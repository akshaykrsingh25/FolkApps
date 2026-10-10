import type { Request } from 'express';
import type { JWTPayload } from 'jose';

export interface Membership {
  role: 'head_office' | 'state_head' | 'centre_head' | 'asset_custodian' | 'viewer';
  scopeLocationId: string | null;
}

export interface ActorContext {
  userId: string;
  organizationId: string;
  subject: string;
  memberships: Membership[];
}

export interface AuthenticatedRequest extends Request {
  auth?: JWTPayload;
  actor?: ActorContext;
}
