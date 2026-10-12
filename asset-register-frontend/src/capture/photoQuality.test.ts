import {describe,it,expect} from 'vitest';
import {assessPhoto} from './photoQuality';
describe('photo capture guidance',()=>{
 it('flags dark, overexposed and featureless images',()=>{for(const value of [0,255,100]){const pixels=new Uint8ClampedArray(64*64*4).fill(value);expect(assessPhoto(pixels,64,64).usable).toBe(false);}});
 it('accepts adequately exposed detail',()=>{const pixels=new Uint8ClampedArray(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=(x+y)%2?70:180;pixels[i+3]=255;}expect(assessPhoto(pixels,64,64).usable).toBe(true);});
 it('rejects incomplete pixel buffers',()=>{expect(assessPhoto(new Uint8ClampedArray(4),64,64).usable).toBe(false);});
});
