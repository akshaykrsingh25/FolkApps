import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { CreateTransferBatchDto, TransferBatchActionDto } from './lifecycle.dto';

const WRITERS=['head_office','state_head','centre_head','asset_custodian'] as const;
const APPROVERS=['head_office','state_head','centre_head'] as const;

@Injectable()
export class TransferBatchesService {
  constructor(private readonly database:DatabaseService,private readonly authorization:AuthorizationService) {}

  async list(actor:ActorContext) {
    return this.database.query(
      `WITH RECURSIVE scope_locations(id) AS (
         SELECT scope_location_id FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
         UNION SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), visible_locations(id) AS (
         SELECT id FROM scope_locations UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS(
           SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND role_key='head_office' AND scope_location_id IS NULL
         )
       )
       SELECT b.id,b.batch_reference AS "batchReference",b.from_location_id AS "fromLocationId",
         CASE WHEN b.from_location_id IN (SELECT id FROM visible_locations) THEN src.name ELSE 'Outside your assigned scope' END AS "fromLocationName",
         b.to_location_id AS "toLocationId",
         CASE WHEN b.to_location_id IN (SELECT id FROM visible_locations) THEN dst.name ELSE 'Outside your assigned scope' END AS "toLocationName",
         b.status,b.requested_at AS "requestedAt",b.dispatched_at AS "dispatchedAt",b.auto_flag_after AS "autoFlagAfter",
         b.completed_at AS "completedAt",b.handover_notes AS "handoverNotes",
         (b.status='in_transit' AND b.auto_flag_after<now()) AS overdue,
         (SELECT count(*)::int FROM transfer_batch_items i WHERE i.organization_id=b.organization_id AND i.batch_id=b.id) AS "itemCount",
         (SELECT count(*)::int FROM transfer_batch_items i WHERE i.organization_id=b.organization_id AND i.batch_id=b.id AND i.receipt_status='pending') AS "pendingCount",
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('assetId',a.id,'assetTag',a.asset_tag,'assetName',a.name,'qrPublicId',a.qr_public_id::text,
           'receiptStatus',i.receipt_status,'discrepancyNote',i.receipt_discrepancy_note) ORDER BY a.asset_tag),'[]'::jsonb)
           FROM transfer_batch_items i JOIN assets a ON a.organization_id=i.organization_id AND a.id=i.asset_id
          WHERE i.organization_id=b.organization_id AND i.batch_id=b.id) AS items
       FROM transfer_batches b
       JOIN locations src ON src.organization_id=b.organization_id AND src.id=b.from_location_id
       JOIN locations dst ON dst.organization_id=b.organization_id AND dst.id=b.to_location_id
       WHERE b.organization_id=$1::uuid AND (b.from_location_id IN (SELECT id FROM visible_locations) OR b.to_location_id IN (SELECT id FROM visible_locations))
       ORDER BY b.requested_at DESC,b.id DESC LIMIT 250`,[actor.organizationId,actor.userId]);
  }

