import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { REQUIRED_PERMISSIONS, type PermissionKey } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = request.actor;
    if (!actor) throw new ForbiddenException('An active organization role is required');
    const roleKeys = [...new Set(actor.memberships.map((membership) => membership.role))];
    const allowed = await this.database.query<{ permissionKey: PermissionKey }>(
      `SELECT DISTINCT permission_key AS "permissionKey"
         FROM role_permissions
        WHERE role_key=ANY($1::text[]) AND permission_key=ANY($2::text[])`,
      [roleKeys, required],
    );
    const granted = new Set(allowed.map((row) => row.permissionKey));
    if (!required.some((permission) => granted.has(permission))) {
      throw new ForbiddenException('Your organization role does not grant this action');
    }
    return true;
  }
}
