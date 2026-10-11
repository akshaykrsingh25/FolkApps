import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, type SqlQuery } from '../database.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { ActorContext } from '../auth/authenticated-request';
import { OperationsService,VISIBLE } from './operations.service';
import type { CreditDto, DepreciationDto, FinanceActionDto, PlanDto, PlanQueryDto, TicketActionDto, TicketDto } from './advanced.dto';
const MANAGERS=['head_office','state_head','centre_head'];
export function depreciation(cost:number,purchased:string,period:string,life:number,residual:number){
 const start=new Date(purchased),end=new Date(period);
 const cents=Math.round(cost*100);
 if(!Number.isSafeInteger(cents)||cents<0||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start||!Number.isInteger(life)||life<1||!Number.isFinite(residual)||residual<0||residual>100)throw new BadRequestException('Invalid depreciation inputs');
 const months=Math.min(life,Math.max(0,(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()-(end.getUTCDate()<start.getUTCDate()?1:0)));
 const residualCents=Math.round(cents*residual/100),accumulated=Math.round((cents-residualCents)*months/life);
 return {elapsedMonths:months,cost:cents/100,residualValue:residualCents/100,accumulatedDepreciation:accumulated/100,netBookValue:(cents-accumulated)/100};
}
@Injectable()
export class AdvancedService {
 constructor(private db:DatabaseService,private auth:AuthorizationService,private ops:OperationsService){}
 private async audit(q:SqlQuery,a:ActorContext,id:string,type:string,details:unknown){await q(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES($1,$2,$3,'operations',$4,$5)`,[a.organizationId,a.userId,type,id,JSON.stringify(details)]);}
 private async finance(a:ActorContext,q:SqlQuery=this.db.query.bind(this.db)){
  const roles=await q(`SELECT 1 FROM role_assignments WHERE organization_id=$1 AND user_id=$2 AND role_key='head_office' AND scope_location_id IS NULL`,[a.organizationId,a.userId]);
  if(!roles.length)throw new ForbiddenException('Head office approval is required');
 }
 tickets(a:ActorContext){return this.db.query(`${VISIBLE} SELECT t.*,a.name AS "assetName",a.asset_tag AS "assetTag",
  (t.acknowledged_at IS NULL AND now()>t.created_at+make_interval(hours=>t.ack_hours)) AS "ackOverdue",
  (t.resolved_at IS NULL AND now()>t.created_at+make_interval(hours=>t.resolution_hours)) AS "resolutionOverdue",
  LEAST(t.credit_cap,ceil(GREATEST(0,extract(epoch FROM(COALESCE(t.resolved_at,now())-(t.created_at+make_interval(hours=>t.resolution_hours)))))/3600)*t.credit_per_hour)::text AS "proposedCredit"
  FROM service_tickets t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id WHERE t.organization_id=$1 AND a.location_id IN(SELECT id FROM visible) ORDER BY t.created_at DESC LIMIT 250`,[a.organizationId,a.userId]);}
 async createTicket(a:ActorContext,d:TicketDto){
  if(d.resolutionHours<d.ackHours)throw new BadRequestException('Resolution target must follow acknowledgement target');
  return this.db.transaction(async q=>{
   await this.ops.asset(a,d.assetId,MANAGERS,q);
   const result=await q(`INSERT INTO service_tickets(id,organization_id,asset_id,created_by,vendor,contract_reference,description,ack_hours,resolution_hours,credit_per_hour,credit_cap) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING RETURNING id`,[d.id,a.organizationId,d.assetId,a.userId,d.vendor,d.contractReference,d.description,d.ackHours,d.resolutionHours,d.creditPerHour,d.creditCap]);
   if(!result.length)throw new ConflictException('Ticket reference already exists. Refresh before trying again.');
   await this.audit(q,a,d.id,'service.ticket_created',d);return result[0];
  });
 }
 async ticketAction(a:ActorContext,id:string,d:TicketActionDto|CreditDto){return this.db.transaction(async q=>{
  const rows=await q(`SELECT * FROM service_tickets WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[a.organizationId,id]);const t=rows[0];if(!t)throw new NotFoundException('Ticket not found');
  await this.ops.asset(a,t.asset_id,MANAGERS,q);
  if('amount' in d){await this.finance(a,q);if(t.status!=='resolved')throw new ConflictException('Resolve the ticket before reviewing credit');if(t.approved_by)throw new ConflictException('Credit already reviewed');if(d.amount>Number(t.credit_cap))throw new BadRequestException('Credit exceeds the recorded contract cap');await q(`UPDATE service_tickets SET approved_credit=$3,approved_by=$4,credit_reason=$5 WHERE organization_id=$1 AND id=$2`,[a.organizationId,id,d.amount,a.userId,d.reason]);}
  else {if(t.status===d.status)return {id,status:t.status};if(t.status==='resolved'||(d.status==='resolved'&&t.status!=='acknowledged'))throw new ConflictException('Acknowledge the ticket before resolving it');await q(`UPDATE service_tickets SET status=$3,acknowledged_at=CASE WHEN $3='acknowledged' THEN now() ELSE acknowledged_at END,resolved_at=CASE WHEN $3='resolved' THEN now() ELSE resolved_at END WHERE organization_id=$1 AND id=$2`,[a.organizationId,id,d.status]);}
  await this.audit(q,a,id,'service.ticket_updated',d);return {id};
 });}
 async savePlan(a:ActorContext,d:PlanDto){return this.db.transaction(async q=>{
  await this.auth.assertLocationAccess(a,d.floorId,MANAGERS,q);
  const floor=await q(`SELECT kind FROM locations WHERE organization_id=$1 AND id=$2`,[a.organizationId,d.floorId]);if(floor[0]?.kind!=='floor')throw new BadRequestException('Choose a floor');
  if(new Set(d.rooms.map(r=>r.locationId)).size!==d.rooms.length)throw new BadRequestException('Each area can appear once');
  for(const room of d.rooms){if(room.x+room.width>100||room.y+room.height>100)throw new BadRequestException('Room exceeds plan bounds');const valid=await q(`SELECT id FROM locations WHERE organization_id=$1 AND id=$2 AND parent_id=$3 AND kind='area'`,[a.organizationId,room.locationId,d.floorId]);if(!valid.length)throw new BadRequestException('Every room must be an area directly inside this floor');}
  await q(`INSERT INTO indoor_plans(id,organization_id,floor_id,name,rooms,created_by) VALUES($1,$2,$3,$4,$5,$6)`,[d.id,a.organizationId,d.floorId,d.name,JSON.stringify(d.rooms),a.userId]);await this.audit(q,a,d.id,'floorplan.version_saved',{floorId:d.floorId,name:d.name});return {id:d.id};
 });}
 async plan(a:ActorContext,d:PlanQueryDto){
  await this.auth.assertLocationAccess(a,d.floorId);
  if(d.cycleId){const cycle=await this.db.query(`SELECT scope_location_id FROM verification_cycles WHERE organization_id=$1 AND id=$2`,[a.organizationId,d.cycleId]);if(!cycle[0])throw new NotFoundException('Cycle not found');await this.auth.assertLocationAccess(a,cycle[0].scope_location_id);}
  const plans=await this.db.query(`SELECT id,name,rooms,created_at AS "createdAt" FROM indoor_plans WHERE organization_id=$1 AND floor_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,[a.organizationId,d.floorId]);
  const areas=await this.db.query(`SELECT l.id,l.name,count(a.id)::int AS total,count(a.id) FILTER(WHERE EXISTS(SELECT 1 FROM scan_events s WHERE s.organization_id=a.organization_id AND s.asset_id=a.id AND s.cycle_id=$3::uuid AND s.location_id=a.location_id))::int AS verified FROM locations l LEFT JOIN assets a ON a.organization_id=l.organization_id AND a.location_id=l.id AND a.status NOT IN('retired','disposed') WHERE l.organization_id=$1 AND l.parent_id=$2 AND l.kind='area' GROUP BY l.id,l.name ORDER BY l.name`,[a.organizationId,d.floorId,d.cycleId??null]);return {plan:plans[0]??null,areas,cycleId:d.cycleId??null};
 }
 async createFinance(a:ActorContext,d:DepreciationDto){return this.db.transaction(async q=>{
  await this.finance(a,q);if(new Set(d.assetIds).size!==d.assetIds.length)throw new BadRequestException('Duplicate assets');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.periodEnd))throw new BadRequestException('Use a date without a time');
  const records=await q(`SELECT id,asset_tag,name,purchase_amount,purchase_date,currency,ownership_type,status FROM assets WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`,[a.organizationId,d.assetIds]);
  if(records.length!==d.assetIds.length)throw new BadRequestException('Some assets are unavailable');
  const lines=records.map(r=>{if(r.purchase_amount===null||!r.purchase_date||r.currency!=='INR'||r.ownership_type!=='INCUSPAZE_OWNED'||['retired','disposed'].includes(r.status))throw new BadRequestException(`Asset ${r.asset_tag} needs eligible ownership, INR cost and purchase date`);return {assetId:r.id,assetTag:r.asset_tag,name:r.name,...depreciation(Number(r.purchase_amount),new Date(r.purchase_date).toISOString().slice(0,10),d.periodEnd,d.usefulLifeMonths,d.residualPercent)};});
  const snapshot={method:'straight_line_completed_months',usefulLifeMonths:d.usefulLifeMonths,residualPercent:d.residualPercent,lines};
  await q(`INSERT INTO depreciation_batches(id,organization_id,created_by,period_end,policy_reference,lines) VALUES($1,$2,$3,$4,$5,$6)`,[d.id,a.organizationId,a.userId,d.periodEnd,d.policyReference,JSON.stringify(lines)]);
  await this.audit(q,a,d.id,'finance.batch_created',snapshot);return {id:d.id,lines};
 });}
 async financeBatches(a:ActorContext){await this.finance(a);return this.db.query(`SELECT id,period_end AS "periodEnd",policy_reference AS "policyReference",status,lines,external_reference AS "externalReference" FROM depreciation_batches WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[a.organizationId]);}
 async financeAction(a:ActorContext,id:string,d:FinanceActionDto){return this.db.transaction(async q=>{
  await this.finance(a,q);const rows=await q(`SELECT * FROM depreciation_batches WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[a.organizationId,id]);const b=rows[0];if(!b)throw new NotFoundException('Batch not found');
  if(b.status===d.status)return {id,status:b.status};
  if(({draft:'approved',approved:'exported',exported:'reconciled'} as Record<string,string>)[b.status]!==d.status)throw new ConflictException('Follow draft, approve, export, reconcile order');
  if(d.status==='approved'&&b.created_by===a.userId)throw new ConflictException('Another head-office reviewer must approve the batch');
  if(d.status==='reconciled'&&!d.externalReference?.trim())throw new BadRequestException('ERP journal reference is required');
  await q(`UPDATE depreciation_batches SET status=$3,approved_by=CASE WHEN $3='approved' THEN $4::uuid ELSE approved_by END,external_reference=COALESCE($5,external_reference) WHERE organization_id=$1 AND id=$2`,[a.organizationId,id,d.status,a.userId,d.externalReference??null]);await this.audit(q,a,id,'finance.batch_updated',d);return {id,status:d.status};
 });}
}