  async create(actor:ActorContext,dto:CreateTransferBatchDto) {
    const ids=[...new Set(dto.assetIds)];
    if(ids.length===0) throw new ConflictException('Select at least one asset for the transfer manifest');
    const found=await this.database.query<{id:string;locationId:string;status:string}>(
      `SELECT id,location_id AS "locationId",status::text AS status FROM assets
       WHERE organization_id=$1::uuid AND id=ANY($2::uuid[]) ORDER BY id`,[actor.organizationId,ids]);
    if(found.length!==ids.length) throw new NotFoundException('One or more assets were not found in this organization');
    const origin=found[0].locationId;
    if(found.some(asset=>asset.locationId!==origin)) throw new ConflictException('All items in one manifest must leave from the same location');
    if(found.some(asset=>['missing','retired','disposed'].includes(asset.status))) throw new ConflictException('A missing or written-off asset cannot be transferred');
    if(origin===dto.toLocationId) throw new ConflictException('Choose a different destination');
    await this.authorization.assertLocationAccess(actor,origin,WRITERS);
    await this.authorization.assertLocationAccess(actor,dto.toLocationId,WRITERS);

    return this.database.transaction(async query=>{
      const locked=await query<{id:string;locationId:string;status:string}>(
        `SELECT id,location_id AS "locationId",status::text AS status FROM assets
         WHERE organization_id=$1::uuid AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[actor.organizationId,ids]);
      if(locked.length!==ids.length||locked.some(asset=>asset.locationId!==origin||['missing','retired','disposed'].includes(asset.status)))
        throw new ConflictException('One or more assets changed location or status. Refresh the register and try again.');
      const legacyOpen=await query<{assetId:string}>(
        `SELECT asset_id AS "assetId" FROM transfer_requests WHERE organization_id=$1::uuid AND asset_id=ANY($2::uuid[])
          AND status IN ('requested','approved','in_transit')
         UNION ALL SELECT i.asset_id AS "assetId" FROM transfer_batch_items i
          WHERE i.organization_id=$1::uuid AND i.asset_id=ANY($2::uuid[]) AND (i.receipt_status='pending' OR
            (i.receipt_status='not_received' AND NOT EXISTS(SELECT 1 FROM scan_events s WHERE s.organization_id=i.organization_id
              AND s.asset_id=i.asset_id AND s.scanned_at>i.scanned_at_receipt))) LIMIT 1`,[actor.organizationId,ids]);
      if(legacyOpen[0]) throw new ConflictException('An asset already has an open single-item transfer');
      const reference=`BT-${randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`;
      const batch=await query<{id:string}>(
        `INSERT INTO transfer_batches (organization_id,batch_reference,from_location_id,to_location_id,requested_by,handover_notes)
         VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6) RETURNING id`,
        [actor.organizationId,reference,origin,dto.toLocationId,actor.userId,dto.handoverNotes?.trim()||null]);
      for(const assetId of ids) await query(
        `INSERT INTO transfer_batch_items (organization_id,batch_id,asset_id) VALUES ($1::uuid,$2::uuid,$3::uuid)`,
        [actor.organizationId,batch[0].id,assetId]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'transfer_batch.requested','transfer_batch',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,batch[0].id,JSON.stringify({batchReference:reference,itemCount:ids.length,fromLocationId:origin,toLocationId:dto.toLocationId})]);
      await query(`INSERT INTO notification_outbox (organization_id,event_type,payload) VALUES ($1::uuid,'transfer_batch.requested',$2::jsonb)`,
        [actor.organizationId,JSON.stringify({batchId:batch[0].id,batchReference:reference,itemCount:ids.length,fromLocationId:origin,toLocationId:dto.toLocationId})]);
      return {id:batch[0].id,batchReference:reference,status:'requested',itemCount:ids.length};
    });
  }

  async act(actor:ActorContext,id:string,dto:TransferBatchActionDto) {
    const selected=await this.database.query<{fromLocationId:string;toLocationId:string;requestedBy:string;status:string}>(
      `SELECT from_location_id AS "fromLocationId",to_location_id AS "toLocationId",requested_by AS "requestedBy",status::text AS status
       FROM transfer_batches WHERE organization_id=$1::uuid AND id=$2::uuid`,[actor.organizationId,id]);
    const batch=selected[0];
    if(!batch) throw new NotFoundException('Transfer manifest was not found');
    if(dto.action==='approve'&&batch.requestedBy===actor.userId) throw new ConflictException('A different authorized person must approve this manifest');
    await this.authorization.assertLocationAccess(actor,dto.action==='receive'?batch.toLocationId:batch.fromLocationId,
      dto.action==='receive'?WRITERS:APPROVERS);

    return this.database.transaction(async query=>{
      const locked=await query<{status:string;requestedBy:string}>(
        `SELECT status::text AS status,requested_by AS "requestedBy" FROM transfer_batches
         WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,[actor.organizationId,id]);
      if(!locked[0]) throw new NotFoundException('Transfer manifest was not found');
      const transitions:Record<string,{from:string[];to:string}>={
        approve:{from:['requested'],to:'approved'},dispatch:{from:['approved'],to:'in_transit'},
        receive:{from:['in_transit'],to:'received'},reject:{from:['requested'],to:'rejected'},
        cancel:{from:['requested','approved'],to:'cancelled'},
      };
      const transition=transitions[dto.action];
      if(!transition.from.includes(locked[0].status)) throw new ConflictException(`Cannot ${dto.action} a manifest in ${locked[0].status} state`);
      if(dto.action==='approve'&&locked[0].requestedBy===actor.userId) throw new ConflictException('A different authorized person must approve this manifest');

      let nextStatus=transition.to;
      if(dto.action==='receive') {
        const lines=await query<{assetId:string;receiptStatus:string}>(
          `SELECT asset_id AS "assetId",receipt_status::text AS "receiptStatus" FROM transfer_batch_items
           WHERE organization_id=$1::uuid AND batch_id=$2::uuid ORDER BY asset_id FOR UPDATE`,[actor.organizationId,id]);
        if(!dto.items||dto.items.length!==lines.length) throw new ConflictException('Confirm the condition of every item in this manifest before receiving it');
        const byAsset=new Map(dto.items.map(item=>[item.assetId,item]));
        if(byAsset.size!==lines.length||lines.some(line=>!byAsset.has(line.assetId))) throw new ConflictException('Receipt items must match the manifest exactly');
        for(const line of lines) {
          const item=byAsset.get(line.assetId)!;
          if(['damaged','not_received'].includes(item.receiptStatus)&&(!item.discrepancyNote?.trim()||item.discrepancyNote.trim().length<5))
            throw new ConflictException('Add a clear note for each damaged or unreceived item');
          if(item.receiptStatus==='accepted'||item.receiptStatus==='damaged') {
            const moved=await query<{id:string}>(
              `UPDATE assets SET location_id=$3::uuid,condition=CASE WHEN $4='damaged' THEN 'damaged'::asset_condition ELSE condition END,updated_at=now()
               WHERE organization_id=$1::uuid AND id=$2::uuid AND location_id=$5::uuid RETURNING id`,
              [actor.organizationId,line.assetId,batch.toLocationId,item.receiptStatus,batch.fromLocationId]);
            if(!moved[0]) throw new ConflictException('An asset location changed while this manifest was in transit');
          }
          await query(`UPDATE transfer_batch_items SET receipt_status=$4::transfer_batch_item_receipt,
            scanned_at_receipt=now(),receipt_discrepancy_note=$5 WHERE organization_id=$1::uuid AND batch_id=$2::uuid AND asset_id=$3::uuid`,
            [actor.organizationId,id,line.assetId,item.receiptStatus,item.discrepancyNote?.trim()||null]);
          if(item.receiptStatus!=='accepted') await query(
            `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
             VALUES ($1::uuid,$2::uuid,'transfer_batch.item_discrepancy','asset',$3::uuid,$4::jsonb)`,
            [actor.organizationId,actor.userId,line.assetId,JSON.stringify({batchId:id,receiptStatus:item.receiptStatus,note:item.discrepancyNote?.trim()||null})]);
          if(item.receiptStatus==='damaged') {
            const report=await query<{id:string}>(
              `INSERT INTO condition_reports (organization_id,asset_id,kind,urgency,description,reported_by)
               VALUES ($1::uuid,$2::uuid,'damaged','high',$3,$4::uuid) RETURNING id`,
              [actor.organizationId,line.assetId,`Received damaged in transfer manifest ${id}. ${item.discrepancyNote?.trim()}`,actor.userId]);
            await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
              VALUES ($1::uuid,$2::uuid,'condition.reported','condition_report',$3::uuid,$4::jsonb)`,
              [actor.organizationId,actor.userId,report[0].id,JSON.stringify({assetId:line.assetId,kind:'damaged',source:'transfer_receipt'})]);
            await query(`INSERT INTO notification_outbox (organization_id,event_type,payload) VALUES ($1::uuid,'condition.reported',$2::jsonb)`,
              [actor.organizationId,JSON.stringify({reportId:report[0].id,assetId:line.assetId,transferBatchId:id,kind:'damaged'})]);
          }
        }
        if(dto.items.some(item=>item.receiptStatus!=='accepted')) nextStatus='received_with_discrepancy';
        if(nextStatus==='received_with_discrepancy') await query(
          `INSERT INTO notification_outbox (organization_id,event_type,payload) VALUES ($1::uuid,'transfer_batch.discrepancy',$2::jsonb)`,
          [actor.organizationId,JSON.stringify({batchId:id,reportedBy:actor.userId,items:dto.items.filter(item=>item.receiptStatus!=='accepted')})]);
      }
      if(dto.action==='reject'||dto.action==='cancel') await query(
        `UPDATE transfer_batch_items SET receipt_status='cancelled' WHERE organization_id=$1::uuid AND batch_id=$2::uuid AND receipt_status='pending'`,[actor.organizationId,id]);
      const updated=await query<{status:string}>(
        `UPDATE transfer_batches SET status=$3::transfer_batch_status,
           approved_by=CASE WHEN $4='approve' THEN $5::uuid ELSE approved_by END,
           dispatched_by=CASE WHEN $4='dispatch' THEN $5::uuid ELSE dispatched_by END,
           dispatched_at=CASE WHEN $4='dispatch' THEN now() ELSE dispatched_at END,
           auto_flag_after=CASE WHEN $4='dispatch' THEN now()+interval '7 days' WHEN $4='receive' THEN NULL ELSE auto_flag_after END,
           received_by=CASE WHEN $4='receive' THEN $5::uuid ELSE received_by END,
           completed_at=CASE WHEN $4 IN ('receive','reject','cancel') THEN now() ELSE completed_at END,
           handover_notes=COALESCE($6,handover_notes)
         WHERE organization_id=$1::uuid AND id=$2::uuid RETURNING status::text AS status`,
        [actor.organizationId,id,nextStatus,dto.action,actor.userId,dto.handoverNotes?.trim()||null]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,$3,'transfer_batch',$4::uuid,$5::jsonb)`,
        [actor.organizationId,actor.userId,`transfer_batch.${dto.action}`,id,JSON.stringify({from:locked[0].status,to:nextStatus})]);
      return {id,status:updated[0].status};
    });
  }
}
