import {describe,it,expect} from 'vitest';
import {normalizeRectangle} from './svgImport';
describe('floorplan geometry normalization',()=>{
 it('normalizes offset and non-square drawings',()=>{expect(normalizeRectangle({x:110,y:220,width:200,height:100},[10,20,1000,500])).toEqual({x:10,y:40,width:20,height:20});});
 it('rejects malformed, tiny or out of bounds shapes',()=>{for(const r of [{x:0,y:0,width:0,height:10},{x:-1,y:0,width:10,height:10},{x:90,y:0,width:20,height:10},{x:0,y:0,width:NaN,height:10},{x:0,y:0,width:.1,height:10}])expect(()=>normalizeRectangle(r,[0,0,100,100])).toThrow();});
 it('rejects zero and incomplete viewboxes',()=>{expect(()=>normalizeRectangle({x:0,y:0,width:10,height:10},[0,0,0,100])).toThrow();expect(()=>normalizeRectangle({x:0,y:0,width:10,height:10},[0,0,100])).toThrow();});
});
