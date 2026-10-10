import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import type { CreateAssetDto, ListAssetsDto, UpdateAssetDto } from './asset.dto';
import { SignedQrService } from './signed-qr.service';

export interface AssetRow {
  id: string;
  locationId: string;
  locationName: string;
  assetTag: string;
  qrPublicId: string;
  rfidEpc: string | null;
  name: string;
  category: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  ownershipType: string;
  purchaseDate: string | null;
  purchaseAmount: string | null;
  currency: string;
  sellerName: string | null;
  sellerPhone: string | null;
  createdAt: string;
}

const ACCESSIBLE_LOCATION_CTE = `WITH RECURSIVE scope_locations(id) AS (
  SELECT scope_location_id FROM role_assignments
   WHERE organization_id = $1::uuid AND user_id = $2::uuid AND scope_location_id IS NOT NULL
  UNION
  SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id = parent.id
   WHERE child.organization_id = $1::uuid
), visible_locations(id) AS (
  SELECT id FROM scope_locations
  UNION
  SELECT id FROM locations WHERE organization_id = $1::uuid AND EXISTS (
    SELECT 1 FROM role_assignments WHERE organization_id = $1::uuid AND user_id = $2::uuid
      AND role_key = 'head_office' AND scope_location_id IS NULL
  )
)`;

const ASSET_COLUMNS = `a.id, a.location_id AS "locationId", l.name AS "locationName", a.asset_tag AS "assetTag",
  a.qr_public_id::text AS "qrPublicId", a.rfid_epc AS "rfidEpc", a.name, a.category, a.serial_number AS "serialNumber",
  a.manufacturer, a.model, a.status, a.condition, a.ownership_type AS "ownershipType", a.purchase_date AS "purchaseDate",
  a.purchase_amount::text AS "purchaseAmount", a.currency, a.seller_name AS "sellerName",
  a.seller_phone AS "sellerPhone", a.created_at AS "createdAt"`;

