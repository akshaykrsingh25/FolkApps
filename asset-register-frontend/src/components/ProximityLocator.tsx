import { useEffect, useRef, useState } from 'react';
import { ProximityFeedback, ProximityProcessor, type SignalState } from '../capture/proximity';
interface ReaderPort { open(options:{baudRate:number}):Promise<void>; close():Promise<void>; readable:ReadableStream<Uint8Array>|null }
interface SerialApi { requestPort():Promise<ReaderPort> }
export function ProximityLocator({epc,onClose}:{epc:string;onClose:()=>void}) {
  const [signal,setSignal]=useState<SignalState|null>(null);
  const [mode,setMode]=useState<'stopped'|'reader'|'demo'>('stopped');
  const [error,setError]=useState('');
  const [connecting,setConnecting]=useState(false);
  const connectionPending=useRef(false);
  const [sound,setSound]=useState(false),[haptics,setHaptics]=useState(false);
  const [demoRssi,setDemoRssi]=useState(-80);
  const processor=useRef(new ProximityProcessor(epc));
  const settings=useRef({sound,haptics});settings.current={sound,haptics};
  const context=useRef<AudioContext|null>(null);
  const reader=useRef<ReadableStreamDefaultReader<Uint8Array>|null>(null);
  const port=useRef<ReaderPort|null>(null);
  const generation=useRef(0);
  const demoLevel=useRef(demoRssi);demoLevel.current=demoRssi;
  const stop=()=>{generation.current++;void reader.current?.cancel().catch(()=>{});processor.current.reset();setSignal(null);setMode('stopped');navigator.vibrate?.(0);};
  useEffect(()=>{
    const loop=new ProximityFeedback(()=>document.hidden?null:processor.current.read(),()=>{
      if(settings.current.haptics)navigator.vibrate?.(15);
      const audio=context.current;
      if(settings.current.sound && audio?.state==='running'){
        const oscillator=audio.createOscillator(),gain=audio.createGain();
        oscillator.frequency.value=900;gain.gain.setValueAtTime(.025,audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.025);
        oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.03);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      }
    });loop.start();
    const ui=setInterval(()=>setSignal(processor.current.read()),150);
    const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);
    return()=>{generation.current++;loop.stop();clearInterval(ui);document.removeEventListener('visibilitychange',hide);void reader.current?.cancel().catch(()=>{});void context.current?.close();navigator.vibrate?.(0);};
  },[]);
  useEffect(()=>{if(mode!=='demo')return;const timer=setInterval(()=>processor.current.accept(epc,demoLevel.current),300);return()=>clearInterval(timer);},[mode,epc]);
  async function connect(){
    if(port.current||connectionPending.current){setError('Wait for the previous reader to disconnect.');return;}
    const serial=(navigator as Navigator & {serial?:SerialApi}).serial;
    if(!serial){setError('This browser does not support a serial reader. Use a supported desktop browser or the demonstration. BLE requires a device-specific adapter.');return;}
    stop();setError('');connectionPending.current=true;setConnecting(true);const session=++generation.current;
    let selected:ReaderPort|null=null,stream:ReadableStreamDefaultReader<Uint8Array>|null=null;
    try{
      selected=await serial.requestPort();await selected.open({baudRate:115200});
      if(session!==generation.current)return;
      port.current=selected;if(!selected.readable)throw new Error('Reader did not provide a data stream.');
      stream=selected.readable.getReader();reader.current=stream;setMode('reader');
      const decoder=new TextDecoder();let buffer='';
      while(session===generation.current){
        const chunk=await stream.read();if(chunk.done)break;
        buffer+=decoder.decode(chunk.value,{stream:true});
        if(buffer.length>16384)throw new Error('Reader message is too large. Check its output format.');
        const lines=buffer.split('\n');buffer=lines.pop()||'';
        for(const line of lines){try{const sample=JSON.parse(line);if(typeof sample.epc==='string'&&typeof sample.rssi==='number')processor.current.accept(sample.epc,sample.rssi);}catch{/* Ignore incomplete or unsupported reader messages. */}}
      }
    }catch(reason){if(session===generation.current)setError(reason instanceof Error?reason.message:'Reader disconnected.');}
    finally{connectionPending.current=false;setConnecting(false);stream?.releaseLock();reader.current=null;if(selected)await selected.close().catch(()=>{});port.current=null;if(session===generation.current){processor.current.reset();setMode('stopped');setSignal(null);}}
  }
  return <section className="panel proximity-panel" aria-label="Find asset by signal">
    <div className="panel-heading"><div><p className="eyebrow">ASSET LOCATOR</p><h2>Follow the signal.</h2></div><button className="quiet-button" onClick={()=>{stop();onClose();}}>Close</button></div>
    <p>Target EPC: <strong>{epc}</strong></p><p>Signal strength helps you search. It does not measure distance or verify that the asset is present.</p>
    <div className="proximity-dial" role="status"><strong>{signal?`${Math.round(signal.strength*100)}%`:'—'}</strong><span>{mode==='demo'?'DEMONSTRATION · ':''}{signal?'Relative signal strength':mode==='stopped'?'Search stopped':'No recent target signal'}</span></div>
    <progress max="1" value={signal?.strength??0} aria-label="Relative signal strength"/>
    <p>{signal?`${Math.round(signal.rssi)} dBm · move slowly and compare readings`:'No signal means unknown location, not a missing asset.'}</p>
    <div className="form-actions"><button className="primary-button" disabled={mode==='reader'||connecting} onClick={()=>void connect()}>{connecting?'Connecting…':'Connect compatible reader'}</button><button className="quiet-button" onClick={()=>{stop();setError('');setMode('demo');}}>Try demonstration</button><button className="quiet-button" onClick={stop}>Stop</button></div>
    {mode==='demo'&&<label>Simulated signal<input type="range" min="-95" max="-35" value={demoRssi} onChange={e=>setDemoRssi(Number(e.target.value))}/></label>}
    <div className="form-actions"><button className="quiet-button" aria-pressed={sound} onClick={async()=>{if(!sound){try{context.current ||= new AudioContext();await context.current.resume();}catch{setError('Audio is unavailable in this browser.');return;}}setSound(!sound);}}>Sound {sound?'on':'off'}</button><button className="quiet-button" disabled={typeof navigator.vibrate!=='function'} aria-pressed={haptics} onClick={()=>{setHaptics(!haptics);if(haptics)navigator.vibrate?.(0);}}>Vibration {typeof navigator.vibrate==='function'?(haptics?'on':'off'):'unavailable'}</button><button className="quiet-button" onClick={()=>{processor.current.reset();setSignal(null);}}>Reset smoothing</button></div>
    {error&&<p role="alert" className="inline-message error-message">{error}</p>}
    <details><summary>Reader compatibility</summary><p>A supported reader adapter must send one JSON line per reading, with an exact EPC and numeric RSSI in dBm, over serial at 115200 baud. Ordinary barcode scanners and QR labels cannot provide proximity. No BLE or UHF reader has been certified for this installation yet.</p></details>
  </section>;
}
