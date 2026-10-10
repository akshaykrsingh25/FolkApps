import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { ExportsService } from './exports.service';
import { ExportWorkerService } from './export-worker.service';

describe('scoped background asset exports', () => {
  let db: PGlite;
  let organizationId: string;
  let headOfficeActor: ActorContext;
  let stateId: string;
  let centreId: string;
  let otherCentreId: string;
  let exportsService: ExportsService;
  let worker: ExportWorkerService;
  const uploaded = new Map<string, string>();
  const deleted: string[] = [];

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    for (const name of [
      '001_initial_schema.sql', '002_custody_history.sql', '003_ownership_and_transfer_batches.sql',
      '004_scoped_rbac_and_user_profiles.sql', '005_dual_asset_identifiers.sql', '006_background_asset_exports.sql', '007_rfid_binding_history.sql', '008_location_physical_addresses.sql', '009_notification_inbox.sql',
    ]) await db.exec(await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8'));

    const database = {
      query: async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) => (await db.query<Row>(sql, [...values])).rows,
      transaction: async <T>(work: (query: (sql: string, values?: readonly unknown[]) => Promise<never[]>) => Promise<T>) =>
        db.transaction(async (tx) => work(async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
          (await tx.query<Row>(sql, [...values])).rows as never[])),
    };
    const org = await db.query<{ id: string }>(`INSERT INTO organizations(name,slug) VALUES ('Exports Org','exports-org') RETURNING id`);
    organizationId = org.rows[0].id;
    const user = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'exports-ho','Export Head Office','exports-ho@example.test') RETURNING id`, [organizationId]);
    headOfficeActor = { organizationId, userId: user.rows[0].id, subject: 'exports-ho', memberships: [{ role: 'head_office', scopeLocationId: null }] };
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key) VALUES ($1,$2,'head_office')`, [organizationId, user.rows[0].id]);
    const state = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,kind,name) VALUES ($1,'state','Gujarat') RETURNING id`, [organizationId]);
    stateId = state.rows[0].id;
    const places = await db.query<{ id: string; code: string }>(
      `INSERT INTO locations(organization_id,parent_id,kind,name,code) VALUES ($1,$2,'centre','Ahmedabad Centre','AHM'),($1,$2,'centre','Surat Centre','SUR') RETURNING id,code`,
      [organizationId, stateId],
    );
    centreId = places.rows.find((place) => place.code === 'AHM')!.id;
    otherCentreId = places.rows.find((place) => place.code === 'SUR')!.id;
    await db.query(`INSERT INTO assets(organization_id,location_id,asset_tag,name,category,seller_phone) VALUES
      ($1,$2,'AHM-001','=HYPERLINK("x")','IT equipment','+91 1111111111'),
      ($1,$3,'SUR-001','Other Centre Router','IT equipment','+91 2222222222')`, [organizationId, centreId, otherCentreId]);

    const authorization = new AuthorizationService(database as never);
    const storage = {
      uploadPrivateFile: async (input: { key: string; filePath: string }) => uploaded.set(input.key, await readFile(input.filePath, 'utf8')),
      deletePrivateObject: async (key: string) => { deleted.push(key); uploaded.delete(key); },
      createExportDownloadUrl: async (_key: string, id: string) => `https://private.example.test/${id}?signature=short-lived`,
    };
    exportsService = new ExportsService(database as never, authorization, storage as never);
    worker = new ExportWorkerService(database as never, authorization, storage as never);
  });

  afterAll(async () => { await db.close(); });

  it('builds a scoped, formula-safe CSV in the worker and returns only a short-lived private download', async () => {
    const input = { clientRequestId: '40000000-0000-4000-8000-000000000001', scopeLocationId: centreId };
    const job = await exportsService.createAssetExport(headOfficeActor, input);
    const duplicate = await exportsService.createAssetExport(headOfficeActor, input);
    expect(duplicate.id).toBe(job.id);
    expect(job.status).toBe('queued');

    await expect(worker.runOneJob()).resolves.toBe(true);
    const completed = await exportsService.get(headOfficeActor, job.id);
    expect(completed).toMatchObject({ status: 'completed', processedRows: 1, scopeLocationId: centreId });
    expect(completed.resultSha256).toMatch(/^[0-9a-f]{64}$/);
    const csv = [...uploaded.values()][0];
    expect(csv).toContain('AHM-001');
    expect(csv).not.toContain('SUR-001');
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(completed.resultSha256).toBe(createHash('sha256').update(csv).digest('hex'));

    await expect(exportsService.download(headOfficeActor, job.id)).resolves.toMatchObject({
      downloadUrl: expect.stringContaining('short-lived'), expiresInSeconds: 300, sha256: completed.resultSha256,
    });
    const events = await db.query<{ event_type: string }>(`SELECT event_type FROM audit_events WHERE entity_id=$1 ORDER BY occurred_at`, [job.id]);
    expect(events.rows.map((row) => row.event_type)).toEqual(['asset.export_requested', 'asset.export_completed', 'asset.export_download_requested']);
  });

  it('requires non-head-office users to pick an accessible scope and blocks cross-centre requests', async () => {
    const user = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'exports-state','State Head','exports-state@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'state_head',$3)`, [organizationId, user.rows[0].id, stateId]);
    const stateActor: ActorContext = { organizationId, userId: user.rows[0].id, subject: 'exports-state', memberships: [{ role: 'state_head', scopeLocationId: stateId }] };
    await expect(exportsService.createAssetExport(stateActor, { clientRequestId: '40000000-0000-4000-8000-000000000002' })).rejects.toMatchObject({ status: 400 });
    const stateJob = await exportsService.createAssetExport(stateActor, { clientRequestId: '40000000-0000-4000-8000-000000000003', scopeLocationId: stateId });
    await expect(exportsService.cancel(stateActor,stateJob.id)).resolves.toMatchObject({ status: 'cancelled' });
    const centreUser = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'exports-centre','Centre Head','exports-centre@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId, centreUser.rows[0].id, centreId]);
    const centreActor: ActorContext = { organizationId, userId: centreUser.rows[0].id, subject: 'exports-centre', memberships: [{ role: 'centre_head', scopeLocationId: centreId }] };
    await expect(exportsService.createAssetExport(centreActor, { clientRequestId: '40000000-0000-4000-8000-000000000007', scopeLocationId: otherCentreId })).rejects.toMatchObject({ status: 403 });
  });

  it('cancels queued jobs and makes expired files unavailable', async () => {
    const queued = await exportsService.createAssetExport(headOfficeActor, { clientRequestId: '40000000-0000-4000-8000-000000000004' });
    await expect(exportsService.cancel(headOfficeActor, queued.id)).resolves.toMatchObject({ status: 'cancelled' });
    await expect(worker.runOneJob()).resolves.toBe(false);

    const ready = await exportsService.createAssetExport(headOfficeActor, { clientRequestId: '40000000-0000-4000-8000-000000000005', scopeLocationId: centreId });
    await worker.runOneJob();
    await db.query(`UPDATE asset_export_jobs SET expires_at=now()-interval '1 second' WHERE id=$1`, [ready.id]);
    await worker.expireOldExports();
    await expect(exportsService.download(headOfficeActor, ready.id)).rejects.toMatchObject({ status: 410 });
    expect(deleted.length).toBeGreaterThan(0);
  });

  it('does not export after the requester loses their permission', async () => {
    const user = await db.query<{ id: string }>(`INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES ($1,'exports-revoked','Revoked Exporter','exports-revoked@example.test') RETURNING id`, [organizationId]);
    await db.query(`INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES ($1,$2,'centre_head',$3)`, [organizationId, user.rows[0].id, centreId]);
    const actor: ActorContext = { organizationId, userId: user.rows[0].id, subject: 'exports-revoked', memberships: [{ role: 'centre_head', scopeLocationId: centreId }] };
    const job = await exportsService.createAssetExport(actor, { clientRequestId: '40000000-0000-4000-8000-000000000006', scopeLocationId: centreId });
    await db.query(`DELETE FROM role_assignments WHERE organization_id=$1 AND user_id=$2`, [organizationId, user.rows[0].id]);
    await worker.runOneJob();
    await expect(exportsService.get(actor, job.id)).resolves.toMatchObject({ status: 'failed', failureCode: 'access_revoked' });
  });

  it('limits active requests per user so one person cannot flood the worker queue', async () => {
    const jobs = [];
    for (const suffix of ['008', '009', '010']) {
      jobs.push(await exportsService.createAssetExport(headOfficeActor, {
        clientRequestId: `40000000-0000-4000-8000-000000000${suffix}`,
        scopeLocationId: centreId,
      }));
    }
    await expect(exportsService.createAssetExport(headOfficeActor, {
      clientRequestId: '40000000-0000-4000-8000-000000000011',
      scopeLocationId: centreId,
    })).rejects.toMatchObject({ status: 429 });
    for (const job of jobs) await exportsService.cancel(headOfficeActor, job.id);
  });
});
