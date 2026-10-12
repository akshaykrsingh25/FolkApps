import {describe,it,expect,vi} from 'vitest';
import {canonicalJson,deliverSnapshot,erpConfiguration} from './erp-snapshot.service';
const config={endpoint:'https://erp.example.test/snapshots',token:'synthetic-test-token',organizationId:'00000000-0000-4000-8000-000000000001'};
const job={id:'delivery-test',payload:{batchId:'batch-test'},payloadHash:'a'.repeat(64)};
describe('ERP snapshot transport contract',()=>{
 it('requires explicit HTTPS configuration without URL credentials',()=>{
  expect(erpConfiguration({})).toBeNull();
  for(const endpoint of ['http://example.test','https://user:pass@example.test','https://example.test/?token=secret'])expect(()=>erpConfiguration({ERP_SNAPSHOT_ENDPOINT:endpoint,ERP_SNAPSHOT_TOKEN:'test',ERP_SYNC_ORGANIZATION_ID:config.organizationId})).toThrow();
 });
 it('hashes objects independently of database key ordering',()=>{expect(canonicalJson({b:1,a:[{d:3,c:2}]})).toBe(canonicalJson({a:[{c:2,d:3}],b:1}));});
 it('sends a stable idempotency key and accepts only matching acknowledgement',async()=>{
  const send=vi.fn(async()=>new Response(JSON.stringify({deliveryId:job.id,payloadHash:job.payloadHash,externalReference:'ERP-1'}),{status:200}));
  expect(await deliverSnapshot(config,job,send)).toBe('ERP-1');expect(send.mock.calls[0]?.length).toBe(2);
  const options=(send.mock.calls as unknown as [string,RequestInit][])[0][1];expect(options.redirect).toBe('error');expect((options.headers as Record<string,string>)['idempotency-key']).toBe(job.id);
  await expect(deliverSnapshot(config,job,async()=>new Response(JSON.stringify({deliveryId:'wrong',payloadHash:job.payloadHash,externalReference:'ERP-2'})))).rejects.toThrow('does not match');
 });
 it('rejects oversized and failed responses',async()=>{
  await expect(deliverSnapshot(config,job,async()=>new Response('x'.repeat(9000)))).rejects.toThrow('too large');
  await expect(deliverSnapshot(config,job,async()=>new Response('',{status:503}))).rejects.toThrow('503');
 });
});
