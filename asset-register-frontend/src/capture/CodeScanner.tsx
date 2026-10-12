import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { Icon } from '../ui/Icon';

export function CodeScanner({ onCode, onClose }: { onCode: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation=useRef(0);
  const [starting,setStarting]=useState(false);
  const [active, setActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');

  useEffect(()=>{const hide=(event?:Event)=>{if(document.hidden||event?.type==='incuasset-background'){generation.current++;controls.current?.stop();setActive(false);}};document.addEventListener('visibilitychange',hide);window.addEventListener('incuasset-background',hide);return()=>{generation.current++;controls.current?.stop();document.removeEventListener('visibilitychange',hide);window.removeEventListener('incuasset-background',hide);};},[]);

  async function start() {
    if(starting||active)return;setStarting(true);setError('');const id=++generation.current;
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const next = await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false}, video.current || undefined, (result, _error, scannerControls) => {
        if(id!==generation.current){scannerControls.stop();return;}
        if (!result) return;
        controls.current = scannerControls;
        scannerControls.stop();
        setActive(false);
        onCode(result.getText().trim());
      });
      if(id!==generation.current){next.stop();return;}controls.current=next;setActive(true);
    } catch {
      setError('Camera could not start. Check camera access, or type the code below.');
    } finally {setStarting(false);}
  }

  return <section className="view-panel scanner-view">
    <button className="back-action" onClick={onClose}>← Back to register</button>
    <p className="eyebrow">FIND AN ASSET</p>
    <h1>Scan its mark.</h1>
    <p className="view-lead">Read an Incuspaze QR label or a standard barcode. You can also enter the asset tag.</p>
    <div className="panel scanner-panel">
      <div className="scanner-frame"><video ref={video} muted playsInline autoPlay aria-label="Camera preview for asset code scanning" />{!active && <div className="scanner-placeholder"><Icon name="asset" /><span>Camera preview</span></div>}</div>
      {error && <p className="capture-error" role="alert">{error}</p>}
      {!active && <button className="primary-button" disabled={starting} onClick={() => void start()}>{starting?'Starting…':'Start camera scan'}</button>}
      {active && <button className="quiet-button scanner-stop" onClick={() => { generation.current++;controls.current?.stop(); setActive(false); }}>Stop camera</button>}
      <form className="manual-code" onSubmit={(event) => { event.preventDefault(); if (manualCode.trim()) onCode(manualCode.trim()); }}>
        <label>QR identity or asset tag<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="e.g. IT-00482" autoComplete="off" /></label>
        <button className="primary-button" disabled={!manualCode.trim()}>Find asset</button>
      </form>
      <p className="scanner-privacy">The camera is used only while this screen is open. The code is sent to your authorized register for lookup.</p>
    </div>
  </section>;
}
