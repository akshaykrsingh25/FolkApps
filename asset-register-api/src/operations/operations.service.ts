import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, type SqlQuery } from '../database.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { ActorContext } from '../auth/authenticated-request';
import type { AssignCompletionDto, ReuseQueryDto, TaskActionDto } from './operations.dto';
const MANAGERS=['head_office','state_head','centre_head'];
export const VISIBLE=`WITH RECURSIVE scoped(id) AS (
 SELECT scope_location_id FROM role_assignments WHERE organization_id=$1 AND user_id=$2 AND scope_location_id IS NOT NULL
 UNION SELECT l.id FROM locations l JOIN scoped s ON l.parent_id=s.id WHERE l.organization_id=$1
), visible(id) AS (SELECT id FROM scoped UNION SELECT id FROM locations WHERE organization_id=$1 AND EXISTS(
 SELECT 1 FROM role_assignments WHERE organization_id=$1 AND user_id=$2 AND role_key='head_office' AND scope_location_id IS NULL))`;
@Injectable()
export class OperationsService {
 constructor(private db:DatabaseService,private auth:AuthorizationService){}
 async asset(actor:ActorContext,id:string,roles?:string[],query?:SqlQuery){
  const q=query??this.db.query.bind(this.db);
  const rows=await q(`SELECT id,location_id AS "locationId",purchase_date,purchase_amount,seller_name FROM assets WHERE organization_id=$1 AND id=$2`,[actor.organizationId,id]);
  if(!rows[0])throw new NotFoundException('Asset not found');
  await this.auth.assertLocationAccess(actor,rows[0].locationId,roles,q);return rows[0];
 }
 tasks(actor:ActorContext){return this.db.query(`${VISIBLE} SELECT t.id,t.asset_id AS "assetId",a.name AS "assetName",a.asset_tag AS "assetTag",u.display_name AS "assigneeName",t.assigned_to AS "assignedTo",t.due_at AS "dueAt",t.notes,t.status FROM asset_completion_tasks t JOIN assets a ON a.organization_id=t.organization_id AND a.id=t.asset_id JOIN users u ON u.organization_id=t.organization_id AND u.id=t.assigned_to WHERE t.organization_id=$1 AND a.location_id IN(SELECT id FROM visible) ORDER BY (t.status='open') DESC,t.due_at,t.id LIMIT 250`,[actor.organizationId,actor.userId]);}
 async assignees(actor:ActorContext,assetId:string){
  const asset=await this.asset(actor,assetId,MANAGERS);
  return this.db.query(`WITH RECURSIVE path AS(SELECT id,parent_id FROM locations WHERE organization_id=$1 AND id=$2 UNION ALL SELECT l.id,l.parent_id FROM locations l JOIN path p ON p.parent_id=l.id WHERE l.organization_id=$1) SELECT DISTINCT u.id,u.display_name AS name FROM users u JOIN role_assignments r ON r.organization_id=u.organization_id AND r.user_id=u.id WHERE u.organization_id=$1 AND u.active=true AND r.role_key IN('head_office','state_head','centre_head','asset_custodian') AND ((r.role_key='head_office' AND r.scope_location_id IS NULL) OR r.scope_location_id IN(SELECT id FROM path)) ORDER BY name LIMIT 500`,[actor.organizationId,asset.locationId]);
 }
 async assign(actor:ActorContext,dto:AssignCompletionDto){
  if(Date.parse(dto.dueAt)<=Date.now())throw new BadRequestException('Choose a future due date');
  return this.db.transaction(async q=>{
   const asset=await this.asset(actor,dto.assetId,MANAGERS,q);
   if(asset.purchase_date!==null&&asset.purchase_amount!==null&&asset.seller_name?.trim())throw new ConflictException('Purchase details are already complete');
   const users=await q(`SELECT id FROM users WHERE organization_id=$1 AND id=$2 AND active=true`,[actor.organizationId,dto.assignedTo]);
   if(!users[0])throw new BadRequestException('Choose an active assignee');
   await this.auth.assertLocationAccess({...actor,userId:dto.assignedTo},asset.locationId,[...MANAGERS,'asset_custodian'],q);
   const rows=await q(`INSERT INTO asset_completion_tasks(organization_id,asset_id,assigned_to,created_by,due_at,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,asset_id) WHERE status='open' DO NOTHING RETURNING id`,[actor.organizationId,dto.assetId,dto.assignedTo,actor.userId,dto.dueAt,dto.notes??'']);
   if(!rows[0])throw new ConflictException('This asset already has an open task. Complete or cancel it first.');
   await q(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES($1,$2,'completion.assigned','completion_task',$3,$4)`,[actor.organizationId,actor.userId,rows[0].id,JSON.stringify(dto)]);
   return rows[0];
  });
 }
 async update(actor:ActorContext,id:string,dto:TaskActionDto){
  return this.db.transaction(async q=>{
   const tasks=await q(`SELECT * FROM asset_completion_tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[actor.organizationId,id]);
   if(!tasks[0])throw new NotFoundException('Task not found');const t=tasks[0];
   const asset=await this.asset(actor,t.asset_id,t.assigned_to===actor.userId?undefined:MANAGERS,q);
   if(dto.status==='cancelled')await this.auth.assertLocationAccess(actor,asset.locationId,MANAGERS,q);
   if(t.status===dto.status)return {id,status:t.status};
   if(t.status!=='open')throw new ConflictException('Task is already closed');
   if(dto.status==='completed'&&(asset.purchase_date===null||asset.purchase_amount===null||!asset.seller_name?.trim()))throw new ConflictException('Complete purchase date, unit price and seller before closing the task');
   await q(`UPDATE asset_completion_tasks SET status=$3,completed_at=now() WHERE organization_id=$1 AND id=$2`,[actor.organizationId,id,dto.status]);
   await q(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES($1,$2,'completion.closed','completion_task',$3,$4)`,[actor.organizationId,actor.userId,id,JSON.stringify(dto)]);return {id,status:dto.status};
  });
 }
 reuse(actor:ActorContext,dto:ReuseQueryDto){return this.db.query(`${VISIBLE} SELECT a.id,a.name,a.asset_tag AS "assetTag",a.category,a.condition,a.manufacturer,a.model,l.name AS "locationName",a.location_id AS "locationId" FROM assets a JOIN locations l ON l.organization_id=a.organization_id AND l.id=a.location_id WHERE a.organization_id=$1 AND a.location_id IN(SELECT id FROM visible) AND a.status='unused' AND a.condition='good' AND a.ownership_type='INCUSPAZE_OWNED' AND lower(a.category)=lower($3) AND ($4='' OR a.name ILIKE '%'||$4||'%' OR a.model ILIKE '%'||$4||'%') AND NOT EXISTS(SELECT 1 FROM transfer_requests t WHERE t.organization_id=a.organization_id AND t.asset_id=a.id AND t.status IN('draft','requested','approved','in_transit')) AND NOT EXISTS(SELECT 1 FROM transfer_batch_items bi JOIN transfer_batches b ON b.organization_id=bi.organization_id AND b.id=bi.batch_id WHERE bi.organization_id=a.organization_id AND bi.asset_id=a.id AND b.status IN('requested','approved','in_transit')) ORDER BY a.created_at,a.id LIMIT 100`,[actor.organizationId,actor.userId,dto.category.trim(),dto.q?.trim()??'']);}
}
