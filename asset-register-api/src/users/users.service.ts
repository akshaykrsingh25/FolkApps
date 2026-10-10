import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { SqlQuery } from '../database.service';
import type { AppRole, CreateUserDto } from './users.dto';

const MANAGER_ROLES = ['head_office', 'state_head', 'centre_head'] as const;
const ROLE_SCOPE_KIND: Record<AppRole, string[] | null> = {
  head_office: null,
  state_head: ['state'],
  centre_head: ['centre'],
  asset_custodian: ['floor', 'area'],
  viewer: ['state', 'centre', 'warehouse', 'building', 'floor', 'area'],
};

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  isActive: boolean;
  roles: { role: AppRole; scopeLocationId: string | null; scopeLocationName: string | null }[];
}

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService, private readonly authorization: AuthorizationService) {}

  async list(actor: ActorContext): Promise<UserRow[]> {
    return this.database.query<UserRow>(
      `WITH RECURSIVE assigned_scope(id) AS (
         SELECT scope_location_id FROM role_assignments
          WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
         UNION
         SELECT child.id FROM locations child JOIN assigned_scope parent ON child.parent_id=parent.id
          WHERE child.organization_id=$1::uuid
       ), visible_assignments AS (
         SELECT assignment.organization_id,assignment.user_id,assignment.role_key,assignment.scope_location_id
           FROM role_assignments assignment
          WHERE assignment.organization_id=$1::uuid AND (
            EXISTS (SELECT 1 FROM role_assignments mine WHERE mine.organization_id=$1::uuid AND mine.user_id=$2::uuid
                     AND mine.role_key='head_office' AND mine.scope_location_id IS NULL)
            OR assignment.scope_location_id IN (SELECT id FROM assigned_scope)
          )
       )
       SELECT person.id,person.email,person.display_name AS "displayName",person.phone_number AS "phoneNumber",
              person.active AS "isActive",
              json_agg(json_build_object('role',assignment.role_key,'scopeLocationId',assignment.scope_location_id,'scopeLocationName',place.name)
                       ORDER BY assignment.role_key,place.name) AS roles
         FROM users person JOIN visible_assignments assignment
           ON assignment.organization_id=person.organization_id AND assignment.user_id=person.id
         LEFT JOIN locations place ON place.organization_id=assignment.organization_id AND place.id=assignment.scope_location_id
        WHERE person.organization_id=$1::uuid
        GROUP BY person.id,person.email,person.display_name,person.phone_number,person.active
        ORDER BY lower(person.display_name),person.id`,
      [actor.organizationId, actor.userId],
    );
  }

  async create(actor: ActorContext, dto: CreateUserDto) {
    await this.assertCanGrantRole(actor, dto.role, dto.scopeLocationId ?? null);
    const email = dto.email.trim().toLocaleLowerCase('en-IN');
    const subject = dto.identitySubject.trim();
    const displayName = dto.displayName.trim();
    const phoneNumber = dto.phoneNumber?.trim() || null;
    if (!subject || !displayName || !email) throw new BadRequestException('Enter a valid identity subject, email, and display name');
    if (phoneNumber && phoneNumber.length < 7) throw new ConflictException('Enter a complete contact number or leave it blank');

    try {
      return await this.database.transaction(async (query) => {
        const matching = await query<{ id: string; email: string; identitySubject: string; active: boolean }>(
          `SELECT id,email,identity_subject AS "identitySubject",active
             FROM users WHERE organization_id=$1::uuid
              AND (identity_subject=$2 OR lower(email)=lower($3)) FOR UPDATE`,
          [actor.organizationId, subject, email],
        );
        if (matching.length > 1 || (matching[0] && (matching[0].identitySubject !== subject || matching[0].email.toLocaleLowerCase('en-IN') !== email))) {
          throw new ConflictException('That email or identity-provider subject is already linked to a different user');
        }

        let userId: string;
        let created = false;
        if (matching[0]) {
          if (!matching[0].active) throw new ConflictException('This user is inactive. Reactivation must be approved separately.');
          userId = matching[0].id;
          await query(
            `UPDATE users SET display_name=$3,phone_number=COALESCE($4,phone_number)
              WHERE organization_id=$1::uuid AND id=$2::uuid`,
            [actor.organizationId, userId, displayName, phoneNumber],
          );
        } else {
          const inserted = await query<{ id: string }>(
            `INSERT INTO users (organization_id,identity_subject,display_name,email,phone_number)
             VALUES ($1::uuid,$2,$3,$4,$5) RETURNING id`,
            [actor.organizationId, subject, displayName, email, phoneNumber],
          );
          userId = inserted[0].id;
          created = true;
        }

        const grant = await query<{ id: string }>(
          `INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::uuid) RETURNING id`,
          [actor.organizationId, userId, dto.role, dto.scopeLocationId ?? null],
        );
        await query(
          `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
           VALUES ($1::uuid,$2::uuid,$3,'user',$4::uuid,$5::jsonb)`,
          [actor.organizationId, actor.userId, created ? 'user.created' : 'user.role_assigned', userId,
            JSON.stringify({ role: dto.role, scopeLocationId: dto.scopeLocationId ?? null, assignmentId: grant[0].id })],
        );
        return { id: userId, email, displayName, phoneNumber, isActive: true, role: dto.role, scopeLocationId: dto.scopeLocationId ?? null, created };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('This user already has that role at the selected scope');
      throw error;
    }
  }

  async setActive(actor: ActorContext, userId: string, isActive: boolean) {
    return this.database.transaction(async (query) => {
      // Serialize account-status changes within an organization so two administrators
      // cannot concurrently deactivate the final active Head Office account.
      await query('SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE', [actor.organizationId]);
      const assignments = await query<{ role: AppRole; scopeLocationId: string | null }>(
        `SELECT role_key AS role,scope_location_id AS "scopeLocationId" FROM role_assignments
          WHERE organization_id=$1::uuid AND user_id=$2::uuid`,
        [actor.organizationId, userId],
      );
      if (!assignments.length) throw new NotFoundException('User was not found in this organization');
      if (userId === actor.userId && !isActive) throw new ConflictException('Ask another organization administrator to deactivate your own account');
      await this.assertCanManageAssignments(actor, assignments, query);
      if (!isActive && assignments.some((assignment) => assignment.role === 'head_office')) {
        const remaining = await query<{ count: number }>(
          `SELECT count(DISTINCT person.id)::int AS count FROM users person
            JOIN role_assignments assignment ON assignment.organization_id=person.organization_id AND assignment.user_id=person.id
           WHERE person.organization_id=$1::uuid AND person.active=true AND assignment.role_key='head_office'
             AND assignment.scope_location_id IS NULL AND person.id<>$2::uuid`,
          [actor.organizationId, userId],
        );
        if (!remaining[0]?.count) throw new ConflictException('The organization must keep at least one active Head Office administrator');
      }
      const updated = await query<{ id: string; isActive: boolean }>(
        `UPDATE users SET active=$3 WHERE organization_id=$1::uuid AND id=$2::uuid
         RETURNING id,active AS "isActive"`,
        [actor.organizationId, userId, isActive],
      );
      if (!updated[0]) throw new NotFoundException('User was not found in this organization');
      await query(
        `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
         VALUES ($1::uuid,$2::uuid,'user.active_changed','user',$3::uuid,$4::jsonb)`,
        [actor.organizationId, actor.userId, userId, JSON.stringify({ isActive })],
      );
      return updated[0];
    });
  }

  private async assertCanGrantRole(actor: ActorContext, role: AppRole, scopeLocationId: string | null) {
    const isHeadOffice = actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null);
    const isStateHead = actor.memberships.some((membership) => membership.role === 'state_head');
    const isCentreHead = actor.memberships.some((membership) => membership.role === 'centre_head');

    if (role === 'head_office') {
      if (!isHeadOffice || scopeLocationId) throw new ForbiddenException('Only Head Office can grant an organization-wide administrator role');
      return;
    }
    if (!scopeLocationId) throw new ConflictException('Choose a location scope for this role');

    const grantableRoles: AppRole[] = isHeadOffice
      ? ['state_head', 'centre_head', 'asset_custodian', 'viewer']
      : isStateHead
        ? ['centre_head', 'asset_custodian', 'viewer']
        : isCentreHead
          ? ['asset_custodian', 'viewer']
          : [];
    if (!grantableRoles.includes(role)) throw new ForbiddenException('Your role cannot grant that level of access');

    const location = await this.database.query<{ kind: string }>(
      'SELECT kind FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid',
      [actor.organizationId, scopeLocationId],
    );
    if (!location[0]) throw new NotFoundException('The selected access location was not found');
    if (!ROLE_SCOPE_KIND[role]?.includes(location[0].kind)) {
      throw new ConflictException(`A ${role.replaceAll('_', ' ')} must be scoped to ${ROLE_SCOPE_KIND[role]?.join(' or ')}`);
    }
    const callerRoles = isHeadOffice ? ['head_office'] : isStateHead ? ['state_head'] : ['centre_head'];
    await this.authorization.assertLocationAccess(actor, scopeLocationId, callerRoles);
  }

  private async assertCanManageAssignments(actor: ActorContext, assignments: { role: AppRole; scopeLocationId: string | null }[], query?: SqlQuery) {
    const isHeadOffice = actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null);
    if (isHeadOffice) return;
    const manageableRoles: AppRole[] = actor.memberships.some((membership) => membership.role === 'state_head')
      ? ['centre_head', 'asset_custodian', 'viewer']
      : actor.memberships.some((membership) => membership.role === 'centre_head')
        ? ['asset_custodian', 'viewer']
        : [];
    if (assignments.some((assignment) => assignment.role === 'head_office' || assignment.scopeLocationId === null)) {
      throw new ForbiddenException('Only Head Office can manage an organization-wide administrator');
    }
    for (const assignment of assignments) {
      if (!manageableRoles.includes(assignment.role)) {
        throw new ForbiddenException('You can only manage users with roles below your own');
      }
      await this.authorization.assertLocationAccess(actor, assignment.scopeLocationId!, MANAGER_ROLES, query);
    }
  }
}
