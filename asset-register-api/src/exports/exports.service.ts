import { BadRequestException, ConflictException, GoneException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import { ObjectStorageService } from '../evidence/object-storage.service';
import type { CreateAssetExportDto } from './export.dto';

export interface AssetExportJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';
  scopeLocationId: string | null;
  scopeLocationName: string | null;
  filters: { status: string | null; search: string | null };
  processedRows: number;
  resultBytes: number | null;
  resultSha256: string | null;
  failureCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

interface ExportJobRow extends AssetExportJob {
  requestedBy: string;
  organizationId: string;
  clientRequestId: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  objectKey: string | null;
  attemptCount: number;
}

const JOB_COLUMNS = `j.id, j.organization_id AS "organizationId", j.requested_by AS "requestedBy",
  j.client_request_id AS "clientRequestId", j.scope_location_id AS "scopeLocationId", l.name AS "scopeLocationName",
  j.filters, j.status, j.attempt_count AS "attemptCount", j.lease_token AS "leaseToken",
  j.lease_expires_at AS "leaseExpiresAt", j.processed_rows AS "processedRows",
  j.result_object_key AS "objectKey", j.result_bytes AS "resultBytes", j.result_sha256 AS "resultSha256",
  j.failure_code AS "failureCode", j.created_at AS "createdAt", j.started_at AS "startedAt",
  j.completed_at AS "completedAt", j.expires_at AS "expiresAt"`;

@Injectable()
export class ExportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly storage: ObjectStorageService,
  ) {}

  async createAssetExport(actor: ActorContext, dto: CreateAssetExportDto): Promise<AssetExportJob> {
    const scopeLocationId = dto.scopeLocationId ?? null;
    if (scopeLocationId) {
      await this.authorization.assertLocationAccess(actor, scopeLocationId, ['head_office', 'state_head', 'centre_head']);
    } else if (!actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null)) {
      throw new BadRequestException('Choose a location scope for this export');
    }

    const filters = { status: dto.status ?? null, search: dto.search?.trim() || null };
    return this.database.transaction(async (query) => {
      await query('SELECT id FROM organizations WHERE id = $1::uuid FOR UPDATE', [actor.organizationId]);
      const prior = await query<ExportJobRow>(
        `SELECT ${JOB_COLUMNS} FROM asset_export_jobs j LEFT JOIN locations l
           ON l.organization_id = j.organization_id AND l.id = j.scope_location_id
         WHERE j.organization_id = $1::uuid AND j.requested_by = $2::uuid AND j.client_request_id = $3::uuid`,
        [actor.organizationId, actor.userId, dto.clientRequestId],
      );
      if (prior[0]) {
        if (prior[0].scopeLocationId?.toLowerCase() !== scopeLocationId?.toLowerCase()
          || JSON.stringify(normalizeFilters(prior[0].filters)) !== JSON.stringify(filters)) {
          throw new ConflictException('This request ID was already used for a different export');
        }
        return this.publicJob(prior[0]);
      }
      const queue = await query<{ userCount: number | string; organizationCount: number | string }>(
        `SELECT count(*) FILTER (WHERE requested_by = $2::uuid) AS "userCount", count(*) AS "organizationCount"
           FROM asset_export_jobs WHERE organization_id = $1::uuid AND status IN ('queued','running')`,
        [actor.organizationId, actor.userId],
      );
      if (Number(queue[0]?.userCount ?? 0) >= 3 || Number(queue[0]?.organizationCount ?? 0) >= 50) {
        throw new HttpException('Too many exports are already queued. Wait for one to finish before requesting another.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const inserted = await query<ExportJobRow>(
        `INSERT INTO asset_export_jobs (organization_id, requested_by, scope_location_id, client_request_id, filters)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb)
         ON CONFLICT (organization_id, requested_by, client_request_id) DO NOTHING
         RETURNING ${JOB_COLUMNS.replaceAll('j.', 'asset_export_jobs.').replaceAll('l.name AS "scopeLocationName"', 'NULL::text AS "scopeLocationName"')}`,
        [actor.organizationId, actor.userId, scopeLocationId, dto.clientRequestId, JSON.stringify(filters)],
      );
      if (inserted[0]) {
        await query(
          `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
           VALUES ($1::uuid, $2::uuid, 'asset.export_requested', 'asset_export', $3::uuid, $4::jsonb)`,
          [actor.organizationId, actor.userId, inserted[0].id, JSON.stringify({ scopeLocationId, status: filters.status })],
        );
        return this.publicJob(inserted[0]);
      }

      const existing = await query<ExportJobRow>(
        `SELECT ${JOB_COLUMNS} FROM asset_export_jobs j LEFT JOIN locations l
           ON l.organization_id = j.organization_id AND l.id = j.scope_location_id
         WHERE j.organization_id = $1::uuid AND j.requested_by = $2::uuid AND j.client_request_id = $3::uuid`,
        [actor.organizationId, actor.userId, dto.clientRequestId],
      );
      if (!existing[0]) throw new ConflictException('The export request is being registered. Retry with the same request ID.');
      if (existing[0].scopeLocationId?.toLowerCase() !== scopeLocationId?.toLowerCase()
        || JSON.stringify(normalizeFilters(existing[0].filters)) !== JSON.stringify(filters)) {
        throw new ConflictException('This request ID was already used for a different export');
      }
      return this.publicJob(existing[0]);
    });
  }

  async list(actor: ActorContext): Promise<AssetExportJob[]> {
    const rows = await this.database.query<ExportJobRow>(
      `SELECT ${JOB_COLUMNS} FROM asset_export_jobs j LEFT JOIN locations l
         ON l.organization_id = j.organization_id AND l.id = j.scope_location_id
       WHERE j.organization_id = $1::uuid AND j.requested_by = $2::uuid
       ORDER BY j.created_at DESC, j.id DESC LIMIT 100`,
      [actor.organizationId, actor.userId],
    );
    return rows.map((row) => this.publicJob(row));
  }

  async get(actor: ActorContext, id: string): Promise<AssetExportJob> {
    const row = await this.ownedJob(actor, id);
    return this.publicJob(row);
  }

  async cancel(actor: ActorContext, id: string): Promise<AssetExportJob> {
    return this.database.transaction(async (query) => {
      const rows = await query<ExportJobRow>(
        `UPDATE asset_export_jobs j SET status = 'cancelled', updated_at = now()
         WHERE j.organization_id = $1::uuid AND j.requested_by = $2::uuid AND j.id = $3::uuid AND j.status = 'queued'
         RETURNING ${JOB_COLUMNS.replaceAll('l.name AS "scopeLocationName"', 'NULL::text AS "scopeLocationName"')}`,
        [actor.organizationId, actor.userId, id],
      );
      if (rows[0]) {
        await query(
          `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
           VALUES ($1::uuid, $2::uuid, 'asset.export_cancelled', 'asset_export', $3::uuid, '{}'::jsonb)`,
          [actor.organizationId, actor.userId, id],
        );
        return this.publicJob(rows[0]);
      }
      const existing = await this.ownedJob(actor, id, query);
      if (existing.status === 'cancelled') return this.publicJob(existing);
      if (existing.status === 'running') throw new ConflictException('This export is already being prepared and cannot be cancelled');
      throw new ConflictException('Only a queued export can be cancelled');
    });
  }

  async download(actor: ActorContext, id: string) {
    const job = await this.ownedJob(actor, id);
    if (job.status === 'expired' || (job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now())) {
      throw new GoneException('This export has expired. Create a new export to download the current register.');
    }
    if (job.status !== 'completed' || !job.objectKey) throw new ConflictException('This export is not ready to download');
    if (job.scopeLocationId) {
      await this.authorization.assertLocationAccess(actor, job.scopeLocationId, ['head_office', 'state_head', 'centre_head']);
    } else if (!actor.memberships.some((membership) => membership.role === 'head_office' && membership.scopeLocationId === null)) {
      throw new NotFoundException('Export was not found');
    }
    const downloadUrl = await this.storage.createExportDownloadUrl(job.objectKey, job.id);
    await this.database.query(
      `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
       VALUES ($1::uuid, $2::uuid, 'asset.export_download_requested', 'asset_export', $3::uuid, $4::jsonb)`,
      [actor.organizationId, actor.userId, job.id, JSON.stringify({ expiresInSeconds: 300, sha256: job.resultSha256 })],
    );
    return { downloadUrl, expiresInSeconds: 300, sha256: job.resultSha256, byteSize: job.resultBytes };
  }

  async ownedJob(actor: ActorContext, id: string, query = this.database.query.bind(this.database)): Promise<ExportJobRow> {
    const rows = await query<ExportJobRow>(
      `SELECT ${JOB_COLUMNS} FROM asset_export_jobs j LEFT JOIN locations l
         ON l.organization_id = j.organization_id AND l.id = j.scope_location_id
       WHERE j.organization_id = $1::uuid AND j.requested_by = $2::uuid AND j.id = $3::uuid`,
      [actor.organizationId, actor.userId, id],
    );
    if (!rows[0]) throw new NotFoundException('Export was not found');
    return rows[0];
  }

  private publicJob(row: ExportJobRow): AssetExportJob {
    return {
      id: row.id,
      status: row.status,
      scopeLocationId: row.scopeLocationId,
      scopeLocationName: row.scopeLocationName,
      filters: row.filters,
      processedRows: Number(row.processedRows),
      resultBytes: row.resultBytes === null ? null : Number(row.resultBytes),
      resultSha256: row.resultSha256,
      failureCode: row.failureCode,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };
  }
}

function normalizeFilters(value: unknown): { status: string | null; search: string | null } {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) as unknown; } catch { parsed = {}; }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { status: null, search: null };
  const filters = parsed as Record<string, unknown>;
  return {
    status: typeof filters.status === 'string' ? filters.status : null,
    search: typeof filters.search === 'string' ? filters.search : null,
  };
}
