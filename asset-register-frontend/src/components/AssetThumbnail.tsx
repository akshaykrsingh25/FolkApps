import {useEffect,useState} from 'react';
import {listDemoEvidence,readDemoEvidence} from '../demo/evidence';
import {LOCAL_MODE} from '../appMode';
import {Icon} from '../ui/Icon';
export function AssetThumbnail({assetId}:{assetId:string}){const [url,setUrl]=useState('');useEffect(()=>{if(!LOCAL_MODE)return;let alive=true,objectUrl='';void listDemoEvidence(assetId).then(async files=>{const image=files.find(f=>f.kind==='asset_photo'&&f.contentType.startsWith('image/'));if(!image)return;const blob=await readDemoEvidence(assetId,image.id);if(!alive)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(()=>{});return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[assetId]);return url?<img className="asset-thumbnail" src={url} alt="" loading="lazy"/>:<Icon name="asset"/>;}
