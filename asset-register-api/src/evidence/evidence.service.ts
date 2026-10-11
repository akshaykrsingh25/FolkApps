import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { CreateEvidenceUploadDto, LinkInvoiceDto } from './evidence.dto';
import { ObjectStorageService } from './object-storage.service';

interface UploadIntent {
  id: string; assetId: string; objectKey: string; kind: string; originalName: string;
  contentType: string; byteSize: number; expiresAt: string;
  sha256: string;
  visualHash: string | null;
}

@Injectable()
export class EvidenceService {
  constructor(private readonly database: DatabaseService, private readonly authorization: AuthorizationService, private readonly storage: ObjectStorageService) {}

  private async assertWritableAsset(actor: ActorContext, assetId: string) {
    const rows = await this.database.query<{ locationId: string }>(
      'SELECT location_id AS "locationId" FROM assets WHERE organization_id=$1::uuid AND id=$2::uuid',
      [actor.organizationId,assetId],
    );
    if (!rows[0]) throw new NotFoundException('Asset was not found');
    await this.authorization.assertLocationAccess(actor, rows[0].locationId, ['head_office', 'state_head', 'centre_head', 'asset_custodian']);
  }

  async linkInvoice(actor: ActorContext, assetId: string, dto: LinkInvoiceDto) {
    await this.assertWritableAsset(actor, assetId);
    await this.assertWritableAsset(actor, dto.sourceAssetId);
    return this.database.transaction(async query => {
      const source = await query<{ objectKey:string }>(
        `SELECT object_key AS "objectKey" FROM evidence
         WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid AND kind='invoice'`,
        [actor.organizationId,dto.sourceAssetId,dto.evidenceId]);
      if(!source[0]) throw new NotFoundException('The source invoice was not found');
      const saved = await query<{id:string}>(
        `INSERT INTO evidence(id,organization_id,asset_id,kind,object_key,original_name,content_type,byte_size,sha256,uploaded_by)
         SELECT $4::uuid,organization_id,$5::uuid,kind,object_key,original_name,content_type,byte_size,sha256,$6::uuid
           FROM evidence WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid AND kind='invoice'
         ON CONFLICT(id) DO NOTHING RETURNING id`,
        [actor.organizationId,dto.sourceAssetId,dto.evidenceId,dto.linkId,assetId,actor.userId]);
      if(!saved[0]) {
        const replay=await query<{id:string}>(`SELECT id FROM evidence WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid AND object_key=$4 AND kind='invoice'`,[actor.organizationId,assetId,dto.linkId,source[0].objectKey]);
        if(!replay[0]) throw new ConflictException('This invoice-link request was already used for a different record');
        return replay[0];
      }
      await query(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES($1::uuid,$2::uuid,'evidence.invoice_linked','asset',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,assetId,JSON.stringify({sourceAssetId:dto.sourceAssetId,sourceEvidenceId:dto.evidenceId,evidenceId:dto.linkId})]);
      return saved[0];
    });
  }

  async createUpload(actor: ActorContext, assetId: string, dto: CreateEvidenceUploadDto) {
    if (dto.visualHash && dto.kind !== 'asset_photo') throw new BadRequestException('Visual matching is available for asset photos only');
    await this.assertWritableAsset(actor, assetId);
    const id = dto.clientEvidenceId || randomUUID();
    const completed = await this.database.query<{ id: string }>(
      'SELECT id FROM evidence WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid',
      [actor.organizationId,assetId,id],
    );
    if (completed[0]) return { evidenceId: id, alreadyCompleted: true, uploadUrl: null, headers: {}, expiresInSeconds: 0 };
    const objectKey = `${actor.organizationId}/assets/${assetId}/${id}`;
    const signed = await this.storage.createUploadUrl({ key: objectKey, contentType: dto.contentType, sha256: dto.sha256.toLowerCase() });
    await this.database.query(
      `INSERT INTO evidence_upload_intents (id,organization_id,asset_id,object_key,kind,original_name,content_type,byte_size,sha256,uploaded_by,visual_hash)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::evidence_kind,$6,$7,$8,$9,$10::uuid,$11)
       ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,original_name=EXCLUDED.original_name,
         content_type=EXCLUDED.content_type,byte_size=EXCLUDED.byte_size,sha256=EXCLUDED.sha256,
         uploaded_by=EXCLUDED.uploaded_by,visual_hash=EXCLUDED.visual_hash,expires_at=now()+interval '20 minutes'
       WHERE evidence_upload_intents.organization_id=EXCLUDED.organization_id AND evidence_upload_intents.asset_id=EXCLUDED.asset_id`,
      [id,actor.organizationId,assetId,objectKey,dto.kind,dto.originalName,dto.contentType,dto.byteSize,dto.sha256.toLowerCase(),actor.userId,dto.visualHash?.toLowerCase()??null],
    );
    return { evidenceId: id, uploadUrl: signed.url, headers: signed.headers, expiresInSeconds: 600 };
  }

