import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { Icon } from '../ui/Icon';

export function CodeScanner({ onCode, onClose }: { onCode: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const [active, setActive] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => controls.current?.stop(), []);

  async function start() {
    setError('');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      controls.current = await reader.decodeFromVideoDevice(undefined, video.current || undefined, (result, _error, scannerControls) => {
        if (!result) return;
        controls.current = scannerControls;
        scannerControls.stop();
        setActive(false);
        onCode(result.getText().trim());
      });
      setActive(true);
    } catch {
      setError('Camera could not start. Check camera access, or type the code below.');
    }
  }

  return <section className="view-panel scanner-view">
    <button className="back-action" onClick={onClose}>← Back to register</button>
    <p className="eyebrow">FIND AN ASSET</p>
    <h1>Scan its mark.</h1>
    <p className="view-lead">Read an Incuspaze QR label or a standard barcode. You can also enter the asset tag.</p>
    <div className="panel scanner-panel">
      <div className="scanner-frame"><video ref={video} muted playsInline autoPlay aria-label="Camera preview for asset code scanning" />{!active && <div className="scanner-placeholder"><Icon name="asset" /><span>Camera preview</span></div>}</div>
      {error && <p className="capture-error" role="alert">{error}</p>}
      {!active && <button className="primary-button" onClick={() => void start()}>Start camera scan</button>}
      {active && <button className="quiet-button scanner-stop" onClick={() => { controls.current?.stop(); setActive(false); }}>Stop camera</button>}
      <form className="manual-code" onSubmit={(event) => { event.preventDefault(); if (manualCode.trim()) onCode(manualCode.trim()); }}>
        <label>QR identity or asset tag<input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="e.g. IT-00482" autoComplete="off" /></label>
        <button className="primary-button" disabled={!manualCode.trim()}>Find asset</button>
      </form>
      <p className="scanner-privacy">The camera is used only while this screen is open. The code is sent to your authorized register for lookup.</p>
    </div>
  </section>;
}
