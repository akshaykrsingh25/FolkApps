import {createHash} from 'node:crypto';
import {ConflictException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {DatabaseService,type SqlQuery} from '../database.service';
import type {ActorContext} from '../auth/authenticated-request';
export function canonicalJson(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson((value as Record<string,unknown>)[key])).join(',')+'}';
}
export interface ErpConfiguration { endpoint:string;token:string;organizationId:string }
export function erpConfiguration(env:NodeJS.ProcessEnv=process.env):ErpConfiguration|null{
 if(!env.ERP_SNAPSHOT_ENDPOINT&&!env.ERP_SNAPSHOT_TOKEN&&!env.ERP_SYNC_ORGANIZATION_ID)return null;
 const endpoint=new URL(env.ERP_SNAPSHOT_ENDPOINT||'');
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.search||!env.ERP_SNAPSHOT_TOKEN?.trim()||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.ERP_SYNC_ORGANIZATION_ID||''))throw new Error('ERP snapshot configuration is invalid');
 return {endpoint:endpoint.toString(),token:env.ERP_SNAPSHOT_TOKEN,organizationId:env.ERP_SYNC_ORGANIZATION_ID!};
}
export async function deliverSnapshot(config:ErpConfiguration,job:{id:string;payload:unknown;payloadHash:string},send:typeof fetch=fetch):Promise<string>{
 const response=await send(config.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json','idempotency-key':job.id},body:JSON.stringify({schema:'incuasset.depreciation-snapshot.v1',deliveryId:job.id,payloadHash:job.payloadHash,payload:job.payload})});
 if(!response.ok)throw new Error(`ERP HTTP ${response.status}`);
 if(!response.body)throw new Error('ERP response missing');
 const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)throw new Error('ERP response too large');parts.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
 if(result.deliveryId!==job.id||result.payloadHash!==job.payloadHash||typeof result.externalReference!=='string'||!result.externalReference.trim()||result.externalReference.length>200)throw new Error('ERP acknowledgement does not match this delivery');
 return result.externalReference.trim();
}
@Injectable()
export class ErpSnapshotService {
 constructor(private db:DatabaseService){}
 private async authorize(a:ActorContext,q:SqlQuery=this.db.query.bind(this.db)){
  const rows=await q(`SELECT 1 FROM role_assignments WHERE organization_id=$1 AND user_id=$2 AND role_key='head_office' AND scope_location_id IS NULL`,[a.organizationId,a.userId]);if(!rows.length)throw new ForbiddenException('Head office access is required');
 }
 async status(a:ActorContext){await this.authorize(a);let ready=false;try{ready=erpConfiguration()?.organizationId===a.organizationId;}catch{/* Do not expose operator configuration. */}return {configured:ready,jobs:await this.db.query(`SELECT id,batch_id AS "batchId",status,attempts,external_reference AS "externalReference",last_error AS "lastError",created_at AS "createdAt" FROM erp_snapshot_jobs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[a.organizationId])};}
 async enqueue(a:ActorContext,id:string){
  await this.authorize(a);let config:ErpConfiguration|null=null;try{config=erpConfiguration();}catch{}if(config?.organizationId!==a.organizationId)throw new ServiceUnavailableException('An approved ERP snapshot receiver is not configured for this organization');
  return this.db.transaction(async q=>{
   await this.authorize(a,q);const rows=await q(`SELECT * FROM depreciation_batches WHERE organization_id=$1 AND id=$2 FOR UPDATE`,[a.organizationId,id]);const batch=rows[0];if(!batch)throw new NotFoundException('Batch not found');if(!['approved','exported','reconciled'].includes(batch.status))throw new ConflictException('Approve the snapshot before syncing');
   const payload={organizationId:a.organizationId,batchId:id,periodEnd:new Date(batch.period_end).toISOString().slice(0,10),policyReference:batch.policy_reference,measurement:'cumulative_snapshot_not_posting_instruction',currency:'INR',lines:batch.lines};
   const hash=createHash('sha256').update(canonicalJson(payload)).digest('hex');
   const added=await q(`INSERT INTO erp_snapshot_jobs(organization_id,batch_id,payload,payload_hash) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,batch_id) DO NOTHING RETURNING id`,[a.organizationId,id,JSON.stringify(payload),hash]);
   if(added.length)await q(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES($1,$2,'erp.snapshot_queued','depreciation_batch',$3,$4)`,[a.organizationId,a.userId,id,JSON.stringify({payloadHash:hash})]);
   return (await q(`SELECT id,status FROM erp_snapshot_jobs WHERE organization_id=$1 AND batch_id=$2`,[a.organizationId,id]))[0];
  });
 }
 async retry(a:ActorContext,id:string){await this.authorize(a);return this.db.transaction(async q=>{const rows=await q(`UPDATE erp_snapshot_jobs SET status='queued',attempts=0,next_attempt_at=now(),last_error=NULL WHERE organization_id=$1 AND id=$2 AND status='failed' RETURNING batch_id`,[a.organizationId,id]);if(!rows[0])throw new ConflictException('Only a failed delivery can be retried');await q(`INSERT INTO audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,details) VALUES($1,$2,'erp.snapshot_retried','depreciation_batch',$3,$4)`,[a.organizationId,a.userId,rows[0].batch_id,JSON.stringify({deliveryId:id})]);return {id,status:'queued'};});}
 async runOne():Promise<boolean>{
  const config=erpConfiguration();if(!config)return false;
  const job=await this.db.transaction(async q=>{await q(`UPDATE erp_snapshot_jobs SET status='failed',lease_until=NULL,last_error='Delivery lease expired after final attempt; review receiver before retrying.' WHERE organization_id=$1 AND status='sending' AND attempts>=8 AND lease_until<now()`,[config.organizationId]);const rows=await q(`SELECT id FROM erp_snapshot_jobs WHERE organization_id=$1 AND attempts<8 AND ((status='queued' AND next_attempt_at<=now()) OR(status='sending' AND lease_until<now())) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1`,[config.organizationId]);if(!rows[0])return null;return (await q(`UPDATE erp_snapshot_jobs SET status='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds' WHERE id=$1 RETURNING id,organization_id AS "organizationId",batch_id AS "batchId",payload,payload_hash AS "payloadHash",attempts`,[rows[0].id]))[0];});
  if(!job)return false;
  try{
   const ref=await deliverSnapshot(config,job as {id:string;payload:unknown;payloadHash:string});
   await this.db.transaction(async q=>{const updated=await q(`UPDATE erp_snapshot_jobs SET status='delivered',external_reference=$2,delivered_at=now(),lease_until=NULL,last_error=NULL WHERE id=$1 AND status='sending' AND attempts=$3 RETURNING id`,[job.id,ref,job.attempts]);if(updated.length)await q(`INSERT INTO audit_events(organization_id,event_type,entity_type,entity_id,details) VALUES($1,'erp.snapshot_delivered','depreciation_batch',$2,$3)`,[job.organizationId,job.batchId,JSON.stringify({deliveryId:job.id,externalReference:ref,payloadHash:job.payloadHash})]);});
  }catch{
   await this.db.query(`UPDATE erp_snapshot_jobs SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'queued' END,next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,attempts)::int)),lease_until=NULL,last_error='Receiver unavailable or acknowledgement invalid; check connector logs without exposing credentials.' WHERE id=$1 AND status='sending' AND attempts=$2`,[job.id,job.attempts]);
  }
  return true;
 }
}
