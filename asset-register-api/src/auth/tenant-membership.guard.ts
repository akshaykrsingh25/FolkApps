import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthenticatedRequest, Membership } from './authenticated-request';

interface MembershipRow {
  userId: string;
  organizationId: string;
  memberships: Membership[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subject = request.auth?.sub;
    const organizationId = request.header('x-organization-id');
    if (!subject) throw new UnauthorizedException('Authenticated subject is missing');
    if (!organizationId || !UUID.test(organizationId)) throw new ForbiddenException('Organization context is invalid');

    const rows = await this.database.query<MembershipRow>(
      `SELECT u.id AS "userId", u.organization_id AS "organizationId",
              COALESCE(json_agg(json_build_object('role', ra.role_key, 'scopeLocationId', ra.scope_location_id))
                FILTER (WHERE ra.id IS NOT NULL), '[]'::json) AS memberships
         FROM users u
         LEFT JOIN role_assignments ra
           ON ra.organization_id = u.organization_id AND ra.user_id = u.id
        WHERE u.organization_id = $1::uuid AND u.identity_subject = $2 AND u.active = true
        GROUP BY u.id, u.organization_id`,
      [organizationId, subject],
    );
    const member = rows[0];
    if (!member || member.memberships.length === 0) throw new ForbiddenException('No active role in this organization');

    request.actor = {
      userId: member.userId,
      organizationId: member.organizationId,
      subject,
      memberships: member.memberships,
    };
    return true;
  }
}
