import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { OidcAuthGuard } from '../auth/oidc-auth.guard';
import { DatabaseService } from '../database.service';

@Controller('me')
@UseGuards(OidcAuthGuard)
export class MeController {
  constructor(private readonly database: DatabaseService) {}

  @Get('organizations')
  async organizations(@Req() request: AuthenticatedRequest) {
    const subject = request.auth?.sub;
    const rows = await this.database.query<{
      id: string;
      name: string;
      slug: string;
      roles: { role: string; scopeLocationId: string | null }[];
    }>(
      `SELECT o.id,o.name,o.slug,
              json_agg(json_build_object('role',ra.role_key,'scopeLocationId',ra.scope_location_id)) AS roles
         FROM users u JOIN organizations o ON o.id=u.organization_id
         JOIN role_assignments ra ON ra.organization_id=u.organization_id AND ra.user_id=u.id
        WHERE u.identity_subject=$1 AND u.active=true
        GROUP BY o.id,o.name,o.slug ORDER BY o.name`,
      [subject],
    );
    return rows;
  }
}
