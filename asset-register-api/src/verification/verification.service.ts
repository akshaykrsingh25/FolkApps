import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService, type SqlQuery } from '../database.service';
import type { CloseCycleDto, CreateCycleDto, CreatePolicyDto, RecordRfidScansDto, RecordScanDto, UpdatePolicyDto } from './verification.dto';

@Injectable()
export class VerificationService {
  constructor(private readonly database: DatabaseService, private readonly authorization: AuthorizationService) {}

  private async assertCycleScopeAccess(actor:ActorContext,scopeLocationId:string,allowedRoles?:readonly string[]) {
    const rows=await this.database.query<{allowed:boolean}>(
      `WITH RECURSIVE cycle_scope(id) AS (
        SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
        UNION ALL SELECT child.id FROM locations child JOIN cycle_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ) SELECT EXISTS(SELECT 1 FROM role_assignments r WHERE r.organization_id=$1::uuid AND r.user_id=$3::uuid
         AND (cardinality($4::text[])=0 OR r.role_key=ANY($4::text[]))
         AND ((r.role_key='head_office' AND r.scope_location_id IS NULL) OR r.scope_location_id IN (SELECT id FROM cycle_scope))) AS allowed`,
      [actor.organizationId,scopeLocationId,actor.userId,allowedRoles?[...allowedRoles]:[]],
    );
    if (!rows[0]?.allowed) throw new ForbiddenException('Verification cycle is outside the assigned role scope');
  }

  async policies(actor: ActorContext) {
    return this.database.query(
      `WITH RECURSIVE assigned_path(id,parent_id) AS (
         SELECT place.id,place.parent_id FROM role_assignments assignment
          JOIN locations place ON place.organization_id=assignment.organization_id AND place.id=assignment.scope_location_id
          WHERE assignment.organization_id=$1::uuid AND assignment.user_id=$2::uuid AND assignment.scope_location_id IS NOT NULL
         UNION
         SELECT parent.id,parent.parent_id FROM locations parent JOIN assigned_path child ON child.parent_id=parent.id WHERE parent.organization_id=$1::uuid
       )
       SELECT p.id,p.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        p.cadence_months AS "cadenceMonths",p.grace_days AS "graceDays",
              p.escalation_interval_days AS "escalationIntervalDays",p.enabled,p.created_at AS "createdAt"
       FROM verification_policies p JOIN locations l ON l.organization_id=p.organization_id AND l.id=p.scope_location_id
       WHERE p.organization_id=$1::uuid AND (
         p.scope_location_id IN (SELECT id FROM assigned_path)
         OR EXISTS (SELECT 1 FROM role_assignments head WHERE head.organization_id=$1::uuid AND head.user_id=$2::uuid
              AND head.role_key='head_office' AND head.scope_location_id IS NULL)
       ) ORDER BY p.created_at DESC`,[actor.organizationId,actor.userId],
    );
  }

