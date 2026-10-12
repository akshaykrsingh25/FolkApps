import {useEffect,useMemo,useRef,useState} from 'react';
import type {Location} from '../domain/types';
import {locationPath} from '../capture/quickAdd';

export function SmartLocationField({locations,initialId,value,onSelect,onChange,label='Where is this asset?',hint,required=true,name='locationId'}:{locations:Location[];initialId?:string;value?:string;onSelect?:(id:string)=>void;onChange?:(id:string)=>void;label?:string;hint?:string;required?:boolean;name?:string}){
  const choices=useMemo(()=>locations.filter(place=>place.kind!=='state').map(place=>({place,label:`${locationPath(locations,place.id)}${place.code?` (${place.code})`:''}`})),[locations]);
  const effectiveId=value??initialId;
  const initial=choices.find(item=>item.place.id===effectiveId);
  const [selectedId,setSelectedId]=useState(initial?.place.id||'');
  const [query,setQuery]=useState(initial?.label||'');
  const [open,setOpen]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const matches=useMemo(()=>{
    const value=query.trim().toLowerCase();
    if(!value)return choices.slice(0,8);
    return choices.filter(item=>`${item.label} ${item.place.city||''} ${item.place.kind}`.toLowerCase().includes(value)).slice(0,12);
  },[choices,query]);
  useEffect(()=>{const id=value??initialId;if(!id)return;const chosen=choices.find(item=>item.place.id===id);if(!chosen)return;setSelectedId(id);setQuery(chosen.label);},[choices,initialId,value]);
  const choose=(id:string,choiceLabel:string)=>{setSelectedId(id);setQuery(choiceLabel);setOpen(false);input.current?.setCustomValidity('');onSelect?.(id);onChange?.(id);};
  return <label className="smart-location-field">{label}
    <span className="smart-location-search">
      <input ref={input} required={required} autoComplete="off" inputMode="search" value={query} placeholder="Search centre, city, building, floor or area" onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setSelectedId('');onChange?.('');setOpen(true);if(required)event.currentTarget.setCustomValidity('Choose one location from the suggestions.');}} onBlur={()=>setTimeout(()=>setOpen(false),120)}/>
      {selectedId&&<button type="button" aria-label="Clear selected location" onMouseDown={event=>event.preventDefault()} onClick={()=>{setSelectedId('');setQuery('');onChange?.('');setOpen(true);input.current?.focus();}}>×</button>}
    </span>
    <input type="hidden" name={name} value={selectedId}/>
    {open&&<span className="smart-location-results" role="listbox" aria-label="Matching locations">
      {matches.map(item=><button type="button" role="option" aria-selected={item.place.id===selectedId} key={item.place.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item.place.id,item.label)}><strong>{item.place.name}</strong><small>{item.place.kind} · {locationPath(locations,item.place.id)}</small></button>)}
      {!matches.length&&<small className="smart-location-empty">No matching location. Try the centre code, city, floor, or area.</small>}
    </span>}
    <small>{selectedId?'Location selected.':hint||'Type a few letters, then choose the correct result.'}</small>
  </label>;
}
