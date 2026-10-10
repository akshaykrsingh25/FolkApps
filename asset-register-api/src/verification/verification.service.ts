import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../auth/authenticated-request';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database.service';
import type { CreateCycleDto, CreatePolicyDto, RecordScanDto } from './verification.dto';

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
    const rows = await this.database.query<{ id: string; scopeLocationId: string }>(
      `SELECT id,scope_location_id AS "scopeLocationId" FROM verification_policies
       WHERE organization_id=$1::uuid ORDER BY created_at DESC`, [actor.organizationId],
    );
    const allowed: string[] = [];
    for (const row of rows) {
      try { await this.assertCycleScopeAccess(actor,row.scopeLocationId); allowed.push(row.id); } catch { /* outside assigned scope */ }
    }
    return this.database.query(
      `SELECT p.id,p.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        p.cadence_months AS "cadenceMonths",p.grace_days AS "graceDays",p.enabled,p.created_at AS "createdAt"
       FROM verification_policies p JOIN locations l ON l.organization_id=p.organization_id AND l.id=p.scope_location_id
       WHERE p.organization_id=$1::uuid AND p.id=ANY($2::uuid[]) ORDER BY p.created_at DESC`,[actor.organizationId,allowed],
    );
  }

  async createPolicy(actor: ActorContext,dto: CreatePolicyDto) {
    await this.authorization.assertLocationAccess(actor,dto.scopeLocationId,['head_office']);
    return this.database.transaction(async (query) => {
      const rows = await query<{ id: string }>(
        `INSERT INTO verification_policies (organization_id,scope_location_id,cadence_months,grace_days,enabled)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5) RETURNING id`,
        [actor.organizationId,dto.scopeLocationId,dto.cadenceMonths,dto.graceDays,dto.enabled ?? true],
      );
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'verification.policy_created','verification_policy',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,rows[0].id,JSON.stringify(dto)]);
      return (await query(`SELECT p.id,p.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        p.cadence_months AS "cadenceMonths",p.grace_days AS "graceDays",p.enabled,p.created_at AS "createdAt"
        FROM verification_policies p JOIN locations l ON l.id=p.scope_location_id AND l.organization_id=p.organization_id
        WHERE p.organization_id=$1::uuid AND p.id=$2::uuid`,[actor.organizationId,rows[0].id]))[0];
    });
  }

  async cycles(actor: ActorContext) {
    const rows = await this.database.query<{ id: string; scopeLocationId: string }>(
      `SELECT id,scope_location_id AS "scopeLocationId" FROM verification_cycles WHERE organization_id=$1::uuid`,[actor.organizationId],
    );
    const allowed: string[]=[];
    for (const row of rows) {
      try { await this.assertCycleScopeAccess(actor,row.scopeLocationId); allowed.push(row.id); } catch { /* outside assigned scope */ }
    }
    if (!allowed.length) return [];
    return this.database.query(
      `SELECT c.id,c.policy_id AS "policyId",c.scope_location_id AS "scopeLocationId",l.name AS "scopeLocationName",
        c.starts_at AS "startsAt",c.grace_ends_at AS "graceEndsAt",c.status,c.created_at AS "createdAt",
        (SELECT count(*) FROM assets a WHERE a.organization_id=c.organization_id AND a.location_id IN (
          WITH RECURSIVE descendants(id) AS (SELECT c.scope_location_id UNION ALL SELECT child.id FROM locations child JOIN descendants d ON child.parent_id=d.id WHERE child.organization_id=c.organization_id)
          SELECT id FROM descendants)) AS "assetCount",
        (SELECT count(DISTINCT s.asset_id) FROM scan_events s WHERE s.organization_id=c.organization_id AND s.cycle_id=c.id) AS "scannedCount"
       FROM verification_cycles c JOIN locations l ON l.organization_id=c.organization_id AND l.id=c.scope_location_id
       WHERE c.organization_id=$1::uuid AND c.id=ANY($2::uuid[]) ORDER BY c.starts_at DESC`,[actor.organizationId,allowed],
    );
  }

  async createCycle(actor: ActorContext,dto: CreateCycleDto) {
    const policies = await this.database.query<{ id:string; scopeLocationId:string; graceDays:number }>(
      `SELECT id,scope_location_id AS "scopeLocationId",grace_days AS "graceDays" FROM verification_policies
       WHERE organization_id=$1::uuid AND id=$2::uuid AND enabled=true`,[actor.organizationId,dto.policyId],
    );
    const policy=policies[0];
    if (!policy) throw new NotFoundException('Enabled verification policy was not found');
    await this.assertCycleScopeAccess(actor,policy.scopeLocationId,['head_office','state_head','centre_head']);
    const startsAt=dto.startsAt || new Date().toISOString();
    return this.database.transaction(async (query) => {
      const rows=await query<{id:string}>(
        `INSERT INTO verification_cycles (organization_id,scope_location_id,policy_id,starts_at,grace_ends_at,status,created_by)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$4::timestamptz+make_interval(days=>$5),'open',$6::uuid) RETURNING id`,
        [actor.organizationId,policy.scopeLocationId,policy.id,startsAt,policy.graceDays,actor.userId],
      );
      await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
        VALUES ($1::uuid,$2::uuid,'verification.cycle_opened','verification_cycle',$3::uuid,$4::jsonb)`,
        [actor.organizationId,actor.userId,rows[0].id,JSON.stringify({policyId:policy.id,scopeLocationId:policy.scopeLocationId,startsAt,graceDays:policy.graceDays})]);
      return rows[0];
    });
  }

  private async cycle(actor: ActorContext,cycleId:string) {
    const rows=await this.database.query<{id:string;scopeLocationId:string;startsAt:string;graceEndsAt:string;status:string}>(
      `SELECT id,scope_location_id AS "scopeLocationId",starts_at AS "startsAt",grace_ends_at AS "graceEndsAt",status
       FROM verification_cycles WHERE organization_id=$1::uuid AND id=$2::uuid`,[actor.organizationId,cycleId]);
    if (!rows[0]) throw new NotFoundException('Verification cycle was not found');
    await this.assertCycleScopeAccess(actor,rows[0].scopeLocationId);
    return rows[0];
  }

  async recordScan(actor:ActorContext,cycleId:string,dto:RecordScanDto) {
    const cycle=await this.cycle(actor,cycleId);
    if (cycle.status==='closed') throw new ForbiddenException('This verification cycle is closed');
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
      const saved=await query<{id:string;duplicate:boolean}>(
        `INSERT INTO scan_events (organization_id,cycle_id,asset_id,location_id,scanned_by,client_event_id,scanned_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::timestamptz)
         ON CONFLICT (organization_id,client_event_id) DO NOTHING RETURNING id,false AS duplicate`,
        [actor.organizationId,cycleId,dto.assetId,dto.locationId,actor.userId,dto.clientEventId,dto.scannedAt]);
      if (saved[0]) {
        await query(`INSERT INTO audit_events (organization_id,actor_user_id,event_type,entity_type,entity_id,details)
          VALUES ($1::uuid,$2::uuid,'verification.asset_scanned','asset',$3::uuid,$4::jsonb)`,
          [actor.organizationId,actor.userId,dto.assetId,JSON.stringify({cycleId,locationId:dto.locationId,clientEventId:dto.clientEventId})]);
        return saved[0];
      }
      const existing=await query<{id:string}>(
        'SELECT id FROM scan_events WHERE organization_id=$1::uuid AND client_event_id=$2::uuid',[actor.organizationId,dto.clientEventId]);
      return {id:existing[0]?.id,duplicate:true};
    });
  }

  async progress(actor:ActorContext,cycleId:string) {
    const cycle=await this.cycle(actor,cycleId);
    return this.database.query(
      `WITH RECURSIVE scope_tree(id) AS (SELECT id FROM locations WHERE organization_id=$1::uuid AND id=$2::uuid
        UNION ALL SELECT child.id FROM locations child JOIN scope_tree parent ON child.parent_id=parent.id WHERE child.organization_id=$1::uuid),
       cycle_assets AS (SELECT a.id,a.asset_tag AS "assetTag",a.name,a.location_id AS "locationId",l.name AS "locationName"
         FROM assets a JOIN locations l ON l.id=a.location_id AND l.organization_id=a.organization_id WHERE a.organization_id=$1::uuid AND a.location_id IN (SELECT id FROM scope_tree)),
       scanned AS (SELECT DISTINCT asset_id FROM scan_events WHERE organization_id=$1::uuid AND cycle_id=$3::uuid)
       SELECT ca.id AS "assetId",ca."assetTag",ca.name,ca."locationId",ca."locationName",
         (s.asset_id IS NOT NULL) AS scanned,
         CASE WHEN s.asset_id IS NOT NULL THEN 'verified' WHEN now()>$4::timestamptz THEN 'unseen_after_window' ELSE 'not_yet_scanned' END AS "reviewState"
       FROM cycle_assets ca LEFT JOIN scanned s ON s.asset_id=ca.id ORDER BY ca."locationName",ca."assetTag"`,
      [actor.organizationId,cycle.scopeLocationId,cycleId,cycle.graceEndsAt],
    );
  }
}