  async createPolicy(actor: ActorContext,dto: CreatePolicyDto) {
    await this.authorization.assertLocationAccess(actor,dto.scopeLocationId,['head_office']);
    return this.database.transaction(async (query) => {
      const rows = await query<{ id: string }>(
        `INSERT INTO verification_policies (organization_id,scope_location_id,cadence_months,grace_days,escalation_interval_days,enabled)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6) RETURNING id`,
        [actor.organizationId,dto.scopeLocationId,dto.cadenceMonths,dto.graceDays,dto.escalationIntervalDays ?? 7,dto.enabled ?? true],
      );
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'verification.policy_created','verification_policy',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,rows[0].id,JSON.stringify(dto)]);
      return (await query(`SELECT p.id,p.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        p.cadence_months AS "cadenceMonths",p.grace_days AS "graceDays",
        p.escalation_interval_days AS "escalationIntervalDays",p.enabled,p.created_at AS "createdAt"
        FROM verification_policies p JOIN locations l ON l.id=p.scope_location_id AND l.organization_id=p.organization_id
        WHERE p.organization_id=$1::uuid AND p.id=$2::uuid`,[actor.organizationId,rows[0].id]))[0];
    });
  }

  async updatePolicy(actor: ActorContext,policyId: string,dto: UpdatePolicyDto) {
    if (Object.values(dto).every((value) => value === undefined)) throw new BadRequestException('Change at least one schedule setting');
    const existing = await this.database.query<{
      id:string;scopeLocationId:string;cadenceMonths:number;graceDays:number;escalationIntervalDays:number;enabled:boolean;
    }>(
      `SELECT id,scope_location_id AS "scopeLocationId",cadence_months AS "cadenceMonths",grace_days AS "graceDays",
              escalation_interval_days AS "escalationIntervalDays",enabled
         FROM verification_policies WHERE organization_id=$1::uuid AND id=$2::uuid`,
      [actor.organizationId,policyId],
    );
    const before=existing[0];
    if (!before) throw new NotFoundException('Verification policy was not found');
    await this.authorization.assertLocationAccess(actor,before.scopeLocationId,['head_office']);
    return this.database.transaction(async (query) => {
      const locked = await query<typeof before>(
        `SELECT id,scope_location_id AS "scopeLocationId",cadence_months AS "cadenceMonths",grace_days AS "graceDays",
                escalation_interval_days AS "escalationIntervalDays",enabled
           FROM verification_policies WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,
        [actor.organizationId,policyId],
      );
      if (!locked[0]) throw new NotFoundException('Verification policy was not found');
      const current=locked[0];
      const updated=(await query<typeof current>(
        `UPDATE verification_policies SET cadence_months=COALESCE($3,cadence_months),
                grace_days=COALESCE($4,grace_days),escalation_interval_days=COALESCE($5,escalation_interval_days),
                enabled=COALESCE($6,enabled)
          WHERE organization_id=$1::uuid AND id=$2::uuid
          RETURNING id,scope_location_id AS "scopeLocationId",cadence_months AS "cadenceMonths",grace_days AS "graceDays",
                    escalation_interval_days AS "escalationIntervalDays",enabled`,
        [actor.organizationId,policyId,dto.cadenceMonths ?? null,dto.graceDays ?? null,dto.escalationIntervalDays ?? null,dto.enabled ?? null],
      ))[0];
      await query(
        `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
         VALUES ($1::uuid,$2::uuid,'verification.policy_updated','verification_policy',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,policyId,JSON.stringify({before:current,after:updated})],
      );
      const names=await query<{scopeLocationName:string}>(
        `SELECT name AS "scopeLocationName" FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid`,
        [actor.organizationId,updated.scopeLocationId],
      );
      return {...updated,scopeLocationName:names[0]?.scopeLocationName};
    });
  }

  async cycles(actor: ActorContext) {
    return this.database.query(
      `WITH RECURSIVE assigned_path(id,parent_id) AS (
         SELECT place.id,place.parent_id FROM role_assignments assignment
          JOIN locations place ON place.organization_id=assignment.organization_id AND place.id=assignment.scope_location_id
          WHERE assignment.organization_id=$1::uuid AND assignment.user_id=$2::uuid AND assignment.scope_location_id IS NOT NULL
         UNION
         SELECT parent.id,parent.parent_id FROM locations parent JOIN assigned_path child ON child.parent_id=parent.id WHERE parent.organization_id=$1::uuid
       ), assigned_scope(id) AS (
         SELECT scope_location_id FROM role_assignments
          WHERE organization_id=$1::uuid AND user_id=$2::uuid AND scope_location_id IS NOT NULL
         UNION
         SELECT child.id FROM locations child JOIN assigned_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), visible_locations(id) AS (
         SELECT id FROM assigned_scope
         UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS (
           SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$2::uuid
             AND role_key='head_office' AND scope_location_id IS NULL
         )
       )
       SELECT c.id,c.policy_id AS "policyId",c.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        c.starts_at AS "startsAt",c.grace_ends_at AS "graceEndsAt",c.status,c.created_at AS "createdAt",
        c.closed_at AS "closedAt",c.close_reason AS "closeReason",
        (SELECT count(*) FROM assets a WHERE a.organization_id=c.organization_id AND a.location_id IN (
          WITH RECURSIVE descendants(id) AS (SELECT c.scope_location_id UNION SELECT child.id FROM locations child JOIN descendants d ON child.parent_id=d.id WHERE child.organization_id=c.organization_id)
          SELECT id FROM descendants INTERSECT SELECT id FROM visible_locations)) AS "assetCount",
        (SELECT count(DISTINCT s.asset_id) FROM scan_events s JOIN assets a ON a.organization_id=s.organization_id AND a.id=s.asset_id
          WHERE s.organization_id=c.organization_id AND s.cycle_id=c.id AND a.location_id IN (
            WITH RECURSIVE descendants(id) AS (SELECT c.scope_location_id UNION SELECT child.id FROM locations child JOIN descendants d ON child.parent_id=d.id WHERE child.organization_id=c.organization_id)
            SELECT id FROM descendants INTERSECT SELECT id FROM visible_locations)) AS "scannedCount"
       FROM verification_cycles c JOIN locations l ON l.organization_id=c.organization_id AND l.id=c.scope_location_id
       WHERE c.organization_id=$1::uuid AND (
         c.scope_location_id IN (SELECT id FROM assigned_path)
         OR EXISTS (SELECT 1 FROM role_assignments head WHERE head.organization_id=$1::uuid AND head.user_id=$2::uuid
              AND head.role_key='head_office' AND head.scope_location_id IS NULL)
       ) ORDER BY c.starts_at DESC`,[actor.organizationId,actor.userId],
    );
  }

  async createCycle(actor: ActorContext,dto: CreateCycleDto) {
    const policies = await this.database.query<{ id:string; scopeLocationId:string }>(
      `SELECT id,scope_location_id AS "scopeLocationId" FROM verification_policies
       WHERE organization_id=$1::uuid AND id=$2::uuid AND enabled=true`,[actor.organizationId,dto.policyId],
    );
    const policy=policies[0];
    if (!policy) throw new NotFoundException('Enabled verification policy was not found');
    await this.assertCycleScopeAccess(actor,policy.scopeLocationId,['head_office','state_head','centre_head']);
    return this.database.transaction(async (query) => {
      const lockedPolicy=await query<{graceDays:number}>(
        `SELECT grace_days AS "graceDays" FROM verification_policies
          WHERE organization_id=$1::uuid AND id=$2::uuid AND enabled=true FOR UPDATE`,
        [actor.organizationId,policy.id],
      );
      if(!lockedPolicy[0])throw new NotFoundException('Enabled verification policy was not found');
      const active=await query<{id:string}>(
        `SELECT id FROM verification_cycles WHERE organization_id=$1::uuid AND policy_id=$2::uuid AND status<>'closed'
          ORDER BY starts_at DESC,created_at DESC LIMIT 1`,[actor.organizationId,policy.id],
      );
      if(active[0])return {id:active[0].id,reused:true};
      const startsAt=dto.startsAt ?? null;
      const rows=await query<{id:string;status:string;startsAt:Date|string}>(
        `INSERT INTO verification_cycles (organization_id,scope_location_id,policy_id,starts_at,grace_ends_at,status,created_by)
         VALUES ($1::uuid,$2::uuid,$3::uuid,COALESCE($4::timestamptz,now()),COALESCE($4::timestamptz,now())+make_interval(days=>$5),
           CASE WHEN COALESCE($4::timestamptz,now())+make_interval(days=>$5)<=now() THEN 'grace'::cycle_status
                WHEN COALESCE($4::timestamptz,now())>now() THEN 'scheduled'::cycle_status ELSE 'open'::cycle_status END,$6::uuid)
         RETURNING id,status,starts_at AS "startsAt"`,
        [actor.organizationId,policy.scopeLocationId,policy.id,startsAt,lockedPolicy[0].graceDays,actor.userId],
      );
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'verification.cycle_opened','verification_cycle',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,rows[0].id,JSON.stringify({policyId:policy.id,scopeLocationId:policy.scopeLocationId,startsAt:rows[0].startsAt,graceDays:lockedPolicy[0].graceDays,status:rows[0].status})]);
      return {...rows[0],reused:false};
    });
  }

  async closeCycle(actor:ActorContext,cycleId:string,dto:CloseCycleDto) {
    const cycle=await this.cycle(actor,cycleId);
    await this.assertCycleScopeAccess(actor,cycle.scopeLocationId,['head_office']);
    const reason=dto.reason.trim();
    if(reason.length<5)throw new BadRequestException('Enter at least five characters for the closure reason');
    return this.database.transaction(async(query)=>{
      const lockedCycle=await query<{status:string}>(
        `SELECT status FROM verification_cycles WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,
        [actor.organizationId,cycleId],
      );
      if(!lockedCycle[0])throw new NotFoundException('Verification cycle was not found');
      if(lockedCycle[0].status==='closed')throw new ConflictException('Verification cycle is already closed');
      const unresolved=await query<{count:number}>(
        `WITH RECURSIVE scope_tree(id) AS (
           SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
           UNION SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
         ) SELECT count(*)::integer AS count FROM assets asset
           WHERE asset.organization_id=$1::uuid AND asset.location_id IN (SELECT id FROM scope_tree)
             AND asset.status NOT IN ('missing','retired','disposed')
             AND NOT EXISTS (SELECT 1 FROM scan_events scan WHERE scan.organization_id=$1::uuid AND scan.cycle_id=$3::uuid AND scan.asset_id=asset.id)`,
        [actor.organizationId,cycle.scopeLocationId,cycleId],
      );
      const closed=await query<{id:string;status:string;closedAt:Date|string;closeReason:string}>(
        `UPDATE verification_cycles SET status='closed',closed_at=now(),closed_by=$3::uuid,close_reason=$4
          WHERE organization_id=$1::uuid AND id=$2::uuid AND status<>'closed'
          RETURNING id,status,closed_at AS "closedAt",close_reason AS "closeReason"`,
        [actor.organizationId,cycleId,actor.userId,reason],
      );
      if(!closed[0])throw new ConflictException('Verification cycle is already closed');
      await query(
        `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
         VALUES ($1::uuid,$2::uuid,'verification.cycle_closed','verification_cycle',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,cycleId,JSON.stringify({reason,unresolvedAssetCount:unresolved[0]?.count??0})],
      );
      return {...closed[0],unresolvedAssetCount:unresolved[0]?.count??0};
    });
  }

  private async cycle(actor: ActorContext,cycleId:string) {
    const rows=await this.database.query<{id:string;scopeLocationId:string;startsAt:string;graceEndsAt:string;status:string;started:boolean}>(
      `SELECT id,scope_location_id AS "scopeLocationId",starts_at AS "startsAt",grace_ends_at AS "graceEndsAt",status,starts_at<=now() AS started
       FROM verification_cycles WHERE organization_id=$1::uuid AND id=$2::uuid`,[actor.organizationId,cycleId]);
    if (!rows[0]) throw new NotFoundException('Verification cycle was not found');
    await this.assertCycleScopeAccess(actor,rows[0].scopeLocationId);
    return rows[0];
  }

  private async lockWritableCycle(query:SqlQuery,actor:ActorContext,cycleId:string) {
    const rows=await query<{status:string;started:boolean}>(
      `SELECT status,starts_at<=now() AS started FROM verification_cycles
        WHERE organization_id=$1::uuid AND id=$2::uuid FOR UPDATE`,
      [actor.organizationId,cycleId],
    );
    if(!rows[0]) throw new NotFoundException('Verification cycle was not found');
    if(rows[0].status==='closed') throw new ForbiddenException('This verification cycle is closed');
    if(!rows[0].started) throw new ForbiddenException('This verification cycle has not started yet');
  }

  async recordScan(actor:ActorContext,cycleId:string,dto:RecordScanDto) {
    const cycle=await this.cycle(actor,cycleId);
    if (cycle.status==='closed') throw new ForbiddenException('This verification cycle is closed');
    if (!cycle.started) throw new ForbiddenException('This verification cycle has not started yet');
    const locations=await this.database.query<{allowed:boolean}>(
      `WITH RECURSIVE scope_tree(id) AS (
        SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
        UNION ALL SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ) SELECT EXISTS(SELECT 1 FROM scope_tree WHERE id=$3::uuid) AS allowed`,
      [actor.organizationId,cycle.scopeLocationId,dto.locationId]);
    if (!locations[0]?.allowed) throw new ForbiddenException('Scan location is outside this cycle');
    await this.authorization.assertLocationAccess(actor,dto.locationId,['head_office','state_head','centre_head','asset_custodian']);
    const asset=this.database.query<{id:string;locationId:string}>(
      'SELECT id,location_id AS "locationId" FROM assets WHERE organization_id=$1::uuid AND id=$2::uuid',[actor.organizationId,dto.assetId]);
    const assetRows=await asset;
    if (!assetRows[0]) throw new NotFoundException('Asset was not found');
    await this.authorization.assertLocationAccess(actor,assetRows[0].locationId,['head_office','state_head','centre_head','asset_custodian']);
    const inScope=await this.database.query<{allowed:boolean}>(
      `WITH RECURSIVE scope_tree(id) AS (SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
        UNION ALL SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid)
       SELECT EXISTS(SELECT 1 FROM scope_tree WHERE id=$3::uuid) AS allowed`,[actor.organizationId,cycle.scopeLocationId,assetRows[0].locationId]);
    if (!inScope[0]?.allowed) throw new ForbiddenException('Asset is outside this verification cycle');
    return this.database.transaction(async query=>{
      await this.lockWritableCycle(query,actor,cycleId);
      const saved=await query<{id:string;duplicate:boolean}>(
        `INSERT INTO scan_events (organization_id,cycle_id,asset_id,location_id,scanned_by,client_event_id,scanned_at,identification_method)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz,$8)
         ON CONFLICT (organization_id,client_event_id) DO NOTHING RETURNING id,false AS duplicate`,
        [actor.organizationId,cycleId,dto.assetId,dto.locationId,actor.userId,dto.clientEventId,dto.scannedAt,dto.identificationMethod ?? 'qr']);
      if (saved[0]) {
        await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
          VALUES ($1::uuid,$2::uuid,'verification.asset_scanned','asset',$3::uuid,$4::jsonb)`,
          [actor.organizationId,actor.userId,dto.assetId,JSON.stringify({cycleId,locationId:dto.locationId,clientEventId:dto.clientEventId,identificationMethod:dto.identificationMethod ?? 'qr'})]);
        return saved[0];
      }
      const existing=await query<{id:string;assetId:string;cycleId:string|null;locationId:string;identificationMethod:string}>(
        'SELECT id,asset_id AS "assetId",cycle_id AS "cycleId",location_id AS "locationId",identification_method AS "identificationMethod" FROM scan_events WHERE organization_id=$1::uuid AND client_event_id=$2::uuid',[actor.organizationId,dto.clientEventId]);
      if(existing[0]&&(existing[0].assetId!==dto.assetId||existing[0].cycleId!==cycleId||existing[0].locationId!==dto.locationId||existing[0].identificationMethod!==(dto.identificationMethod??'qr'))) throw new ConflictException('This scan identifier was already used for a different scan');
      return {id:existing[0]?.id,duplicate:true};
    });
  }

  async recordRfidScans(actor:ActorContext,cycleId:string,dto:RecordRfidScansDto) {
    const cycle=await this.cycle(actor,cycleId);
    if(cycle.status==='closed') throw new ForbiddenException('This verification cycle is closed');
    if(!cycle.started) throw new ForbiddenException('This verification cycle has not started yet');
    const location=await this.database.query<{allowed:boolean}>(
      `WITH RECURSIVE scope_tree(id) AS (
         SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
         UNION ALL SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ) SELECT EXISTS(SELECT 1 FROM scope_tree WHERE id=$3::uuid) AS allowed`,
      [actor.organizationId,cycle.scopeLocationId,dto.locationId],
    );
    if(!location[0]?.allowed) throw new ForbiddenException('Scan location is outside this cycle');
    await this.authorization.assertLocationAccess(actor,dto.locationId,['head_office','state_head','centre_head','asset_custodian']);

    const readings=dto.readings.map((reading)=>({...reading,epc:reading.epc.toUpperCase()}));
    const epcs=[...new Set(readings.map((reading)=>reading.epc))];
    const matches=await this.database.query<{id:string;epc:string;assetTag:string;locationId:string;locationName:string;inScanLocation:boolean}>(
      `WITH RECURSIVE cycle_scope(id) AS (
         SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
         UNION ALL SELECT child.id FROM locations child JOIN cycle_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), scan_scope(id) AS (
         SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$4::uuid
         UNION ALL SELECT child.id FROM locations child JOIN scan_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), assigned_scope(id) AS (
         SELECT scope_location_id FROM role_assignments
          WHERE organization_id=$1::uuid AND user_id=$5::uuid AND scope_location_id IS NOT NULL
         UNION
         SELECT child.id FROM locations child JOIN assigned_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), visible_locations(id) AS (
         SELECT id FROM assigned_scope
         UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS (
           SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$5::uuid
             AND role_key='head_office' AND scope_location_id IS NULL
         )
       )
       SELECT a.id,a.rfid_epc AS epc,a.asset_tag AS "assetTag",a.location_id AS "locationId",l.name AS "locationName",
              (a.location_id IN (SELECT id FROM scan_scope)) AS "inScanLocation"
         FROM assets a JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id
        WHERE a.organization_id=$1::uuid AND upper(a.rfid_epc)=ANY($3::text[])
          AND a.location_id IN (SELECT id FROM cycle_scope INTERSECT SELECT id FROM visible_locations)`,
      [actor.organizationId,cycle.scopeLocationId,epcs,dto.locationId,actor.userId],
    );
    const byEpc=new Map(matches.map((match)=>[match.epc.toUpperCase(),match]));
    const seen=new Set<string>();
    const candidates:{assetId:string;assetTag:string;epc:string;clientEventId:string;scannedAt:string;resultIndex:number}[]=[];
    type RfidResult={epc:string;status:'recorded'|'duplicate'|'duplicate_read'|'not_registered'|'wrong_location';assetId?:string;assetTag?:string;assignedLocation?:string;clientEventId:string;scanEventId?:string};
    const results:(RfidResult|undefined)[]=Array.from({length:readings.length});
    for(const [index,reading] of readings.entries()) {
      if(seen.has(reading.epc)) { results[index]={epc:reading.epc,status:'duplicate_read',clientEventId:reading.clientEventId};continue; }
      seen.add(reading.epc);
      const match=byEpc.get(reading.epc);
      if(!match) { results[index]={epc:reading.epc,status:'not_registered',clientEventId:reading.clientEventId};continue; }
      if(!match.inScanLocation) { results[index]={epc:reading.epc,status:'wrong_location',assetId:match.id,assetTag:match.assetTag,assignedLocation:match.locationName,clientEventId:reading.clientEventId};continue; }
      candidates.push({assetId:match.id,assetTag:match.assetTag,epc:reading.epc,clientEventId:reading.clientEventId,scannedAt:reading.scannedAt,resultIndex:index});
    }

    const saved=await this.database.transaction(async query=>{
      await this.lockWritableCycle(query,actor,cycleId);
      const inserted=candidates.length?await query<{id:string;assetId:string;clientEventId:string}>(
        `INSERT INTO scan_events (organization_id,cycle_id,asset_id,location_id,scanned_by,client_event_id,scanned_at,identification_method)
         SELECT $1::uuid,$2::uuid,input.asset_id,$3::uuid,$4::uuid,input.event_id,input.scanned_at,'rfid'
           FROM unnest($5::uuid[],$6::uuid[],$7::timestamptz[]) AS input(asset_id,event_id,scanned_at)
         ON CONFLICT (organization_id,client_event_id) DO NOTHING
         RETURNING id,asset_id AS "assetId",client_event_id AS "clientEventId"`,
        [actor.organizationId,cycleId,dto.locationId,actor.userId,candidates.map((item)=>item.assetId),candidates.map((item)=>item.clientEventId),candidates.map((item)=>item.scannedAt)],
      ):[];
      const insertedIds=inserted.map((item)=>item.clientEventId);
      if(insertedIds.length) await query(
        `INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
         SELECT $1::uuid,$2::uuid,'verification.asset_scanned','asset',scan.asset_id,
                jsonb_build_object('cycleId',scan.cycle_id,'locationId',scan.location_id,'clientEventId',scan.client_event_id,'identificationMethod','rfid')
           FROM scan_events scan WHERE scan.organization_id=$1::uuid AND scan.client_event_id=ANY($3::uuid[])`,
        [actor.organizationId,actor.userId,insertedIds],
      );
      const missing=candidates.filter((item)=>!insertedIds.includes(item.clientEventId));
      const existing=missing.length?await query<{id:string;assetId:string;cycleId:string|null;locationId:string;clientEventId:string;identificationMethod:string}>(
        `SELECT id,asset_id AS "assetId",cycle_id AS "cycleId",location_id AS "locationId",client_event_id AS "clientEventId",identification_method AS "identificationMethod"
           FROM scan_events WHERE organization_id=$1::uuid AND client_event_id=ANY($2::uuid[])`,
        [actor.organizationId,missing.map((item)=>item.clientEventId)],
      ):[];
      const existingById=new Map(existing.map((item)=>[item.clientEventId,item]));
      for(const item of missing) {
        const prior=existingById.get(item.clientEventId);
        if(!prior||prior.assetId!==item.assetId||prior.cycleId!==cycleId||prior.locationId!==dto.locationId||prior.identificationMethod!=='rfid') {
          throw new ConflictException('An RFID scan event identifier was already used for another record');
        }
      }
      return {inserted,existing};
    });
    const savedByEvent=new Map<string,{id:string;duplicate:boolean}>();
    for(const item of saved.inserted) savedByEvent.set(item.clientEventId,{id:item.id,duplicate:false});
    for(const item of saved.existing) savedByEvent.set(item.clientEventId,{id:item.id,duplicate:true});
    for(const item of candidates) {
      const row=savedByEvent.get(item.clientEventId);
      results[item.resultIndex]={epc:item.epc,status:row?.duplicate?'duplicate':'recorded',assetId:item.assetId,assetTag:item.assetTag,clientEventId:item.clientEventId,scanEventId:row?.id};
    }
    const orderedResults=results.filter((result):result is RfidResult=>result!==undefined);
    const recordedCount=orderedResults.filter((result)=>result.status==='recorded').length;
    return {cycleId,receivedCount:readings.length,recordedCount,duplicateCount:orderedResults.filter((result)=>result.status==='duplicate'||result.status==='duplicate_read').length,
      wrongLocationCount:orderedResults.filter((result)=>result.status==='wrong_location').length,notRegisteredCount:orderedResults.filter((result)=>result.status==='not_registered').length,results:orderedResults};
  }

  async progress(actor:ActorContext,cycleId:string) {
    const cycle=await this.cycle(actor,cycleId);
    return this.database.query(
      `WITH RECURSIVE scope_tree(id) AS (SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
        UNION ALL SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid),
       assigned_scope(id) AS (
         SELECT scope_location_id FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$5::uuid AND scope_location_id IS NOT NULL
         UNION SELECT child.id FROM locations child JOIN assigned_scope parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid
       ), visible_locations(id) AS (
         SELECT id FROM assigned_scope
         UNION SELECT id FROM locations WHERE organization_id=$1::uuid AND EXISTS (
           SELECT 1 FROM role_assignments WHERE organization_id=$1::uuid AND user_id=$5::uuid AND role_key='head_office' AND scope_location_id IS NULL
         )
       ),
       cycle_assets AS (SELECT a.id,a.asset_tag AS "assetTag",a.name,a.location_id AS "locationId",l.name AS "locationName"
         FROM assets a JOIN locations l ON l.id=a.location_id AND l.organization_id=a.organization_id
         WHERE a.organization_id=$1::uuid AND a.location_id IN (SELECT id FROM scope_tree INTERSECT SELECT id FROM visible_locations)),
       scanned AS (SELECT DISTINCT scan.asset_id FROM scan_events scan JOIN cycle_assets visible_asset ON visible_asset.id=scan.asset_id
         WHERE scan.organization_id=$1::uuid AND scan.cycle_id=$3::uuid)
       SELECT ca.id AS "assetId",ca."assetTag",ca.name,ca."locationId",ca."locationName",
         (s.asset_id IS NOT NULL) AS scanned,
         CASE WHEN s.asset_id IS NOT NULL THEN 'verified' WHEN now()>$4::timestamptz THEN 'unseen_after_window' ELSE 'not_yet_scanned' END AS "reviewState"
       FROM cycle_assets ca LEFT JOIN scanned s ON s.asset_id=ca.id ORDER BY ca."locationName",ca."assetTag"`,
      [actor.organizationId,cycle.scopeLocationId,cycleId,cycle.graceEndsAt,actor.userId],
    );
  }
}
