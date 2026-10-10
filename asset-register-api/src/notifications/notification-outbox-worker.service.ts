import { Injectable, Logger } from '@nestjs/common';
import type { SqlQuery } from '../database.service';
import { DatabaseService } from '../database.service';

interface OutboxEvent {
  id: string;
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown> | string;
}

interface Notice {
  notificationKey: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  locationId: string;
  locationName: string;
  relatedId: string | null;
  occurredAt: Date | string;
  permission: 'asset:read' | 'transfer:approve';
}

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1000;
const VERIFICATION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class NotificationOutboxWorkerService {
  private readonly logger = new Logger(NotificationOutboxWorkerService.name);
  private lastVerificationSweepAt = 0;

  constructor(private readonly database: DatabaseService) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        if (Date.now() - this.lastVerificationSweepAt >= VERIFICATION_SWEEP_INTERVAL_MS) {
          await this.runOverdueVerificationSweep();
          this.lastVerificationSweepAt = Date.now();
        }
        const didWork = await this.runOneJob();
        if (!didWork) await waitForPoll(signal);
      } catch {
        this.logger.error('Notification outbox worker failed; it will retry after a short delay.');
        await waitForPoll(signal);
      }
    }
  }

  async runOverdueVerificationSweep(): Promise<void> {
    await this.database.transaction(async (query) => {
      const lock = await query<{ acquired: boolean }>(`SELECT pg_try_advisory_xact_lock(183456720,1) AS acquired`);
      if (!lock[0]?.acquired) return;
      await query(
        `WITH RECURSIVE cycle_places(organization_id,cycle_id,location_id,grace_ends_at) AS (
           SELECT c.organization_id,c.id,c.scope_location_id,c.grace_ends_at
             FROM verification_cycles c
            WHERE c.grace_ends_at<=now() AND c.status<>'closed'
           UNION
           SELECT places.organization_id,places.cycle_id,child.id,places.grace_ends_at
             FROM cycle_places places
             JOIN locations child ON child.organization_id=places.organization_id AND child.parent_id=places.location_id
         ), overdue_assets AS (
           SELECT DISTINCT c.organization_id,c.cycle_id,a.id AS asset_id,a.asset_tag,a.name AS asset_name,
                  a.location_id,l.name AS location_name,c.grace_ends_at
             FROM cycle_places c
             JOIN assets a ON a.organization_id=c.organization_id AND a.location_id=c.location_id
             JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
            WHERE NOT EXISTS (
              SELECT 1 FROM scan_events s
               WHERE s.organization_id=c.organization_id AND s.cycle_id=c.cycle_id AND s.asset_id=a.id
            )
         ), asset_paths(organization_id,cycle_id,asset_id,location_id,parent_id) AS (
           SELECT overdue.organization_id,overdue.cycle_id,overdue.asset_id,l.id,l.parent_id
             FROM overdue_assets overdue JOIN locations l
               ON l.organization_id=overdue.organization_id AND l.id=overdue.location_id
           UNION
           SELECT path.organization_id,path.cycle_id,path.asset_id,parent.id,parent.parent_id
             FROM asset_paths path JOIN locations parent
               ON parent.organization_id=path.organization_id AND parent.id=path.parent_id
         ), recipients AS (
           SELECT DISTINCT overdue.organization_id,assignment.user_id,overdue.cycle_id,overdue.asset_id,
                  overdue.asset_tag,overdue.asset_name,overdue.location_id,overdue.location_name,overdue.grace_ends_at
             FROM overdue_assets overdue
             JOIN asset_paths path ON path.organization_id=overdue.organization_id
               AND path.cycle_id=overdue.cycle_id AND path.asset_id=overdue.asset_id
             JOIN role_assignments assignment ON assignment.organization_id=overdue.organization_id
             JOIN users member ON member.organization_id=assignment.organization_id AND member.id=assignment.user_id AND member.active=true
             JOIN role_permissions permission ON permission.role_key=assignment.role_key AND permission.permission_key='asset:read'
            WHERE (assignment.role_key='head_office' AND assignment.scope_location_id IS NULL)
               OR assignment.scope_location_id=path.location_id
         )
         INSERT INTO notification_inbox (
           organization_id,recipient_user_id,notification_key,kind,severity,title,description,
           asset_id,asset_tag,asset_name,location_name,related_id,occurred_at
         )
         SELECT recipient.organization_id,recipient.user_id,
                'unseen:'||recipient.cycle_id::text||':'||recipient.asset_id::text,
                'verification_overdue','medium','Not seen after the scan window',
                'Contact the centre and check the last recorded location. This is not a confirmed loss.',
                recipient.asset_id,recipient.asset_tag,recipient.asset_name,recipient.location_name,
                recipient.cycle_id,recipient.grace_ends_at
           FROM recipients recipient
         ON CONFLICT (organization_id,recipient_user_id,notification_key) DO NOTHING`,
      );
    });
  }

  async runOneJob(): Promise<boolean> {
    let eventId: string | null = null;
    try {
      return await this.database.transaction(async (query) => {
        const rows = await query<OutboxEvent>(
          `SELECT id,organization_id AS "organizationId",event_type AS "eventType",payload
             FROM notification_outbox
            WHERE delivered_at IS NULL AND dead_lettered_at IS NULL AND available_at<=now() AND attempts<$1
            ORDER BY available_at,created_at,id
            FOR UPDATE SKIP LOCKED LIMIT 1`,
          [MAX_ATTEMPTS],
        );
        const event = rows[0];
        if (!event) return false;
        eventId = event.id;
        await this.deliver(query, event);
        await query(
          `UPDATE notification_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL
            WHERE id=$1::uuid AND organization_id=$2::uuid AND delivered_at IS NULL`,
          [event.id, event.organizationId],
        );
        return true;
      });
    } catch {
      if (eventId) await this.recordFailure(eventId);
      this.logger.warn(`Notification outbox event ${eventId ?? 'unclaimed'} failed; retry state was recorded.`);
      return Boolean(eventId);
    }
  }

  private async deliver(query: SqlQuery, event: OutboxEvent): Promise<void> {
    const payload = this.payload(event.payload);
    if (event.eventType === 'asset.marked_missing') {
      const assetId = this.uuid(payload.assetId);
      const rows = await query<{
        assetId: string;
        assetTag: string;
        assetName: string;
        status: string;
        locationId: string;
        locationName: string;
        occurredAt: Date | string;
      }>(
        `SELECT a.id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",a.status::text AS status,
                a.location_id AS "locationId",l.name AS "locationName",a.updated_at AS "occurredAt"
           FROM assets a JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
          WHERE a.organization_id=$1::uuid AND a.id=$2::uuid`,
        [event.organizationId, assetId],
      );
      const asset = rows[0];
      if (!asset) throw new Error('Missing asset event target does not exist');
      if (asset.status !== 'missing') return;
      await this.store(query, event, {
        notificationKey: `missing:${asset.assetId}`,
        kind: 'missing',
        severity: 'high',
        title: 'Asset marked missing',
        description: 'Review the last known location and record the investigation outcome.',
        assetId: asset.assetId,
        assetTag: asset.assetTag,
        assetName: asset.assetName,
        locationId: asset.locationId,
        locationName: asset.locationName,
        relatedId: null,
        occurredAt: asset.occurredAt,
        permission: 'asset:read',
      });
      return;
    }

    if (event.eventType === 'condition.reported') {
      const reportId = this.uuid(payload.reportId);
      const rows = await query<{
        reportId: string;
        assetId: string;
        assetTag: string;
        assetName: string;
        locationId: string;
        locationName: string;
        reportKind: string;
        urgency: string;
        description: string;
        occurredAt: Date | string;
        transferBatchId: string | null;
      }>(
        `SELECT r.id AS "relatedId",r.id AS "reportId",r.asset_id AS "assetId",a.asset_tag AS "assetTag",
                a.name AS "assetName",a.location_id AS "locationId",l.name AS "locationName",r.kind::text AS "reportKind",
                r.urgency,r.description,r.reported_at AS "occurredAt",$3::uuid AS "transferBatchId"
           FROM condition_reports r JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id
           JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
          WHERE r.organization_id=$1::uuid AND r.id=$2::uuid`,
        [event.organizationId, reportId, payload.transferBatchId ? this.uuid(payload.transferBatchId) : null],
      );
      const report = rows[0];
      if (!report) throw new Error('Report event target does not exist');
      if (report.transferBatchId) return;
      const urgent = report.urgency === 'urgent';
      await this.store(query, event, {
        notificationKey: `${urgent ? 'report' : 'condition-report'}:${report.reportId}`,
        kind: urgent ? 'urgent_report' : 'condition_report',
        severity: urgent || report.urgency === 'high' ? 'high' : report.urgency === 'low' ? 'low' : 'medium',
        title: urgent ? 'Urgent asset report is unresolved' : 'Condition report needs attention',
        description: report.description,
        assetId: report.assetId,
        assetTag: report.assetTag,
        assetName: report.assetName,
        locationId: report.locationId,
        locationName: report.locationName,
        relatedId: report.reportId,
        occurredAt: report.occurredAt,
        permission: 'asset:read',
      });
      return;
    }

    if (event.eventType === 'transfer_batch.requested') {
      const batchId = this.uuid(payload.batchId);
      const rows = await query<{
        batchId: string;
        batchReference: string;
        fromLocationId: string;
        fromLocationName: string;
        toLocationName: string;
        itemCount: number;
        assetId: string;
        assetTag: string;
        assetName: string;
        occurredAt: Date | string;
      }>(
        `SELECT b.id AS "batchId",b.batch_reference AS "batchReference",b.from_location_id AS "fromLocationId",
                source.name AS "fromLocationName",destination.name AS "toLocationName",
                (SELECT count(*)::int FROM transfer_batch_items i WHERE i.organization_id=b.organization_id AND i.batch_id=b.id) AS "itemCount",
                first_asset.id AS "assetId",first_asset.asset_tag AS "assetTag",first_asset.name AS "assetName",b.requested_at AS "occurredAt"
           FROM transfer_batches b
           JOIN locations source ON source.organization_id=b.organization_id AND source.id=b.from_location_id
           JOIN locations destination ON destination.organization_id=b.organization_id AND destination.id=b.to_location_id
           JOIN LATERAL (
             SELECT a.id,a.asset_tag,a.name FROM transfer_batch_items i
             JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
              WHERE i.organization_id=b.organization_id AND i.batch_id=b.id ORDER BY a.asset_tag,a.id LIMIT 1
           ) first_asset ON true
          WHERE b.organization_id=$1::uuid AND b.id=$2::uuid`,
        [event.organizationId, batchId],
      );
      const batch = rows[0];
      if (!batch) throw new Error('Transfer event target does not exist');
      await this.store(query, event, {
        notificationKey: `transfer-batch-requested:${batch.batchId}`,
        kind: 'transfer_batch_requested',
        severity: 'medium',
        title: 'Transfer awaiting approval',
        description: `${batch.batchReference} · ${batch.itemCount} item${batch.itemCount === 1 ? '' : 's'} from ${batch.fromLocationName} to ${batch.toLocationName}. Review the manifest before dispatch.`,
        assetId: batch.assetId,
        assetTag: batch.assetTag,
        assetName: batch.assetName,
        locationId: batch.fromLocationId,
        locationName: batch.fromLocationName,
        relatedId: batch.batchId,
        occurredAt: batch.occurredAt,
        permission: 'transfer:approve',
      });
      return;
    }

    if (event.eventType === 'transfer_batch.discrepancy') {
      const batchId = this.uuid(payload.batchId);
      const rows = await query<{
        batchId: string;
        batchReference: string;
        itemCount: number;
        assetId: string;
        assetTag: string;
        assetName: string;
        receiptStatus: string;
        note: string | null;
        locationId: string;
        locationName: string;
        occurredAt: Date | string;
      }>(
        `SELECT b.id AS "batchId",b.batch_reference AS "batchReference",
                (SELECT count(*)::int FROM transfer_batch_items count_item WHERE count_item.organization_id=b.organization_id AND count_item.batch_id=b.id AND count_item.receipt_status<>'accepted') AS "itemCount",
                a.id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",i.receipt_status::text AS "receiptStatus",
                i.receipt_discrepancy_note AS note,a.location_id AS "locationId",l.name AS "locationName",i.scanned_at_receipt AS "occurredAt"
           FROM transfer_batches b JOIN transfer_batch_items i ON i.organization_id=b.organization_id AND i.batch_id=b.id
           JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
           JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
          WHERE b.organization_id=$1::uuid AND b.id=$2::uuid AND i.receipt_status IN ('damaged','not_received')
          ORDER BY a.asset_tag,a.id`,
        [event.organizationId, batchId],
      );
      if (!rows.length) throw new Error('Transfer discrepancy event has no discrepant items');
      for (const item of rows) {
        const notReceived = item.receiptStatus === 'not_received';
        await this.store(query, event, {
          notificationKey: `batch-discrepancy:${item.batchId}:${item.assetId}`,
          kind: 'transfer_discrepancy',
          severity: notReceived ? 'high' : 'medium',
          title: notReceived ? 'Item not confirmed at destination' : 'Asset arrived damaged',
          description: `${item.batchReference} · ${item.itemCount} item${item.itemCount === 1 ? '' : 's'} need review. ${item.note ?? ''}`.trim(),
          assetId: item.assetId,
          assetTag: item.assetTag,
          assetName: item.assetName,
          locationId: item.locationId,
          locationName: item.locationName,
          relatedId: item.batchId,
          occurredAt: item.occurredAt,
          permission: 'asset:read',
        });
      }
      return;
    }

    throw new Error('Unsupported outbox event type');
  }

  private async store(query: SqlQuery, event: OutboxEvent, notice: Notice): Promise<void> {
    const recipients = await query<{ userId: string }>(
      `WITH RECURSIVE scope_path(id,parent_id) AS (
         SELECT id,parent_id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
         UNION
         SELECT parent.id,parent.parent_id FROM locations parent JOIN scope_path child ON child.parent_id=parent.id
          WHERE parent.organization_id=$1::uuid
       )
       SELECT DISTINCT assignment.user_id AS "userId"
         FROM role_assignments assignment
         JOIN users member ON member.organization_id=assignment.organization_id AND member.id=assignment.user_id AND member.active=true
         JOIN role_permissions permission ON permission.role_key=assignment.role_key AND permission.permission_key=$3
        WHERE assignment.organization_id=$1::uuid
          AND ((assignment.role_key='head_office' AND assignment.scope_location_id IS NULL)
            OR assignment.scope_location_id IN (SELECT id FROM scope_path))`,
      [event.organizationId, notice.locationId, notice.permission],
    );
    if (!recipients.length) return;
    await query(
      `INSERT INTO notification_inbox (
         organization_id,recipient_user_id,notification_key,kind,severity,title,description,
         asset_id,asset_tag,asset_name,location_name,related_id,occurred_at
       )
       SELECT $1::uuid,recipient.user_id,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10,$11::uuid,$12::timestamptz
         FROM unnest($13::uuid[]) AS recipient(user_id)
       ON CONFLICT (organization_id,recipient_user_id,notification_key) DO NOTHING`,
      [event.organizationId, notice.notificationKey, notice.kind, notice.severity, notice.title, notice.description,
        notice.assetId, notice.assetTag, notice.assetName, notice.locationName, notice.relatedId, notice.occurredAt,
        recipients.map((recipient) => recipient.userId)],
    );
  }

  private async recordFailure(eventId: string): Promise<void> {
    try {
      await this.database.query(
        `UPDATE notification_outbox
            SET attempts=attempts+1,last_error='delivery_failed',
                available_at=now()+LEAST(10*power(2,attempts+1),3600)*interval '1 second',
                dead_lettered_at=CASE WHEN attempts+1 >= $2 THEN now() ELSE NULL END
          WHERE id=$1::uuid AND delivered_at IS NULL AND dead_lettered_at IS NULL`,
        [eventId, MAX_ATTEMPTS],
      );
    } catch {
      this.logger.error(`Notification outbox retry state could not be recorded for event ${eventId}.`);
    }
  }

  private payload(value: OutboxEvent['payload']): Record<string, unknown> {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid outbox payload');
    return parsed as Record<string, unknown>;
  }

  private uuid(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('Invalid outbox entity identifier');
    }
    return value;
  }
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, POLL_INTERVAL_MS);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
