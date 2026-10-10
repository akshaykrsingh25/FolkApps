import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { SqlQuery } from '../database.service';
import { ObjectStorageService } from '../evidence/object-storage.service';

interface ClaimedExport {
  id: string;
  organizationId: string;
  requestedBy: string;
  scopeLocationId: string | null;
  filters: { status: string | null; search: string | null };
  leaseToken: string;
  attemptCount: number;
}

interface CsvAssetRow {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  ownershipType: string;
  locationName: string;
  locationCode: string | null;
  purchaseDate: string | null;
  purchaseAmount: string | null;
  currency: string;
  sellerName: string | null;
  sellerPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CsvStats {
  rows: number;
  bytes: number;
  hash: ReturnType<typeof createHash>;
}

class ExportFailure extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

const PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 250_000;
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;
const FILE_HEADER = [
  'Asset Tag', 'Name', 'Category', 'Serial Number', 'Manufacturer', 'Model', 'Status', 'Condition',
  'Ownership', 'Location', 'Location Code', 'Purchase Date', 'Purchase Amount', 'Currency',
  'Seller Name', 'Seller Phone', 'Created At', 'Updated At',
].map(csvCell).join(',') + '\r\n';

@Injectable()
export class ExportWorkerService {
  private readonly logger = new Logger(ExportWorkerService.name);
  private lastCleanupAt = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly storage: ObjectStorageService,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        if (Date.now() - this.lastCleanupAt >= 60_000) {
          await this.expireOldExports();
          this.lastCleanupAt = Date.now();
        }
        const didWork = await this.runOneJob();
        if (!didWork) await waitForPoll(signal);
      } catch {
        this.logger.error('Export worker loop failed; it will retry after a short delay.');
        await waitForPoll(signal);
      }
    }
  }

  async runOneJob(): Promise<boolean> {
    await this.database.query(
      `UPDATE asset_export_jobs SET status = 'failed', failure_code = 'retry_limit', lease_token = NULL,
         lease_expires_at = NULL, updated_at = now(), completed_at = now()
       WHERE status = 'running' AND lease_expires_at <= now() AND attempt_count >= 3`,
    );
    const jobs = await this.database.query<ClaimedExport>(
      `WITH candidate AS (
         SELECT id FROM asset_export_jobs
          WHERE (status = 'queued' AND attempt_count < 3)
             OR (status = 'running' AND lease_expires_at <= now() AND attempt_count < 3)
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE asset_export_jobs job SET status = 'running', attempt_count = job.attempt_count + 1,
         lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes',
         started_at = COALESCE(job.started_at, now()), updated_at = now(), failure_code = NULL
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.id, job.organization_id AS "organizationId", job.requested_by AS "requestedBy",
         job.scope_location_id AS "scopeLocationId", job.filters, job.lease_token AS "leaseToken",
         job.attempt_count AS "attemptCount"`,
    );
    if (!jobs[0]) return false;
    await this.processJob(jobs[0]);
    return true;
  }

  async expireOldExports(): Promise<void> {
    await this.database.query(
      `UPDATE asset_export_jobs SET status = 'expired', updated_at = now()
       WHERE status = 'completed' AND expires_at <= now()`,
    );
    const expired = await this.database.query<{ id: string; organizationId: string; objectKey: string }>(
      `SELECT id, organization_id AS "organizationId", result_object_key AS "objectKey"
         FROM asset_export_jobs WHERE status = 'expired' AND result_object_key IS NOT NULL
         ORDER BY expires_at LIMIT 20`,
    );
    for (const item of expired) {
      try {
        await this.storage.deletePrivateObject(item.objectKey);
        await this.database.query(
          `UPDATE asset_export_jobs SET result_object_key = NULL, result_sha256 = NULL, result_bytes = NULL, updated_at = now()
           WHERE organization_id = $1::uuid AND id = $2::uuid AND status = 'expired' AND result_object_key = $3`,
          [item.organizationId, item.id, item.objectKey],
        );
      } catch {
        this.logger.warn(`Expired export cleanup will retry for job ${item.id}.`);
      }
    }
  }

  private async processJob(job: ClaimedExport): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'incuasset-export-'));
    const filePath = join(directory, 'assets.csv');
    let objectKey: string | null = null;
    try {
      await this.assertCurrentAccess(job);
      const stats: CsvStats = { rows: 0, bytes: 0, hash: createHash('sha256') };
      await this.database.transaction(async (snapshotQuery) => {
        await snapshotQuery('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await pipeline(Readable.from(this.csvChunks(job, stats, snapshotQuery)), createWriteStream(filePath, { flags: 'wx' }));
      });
      const file = await stat(filePath);
      if (file.size !== stats.bytes) throw new ExportFailure('file_size_mismatch', true);
      const sha256 = stats.hash.digest('hex');
      objectKey = `${job.organizationId}/exports/${job.id}/${job.leaseToken}.csv`;
      await this.assertCurrentAccess(job);
      await this.storage.uploadPrivateFile({
        key: objectKey,
        filePath,
        byteSize: stats.bytes,
        sha256,
        contentType: 'text/csv; charset=utf-8',
      });

      const completed = await this.database.transaction(async (query) => {
        const rows = await query<{ id: string }>(
          `UPDATE asset_export_jobs SET status = 'completed', processed_rows = $4, result_object_key = $5,
             result_sha256 = $6, result_bytes = $7, lease_token = NULL, lease_expires_at = NULL,
             completed_at = now(), expires_at = now() + interval '7 days', updated_at = now()
           WHERE organization_id = $1::uuid AND id = $2::uuid AND lease_token = $3::uuid AND status = 'running'
           RETURNING id`,
          [job.organizationId, job.id, job.leaseToken, stats.rows, objectKey, sha256, stats.bytes],
        );
        if (!rows[0]) return false;
        await query(
          `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
           VALUES ($1::uuid, $2::uuid, 'asset.export_completed', 'asset_export', $3::uuid, $4::jsonb)`,
          [job.organizationId, job.requestedBy, job.id, JSON.stringify({ rowCount: stats.rows, byteSize: stats.bytes, sha256 })],
        );
        return true;
      });
      if (!completed) await this.storage.deletePrivateObject(objectKey);
    } catch (error) {
      if (objectKey) await this.storage.deletePrivateObject(objectKey).catch(() => undefined);
      const failure = error instanceof ExportFailure
        ? error
        : new ExportFailure('export_processing_failed', true);
      await this.recordFailure(job, failure);
      this.logger.warn(`Asset export ${job.id} failed with ${failure.code}.`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async *csvChunks(job: ClaimedExport, stats: CsvStats, snapshotQuery: SqlQuery): AsyncGenerator<string> {
    yield this.trackChunk('\uFEFF' + FILE_HEADER, stats);
    let cursor: string | null = null;
    while (true) {
      const page: CsvAssetRow[] = await snapshotQuery<CsvAssetRow>(
        `WITH RECURSIVE assigned_scope(id) AS (
           SELECT scope_location_id FROM role_assignments
            WHERE organization_id = $1::uuid AND user_id = $2::uuid AND scope_location_id IS NOT NULL
           UNION
           SELECT child.id FROM locations child JOIN assigned_scope parent ON child.parent_id = parent.id
            WHERE child.organization_id = $1::uuid
         ), visible_locations(id) AS (
           SELECT id FROM assigned_scope
           UNION
           SELECT location.id FROM locations location WHERE location.organization_id = $1::uuid AND EXISTS (
             SELECT 1 FROM role_assignments WHERE organization_id = $1::uuid AND user_id = $2::uuid
               AND role_key = 'head_office' AND scope_location_id IS NULL
           )
         ), requested_scope(id) AS (
           SELECT id FROM locations WHERE organization_id = $1::uuid AND id = $3::uuid
           UNION ALL
           SELECT child.id FROM locations child JOIN requested_scope parent ON child.parent_id = parent.id
            WHERE child.organization_id = $1::uuid
         )
         SELECT a.id, a.asset_tag AS "assetTag", a.name, a.category, a.serial_number AS "serialNumber",
           a.manufacturer, a.model, a.status::text AS status, a.condition::text AS condition,
           a.ownership_type AS "ownershipType", l.name AS "locationName", l.code AS "locationCode",
           a.purchase_date::text AS "purchaseDate", a.purchase_amount::text AS "purchaseAmount", a.currency,
           a.seller_name AS "sellerName", a.seller_phone AS "sellerPhone",
           a.created_at::text AS "createdAt", a.updated_at::text AS "updatedAt"
         FROM assets a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
         WHERE a.organization_id = $1::uuid AND a.location_id IN (SELECT id FROM visible_locations)
           AND ($3::uuid IS NULL OR a.location_id IN (SELECT id FROM requested_scope))
           AND ($4::asset_status IS NULL OR a.status = $4::asset_status)
           AND ($5::text IS NULL OR concat_ws(' ', a.asset_tag, a.name, a.category, a.serial_number, a.manufacturer, a.model, l.name, l.code) ILIKE '%' || $5 || '%')
           AND ($6::uuid IS NULL OR a.id > $6::uuid)
         ORDER BY a.id LIMIT $7`,
        [job.organizationId, job.requestedBy, job.scopeLocationId, job.filters.status, job.filters.search, cursor, PAGE_SIZE + 1],
      );
      if (page.length === 0) break;
      const rows: CsvAssetRow[] = page.slice(0, PAGE_SIZE);
      for (const row of rows) {
        stats.rows += 1;
        if (stats.rows > MAX_EXPORT_ROWS) throw new ExportFailure('row_limit_exceeded', false);
        const fields = [row.assetTag, row.name, row.category, row.serialNumber, row.manufacturer, row.model, row.status,
          row.condition, row.ownershipType, row.locationName, row.locationCode, row.purchaseDate, row.purchaseAmount,
          row.currency, row.sellerName, row.sellerPhone, row.createdAt, row.updatedAt];
        yield this.trackChunk(fields.map(csvCell).join(',') + '\r\n', stats);
      }
      cursor = rows[rows.length - 1].id;
      await this.heartbeat(job, stats.rows, snapshotQuery);
      if (page.length <= PAGE_SIZE) break;
    }
  }

  private trackChunk(value: string, stats: CsvStats): string {
    const size = Buffer.byteLength(value, 'utf8');
    stats.bytes += size;
    if (stats.bytes > MAX_EXPORT_BYTES) throw new ExportFailure('file_limit_exceeded', false);
    stats.hash.update(value, 'utf8');
    return value;
  }

  private async heartbeat(job: ClaimedExport, processedRows: number, snapshotQuery: SqlQuery): Promise<void> {
    const rows = await snapshotQuery<{ id: string }>(
      `UPDATE asset_export_jobs SET processed_rows = $4, lease_expires_at = now() + interval '5 minutes', updated_at = now()
       WHERE organization_id = $1::uuid AND id = $2::uuid AND lease_token = $3::uuid AND status = 'running'
       RETURNING id`,
      [job.organizationId, job.id, job.leaseToken, processedRows],
    );
    if (!rows[0]) throw new ExportFailure('lease_lost', true);
  }

  private async assertCurrentAccess(job: ClaimedExport): Promise<void> {
    const assignments = await this.database.query<{ canExport: boolean; canExportOrganization: boolean }>(
      `SELECT
         EXISTS(SELECT 1 FROM users u JOIN role_assignments ra ON ra.organization_id = u.organization_id AND ra.user_id = u.id
           JOIN role_permissions rp ON rp.role_key = ra.role_key AND rp.permission_key = 'asset:export'
           WHERE u.organization_id = $1::uuid AND u.id = $2::uuid AND u.active = true) AS "canExport",
         EXISTS(SELECT 1 FROM users u JOIN role_assignments ra ON ra.organization_id = u.organization_id AND ra.user_id = u.id
           JOIN role_permissions rp ON rp.role_key = ra.role_key AND rp.permission_key = 'asset:export'
           WHERE u.organization_id = $1::uuid AND u.id = $2::uuid AND u.active = true
             AND ra.role_key = 'head_office' AND ra.scope_location_id IS NULL) AS "canExportOrganization"`,
      [job.organizationId, job.requestedBy],
    );
    if (!assignments[0]?.canExport) throw new ExportFailure('access_revoked', false);
    if (!job.scopeLocationId && !assignments[0].canExportOrganization) throw new ExportFailure('access_revoked', false);
    if (job.scopeLocationId) {
      try {
        const actor: ActorContext = { organizationId: job.organizationId, userId: job.requestedBy, subject: 'export-worker', memberships: [] };
        await this.authorization.assertLocationAccess(actor, job.scopeLocationId, ['head_office', 'state_head', 'centre_head']);
      } catch {
        throw new ExportFailure('access_revoked', false);
      }
    }
  }

  private async recordFailure(job: ClaimedExport, failure: ExportFailure): Promise<void> {
    const rows = await this.database.query<{ attemptCount: number }>(
      `UPDATE asset_export_jobs SET status = CASE WHEN $4::boolean OR attempt_count >= 3 THEN 'failed' ELSE 'queued' END,
         failure_code = $5, lease_token = NULL, lease_expires_at = NULL, updated_at = now(),
         completed_at = CASE WHEN $4::boolean OR attempt_count >= 3 THEN now() ELSE completed_at END
       WHERE organization_id = $1::uuid AND id = $2::uuid AND lease_token = $3::uuid
       RETURNING attempt_count AS "attemptCount"`,
      [job.organizationId, job.id, job.leaseToken, !failure.retryable, failure.code],
    );
    if (rows[0] && (!failure.retryable || rows[0].attemptCount >= 3)) {
      await this.database.query(
        `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
         VALUES ($1::uuid, $2::uuid, 'asset.export_failed', 'asset_export', $3::uuid, $4::jsonb)`,
        [job.organizationId, job.requestedBy, job.id, JSON.stringify({ failureCode: failure.code })],
      );
    }
  }
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 1500);
    signal.addEventListener('abort', finish, { once: true });
  });
}
