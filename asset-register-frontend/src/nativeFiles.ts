declare global {interface Window {IncuAssetNative?:{saveFile(name:string,mime:string,base64:string):void;printLabel():void;closeApp():void}}}
export async function saveDownload(blob:Blob,name:string){
 if(window.IncuAssetNative){const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=reject;reader.readAsDataURL(blob);});window.IncuAssetNative.saveFile(name,blob.type,value);return;}
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function printLabel(){if(window.IncuAssetNative)window.IncuAssetNative.printLabel();else window.print();}
