import {afterEach,describe,it,expect,vi} from 'vitest';
const values=new Map<string,string>();
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();values.clear();});
describe('device edition persistence',()=>{
 it('starts without synthetic assets and preserves records across reloads',async()=>{
 vi.stubEnv('VITE_APP_MODE','device');vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});vi.resetModules();
 const {demoStore}=await import('./store');expect(await demoStore.assets()).toHaveLength(0);const location=(await demoStore.locations()).find(l=>l.kind==='centre')!;
 const payload={clientRequestId:crypto.randomUUID(),name:'QA chair',category:'Furniture',locationId:location.id,assetTag:'QA-TAG-1'};
 const first=await demoStore.createAsset(payload);const replay=await demoStore.createAsset(payload);expect(replay.id).toBe(first.id);
 vi.resetModules();const reloaded=await import('./store');expect(await reloaded.demoStore.assets()).toHaveLength(1);
 await expect(reloaded.demoStore.createAsset({...payload,clientRequestId:crypto.randomUUID()})).rejects.toThrow('already registered');
 });
});
