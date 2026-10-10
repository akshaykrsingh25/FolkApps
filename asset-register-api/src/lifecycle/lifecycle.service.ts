import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { CreateReportDto, CreateTransferDto, CreateWarrantyDto, TransferActionDto, UpdateReportDto } from './lifecycle.dto';

const WRITERS=['head_office','state_head','centre_head','asset_custodian'] as const;
@Injectable()
export class LifecycleService {
  constructor(private readonly database:DatabaseService,private readonly authorization:AuthorizationService) {}

  private async assetLocation(actor:ActorContext,assetId:string) {
    const rows=await this.database.query<{locationId:string;status:string}>(
      'SELECT location_id AS "locationId",status FROM assets WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,assetId]);
    if(!rows[0]) throw new NotFoundException('Asset was not found');
    await this.authorization.assertLocationAccess(actor,rows[0].locationId,WRITERS);
    return rows[0];
  }

  reports(actor:ActorContext) {
    return this.database.query(
      `WITH RECURSIVE scope_locations(id) AS (
        SELECT scope_location_id FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
        UNION SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid),
       visible_locations(id) AS (SELECT id FROM scope_locations UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS(
         SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND role_key='head_office' AND scope_location_id IS NULL))
       SELECT r.id,r.asset_id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",a.location_id AS "locationId",l.name AS "locationName",
         r.kind,r.status,r.urgency,r.description,r.resolution_notes AS "resolutionNotes",r.reported_at AS "reportedAt",r.resolved_at AS "resolvedAt"
       FROM condition_reports r JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id
       JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
       WHERE r.organization_id=$1::uuid AND a.location_id IN (SELECT id FROM visible_locations)
       ORDER BY r.reported_at DESC,r.id LIMIT 250`,[actor.organizationId,actor.userId]);
  }

  async createReport(actor:ActorContext,dto:CreateReportDto) {
    const asset=await this.assetLocation(actor,dto.assetId);
    return this.database.transaction(async query=>{
      const rows=await query<{id:string}>(
        `INSERT INTO condition_reports (organization_id,asset_id,kind,urgency,description,reported_by)
         VALUES ($1::uuid,$2::uuid,$3::report_kind,$4,$5,$6::uuid) RETURNING id`,
        [actor.organizationId,dto.assetId,dto.kind,dto.urgency,dto.description.trim(),actor.userId]);
      if(dto.evidenceIds?.length){
        const linked=await query<{evidenceId:string}>(
          `INSERT INTO report_evidence (organization_id,report_id,evidence_id)
           SELECT $1::uuid,$2::uuid,e.id FROM evidence e WHERE e.organization_id=$1::uuid AND e.asset_id=$3::uuid AND e.id=ANY($4::uuid[])
           ON CONFLICT DO NOTHING RETURNING evidence_id AS "evidenceId"`,[actor.organizationId,rows[0].id,dto.assetId,dto.evidenceIds]);
        if(linked.length!==new Set(dto.evidenceIds).size) throw new ConflictException('One or more attached captures do not belong to this asset');
      }
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'condition.reported','condition_report',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,rows[0].id,JSON.stringify({assetId:dto.assetId,kind:dto.kind,urgency:dto.urgency})]);
      await query(`INSERT INTO notification_outbox (organization_id,event_type,payload) VALUES ($1::uuid,'condition.reported',$2::jsonb)`,
        [actor.organizationId,JSON.stringify({reportId:rows[0].id,assetId:dto.assetId,locationId:asset.locationId})]);
      return (await query('SELECT id,asset_id AS "assetId",kind,status,urgency,description,reported_at AS "reportedAt" FROM condition_reports WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,rows[0].id]))[0];
    });
  }

  async updateReport(actor:ActorContext,id:string,dto:UpdateReportDto) {
    const found=await this.database.query<{assetId:string;locationId:string;status:string}>(
      `SELECT r.asset_id AS "assetId",a.location_id AS "locationId",r.status FROM condition_reports r JOIN assets a ON a.organization_id=r.organization_id AND a.id=r.asset_id WHERE r.organization_id=$1::uuid AND r.id=$2::uuid`,[actor.organizationId,id]);
    if(!found[0]) throw new NotFoundException('Condition report was not found');
    await this.authorization.assertLocationAccess(actor,found[0].locationId,['head_office','state_head','centre_head']);
    const transitions:Record<string,string[]>={reported:['assigned','in_repair','resolved','closed'],assigned:['in_repair','resolved','closed'],in_repair:['resolved','closed'],resolved:['closed'],closed:[]};
    if(!transitions[found[0].status]?.includes(dto.status)) throw new ConflictException(`A report cannot move from ${found[0].status} to ${dto.status}`);
    if(dto.assignedTo){
      const assignee=await this.database.query<{id:string}>(`SELECT id FROM users WHERE organization_id=$1::uuid AND id=$2::uuid AND active=true`,[actor.organizationId,dto.assignedTo]);
      if(!assignee[0]) throw new ConflictException('Choose an active person in this organization');
    }
    return this.database.transaction(async query=>{
      const updated=await query(`UPDATE condition_reports SET status=$3::report_status,assigned_to=COALESCE($4::uuid,assigned_to),
        resolution_notes=COALESCE($5,resolution_notes),resolved_at=CASE WHEN $3 IN ('resolved','closed') THEN COALESCE(resolved_at,now()) ELSE resolved_at END
        WHERE organization_id=$1::uuid AND id=$2::uuid RETURNING id,asset_id AS "assetId",kind,status,urgency,description,assigned_to AS "assignedTo",resolution_notes AS "resolutionNotes",reported_at AS "reportedAt",resolved_at AS "resolvedAt"`,
        [actor.organizationId,id,dto.status,dto.assignedTo??null,dto.resolutionNotes??null]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES ($1::uuid,$2::uuid,'condition.status_changed','condition_report',$3::uuid,$4::jsonb)`,[actor.organizationId,actor.userId,id,JSON.stringify({from:found[0].status,to:dto.status})]);
      return updated[0];
    });
  }

  transfers(actor:ActorContext) {
    return this.database.query(
      `WITH RECURSIVE scope_locations(id) AS (SELECT scope_location_id FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
        UNION SELECT child.id FROM locations child JOIN scope_locations parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid),
       visible_locations(id) AS (SELECT id FROM scope_locations UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS(SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid AND role_key='head_office' AND scope_location_id IS NULL))
       SELECT t.id,t.asset_id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",t.from_location_id AS "fromLocationId",src.name AS "fromLocationName",
        t.to_location_id AS "toLocationId",dst.name AS "toLocationName",t.status,t.requested_at AS "requestedAt",t.received_at AS "receivedAt",t.handover_notes AS "handoverNotes"
       FROM transfer_requests t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id
       JOIN locations src ON src.organization_id=t.organization_id AND src.id=t.from_location_id JOIN locations dst ON dst.organization_id=t.organization_id AND dst.id=t.to_location_id
       WHERE t.organization_id=$1::uuid AND t.from_location_id IN (SELECT id FROM visible_locations) ORDER BY t.requested_at DESC,t.id LIMIT 250`,[actor.organizationId,actor.userId]);
  }

  async createTransfer(actor:ActorContext,dto:CreateTransferDto) {
    const asset=await this.assetLocation(actor,dto.assetId);
    if(asset.locationId===dto.toLocationId) throw new ConflictException('Choose a different destination');
    await this.authorization.assertLocationAccess(actor,dto.toLocationId,WRITERS);
    const result=await this.database.transaction(async query=>{
      const rows=await query<{id:string}>(`INSERT INTO transfer_requests (organization_id,asset_id,from_location_id,to_location_id,status,requested_by,handover_notes)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'requested',$5::uuid,$6) RETURNING id`,[actor.organizationId,dto.assetId,asset.locationId,dto.toLocationId,actor.userId,dto.handoverNotes??null]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES ($1::uuid,$2::uuid,'transfer.requested','transfer',$3::uuid,$4::jsonb)`,[actor.organizationId,actor.userId,rows[0].id,JSON.stringify({assetId:dto.assetId,from:asset.locationId,to:dto.toLocationId})]);
      return rows[0];
    });
    return result;
  }

