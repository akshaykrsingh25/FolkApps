import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthorizationService } from '../authorization/authorization.service';
import type { ActorContext } from '../auth/authenticated-request';

describe('initial PostgreSQL schema', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    const migration = await readFile(new URL('../../database/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const custodyMigration = await readFile(new URL('../../database/migrations/002_custody_history.sql', import.meta.url), 'utf8');
    await db.exec(custodyMigration);
  });

  afterAll(async () => { await db.close(); });

  it('creates the full tenant-scoped workflow schema', async () => {
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      'organizations', 'users', 'role_assignments', 'locations', 'assets', 'warranties', 'evidence',
      'verification_policies', 'verification_cycles', 'scan_events', 'condition_reports', 'report_evidence',
      'transfer_requests', 'audit_events', 'notification_outbox', 'asset_custodies',
    ]));
  });

  it('allows only one open custody handover per asset', async () => {
    const org = await db.query<{ id: string }>(`INSERT INTO organizations (name,slug) VALUES ('Custody Org','custody-org') RETURNING id`);
    const organizationId=org.rows[0].id;
    const person=await db.query<{id:string}>(`INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'custodian','Custodian','custodian@example.test') RETURNING id`,[organizationId]);
    const place=await db.query<{id:string}>(`INSERT INTO locations (organization_id,kind,name) VALUES ($1,'centre','Custody Centre') RETURNING id`,[organizationId]);
    const asset=await db.query<{id:string}>(`INSERT INTO assets (organization_id,location_id,asset_tag,name,category) VALUES ($1,$2,'C-001','Laptop','IT') RETURNING id`,[organizationId,place.rows[0].id]);
    await db.query(`INSERT INTO asset_custodies (organization_id,asset_id,custodian_user_id) VALUES ($1,$2,$3)`,[organizationId,asset.rows[0].id,person.rows[0].id]);
    await expect(db.query(`INSERT INTO asset_custodies (organization_id,asset_id,custodian_user_id) VALUES ($1,$2,$3)`,[organizationId,asset.rows[0].id,person.rows[0].id]))
      .rejects.toMatchObject({code:'23505'});
  });

  it('blocks cross-organization asset-to-location references', async () => {
    const orgs = await db.query<{ id: string }>(
      `INSERT INTO organizations (name, slug) VALUES ('Org One','org-one'),('Org Two','org-two') RETURNING id`,
    );
    const [orgOne, orgTwo] = orgs.rows.map((row) => row.id);
    const locations = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id, kind, name) VALUES ($1,'centre','A Centre') RETURNING id`, [orgOne],
    );
    await expect(db.query(
      `INSERT INTO assets (organization_id, location_id, asset_tag, name, category) VALUES ($1,$2,'A-001','Switch','IT')`,
      [orgTwo, locations.rows[0].id],
    )).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps scan retries idempotent inside an organization', async () => {
    const organization = await db.query<{ id: string }>(
      `INSERT INTO organizations (name, slug) VALUES ('Scan Org','scan-org') RETURNING id`,
    );
    const organizationId = organization.rows[0].id;
    const location = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id, kind, name) VALUES ($1,'centre','Scan Centre') RETURNING id`, [organizationId],
    );
    const asset = await db.query<{ id: string }>(
      `INSERT INTO assets (organization_id, location_id, asset_tag, name, category) VALUES ($1,$2,'SCAN-001','Router','IT') RETURNING id`,
      [organizationId, location.rows[0].id],
    );
    const cycle = await db.query<{ id: string }>(
      `INSERT INTO verification_cycles (organization_id, scope_location_id, starts_at, grace_ends_at) VALUES ($1,$2,now(),now()+interval '60 days') RETURNING id`,
      [organizationId, location.rows[0].id],
    );
    const params = [organizationId, cycle.rows[0].id, asset.rows[0].id, location.rows[0].id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'];
    const insert = `INSERT INTO scan_events (organization_id,cycle_id,asset_id,location_id,client_event_id,scanned_at) VALUES ($1,$2,$3,$4,$5,now())`;
    await db.query(insert, params);
    await expect(db.query(insert, params)).rejects.toMatchObject({ code: '23505' });
  });

  it('executes centre-descendant and cross-centre scope checks', async () => {
    const organization = await db.query<{ id: string }>(
      `INSERT INTO organizations (name, slug) VALUES ('Scope Org','scope-org') RETURNING id`,
    );
    const organizationId = organization.rows[0].id;
    const state = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id,kind,name) VALUES ($1,'state','Gujarat') RETURNING id`, [organizationId],
    );
    const center = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id,parent_id,kind,name) VALUES ($1,$2,'centre','Ahmedabad Centre') RETURNING id`, [organizationId,state.rows[0].id],
    );
    const building = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id,parent_id,kind,name) VALUES ($1,$2,'building','Tower A') RETURNING id`, [organizationId,center.rows[0].id],
    );
    const floor = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id,parent_id,kind,name) VALUES ($1,$2,'floor','Floor 4') RETURNING id`, [organizationId,building.rows[0].id],
    );
    const otherCenter = await db.query<{ id: string }>(
      `INSERT INTO locations (organization_id,parent_id,kind,name) VALUES ($1,$2,'centre','Surat Centre') RETURNING id`, [organizationId,state.rows[0].id],
    );
    const staff = await db.query<{ id: string }>(
      `INSERT INTO users (organization_id,identity_subject,display_name,email) VALUES ($1,'scope-staff','Scope Staff','scope@example.test') RETURNING id`, [organizationId],
    );
    await db.query(`INSERT INTO role_assignments (organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId,staff.rows[0].id,center.rows[0].id]);
    const actor: ActorContext = {
      userId: staff.rows[0].id,
      organizationId,
      subject: 'scope-staff',
      memberships: [{ role: 'centre_head', scopeLocationId: center.rows[0].id }],
    };
    const adapter = { query: async (sql: string, values: readonly unknown[]) => (await db.query(sql, [...values])).rows };
    const authorization = new AuthorizationService(adapter as never);
    await expect(authorization.assertLocationAccess(actor, floor.rows[0].id, ['centre_head'])).resolves.toBeUndefined();
    await expect(authorization.assertLocationAccess(actor, otherCenter.rows[0].id, ['centre_head'])).rejects.toMatchObject({ status: 403 });
  });
});
