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
  let stateHeadId: string;
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
      '010_notification_outbox_worker.sql', '011_verification_watch_indexes.sql', '012_recurring_verification_cycles.sql', '013_verification_escalation_policy.sql', '014_verification_cycle_closure.sql',
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
       ($1,'notify-state','State Head','notify-state@example.test'),
       ($1,'notify-a','Centre A Head','notify-a@example.test'),
       ($1,'notify-b','Centre B Head','notify-b@example.test'),
       ($1,'notify-custodian','Centre A Custodian','notify-custodian@example.test')
       RETURNING id,identity_subject`, [organizationId],
    );
    headOfficeId = users.rows.find((row) => row.identity_subject === 'notify-ho')!.id;
    stateHeadId = users.rows.find((row) => row.identity_subject === 'notify-state')!.id;
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
       ($1,$2,'head_office',NULL),($1,$3,'centre_head',$5),($1,$4,'centre_head',$6),($1,$7,'asset_custodian',$5),($1,$8,'state_head',$9)`,
      [organizationId, headOfficeId, centreHeadAId, centreHeadBId, centreAId, centreBId, custodianAId, stateHeadId, state.rows[0].id],
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

  it('escalates overdue items through custodian, centre, state, and Head Office once each', async () => {
    await worker.runOverdueVerificationSweep();
    const firstSweep = await db.query<{ recipient_user_id: string; kind: string; severity: string; description: string; notification_key:string }>(
      `SELECT recipient_user_id,kind,severity,description,notification_key FROM notification_inbox
        WHERE organization_id=$1 AND notification_key LIKE $2 ORDER BY notification_key`,
      [organizationId, `unseen:${verificationCycleId}:${assetId}:%`],
    );
    expect(firstSweep.rows).toHaveLength(4);
    expect(firstSweep.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, stateHeadId, centreHeadAId, custodianAId]));
    expect(firstSweep.rows.some((row) => row.recipient_user_id === centreHeadBId)).toBe(false);
    expect(firstSweep.rows.every((row) => row.kind === 'verification_overdue')).toBe(true);
    expect(firstSweep.rows.map((row)=>row.notification_key.split(':').at(-1))).toEqual(['0','1','2','3']);
    expect(firstSweep.rows.filter((row)=>row.severity==='high')).toHaveLength(2);
    expect(firstSweep.rows.every((row) => row.description.includes('not a confirmed loss'))).toBe(true);
    await worker.runOverdueVerificationSweep();
    const secondSweep = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notification_inbox WHERE organization_id=$1 AND notification_key LIKE $2`,
      [organizationId, `unseen:${verificationCycleId}:${assetId}:%`],
    );
    expect(secondSweep.rows[0].count).toBe(4);
    const auditLevels = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events WHERE organization_id=$1 AND entity_id=$2 AND event_type='verification.escalation_notified'`,
      [organizationId, verificationCycleId],
    );
    expect(auditLevels.rows[0].count).toBe(4);
  });

  it('uses the policy interval to delay each escalation stage', async () => {
    const policy = await db.query<{ id: string }>(
      `INSERT INTO verification_policies(organization_id,scope_location_id,cadence_months,grace_days,escalation_interval_days)
       VALUES ($1,$2,6,60,14) RETURNING id`, [organizationId, centreAId],
    );
    const cycle = await db.query<{ id: string }>(
      `INSERT INTO verification_cycles(organization_id,scope_location_id,policy_id,starts_at,grace_ends_at,status)
       VALUES ($1,$2,$3,now()-interval '70 days',now()-interval '10 days','grace') RETURNING id`,
      [organizationId, centreAId, policy.rows[0].id],
    );
    await worker.runOverdueVerificationSweep();
    const firstStage = await db.query<{ recipient_user_id: string }>(
      `SELECT recipient_user_id FROM notification_inbox WHERE organization_id=$1 AND related_id=$2`,
      [organizationId, cycle.rows[0].id],
    );
    expect(firstStage.rows.map((row) => row.recipient_user_id)).toEqual([custodianAId]);

    await db.query(`UPDATE verification_cycles SET grace_ends_at=now()-interval '15 days' WHERE organization_id=$1 AND id=$2`, [organizationId, cycle.rows[0].id]);
    await worker.runOverdueVerificationSweep();
    const secondStage = await db.query<{ recipient_user_id: string }>(
      `SELECT recipient_user_id FROM notification_inbox WHERE organization_id=$1 AND related_id=$2 ORDER BY notification_key`,
      [organizationId, cycle.rows[0].id],
    );
    expect(secondStage.rows.map((row) => row.recipient_user_id)).toEqual([custodianAId, centreHeadAId]);
  });

  it('opens recurring verification cycles from enabled policies on cadence and records the system action', async () => {
    const policy = await db.query<{ id: string }>(
      `INSERT INTO verification_policies(organization_id,scope_location_id,cadence_months,grace_days)
       VALUES ($1,$2,6,60) RETURNING id`, [organizationId, centreAId],
    );

    await worker.runScheduledVerificationCycles();
    const first = await db.query<{ id: string; starts_at: Date; grace_ends_at: Date; created_by: string | null; status: string }>(
      `SELECT id,starts_at,grace_ends_at,created_by,status FROM verification_cycles
        WHERE organization_id=$1 AND policy_id=$2`, [organizationId, policy.rows[0].id],
    );
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].status).toBe('open');
    expect(first.rows[0].created_by).toBeNull();
    const firstDates = await db.query<{ window_days: number; audit_count: number }>(
      `SELECT extract(epoch FROM (grace_ends_at-starts_at))/86400 AS window_days,
              (SELECT count(*)::int FROM audit_events WHERE organization_id=$1 AND entity_id=$2 AND event_type='verification.cycle_auto_opened') AS audit_count
         FROM verification_cycles WHERE organization_id=$1 AND id=$2`, [organizationId, first.rows[0].id],
    );
    expect(Number(firstDates.rows[0].window_days)).toBe(60);
    expect(firstDates.rows[0].audit_count).toBe(1);

    await worker.runScheduledVerificationCycles();
    await expect(db.query(`SELECT id FROM verification_cycles WHERE organization_id=$1 AND policy_id=$2`, [organizationId, policy.rows[0].id]))
      .resolves.toMatchObject({ rows: [{ id: first.rows[0].id }] });

    await db.query(
      `UPDATE verification_cycles SET starts_at=now()-interval '9 months',grace_ends_at=now()-interval '7 months',status='closed'
        WHERE organization_id=$1 AND id=$2`, [organizationId, first.rows[0].id],
    );
    await worker.runScheduledVerificationCycles();
    const recurring = await db.query<{ id: string; starts_at: Date; grace_ends_at: Date; status: string }>(
      `SELECT id,starts_at,grace_ends_at,status FROM verification_cycles
        WHERE organization_id=$1 AND policy_id=$2 ORDER BY starts_at`, [organizationId, policy.rows[0].id],
    );
    expect(recurring.rows).toHaveLength(2);
    expect(recurring.rows[1].status).toBe('grace');
    const cadenceCheck = await db.query<{ matches: boolean; window_days: number }>(
      `SELECT next.starts_at=prior.starts_at+interval '6 months' AS matches,
              extract(epoch FROM (next.grace_ends_at-next.starts_at))/86400 AS window_days
         FROM verification_cycles prior JOIN verification_cycles next
           ON next.organization_id=prior.organization_id AND next.policy_id=prior.policy_id AND next.id<>prior.id
        WHERE prior.organization_id=$1 AND prior.id=$2 AND next.id=$3`,
      [organizationId, first.rows[0].id, recurring.rows[1].id],
    );
    expect(cadenceCheck.rows[0].matches).toBe(true);
    expect(Number(cadenceCheck.rows[0].window_days)).toBe(60);
  });

  it('moves scheduled cycles into open and grace as their dates arrive', async () => {
    const policy = await db.query<{ id: string }>(
      `INSERT INTO verification_policies(organization_id,scope_location_id,cadence_months,grace_days,enabled)
       VALUES ($1,$2,6,60,false) RETURNING id`, [organizationId, centreAId],
    );
    const cycle = await db.query<{ id: string }>(
      `INSERT INTO verification_cycles(organization_id,scope_location_id,policy_id,starts_at,grace_ends_at,status)
       VALUES ($1,$2,$3,now()+interval '1 day',now()+interval '61 days','scheduled') RETURNING id`,
      [organizationId, centreAId, policy.rows[0].id],
    );

    await worker.runScheduledVerificationCycles();
    await expect(db.query(`SELECT status FROM verification_cycles WHERE organization_id=$1 AND id=$2`, [organizationId, cycle.rows[0].id]))
      .resolves.toMatchObject({ rows: [{ status: 'scheduled' }] });

    await db.query(`UPDATE verification_cycles SET starts_at=now()-interval '1 second',grace_ends_at=now()+interval '1 day' WHERE id=$1`, [cycle.rows[0].id]);
    await worker.runScheduledVerificationCycles();
    await expect(db.query(`SELECT status FROM verification_cycles WHERE organization_id=$1 AND id=$2`, [organizationId, cycle.rows[0].id]))
      .resolves.toMatchObject({ rows: [{ status: 'open' }] });

    await db.query(`UPDATE verification_cycles SET grace_ends_at=now()-interval '1 second' WHERE id=$1`, [cycle.rows[0].id]);
    await worker.runScheduledVerificationCycles();
    await expect(db.query(`SELECT status FROM verification_cycles WHERE organization_id=$1 AND id=$2`, [organizationId, cycle.rows[0].id]))
      .resolves.toMatchObject({ rows: [{ status: 'grace' }] });
  });

  it('fans report and transfer events to only authorized recipients and deduplicates Watch signals', async () => {
    await expect(worker.runOneJob()).resolves.toBe(true);
    await expect(worker.runOneJob()).resolves.toBe(true);
    await expect(worker.runOneJob()).resolves.toBe(false);

    const notices = await db.query<{ recipient_user_id: string; notification_key: string; kind: string; title: string }>(
      `SELECT recipient_user_id,notification_key,kind,title FROM notification_inbox WHERE organization_id=$1`, [organizationId],
    );
    expect(notices.rows.filter((row) => row.notification_key === `report:${reportId}`)).toHaveLength(4);
    expect(notices.rows.filter((row) => row.notification_key === `report:${reportId}`).map((row) => row.recipient_user_id))
      .toEqual(expect.arrayContaining([headOfficeId, stateHeadId, centreHeadAId, custodianAId]));
    expect(notices.rows.some((row) => row.recipient_user_id === centreHeadBId)).toBe(false);
    const transferNotices = notices.rows.filter((row) => row.kind === 'transfer_batch_requested');
    expect(transferNotices).toHaveLength(3);
    expect(transferNotices.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, stateHeadId, centreHeadAId]));
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
    expect(discrepancy.rows).toHaveLength(4);
    expect(discrepancy.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, stateHeadId, centreHeadAId, custodianAId]));
    expect(discrepancy.rows.every((row) => row.kind === 'transfer_discrepancy')).toBe(true);

    await db.query(`UPDATE assets SET status='missing',updated_at=now() WHERE organization_id=$1 AND id=$2`, [organizationId, assetId]);
    await db.query(`INSERT INTO notification_outbox(organization_id,event_type,payload) VALUES ($1,'asset.marked_missing',$2::jsonb)`,
      [organizationId, JSON.stringify({ assetId, locationId: centreAId })]);
    await expect(worker.runOneJob()).resolves.toBe(true);
    const missing = await db.query<{ recipient_user_id: string; notification_key: string; kind: string }>(
      `SELECT recipient_user_id,notification_key,kind FROM notification_inbox WHERE organization_id=$1 AND notification_key=$2`,
      [organizationId, `missing:${assetId}`],
    );
    expect(missing.rows).toHaveLength(4);
    expect(missing.rows.map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([headOfficeId, stateHeadId, centreHeadAId, custodianAId]));
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
