import { ErpSnapshotService } from './erp-snapshot.service';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
import { AdvancedService,depreciation } from './advanced.service';
import { OperationsService } from './operations.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { NotificationOutboxWorkerService } from '../notifications/notification-outbox-worker.service';
import type { ActorContext } from '../auth/authenticated-request';
import type { DatabaseService } from '../database.service';
describe('operational completion and reuse',()=>{
 let advanced:AdvancedService,erp:ErpSnapshotService;
 let db:PGlite,service:OperationsService,worker:NotificationOutboxWorkerService,actor:ActorContext,location:string,asset:string,other:string;
 beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 const dir=new URL('../../database/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(f=>/^\d.*sql$/.test(f)).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
 const org=(await db.query<{id:string}>("INSERT INTO organizations(name,slug) VALUES('Ops','ops-test') RETURNING id")).rows[0].id;
 const user=(await db.query<{id:string}>("INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES($1,'ops','Ops','ops@example.test') RETURNING id",[org])).rows[0].id;
 other=(await db.query<{id:string}>("INSERT INTO users(organization_id,identity_subject,display_name,email) VALUES($1,'other','Other','other@example.test') RETURNING id",[org])).rows[0].id;
 await db.query("INSERT INTO role_assignments(organization_id,user_id,role_key) VALUES($1,$2,'head_office')",[org,user]);
 location=(await db.query<{id:string}>("INSERT INTO locations(organization_id,kind,name) VALUES($1,'centre','Centre') RETURNING id",[org])).rows[0].id;
 asset=(await db.query<{id:string}>("INSERT INTO assets(organization_id,location_id,asset_tag,name,category,status,condition,created_by) VALUES($1,$2,'OPS-1','Chair','Furniture','unused','good',$3) RETURNING id",[org,location,user])).rows[0].id;
 actor={organizationId:org,userId:user,subject:'ops',memberships:[{role:'head_office',scopeLocationId:null}]};
 const adapter={query:async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows,transaction:async(fn:any)=>db.transaction(async tx=>fn(async(sql:string,args:unknown[]=[]) => (await tx.query(sql,args)).rows))} as unknown as DatabaseService;
 erp=new ErpSnapshotService(adapter);service=new OperationsService(adapter,new AuthorizationService(adapter));worker=new NotificationOutboxWorkerService(adapter);advanced=new AdvancedService(adapter,new AuthorizationService(adapter),service);
 },30000);
 afterAll(async()=>db.close());
 it('only recommends scoped owned unused stock and excludes transfers',async()=>{
 expect(await service.reuse(actor,{category:'Furniture'})).toHaveLength(1);
 expect(await service.reuse({...actor,userId:other},{category:'Furniture'})).toHaveLength(0);
 await db.query("UPDATE assets SET ownership_type='VENDOR_LEASED' WHERE id=$1",[asset]);expect(await service.reuse(actor,{category:'Furniture'})).toHaveLength(0);
 await db.query("UPDATE assets SET ownership_type='INCUSPAZE_OWNED' WHERE id=$1",[asset]);
 });
 it('validates assignee, rejects duplicate tasks, gates completion and deduplicates reminders',async()=>{
 const dto={assetId:asset,assignedTo:actor.userId,dueAt:new Date(Date.now()+86400000).toISOString()};
 await expect(service.assign(actor,{...dto,assignedTo:other})).rejects.toThrow();
 const task=await service.assign(actor,dto);await expect(service.assign(actor,dto)).rejects.toThrow('already has');
 await expect(service.update(actor,task.id,{status:'completed'})).rejects.toThrow('Complete purchase');
 await db.query("UPDATE asset_completion_tasks SET due_at=now()-interval '1 day' WHERE id=$1",[task.id]);
 await worker.runCompletionReminders();await worker.runCompletionReminders();expect((await db.query('SELECT * FROM notification_inbox')).rows).toHaveLength(1);
 await db.query("UPDATE assets SET purchase_date='2026-01-01',purchase_amount=0,seller_name='Vendor' WHERE id=$1",[asset]);
 await service.update(actor,task.id,{status:'completed'});await service.update(actor,task.id,{status:'completed'});
 expect((await service.tasks(actor))[0].status).toBe('completed');
 });
 it('creates scoped SLA tickets, deduplicates overdue notices and requires resolution before credit',async()=>{
 const dto={id:crypto.randomUUID(),assetId:asset,vendor:'Test Vendor',contractReference:'24x7 test clause',description:'Display down',ackHours:1,resolutionHours:2,creditPerHour:10,creditCap:50};
 await expect(advanced.createTicket({...actor,userId:other},dto)).rejects.toThrow();
 await advanced.createTicket(actor,dto);await expect(advanced.ticketAction(actor,dto.id,{amount:10,reason:'Credit review'})).rejects.toThrow();
 await db.query("UPDATE service_tickets SET created_at=now()-interval '5 hours' WHERE id=$1",[dto.id]);
 await worker.runServiceReminders();await worker.runServiceReminders();expect((await db.query("SELECT * FROM notification_inbox WHERE kind='service_overdue'")).rows).toHaveLength(1);
 const tickets=await advanced.tickets(actor);expect(tickets[0].resolutionOverdue).toBe(true);expect(Number(tickets[0].proposedCredit)).toBeGreaterThanOrEqual(30);
 await advanced.ticketAction(actor,dto.id,{status:'acknowledged'});await advanced.ticketAction(actor,dto.id,{status:'resolved'});
 await expect(advanced.ticketAction(actor,dto.id,{amount:51,reason:'Credit review'})).rejects.toThrow();await advanced.ticketAction(actor,dto.id,{amount:30,reason:'Confirmed contractual credit'});
 await expect(advanced.ticketAction(actor,dto.id,{amount:30,reason:'Duplicate review'})).rejects.toThrow();
 });
 it('validates floor areas and returns safe geometry with accessible counts',async()=>{
 const floor=(await db.query<{id:string}>("INSERT INTO locations(organization_id,parent_id,kind,name) VALUES($1,$2,'floor','Floor 1') RETURNING id",[actor.organizationId,location])).rows[0].id;
 const area=(await db.query<{id:string}>("INSERT INTO locations(organization_id,parent_id,kind,name) VALUES($1,$2,'area','Room A') RETURNING id",[actor.organizationId,floor])).rows[0].id;
 const dto={id:crypto.randomUUID(),floorId:floor,name:'Approved layout v1',rooms:[{locationId:area,x:5,y:5,width:30,height:30}]};
 await expect(advanced.savePlan(actor,{...dto,rooms:[{...dto.rooms[0],x:90}]})).rejects.toThrow();
 await advanced.savePlan(actor,dto);const result=await advanced.plan(actor,{floorId:floor});expect(result.plan?.name).toBe('Approved layout v1');expect(result.areas).toHaveLength(1);
 await expect(advanced.plan({...actor,userId:other},{floorId:floor})).rejects.toThrow();
 });
 it('seals depreciation values and requires independent approval and ERP reference',async()=>{
 await db.query("UPDATE assets SET purchase_date='2025-01-01',purchase_amount=1200,seller_name='Test' WHERE id=$1",[asset]);
 const dto={id:crypto.randomUUID(),periodEnd:'2026-01-01',policyReference:'Test policy',assetIds:[asset],usefulLifeMonths:24,residualPercent:0};
 const result=await advanced.createFinance(actor,dto);expect(result.lines[0].accumulatedDepreciation).toBe(600);
 await expect(advanced.financeAction(actor,dto.id,{status:'approved'})).rejects.toThrow('Another');
 await db.query("INSERT INTO role_assignments(organization_id,user_id,role_key) VALUES($1,$2,'head_office')",[actor.organizationId,other]);
 await advanced.financeAction({...actor,userId:other},dto.id,{status:'approved'});
 await advanced.financeAction(actor,dto.id,{status:'exported'});await expect(advanced.financeAction(actor,dto.id,{status:'reconciled'})).rejects.toThrow();
 await advanced.financeAction(actor,dto.id,{status:'reconciled',externalReference:'TEST-JOURNAL-1'});
 expect((await advanced.financeBatches(actor))[0].status).toBe('reconciled');
 });
 it('bounds depreciation and rejects invalid costs or periods',()=>{
 expect(depreciation(1200,'2025-01-01','2030-01-01',24,10).netBookValue).toBe(120);
 expect(depreciation(0,'2025-01-01','2025-01-01',24,0).netBookValue).toBe(0);
 expect(()=>depreciation(100,'2026-01-01','2025-01-01',12,0)).toThrow();
 expect(()=>depreciation(Infinity,'2025-01-01','2026-01-01',12,0)).toThrow();
 });

 it('queues once, retries failed delivery and records only matched receipts',async()=>{
 vi.stubEnv('ERP_SNAPSHOT_ENDPOINT','https://erp.example.test/snapshots');vi.stubEnv('ERP_SNAPSHOT_TOKEN','synthetic');vi.stubEnv('ERP_SYNC_ORGANIZATION_ID',actor.organizationId);
 try{
 const batch=(await advanced.financeBatches(actor))[0];const first=await erp.enqueue(actor,batch.id);const replay=await erp.enqueue(actor,batch.id);expect(replay.id).toBe(first.id);
 vi.stubGlobal('fetch',async()=>new Response('',{status:503}));expect(await erp.runOne()).toBe(true);
 expect((await erp.status(actor)).jobs[0].status).toBe('queued');
 await db.query("UPDATE erp_snapshot_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[first.id]);
 vi.stubGlobal('fetch',async(_url:unknown,options:RequestInit)=>{const message=JSON.parse(String(options.body));return new Response(JSON.stringify({deliveryId:message.deliveryId,payloadHash:message.payloadHash,externalReference:'RECEIVED-1'}));});
 await erp.runOne();expect((await erp.status(actor)).jobs[0].status).toBe('delivered');expect(await erp.runOne()).toBe(false);
 expect((await db.query("SELECT * FROM audit_events WHERE event_type='erp.snapshot_delivered'")).rows).toHaveLength(1);
 }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });

});