@Injectable()
export class AssetsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly signedQr: SignedQrService,
  ) {}

  async list(actor: ActorContext, filters: ListAssetsDto) {
    if (filters.locationId) await this.authorization.assertLocationAccess(actor, filters.locationId);
    const limit = filters.limit ?? 50;
    const search = filters.q?.trim() || null;
    const rows = await this.database.query<AssetRow>(
      `${ACCESSIBLE_LOCATION_CTE}
       SELECT ${ASSET_COLUMNS} FROM assets a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        WHERE a.organization_id = $1::uuid AND a.location_id IN (SELECT id FROM visible_locations)
          AND ($3::uuid IS NULL OR a.location_id = $3::uuid)
          AND ($4::text IS NULL OR a.status::text = $4)
          AND ($5::text IS NULL OR concat_ws(' ',a.asset_tag,a.name,a.category,a.serial_number,a.manufacturer,a.model,l.name) ILIKE '%' || $5 || '%')
          AND ($6::uuid IS NULL OR a.id > $6::uuid)
        ORDER BY a.id LIMIT $7`,
      [actor.organizationId, actor.userId, filters.locationId ?? null, filters.status ?? null, search,
        filters.cursor ?? null, limit + 1],
    );
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async getById(actor: ActorContext, id: string): Promise<AssetRow> {
    const rows = await this.database.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        WHERE a.organization_id = $1::uuid AND a.id = $2::uuid`,
      [actor.organizationId, id],
    );
    return this.assertVisible(actor, rows[0]);
  }

  async getByQr(actor: ActorContext, qrPublicId: string): Promise<AssetRow> {
    const identity = this.signedQr.resolve(qrPublicId, actor.organizationId) ?? qrPublicId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity)) {
      throw new BadRequestException('QR identity is invalid');
    }
    const rows = await this.database.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        WHERE a.organization_id = $1::uuid AND a.qr_public_id = $2::uuid`,
      [actor.organizationId, identity],
    );
    return this.assertVisible(actor, rows[0]);
  }

  async signedQrForAsset(actor: ActorContext, id: string) {
    const asset = await this.getById(actor, id);
    return this.signedQr.issue(actor.organizationId, asset.qrPublicId);
  }

  async getByRfidEpc(actor: ActorContext, epc: string): Promise<AssetRow> {
    const normalized = epc.trim().toUpperCase();
    if (!/^(?:[A-F0-9]{2}){4,32}$/.test(normalized)) throw new BadRequestException('RFID EPC must be an even-length hexadecimal value between 8 and 64 characters');
    const rows = await this.database.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets a JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
        WHERE a.organization_id=$1::uuid AND upper(a.rfid_epc)=$2`,
      [actor.organizationId, normalized],
    );
    return this.assertVisible(actor, rows[0]);
  }

  async update(actor: ActorContext, id: string, dto: UpdateAssetDto): Promise<AssetRow> {
    const before = await this.getById(actor, id);
    await this.authorization.assertLocationAccess(actor, before.locationId, ['head_office', 'state_head', 'centre_head', 'asset_custodian']);
    if(dto.ownershipType&&dto.ownershipType!==before.ownershipType)
      await this.authorization.assertLocationAccess(actor,before.locationId,['head_office','state_head']);
    if(before.status==='disposed'&&dto.status&&dto.status!=='disposed') throw new ConflictException('A disposed asset cannot be returned to active service');
    if(dto.status&&dto.status!==before.status&&['missing','retired','disposed'].includes(dto.status)) {
      const requiredRoles=dto.status==='missing'?['head_office','state_head','centre_head']:dto.status==='retired'?['head_office','state_head']:['head_office'];
      await this.authorization.assertLocationAccess(actor,before.locationId,requiredRoles);
      if(!dto.statusChangeReason?.trim()||dto.statusChangeReason.trim().length<5) throw new ConflictException('A reason of at least five characters is required for this status change');
    }
    if (dto.locationId) await this.authorization.assertLocationAccess(actor, dto.locationId, ['head_office', 'state_head', 'centre_head', 'asset_custodian']);
    try {
      return await this.database.transaction(async (query) => {
        const locked = await query<{locationId:string;status:string}>(
          `SELECT location_id AS "locationId",status::text AS status FROM assets
           WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,[actor.organizationId,id]);
        if(!locked[0]) throw new NotFoundException('Asset was not found');
        if(locked[0].locationId!==before.locationId) throw new ConflictException('The asset location changed. Refresh the record and try again.');
        if((dto.locationId&&dto.locationId!==locked[0].locationId)||(dto.status&&dto.status!==locked[0].status)) {
          const openTransfer=await query<{id:string}>(
            `SELECT id FROM transfer_requests WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND status IN ('requested','approved','in_transit')
             UNION ALL SELECT b.id FROM transfer_batch_items i JOIN transfer_batches b
               ON b.organization_id=i.organization_id AND b.id=i.batch_id
              WHERE i.organization_id=$1::uuid AND i.asset_id=$2::uuid AND i.receipt_status='pending'
                AND b.status IN ('requested','approved','in_transit') LIMIT 1`,[actor.organizationId,id]);
          if(openTransfer[0]) throw new ConflictException('This asset is part of an open transfer. Complete or cancel the handover before changing its location or status.');
        }
        const rows = await query<AssetRow>(
          `UPDATE assets a SET
             location_id = COALESCE($3::uuid,a.location_id),
             asset_tag = COALESCE(NULLIF($4,''),a.asset_tag),
             name = COALESCE(NULLIF($5,''),a.name), category = COALESCE(NULLIF($6,''),a.category),
             serial_number = COALESCE(NULLIF($7,''),a.serial_number), manufacturer = COALESCE(NULLIF($8,''),a.manufacturer),
             model = COALESCE(NULLIF($9,''),a.model), condition = COALESCE($10::asset_condition,a.condition),
             status = COALESCE($11::asset_status,a.status), purchase_date = COALESCE($12::date,a.purchase_date),
             purchase_amount = COALESCE($13::numeric,a.purchase_amount), currency = COALESCE($14,a.currency),
             seller_name = COALESCE(NULLIF($15,''),a.seller_name), seller_phone = COALESCE(NULLIF($16,''),a.seller_phone),
             notes = COALESCE(NULLIF($17,''),a.notes), ownership_type = COALESCE($18::asset_ownership_type,a.ownership_type),
             rfid_epc = CASE WHEN $19::boolean THEN $20::text ELSE a.rfid_epc END, updated_at = now()
           FROM locations l
           WHERE a.organization_id = $1::uuid AND a.id = $2::uuid
             AND l.organization_id = a.organization_id AND l.id = COALESCE($3::uuid,a.location_id)
           RETURNING ${ASSET_COLUMNS}`,
          [actor.organizationId,id,dto.locationId ?? null,dto.assetTag?.trim() ?? null,dto.name?.trim() ?? null,
            dto.category?.trim() ?? null,dto.serialNumber?.trim() ?? null,dto.manufacturer?.trim() ?? null,dto.model?.trim() ?? null,
            dto.condition ?? null,dto.status ?? null,dto.purchaseDate ?? null,dto.purchaseAmount ?? null,dto.currency?.toUpperCase() ?? null,
            dto.sellerName?.trim() ?? null,dto.sellerPhone?.trim() ?? null,dto.notes?.trim() ?? null,dto.ownershipType ?? null,
            dto.rfidEpc !== undefined,dto.rfidEpc === null ? null : dto.rfidEpc?.trim().toUpperCase() ?? null],
        );
        const updated = rows[0];
        if (!updated) throw new NotFoundException('Asset was not found');
        const auditedFields: Array<[string, unknown, unknown]> = [
          ['location', before.locationName, updated.locationName], ['assetTag', before.assetTag, updated.assetTag],
          ['name', before.name, updated.name], ['category', before.category, updated.category],
          ['serialNumber', before.serialNumber, updated.serialNumber], ['manufacturer', before.manufacturer, updated.manufacturer],
          ['model', before.model, updated.model], ['condition', before.condition, updated.condition],
          ['status', before.status, updated.status], ['purchaseDate', before.purchaseDate, updated.purchaseDate],
          ['ownershipType', before.ownershipType, updated.ownershipType],
          ['purchaseAmount', before.purchaseAmount, updated.purchaseAmount], ['sellerName', before.sellerName, updated.sellerName],
          ['sellerPhone', before.sellerPhone, updated.sellerPhone],
          ['rfidEpc', before.rfidEpc, updated.rfidEpc],
        ];
        const changes = Object.fromEntries(auditedFields.filter(([, oldValue, newValue]) => oldValue !== newValue)
          .map(([field, oldValue, newValue]) => [field, { before: oldValue, after: newValue }]));
        await query(
          `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
           VALUES ($1::uuid,$2::uuid,'asset.updated','asset',$3::uuid,$4::jsonb)`,
          [actor.organizationId,actor.userId,id,JSON.stringify({ changes,...(dto.statusChangeReason?.trim()?{statusChangeReason:dto.statusChangeReason.trim()}: {}) })],
        );
        return updated;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException(dto.rfidEpc ? 'That asset tag or RFID EPC is already registered' : 'That asset tag is already in use');
      if ((error as { code?: string }).code === '23503') throw new ConflictException('Choose an existing location in your organization');
      throw error;
    }
  }

  async create(actor: ActorContext, dto: CreateAssetDto): Promise<AssetRow> {
    await this.authorization.assertLocationAccess(actor, dto.locationId, ['head_office', 'state_head', 'centre_head', 'asset_custodian']);
    if (dto.clientRequestId) {
      const existing = await this.database.query<{ id: string }>(
        'SELECT id FROM assets WHERE organization_id=$1::uuid AND client_request_id=$2::uuid',
        [actor.organizationId,dto.clientRequestId],
      );
      if (existing[0]) return this.getById(actor, existing[0].id);
    }
    try {
      return await this.database.transaction(async (query) => {
        const rows = await query<AssetRow>(
          `INSERT INTO assets (organization_id,location_id,asset_tag,name,category,serial_number,manufacturer,model,condition,
             purchase_date,purchase_amount,currency,seller_name,seller_phone,notes,created_by,client_request_id,ownership_type,rfid_epc)
           VALUES ($1::uuid,$2::uuid,COALESCE(NULLIF($3,''),'INC-' || upper(encode(gen_random_bytes(6),'hex'))),$4,$5,$6,$7,$8,
             COALESCE($9::asset_condition,'good'),$10::date,$11::numeric,COALESCE($12,'INR'),$13,$14,$15,$16::uuid,$17::uuid,COALESCE($18::asset_ownership_type,'INCUSPAZE_OWNED'),$19)
           ON CONFLICT (organization_id,client_request_id) DO NOTHING
           RETURNING id,location_id AS "locationId",(SELECT name FROM locations WHERE id=location_id) AS "locationName",
             asset_tag AS "assetTag",qr_public_id::text AS "qrPublicId",rfid_epc AS "rfidEpc",name,category,serial_number AS "serialNumber",
             manufacturer,model,status,condition,purchase_date AS "purchaseDate",purchase_amount::text AS "purchaseAmount",
             currency,seller_name AS "sellerName",seller_phone AS "sellerPhone",ownership_type AS "ownershipType",created_at AS "createdAt"`,
          [actor.organizationId,dto.locationId,dto.assetTag?.trim() || null,dto.name.trim(),dto.category.trim(),
            dto.serialNumber?.trim() || null,dto.manufacturer?.trim() || null,dto.model?.trim() || null,dto.condition ?? null,
            dto.purchaseDate ?? null,dto.purchaseAmount ?? null,dto.currency?.toUpperCase() ?? null,
            dto.sellerName?.trim() || null,dto.sellerPhone?.trim() || null,dto.notes?.trim() || null,actor.userId,dto.clientRequestId ?? null,dto.ownershipType ?? null,dto.rfidEpc?.trim().toUpperCase() ?? null],
        );
        if (!rows[0]) throw new ConflictException('This offline capture is already syncing. Retry shortly.');
        const asset = rows[0];
        await query(
          `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
           VALUES ($1::uuid,$2::uuid,'asset.created','asset',$3::uuid,$4::jsonb)`,
          [actor.organizationId,actor.userId,asset.id,JSON.stringify({ assetTag: asset.assetTag, locationId: asset.locationId, rfidEpc: asset.rfidEpc })],
        );
        return asset;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException(dto.rfidEpc ? 'That asset tag or RFID EPC is already registered' : 'That asset tag is already in use');
      if ((error as { code?: string }).code === '23503') throw new ConflictException('Choose an existing custodian and location in your organization');
      throw error;
    }
  }

  private async assertVisible(actor: ActorContext, row?: AssetRow): Promise<AssetRow> {
    if (!row) throw new NotFoundException('Asset was not found');
    await this.authorization.assertLocationAccess(actor, row.locationId);
    return row;
  }
}
