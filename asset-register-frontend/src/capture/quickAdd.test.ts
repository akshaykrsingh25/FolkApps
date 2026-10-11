import { describe, expect, it } from 'vitest';
import { similarAssetSeed, missingAssetDetails, locationPath } from './quickAdd';
import type { Asset, Location } from '../domain/types';
const asset = { id:'one', name:'Chair', category:'Furniture', locationId:'floor', manufacturer:'Example', model:'A1', purchaseAmount:'0', purchaseDate:'2026-10-11', sellerName:'Supplier', ownershipType:'INCUSPAZE_OWNED', condition:'damaged', serialNumber:'UNIQUE-1', assetTag:'TAG-1', rfidEpc:'ABCDEF123456', qrPublicId:'private-id' } as Asset;
describe('quick registration',()=>{
  it('reuses purchase information without copying unique identifiers or an old condition',()=>{
    const seed=similarAssetSeed(asset);
    expect(seed).toMatchObject({name:'Chair',category:'Furniture',locationId:'floor',purchaseAmount:'0',condition:'good'});
    for(const key of ['id','serialNumber','assetTag','rfidEpc','qrPublicId']) expect(seed).not.toHaveProperty(key);
  });
  it('does not classify a recorded zero price as missing',()=>{
    expect(missingAssetDetails(asset)).toEqual([]);
    expect(missingAssetDetails({...asset,purchaseDate:null,purchaseAmount:null,sellerName:null})).toEqual(['Purchase date','Unit price','Seller']);
  });
  it('disambiguates repeated floor names with full hierarchy and handles cycles',()=>{
    const places=[{id:'centre',name:'Centre A',parentId:null},{id:'floor',name:'Floor 1',parentId:'centre'}] as Location[];
    expect(locationPath(places,'floor')).toBe('Centre A › Floor 1');
    places[0].parentId='floor';
    expect(locationPath(places,'floor')).toBe('Centre A › Floor 1');
  });
});

it('resumes a partially completed quantity batch without resaving acknowledged items',async()=>{
  const {registerCopies}=await import('./quickAdd');
  const batch={payload:'same draft',ids:['first','second','third'],records:[] as Asset[]};
  const calls:string[]=[];
  let fail=true;
  const save=async(id:string)=>{calls.push(id);if(id==='second'&&fail)throw new Error('offline');return {...asset,id};};
  await expect(registerCopies(batch,save,()=>{})).rejects.toThrow('offline');
  expect(batch.records.map(item=>item.id)).toEqual(['first']);
  fail=false;
  expect((await registerCopies(batch,save,()=>{})).map(item=>item.id)).toEqual(['first','second','third']);
  expect(calls).toEqual(['first','second','second','third']);
});
