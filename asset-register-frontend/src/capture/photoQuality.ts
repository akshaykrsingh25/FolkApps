export interface PhotoQuality { usable:boolean; brightness:number; detail:number; message:string }
export function assessPhoto(data:Uint8ClampedArray,width:number,height:number):PhotoQuality{
 if(width<32||height<32||data.length<width*height*4)return {usable:false,brightness:0,detail:0,message:'The photo is too small. Move closer and retake it.'};
 let sum=0,squares=0,count=0;
 const light=(x:number,y:number)=>{const i=(y*width+x)*4;return data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;};
 for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const l=light(x,y);sum+=l;const edge=4*l-light(x-1,y)-light(x+1,y)-light(x,y-1)-light(x,y+1);squares+=edge*edge;count++;}
 const brightness=sum/count,detail=squares/count;
 const message=brightness<22?'Too dark. Add light and retake.':brightness>245?'Too bright. Reduce glare and retake.':detail<8?'Hold steady. Bring the asset into focus.':'Good light and detail. Check the whole asset is visible.';
 return {usable:brightness>=22&&brightness<=245&&detail>=8,brightness,detail,message};
}
