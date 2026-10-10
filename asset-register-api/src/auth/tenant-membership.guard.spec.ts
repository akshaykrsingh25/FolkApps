import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { TenantMembershipGuard } from './tenant-membership.guard';

function context(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

function request(subject = 'staff-123', organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
  return {
    auth: subject ? { sub: subject } : {},
    header: (name: string) => name === 'x-organization-id' ? organizationId : undefined,
  };
}

describe('tenant membership guard', () => {
  it('loads roles from the database for the selected organization', async () => {
    const database = { query: vi.fn().mockResolvedValue([{
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      memberships: [{ role: 'centre_head', scopeLocationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
    }]) };
    const req = request();
    expect(await new TenantMembershipGuard(database as never).canActivate(context(req))).toBe(true);
    expect(database.query).toHaveBeenCalledWith(expect.any(String), ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'staff-123']);
    expect(req).toHaveProperty('actor.userId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('rejects organizations without active membership and invalid organization IDs', async () => {
    const database = { query: vi.fn().mockResolvedValue([]) };
    await expect(new TenantMembershipGuard(database as never).canActivate(context(request())))
      .rejects.toMatchObject({ status: 403 });
    await expect(new TenantMembershipGuard(database as never).canActivate(context(request('staff-123', 'org-from-browser'))))
      .rejects.toMatchObject({ status: 403 });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