  async completeUpload(actor: ActorContext, assetId: string, evidenceId: string) {
    const intents = await this.database.query<UploadIntent>(
      `SELECT id,asset_id AS "assetId",object_key AS "objectKey",kind,original_name AS "originalName",
              content_type AS "contentType",byte_size AS "byteSize",sha256,visual_hash AS "visualHash","expires_at" AS "expiresAt"
         FROM evidence_upload_intents WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid AND expires_at>now()`,
      [actor.organizationId,assetId,evidenceId],
    );
    const intent = intents[0];
    if (!intent) throw new NotFoundException('The upload expired or was already completed. Start the upload again.');
    await this.assertWritableAsset(actor, assetId);
    await this.storage.verifyUpload(intent.objectKey, { contentType: intent.contentType, byteSize: Number(intent.byteSize), sha256: intent.sha256 });
    return this.database.transaction(async (query) => {
      const saved = await query<{ id: string; kind: string; originalName: string; contentType: string; byteSize: number; createdAt: string }>(
        `INSERT INTO evidence (id,organization_id,asset_id,kind,object_key,original_name,content_type,byte_size,sha256,uploaded_by,visual_hash)
         SELECT id,organization_id,asset_id,kind,object_key,original_name,content_type,byte_size,sha256,uploaded_by,visual_hash
           FROM evidence_upload_intents WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid
         ON CONFLICT (organization_id,id) DO NOTHING
         RETURNING id,kind,original_name AS "originalName",content_type AS "contentType",byte_size AS "byteSize",created_at AS "createdAt"`,
        [actor.organizationId,assetId,evidenceId],
      );
      if (!saved[0]) throw new NotFoundException('The upload was already completed');
      if (intent.kind==='asset_photo'&&intent.visualHash) {
        const visualHash=intent.visualHash.toLowerCase();
        const bandValues=Array.from({length:8},(_,index)=>Number.parseInt(visualHash.slice(index*2,index*2+2),16));
        await query('UPDATE assets SET visual_hash=$3 WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,assetId,visualHash]);
        await query('DELETE FROM asset_visual_hash_bands WHERE organization_id=$1::uuid AND asset_id=$2::uuid',[actor.organizationId,assetId]);
        await query(
          `INSERT INTO asset_visual_hash_bands(organization_id,asset_id,band,band_hash)
           SELECT $1::uuid,$2::uuid,(ordinality-1)::smallint,value FROM unnest($3::smallint[]) WITH ORDINALITY AS bands(value,ordinality)`,
          [actor.organizationId,assetId,bandValues],
        );
      }
      await query('DELETE FROM evidence_upload_intents WHERE organization_id=$1::uuid AND id=$2::uuid', [actor.organizationId,evidenceId]);
      await query(
        `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
         VALUES ($1::uuid,$2::uuid,'evidence.uploaded','asset',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,assetId,JSON.stringify({ evidenceId,kind:intent.kind,byteSize:intent.byteSize })],
      );
      return saved[0];
    });
  }

  async list(actor: ActorContext, assetId: string) {
    await this.assertWritableAsset(actor, assetId);
    return this.database.query(
      `SELECT id,kind,original_name AS "originalName",content_type AS "contentType",byte_size AS "byteSize",created_at AS "createdAt"
       FROM evidence WHERE organization_id=$1::uuid AND asset_id=$2::uuid ORDER BY created_at DESC`,
      [actor.organizationId,assetId],
    );
  }

  async download(actor: ActorContext, assetId: string, evidenceId: string) {
    const rows = await this.database.query<{ objectKey: string }>(
      `SELECT object_key AS "objectKey" FROM evidence WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND id=$3::uuid`,
      [actor.organizationId,assetId,evidenceId],
    );
    if (!rows[0]) throw new NotFoundException('Evidence was not found');
    await this.assertWritableAsset(actor, assetId);
    return { downloadUrl: await this.storage.createDownloadUrl(rows[0].objectKey), expiresInSeconds: 300 };
  }
}
