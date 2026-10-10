import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlQuery } from '../database.service';
import { NotificationOutboxWorkerService } from './notification-outbox-worker.service';

describe('notification outbox worker', () => {
  let db: PGlite;
  let worker: NotificationOutboxWorkerService;
  let organizationId: string;
  let headOfficeId: string;
  let centreHeadAId: string;
  let centreHeadBId: string;
  let custodianAId: string;
  let centreAId: string;
  let centreBId: string;
  let assetId: string;
  let reportId: string;
  let batchId: string;
  let verificationCycleId: string;

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    for (const name of [
      '001_initial_schema.sql', '002_custody_history.sql', '003_ownership_and_transfer_batches.sql',
      '004_scoped_rbac_and_user_profiles.sql', '005_dual_asset_identifiers.sql', '006_background_asset_exports.sql',
      '007_rfid_binding_history.sql', '008_location_physical_addresses.sql', '009_notification_inbox.sql',
      '010_notification_outbox_worker.sql', '011_verification_watch_indexes.sql',
    ]) await db.exec(await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8'));

    const database = {
      query: async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
        (await db.query<Row>(sql, [...values])).rows,
      transaction: async <T>(work: (query: SqlQuery) => Promise<T>) => db.transaction(async (tx) =>
        work(async <Row extends import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
          (await tx.query<Row>(sql, [...values])).rows)),
    };
    worker = new NotificationOutboxWorkerService(database as never);

    const org = await db.query<{ id: string }>(`INSERT INTO organizations(name,slug) VALUES ('Notification Org','notification-org') RETURNING id`);
    organizationId = org.rows[0].id;
    const users = await db.query<{ id: string; identity_subject: string }>(
      `INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES
       ($1,'notify-ho','Head Office','notify-ho@example.test'),
       ($1,'notify-a','Centre A Head','notify-a@example.test'),
       ($1,'notify-b','Centre B Head','notify-b@example.test'),
       ($1,'notify-custodian','Centre A Custodian','notify-custodian@example.test')
       RETURNING id,identity_subject`, [organizationId],
    );
    headOfficeId = users.rows.find((row) => row.identity_subject === 'notify-ho')!.id;
    centreHeadAId = users.rows.find((row) => row.identity_subject === 'notify-a')!.id;
    centreHeadBId = users.rows.find((row) => row.identity_subject === 'notify-b')!.id;
    custodianAId = users.rows.find((row) => row.identity_subject === 'notify-custodian')!.id;
    const state = await db.query<{ id: string }>(`INSERT INTO locations(organization_id,kind,name) VALUES ($1,'state','Gujarat') RETURNING id`, [organizationId]);
    const places = await db.query<{ id: string; code: string }>(
      `INSERT INTO locations(organization_id,parent_id,kind,name,code) VALUES
       ($1,$2,'centre','Ahmedabad Centre','AHM'),($1,$2,'centre','Surat Centre','SUR') RETURNING id,code`,
      [organizationId, state.rows[0].id],
    );
    centreAId = places.rows.find((row) => row.code === 'AHM')!.id;
    centreBId = places.rows.find((row) => row.code === 'SUR')!.id;
    await db.query(
      `INSERT INTO role_assignments(organization_id,user_id,role_key,scope_location_id) VALUES
       ($1,$2,'head_office',NULL),($1,$3,'centre_head',$5),($1,$4,'centre_head',$6),($1,$7,'asset_custodian',$5)`,
      [organizationId, headOfficeId, centreHeadAId, centreHeadBId, centreAId, centreBId, custodianAId],
    );
    const asset = await db.query<{ id: string }>(
      `INSERT INTO assets(organization_id,location_id,asset_tag,name,category) VALUES ($1,$2,'AHM-001','Network switch','IT equipment') RETURNING id`,
      [organizationId, centreAId],
    );
    assetId = asset.rows[0].id;
    const cycle = await db.query<{ id: string }>(
      `INSERT INTO verification_cycles(organization_id,scope_location_id,starts_at,grace_ends_at,status,created_by)
       VALUES ($1,$2,now()-interval '8 months',now()-interval '1 month','grace',$3) RETURNING id`,
      [organizationId, centreAId, headOfficeId],
    );
    verificationCycleId = cycle.rows[0].id;
    const report = await db.query<{ id: string }>(
      `INSERT INTO condition_reports(organization_id,asset_id,kind,urgency,description,reported_by)
       VALUES ($1,$2,'damaged','urgent','Switch is not responding.',$3) RETURNING id`,
      [organizationId, assetId, centreHeadAId],
    );
    reportId = report.rows[0].id;
    await db.query(`INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'condition.reported',$2::jsonb)`,
      [organizationId, JSON.stringify({ reportId, assetId, locationId: centreAId })]);

    const batch = await db.query<{ id: string }>(
      `INSERT INTO transfer_batches(organization_id,batch_reference,from_location_id,to_location_id,requested_by)
       VALUES ($1,'BT-NOTIFY-001',$2,$3,$4) RETURNING id`,
      [organizationId, centreAId, centreBId, headOfficeId],
    );
    batchId = batch.rows[0].id;
    await db.query(`INSERT INTO transfer_batch_items(organization_id,batch_id,asset_id) VALUES ($1,$2,$3)`,
      [organizationId, batchId, assetId]);
    await db.query(`INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'transfer_batch.requested',$2::jsonb)`,
      [organizationId, JSON.stringify({ batchId, fromLocationId: centreAId, toLocationId: centreBId })]);
  });

  afterAll(async () => { await db.close(); });

  it('materializes every overdue cycle item for the current scoped readers, idempotently', async () => {
    await worker.runOverdueVerificationSweep();
    const key = `unseen:${verificationCycleId}:${assetId}`;
    const firstSweep = await db.query<{ recipient_user_id: string; kind: string; severity: string; description: string }>(
      `SELECT recipient_user_id,kind,severity,description FROM notification_inbox WHERE organization_id=$1 AND notification_key=$2`,
      [organizationId, key],
    );
    expect(firstSweep.rows).toHaveLength(3);
    expect(firstSweep.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, centreHeadAId, custodianAId]));
    expect(firstSweep.rows.some((row) => row.recipient_user_id === centreHeadBId)).toBe(false);
    expect(firstSweep.rows.every((row) => row.kind === 'verification_overdue' && row.severity === 'medium')).toBe(true);
    expect(firstSweep.rows.every((row) => row.description.includes('not a confirmed loss'))).toBe(true);
    await worker.runOverdueVerificationSweep();
    const secondSweep = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notification_inbox WHERE organization_id=$1 AND notification_key=$2`,
      [organizationId, key],
    );
    expect(secondSweep.rows[0].count).toBe(3);
  });

  it('fans report and transfer events to only authorized recipients and deduplicates Watch signals', async () => {
    await expect(worker.runOneJob()).resolves.toBe(true);
    await expect(worker.runOneJob()).resolves.toBe(true);
    await expect(worker.runOneJob()).resolves.toBe(false);

    const notices = await db.query<{ recipient_user_id: string; notification_key: string; kind: string; title: string }>(
      `SELECT recipient_user_id,notification_key,kind,title FROM notification_inbox WHERE organization_id=$1`, [organizationId],
    );
    expect(notices.rows.filter((row) => row.notification_key === `report:${reportId}`)).toHaveLength(3);
    expect(notices.rows.filter((row) => row.notification_key === `report:${reportId}`).map((row) => row.recipient_user_id))
      .toEqual(expect.arrayContaining([headOfficeId, centreHeadAId, custodianAId]));
    expect(notices.rows.some((row) => row.recipient_user_id === centreHeadBId)).toBe(false);
    const transferNotices = notices.rows.filter((row) => row.kind === 'transfer_batch_requested');
    expect(transferNotices).toHaveLength(2);
    expect(transferNotices.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, centreHeadAId]));
    expect(transferNotices.every((row) => row.title === 'Transfer awaiting approval')).toBe(true);
    const outbox = await db.query<{ delivered_at: Date | null; attempts: number }>(
      `SELECT delivered_at,attempts FROM notification_outbox WHERE event_type='condition.reported'`,
    );
    expect(outbox.rows[0].delivered_at).toBeTruthy();
    expect(outbox.rows[0].attempts).toBe(1);

    await db.query(`UPDATE transfer_batches SET status='received_with_discrepancy' WHERE organization_id=$1 AND id=$2`, [organizationId, batchId]);
    await db.query(
      `UPDATE transfer_batch_items SET receipt_status='not_received',scanned_at_receipt=now(),receipt_discrepancy_note='Not present at destination'
        WHERE organization_id=$1 AND batch_id=$2 AND asset_id=$3`, [organizationId, batchId, assetId],
    );
    await db.query(`INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'transfer_batch.discrepancy',$2::jsonb)`,
      [organizationId, JSON.stringify({ batchId, reportedBy: centreHeadBId, items: [{ assetId, receiptStatus: 'not_received' }] })]);
    await expect(worker.runOneJob()).resolves.toBe(true);
    const discrepancy = await db.query<{ recipient_user_id: string; notification_key: string; kind: string }>(
      `SELECT recipient_user_id,notification_key,kind FROM notification_inbox WHERE organization_id=$1 AND notification_key=$2`,
      [organizationId, `batch-discrepancy:${batchId}:${assetId}`],
    );
    expect(discrepancy.rows).toHaveLength(3);
    expect(discrepancy.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, centreHeadAId, custodianAId]));
    expect(discrepancy.rows.every((row) => row.kind === 'transfer_discrepancy')).toBe(true);

    await db.query(`UPDATE assets SET status='missing',updated_at=now() WHERE organization_id=$1 AND id=$2`, [organizationId, assetId]);
    await db.query(`INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'asset.marked_missing',$2::jsonb)`,
      [organizationId, JSON.stringify({ assetId, locationId: centreAId })]);
    await expect(worker.runOneJob()).resolves.toBe(true);
    const missing = await db.query<{ recipient_user_id: string; notification_key: string; kind: string }>(
      `SELECT recipient_user_id,notification_key,kind FROM notification_inbox WHERE organization_id=$1 AND notification_key=$2`,
      [organizationId, `missing:${assetId}`],
    );
    expect(missing.rows).toHaveLength(3);
    expect(missing.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, centreHeadAId, custodianAId]));
    expect(missing.rows.every((row) => row.kind === 'missing')).toBe(true);
  });

  it('backs off and dead-letters an unsupported event after the retry limit', async () => {
    const event = await db.query<{ id: string }>(
      `INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'unknown.event','{}'::jsonb) RETURNING id`,
      [organizationId],
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(worker.runOneJob()).resolves.toBe(true);
      await db.query(`UPDATE notification_outbox SET available_at=now() WHERE id=$1`, [event.rows[0].id]);
    }
    const result = await db.query<{ attempts: number; last_error: string; dead_lettered_at: Date | null }>(
      `SELECT attempts,last_error,dead_lettered_at FROM notification_outbox WHERE id=$1`, [event.rows[0].id],
    );
    expect(result.rows[0]).toMatchObject({ attempts: 8, last_error: 'delivery_failed' });
    expect(result.rows[0].dead_lettered_at).toBeTruthy();
    await expect(worker.runOneJob()).resolves.toBe(false);
  });
});
