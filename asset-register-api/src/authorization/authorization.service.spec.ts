import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from './authorization.service';
import type { ActorContext } from '../auth/authenticated-request';

const actor: ActorContext = {
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  subject: 'staff-123',
  memberships: [{ role: 'centre_head', scopeLocationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
};

describe('location authorization', () => {
  it('delegates scope to a recursive tenant-bound database check', async () => {
    const database = { query: vi.fn().mockResolvedValue([{ allowed: true }]) };
    await expect(new AuthorizationService(database as never).assertLocationAccess(actor, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ['centre_head']))
      .resolves.toBeUndefined();
    expect(database.query.mock.calls[0][0]).toContain('WITH RECURSIVE requested_path');
    expect(database.query.mock.calls[0][1]).toEqual([actor.organizationId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', actor.userId, ['centre_head']]);
  });

  it('denies access when no assigned scope contains the requested location', async () => {
    const database = { query: vi.fn().mockResolvedValue([{ allowed: false }]) };
    await expect(new AuthorizationService(database as never).assertLocationAccess(actor, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
      .rejects.toMatchObject({ status: 403 });
  });
});
