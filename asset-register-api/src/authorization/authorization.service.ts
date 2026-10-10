import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { ActorContext } from '../auth/authenticated-request';

@Injectable()
export class AuthorizationService {
  constructor(private readonly database: DatabaseService) {}

  async assertLocationAccess(actor: ActorContext, locationId: string, allowedRoles?: readonly string[]): Promise<void> {
    const rows = await this.database.query<{ allowed: boolean }>(
      `WITH RECURSIVE requested_path AS (
         SELECT id, parent_id FROM locations
          WHERE organization_id = $1::uuid AND id = $2::uuid
         UNION ALL
         SELECT parent.id, parent.parent_id
           FROM locations parent
           JOIN requested_path child ON child.parent_id = parent.id
          WHERE parent.organization_id = $1::uuid
       )
       SELECT EXISTS (
         SELECT 1
           FROM role_assignments assignment
          WHERE assignment.organization_id = $1::uuid
            AND assignment.user_id = $3::uuid
            AND (cardinality($4::text[]) = 0 OR assignment.role_key = ANY($4::text[]))
            AND (
              (assignment.role_key = 'head_office' AND assignment.scope_location_id IS NULL)
              OR assignment.scope_location_id IN (SELECT id FROM requested_path)
            )
       ) AS allowed`,
      [actor.organizationId, locationId, actor.userId, allowedRoles ? [...allowedRoles] : []],
    );
    if (!rows[0]?.allowed) throw new ForbiddenException('Location is outside the assigned role scope');
  }
}
