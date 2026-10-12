import type {Location} from '../domain/types';
export interface RoomRect {locationId:string;x:number;y:number;width:number;height:number}
const key='incuasset-device-floorplans-v1';
export function readDevicePlan(floorId:string):{name:string;rooms:RoomRect[]}|null {try{return JSON.parse(localStorage.getItem(key)||'{}')[floorId]??null;}catch{return null;}}
export function saveDevicePlan(floorId:string,name:string,rooms:RoomRect[],locations:Location[]){
 if(!name.trim()||!rooms.length||rooms.length>200||new Set(rooms.map(r=>r.locationId)).size!==rooms.length)throw new Error('Name the layout and map each room to a different area.');
 for(const r of rooms)if(!locations.some(l=>l.id===r.locationId&&l.parentId===floorId&&l.kind==='area')||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>100||r.y+r.height>100)throw new Error('Room geometry must fit the floor and reference an existing area.');
 const all=JSON.parse(localStorage.getItem(key)||'{}');all[floorId]={name:name.trim(),rooms,updatedAt:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(all));window.dispatchEvent(new Event('incuasset-plan-updated'));
}