  async actOnTransfer(actor:ActorContext,id:string,dto:TransferActionDto) {
    const rows=await this.database.query<{assetId:string;fromLocationId:string;toLocationId:string;status:string}>(
      'SELECT asset_id AS "assetId",from_location_id AS "fromLocationId",to_location_id AS "toLocationId",status FROM transfer_requests WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,id]);
    const transfer=rows[0]; if(!transfer) throw new NotFoundException('Transfer request was not found');
    const actionRoles=dto.action==='receive'?WRITERS:['head_office','state_head','centre_head'] as const;
    await this.authorization.assertLocationAccess(actor,dto.action==='receive'?transfer.toLocationId:transfer.fromLocationId,actionRoles);
    const next:Record<string,{from:string[];to:string}>={approve:{from:['requested'],to:'approved'},dispatch:{from:['approved'],to:'in_transit'},receive:{from:['in_transit'],to:'received'},reject:{from:['requested'],to:'rejected'},cancel:{from:['requested','approved'],to:'cancelled'}};
    const transition=next[dto.action];
    if(!transition.from.includes(transfer.status)) throw new ConflictException(`Cannot ${dto.action} a transfer in ${transfer.status} state`);
    return this.database.transaction(async query=>{
      if(dto.action==='receive'){
        const moved=await query<{id:string}>(`UPDATE assets SET location_id=$3::uuid,updated_at=now() WHERE organization_id=$1::uuid AND id=$2::uuid AND location_id=$4::uuid RETURNING id`,[actor.organizationId,transfer.assetId,transfer.toLocationId,transfer.fromLocationId]);
        if(!moved[0]) throw new ConflictException('The asset location changed since this request was raised');
      }
      const updated=await query(`UPDATE transfer_requests SET status=$3::transfer_status,approved_by=CASE WHEN $3='approved' THEN $4::uuid ELSE approved_by END,
        received_at=CASE WHEN $3='received' THEN now() ELSE received_at END,handover_notes=COALESCE($5,handover_notes)
        WHERE organization_id=$1::uuid AND id=$2::uuid RETURNING id,asset_id AS "assetId",status,from_location_id AS "fromLocationId",to_location_id AS "toLocationId",received_at AS "receivedAt"`,
        [actor.organizationId,id,transition.to,actor.userId,dto.handoverNotes??null]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES ($1::uuid,$2::uuid,$3,'transfer',$4::uuid,$5::jsonb)`,[actor.organizationId,actor.userId,`transfer.${dto.action}`,id,JSON.stringify({assetId:transfer.assetId,from:transfer.status,to:transition.to})]);
      return updated[0];
    });
  }

  async warranties(actor:ActorContext,assetId:string) {
    await this.assetLocation(actor,assetId);
    return this.database.query(`SELECT id,coverage_kind AS "coverageKind",provider,service_phone AS "servicePhone",starts_on AS "startsOn",ends_on AS "endsOn",terms FROM warranties WHERE organization_id=$1::uuid AND asset_id=$2::uuid ORDER BY ends_on NULLS LAST`,[actor.organizationId,assetId]);
  }

  async createWarranty(actor:ActorContext,assetId:string,dto:CreateWarrantyDto) {
    await this.assetLocation(actor,assetId);
    if(dto.startsOn&&dto.endsOn&&dto.endsOn<dto.startsOn) throw new ConflictException('Coverage end date must be after its start date');
    return this.database.transaction(async query=>{
      const rows=await query(`INSERT INTO warranties (organization_id,asset_id,coverage_kind,provider,service_phone,starts_on,ends_on,terms)
        VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::date,$7::date,$8) RETURNING id,coverage_kind AS "coverageKind",provider,service_phone AS "servicePhone",starts_on AS "startsOn",ends_on AS "endsOn",terms`,
        [actor.organizationId,assetId,dto.coverageKind,dto.provider??null,dto.servicePhone??null,dto.startsOn??null,dto.endsOn??null,dto.terms??null]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES ($1::uuid,$2::uuid,'warranty.recorded','asset',$3::uuid,$4::jsonb)`,[actor.organizationId,actor.userId,assetId,JSON.stringify({coverageKind:dto.coverageKind,endsOn:dto.endsOn})]);
      return rows[0];
    });
  }
}
