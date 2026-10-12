export interface ImportedRoom { key:string;label:string;x:number;y:number;width:number;height:number }
export function normalizeRectangle(rect:{x:number;y:number;width:number;height:number},box:number[]):Omit<ImportedRoom,'key'|'label'> {
 const [left,top,width,height]=box;
 if(box.length!==4||![...box,...Object.values(rect)].every(Number.isFinite)||width<=0||height<=0||rect.width<=0||rect.height<=0)throw new Error('The drawing contains invalid dimensions.');
 const result={x:(rect.x-left)/width*100,y:(rect.y-top)/height*100,width:rect.width/width*100,height:rect.height/height*100};
 if(result.x<0||result.y<0||result.x+result.width>100.00001||result.y+result.height>100.00001||result.width<1||result.height<1)throw new Error('Rooms must fit inside the drawing and occupy at least 1% in each dimension.');
 return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,Math.round(v*100000)/100000])) as typeof result;
}
/** Extract numeric geometry only. No uploaded markup is ever inserted into the page or sent to the API. */
export function importRoomSvg(source:string):ImportedRoom[]{
 if(new TextEncoder().encode(source).length>256000)throw new Error('Choose an SVG smaller than 256 KB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('SVG declarations and entities are not supported.');
 const doc=new DOMParser().parseFromString(source,'image/svg+xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw new Error('Choose a valid SVG drawing.');
 const root=doc.documentElement;
 const elements=Array.from(root.querySelectorAll('*'));
 if(elements.length>1000)throw new Error('Simplify the drawing before importing.');
 for(const element of [root,...elements]){
  if((element.localName==='svg'&&element!==root)||!['svg','g','rect','title','desc'].includes(element.localName))throw new Error('Export a room-only SVG containing rectangles. Paths, images, scripts and embedded objects are not supported.');
  if(element.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('Unexpected SVG namespace.');
  for(const attribute of Array.from(element.attributes)){
   if(/^on/i.test(attribute.name)||['href','xlink:href','style','transform','filter','clip-path','mask'].includes(attribute.name)||/url\s*\(/i.test(attribute.value))throw new Error('Remove external references, scripts, styles and transforms before importing.');
  }
 }
 const number=(value:string|null,fallback?:number)=>{if(value===null&&fallback!==undefined)return fallback;if(value===null||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))throw new Error('Use plain numeric SVG dimensions without units.');return Number(value);};
 const box=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(v=>number(v))??[0,0,number(root.getAttribute('width')),number(root.getAttribute('height'))];
 const rects=elements.filter(e=>e.localName==='rect');
 if(!rects.length||rects.length>200)throw new Error('Include between 1 and 200 room rectangles.');
 return rects.map((rect,i)=>({key:`room-${i}`,label:(rect.getAttribute('aria-label')||rect.getAttribute('id')||`Room ${i+1}`).slice(0,120),...normalizeRectangle({x:number(rect.getAttribute('x'),0),y:number(rect.getAttribute('y'),0),width:number(rect.getAttribute('width')),height:number(rect.getAttribute('height'))},box)}));
}
