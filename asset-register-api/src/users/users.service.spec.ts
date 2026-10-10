import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { UsersService } from './users.service';

describe('scoped user management', () => {
  let db: PGlite;
  let service: UsersService;
  let organizationId: string;
  let stateId: string;
  let centreAId: string;
  let centreBId: string;
  let floorAId: string;
  let headOffice: ActorContext;
  let stateHead: ActorContext;
  let centreHead: ActorContext;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    for (const name of ['001_initial_schema.sql', '002_custody_history.sql', '003_ownership_and_transfer_batches.sql', '004_scoped_rbac_and_user_profiles.sql']) {
      await db.exec(await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(await readFile(new URL('../../database/migrations/005_dual_asset_identifiers.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../database/migrations/006_background_asset_exports.sql', import.meta.url), 'utf8'));
    const query = async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
      (await db.query<Row>(sql, [...values])).rows;
    const database = {
      query,
      transaction: async <T>(work: (transactionQuery: typeof query) => Promise<T>) =>
        db.transaction(async (tx) => work(async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
          (await tx.query<Row>(sql, [...values])).rows)),
    };
    const authorization = new AuthorizationService(database as never);
    service = new UsersService(database as never, authorization);

    const organization = await db.query<{ id: string }>(`INSERT INTO organizations(name,slug) VALUES ('User Scope Org','user-scope-org') RETURNING id`);
    organizationId = organization.rows[0].id;
    const state = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,kind,name) VALUES ($1,'state','Gujarat') RETURNING id`, [organizationId]);
    stateId = state.rows[0].id;
    const otherState = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,kind,name) VALUES ($1,'state','Maharashtra') RETURNING id`, [organizationId]);
    const centres = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,parent_id,kind,name) VALUES ($1,$2,'centre','Ahmedabad'),($1,$3,'centre','Surat') RETURNING id,name`, [organizationId,stateId,otherState.rows[0].id]);
    centreAId = centres.rows.find((row) => row.name === 'Ahmedabad')!.id;
    centreBId = centres.rows.find((row) => row.name === 'Surat')!.id;
    const floor = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,parent_id,kind,name) VALUES ($1,$2,'floor','Floor 4') RETURNING id`, [organizationId,centreAId]);
    floorAId = floor.rows[0].id;
    await db.query(`INSERT INTO locations(organization_id,parent_id,kind,name) VALUES ($1,$2,'floor','Floor 2')`, [organizationId,centreBId]);

    const ho = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'ho-sub','Head Office','ho@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key) VALUES ($1,$2,'head_office')`, [organizationId,ho.rows[0].id]);
    headOffice = { userId: ho.rows[0].id, organizationId, subject: 'ho-sub', memberships: [{ role: 'head_office', scopeLocationId: null }] };

    const regional = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'state-sub','State Head','state@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'state_head',$3)`, [organizationId,regional.rows[0].id,stateId]);
    stateHead = { userId: regional.rows[0].id, organizationId, subject: 'state-sub', memberships: [{ role: 'state_head', scopeLocationId: stateId }] };

    const centre = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'centre-sub','Centre Head','centre@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId,centre.rows[0].id,centreAId]);
    centreHead = { userId: centre.rows[0].id, organizationId, subject: 'centre-sub', memberships: [{ role: 'centre_head', scopeLocationId: centreAId }] };
  });

  afterAll(async () => { await db.close(); });

  it('links OIDC identities to scoped roles and records an audit event without creating credentials', async () => {
    const created = await service.create(stateHead, {
      identitySubject: 'custodian-sub', email: ' Custodian@Example.test ', displayName: 'Floor Custodian',
      phoneNumber: '+91 99999 11111', role: 'asset_custodian', scopeLocationId: floorAId,
    });
    expect(created).toMatchObject({ created: true, role: 'asset_custodian', scopeLocationId: floorAId, isActive: true });
    expect(created.email).toBe('custodian@example.test');
    expect(created).not.toHaveProperty('passwordHash');
    expect(created).not.toHaveProperty('password_hash');
    const saved = await db.query<{ phone_number: string; identity_subject: string }>(
      `SELECT phone_number,identity_subject FROM users WHERE organization_id=$1 AND id=$2`, [organizationId,created.id],
    );
    expect(saved.rows[0]).toEqual({ phone_number: '+91 99999 11111', identity_subject: 'custodian-sub' });
    const audit = await db.query<{ event_type: string }>(`SELECT event_type FROM audit_events WHERE entity_type='user' AND entity_id=$1`, [created.id]);
    expect(audit.rows.map((row) => row.event_type)).toContain('user.created');
  });

  it('limits state and centre managers to descendants and prevents privilege escalation', async () => {
    await expect(service.create(stateHead, {
      identitySubject: 'other-state-head', email: 'other@example.test', displayName: 'Other', role: 'centre_head', scopeLocationId: centreBId,
    })).rejects.toMatchObject({ status: 403 });
    const floorB = await db.query<{ id: string }>(`SELECT id FROM locations WHERE organization_id=$1 AND parent_id=$2 AND kind='floor'`, [organizationId,centreBId]);
    await expect(service.create(centreHead, {
      identitySubject: 'outside-sub', email: 'outside@example.test', displayName: 'Outside', role: 'asset_custodian', scopeLocationId: floorB.rows[0].id,
    })).rejects.toMatchObject({ status: 403 });
    await expect(service.create(stateHead, {
      identitySubject: 'ho-impersonation', email: 'elevated@example.test', displayName: 'Elevated', role: 'head_office',
    })).rejects.toMatchObject({ status: 403 });
  });

  it('lists only users whose assignments are visible in the caller’s hierarchy', async () => {
    const gujaratUser = await service.create(stateHead, {
      identitySubject: 'visible-sub', email: 'visible@example.test', displayName: 'Visible', role: 'viewer', scopeLocationId: centreAId,
    });
    const otherUser = await service.create(headOffice, {
      identitySubject: 'hidden-sub', email: 'hidden@example.test', displayName: 'Hidden', role: 'viewer', scopeLocationId: centreBId,
    });
    const regionalRows = await service.list(stateHead);
    expect(regionalRows.some((row) => row.id === gujaratUser.id)).toBe(true);
    expect(regionalRows.some((row) => row.id === otherUser.id)).toBe(false);
    expect((await service.list(headOffice)).some((row) => row.id === otherUser.id)).toBe(true);
  });

  it('prevents self-deactivation and audits scoped active-status changes', async () => {
    await expect(service.setActive(headOffice, headOffice.userId, false)).rejects.toMatchObject({ status: 409 });
    const custodian = await service.create(centreHead, {
      identitySubject: 'staff-sub', email: 'staff@example.test', displayName: 'Centre Staff', role: 'asset_custodian', scopeLocationId: floorAId,
    });
    await expect(service.setActive(centreHead, custodian.id, false)).resolves.toMatchObject({ isActive: false });
    await expect(service.setActive(centreHead, custodian.id, true)).resolves.toMatchObject({ isActive: true });
    await expect(service.setActive(headOffice, headOffice.userId, false)).rejects.toMatchObject({ status: 409 });
  });

  it('prevents regional and centre managers from pausing peers or higher roles', async () => {
    const peer = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'state-peer','Peer State Head','peer-state@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'state_head',$3)`, [organizationId,peer.rows[0].id,stateId]);
    await expect(service.setActive(stateHead, peer.rows[0].id, false)).rejects.toMatchObject({ status: 403 });
    await expect(service.setActive(centreHead, centreHead.userId, false)).rejects.toMatchObject({ status: 409 });
  });
});
