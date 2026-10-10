import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { CreateReportDto, CreateTransferDto, CreateWarrantyDto, IssueCustodyDto, ReturnCustodyDto, TransferActionDto, UpdateReportDto } from './lifecycle.dto';

const WRITERS=['head_office','state_head','centre_head','asset_custodian'] as const;
@Injectable()
export class LifecycleService {
  constructor(private readonly database:DatabaseService,private readonly authorization:AuthorizationService) {}

  private async assetLocation(actor:ActorContext,assetId:string,allowedRoles:readonly string[]=WRITERS) {
    const rows=await this.database.query<{locationId:string;locationName:string;status:string}>(
      `SELECT a.location_id AS "locationId",l.name AS "locationName",a.status FROM assets a
       JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
       WHERE a.organization_id=$1::uuid AND a.id=$2::uuid`,[actor.organizationId,assetId]);
    if(!rows[0]) throw new NotFoundException('Asset was not found');
    await this.authorization.assertLocationAccess(actor,rows[0].locationId,allowedRoles);
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
       SELECT t.id,t.asset_id AS "assetId",a.asset_tag AS "assetTag",a.name AS "assetName",t.from_location_id AS "fromLocationId",
        CASE WHEN t.from_location_id IN (SELECT id FROM visible_locations) THEN src.name ELSE 'Outside your assigned scope' END AS "fromLocationName",
        t.to_location_id AS "toLocationId",CASE WHEN t.to_location_id IN (SELECT id FROM visible_locations) THEN dst.name ELSE 'Outside your assigned scope' END AS "toLocationName",
        t.status,t.requested_at AS "requestedAt",t.received_at AS "receivedAt",t.handover_notes AS "handoverNotes"
       FROM transfer_requests t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id
       JOIN locations src ON src.organization_id=t.organization_id AND src.id=t.from_location_id JOIN locations dst ON dst.organization_id=t.organization_id AND dst.id=t.to_location_id
       WHERE t.organization_id=$1::uuid AND (t.from_location_id IN (SELECT id FROM visible_locations) OR t.to_location_id IN (SELECT id FROM visible_locations))
       ORDER BY t.requested_at DESC,t.id LIMIT 250`,[actor.organizationId,actor.userId]);
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
    const rows=await this.database.query<{assetId:string;fromLocationId:string;toLocationId:string;requestedBy:string|null;status:string}>(
      'SELECT asset_id AS "assetId",from_location_id AS "fromLocationId",to_location_id AS "toLocationId",requested_by AS "requestedBy",status FROM transfer_requests WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,id]);
    const transfer=rows[0]; if(!transfer) throw new NotFoundException('Transfer request was not found');
    if(dto.action==='approve'&&transfer.requestedBy===actor.userId) throw new ConflictException('A different authorized person must approve this transfer');
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
    await this.assetLocation(actor,assetId,[]);
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

  async assetActivity(actor:ActorContext,assetId:string) {
    await this.assetLocation(actor,assetId,[]);
    return this.database.query(
      `SELECT e.id,e.event_type AS "eventType",e.occurred_at AS "occurredAt",
         COALESCE(u.display_name,'System') AS "actorName",e.details
       FROM audit_events e LEFT JOIN users u ON u.organization_id=e.organization_id AND u.id=e.actor_user_id
       WHERE e.organization_id=$1::uuid AND (
         (e.entity_type='asset' AND e.entity_id=$2::uuid)
         OR (e.entity_type='condition_report' AND e.entity_id IN (
           SELECT id FROM condition_reports WHERE organization_id=$1::uuid AND asset_id=$2::uuid))
         OR (e.entity_type='transfer' AND e.entity_id IN (
           SELECT id FROM transfer_requests WHERE organization_id=$1::uuid AND asset_id=$2::uuid))
       )
       ORDER BY e.occurred_at DESC,e.id DESC LIMIT 100`,[actor.organizationId,assetId]);
  }

  async custodyHistory(actor:ActorContext,assetId:string) {
    await this.assetLocation(actor,assetId,[]);
    return this.database.query(
      `SELECT c.id AS "custodyId",c.custodian_user_id AS "custodianUserId",person.display_name AS "custodianName",
         issuer.display_name AS "issuedByName",c.issued_at AS "issuedAt",c.issue_condition AS "issueCondition",c.issue_notes AS "issueNotes",
         returner.display_name AS "returnedByName",c.returned_at AS "returnedAt",c.return_condition AS "returnCondition",c.return_notes AS "returnNotes"
       FROM asset_custodies c
       JOIN users person ON person.organization_id=c.organization_id AND person.id=c.custodian_user_id
       LEFT JOIN users issuer ON issuer.organization_id=c.organization_id AND issuer.id=c.issued_by
       LEFT JOIN users returner ON returner.organization_id=c.organization_id AND returner.id=c.returned_by
       WHERE c.organization_id=$1::uuid AND c.asset_id=$2::uuid
       ORDER BY c.issued_at DESC,c.id DESC LIMIT 50`,[actor.organizationId,assetId]);
  }

  async eligibleCustodians(actor:ActorContext,assetId:string) {
    const asset=await this.assetLocation(actor,assetId);
    return this.database.query(
      `WITH RECURSIVE custodian_places(user_id,location_id) AS (
         SELECT r.user_id,r.scope_location_id
         FROM role_assignments r JOIN users u ON u.organization_id=r.organization_id AND u.id=r.user_id
         WHERE r.organization_id=$1::uuid AND r.role_key='asset_custodian' AND r.scope_location_id IS NOT NULL AND u.active=true
         UNION
         SELECT p.user_id,child.id FROM custodian_places p
         JOIN locations child ON child.organization_id=$1::uuid AND child.parent_id=p.location_id
       )
       SELECT DISTINCT u.id AS "userId",u.display_name AS "displayName"
       FROM users u JOIN custodian_places p ON p.user_id=u.id
       WHERE u.organization_id=$1::uuid AND u.active=true AND p.location_id=$2::uuid
       ORDER BY u.display_name,u.id`,[actor.organizationId,asset.locationId]);
  }

  async issueCustody(actor:ActorContext,assetId:string,dto:IssueCustodyDto) {
    const asset=await this.assetLocation(actor,assetId);
    try {
      return await this.database.transaction(async query=>{
        const locked=await query<{id:string}>(`SELECT id FROM assets WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,[actor.organizationId,assetId]);
        if(!locked[0]) throw new NotFoundException('Asset was not found');
        const active=await query<{id:string}>(`SELECT id FROM asset_custodies WHERE organization_id=$1::uuid AND asset_id=$2::uuid AND returned_at IS NULL`,[actor.organizationId,assetId]);
        if(active[0]) throw new ConflictException('Return the current custody before issuing this asset again');
        const eligible=await query<{userId:string;displayName:string}>(
          `WITH RECURSIVE custodian_places(user_id,location_id) AS (
             SELECT r.user_id,r.scope_location_id FROM role_assignments r JOIN users u ON u.organization_id=r.organization_id AND u.id=r.user_id
             WHERE r.organization_id=$1::uuid AND r.role_key='asset_custodian' AND r.scope_location_id IS NOT NULL AND u.active=true
             UNION SELECT p.user_id,child.id FROM custodian_places p JOIN locations child ON child.organization_id=$1::uuid AND child.parent_id=p.location_id
           ) SELECT DISTINCT u.id AS "userId",u.display_name AS "displayName" FROM users u JOIN custodian_places p ON p.user_id=u.id
           WHERE u.organization_id=$1::uuid AND u.active=true AND p.location_id=$3::uuid AND u.id=$2::uuid`,
          [actor.organizationId,dto.custodianUserId,asset.locationId]);
        if(!eligible[0]) throw new ConflictException('Choose an active asset custodian assigned to this location');
        const rows=await query(`INSERT INTO asset_custodies (organization_id,asset_id,custodian_user_id,issued_by,issue_condition,issue_notes)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,COALESCE($5::asset_condition,'good'),$6) RETURNING id AS "custodyId",issued_at AS "issuedAt"`,
          [actor.organizationId,assetId,dto.custodianUserId,actor.userId,dto.condition??null,dto.notes?.trim()||null]);
        await query(`UPDATE assets SET custodian_user_id=$3::uuid,updated_at=now() WHERE organization_id=$1::uuid AND id=$2::uuid`,[actor.organizationId,assetId,dto.custodianUserId]);
        await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
          VALUES ($1::uuid,$2::uuid,'custody.issued','asset',$3::uuid,$4::jsonb)`,
          [actor.organizationId,actor.userId,assetId,JSON.stringify({custodyId:rows[0].custodyId,custodianUserId:dto.custodianUserId,custodianName:eligible[0].displayName,condition:dto.condition??'good',locationName:asset.locationName})]);
        return rows[0];
      });
    } catch(error) {
      if((error as {code?:string}).code==='23505') throw new ConflictException('This asset already has an active custodian');
      throw error;
    }
  }

  async returnCustody(actor:ActorContext,assetId:string,custodyId:string,dto:ReturnCustodyDto) {
    const asset=await this.assetLocation(actor,assetId);
    return this.database.transaction(async query=>{
      await query(`SELECT id FROM assets WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,[actor.organizationId,assetId]);
      const rows=await query<{custodianUserId:string;custodianName:string;issuedAt:string}>(
        `UPDATE asset_custodies c SET returned_by=$4::uuid,returned_at=now(),return_condition=$5::asset_condition,return_notes=$6
         FROM users u WHERE c.organization_id=$1::uuid AND c.asset_id=$2::uuid AND c.id=$3::uuid AND c.returned_at IS NULL
           AND u.organization_id=c.organization_id AND u.id=c.custodian_user_id
         RETURNING c.custodian_user_id AS "custodianUserId",u.display_name AS "custodianName",c.issued_at AS "issuedAt"`,
        [actor.organizationId,assetId,custodyId,actor.userId,dto.condition,dto.notes?.trim()||null]);
      if(!rows[0]) throw new ConflictException('This custody is already returned or does not belong to this asset');
      await query(`UPDATE assets SET custodian_user_id=NULL,updated_at=now() WHERE organization_id=$1::uuid AND id=$2::uuid AND custodian_user_id=$3::uuid`,[actor.organizationId,assetId,rows[0].custodianUserId]);
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'custody.returned','asset',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,assetId,JSON.stringify({custodyId,custodianUserId:rows[0].custodianUserId,custodianName:rows[0].custodianName,condition:dto.condition,locationName:asset.locationName})]);
      return {custodyId,returnedAt:new Date().toISOString(),custodianUserId:rows[0].custodianUserId};
    });
  }
}
