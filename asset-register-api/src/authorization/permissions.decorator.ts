import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEYS = [
  'asset:read',
  'asset:write',
  'asset:export',
  'transfer:create',
  'transfer:approve',
  'handover:execute',
  'audit:verify',
  'audit:read',
  'user:manage',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];
export const REQUIRED_PERMISSIONS = 'requiredPermissions';

export const RequirePermission = (...permissions: PermissionKey[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
