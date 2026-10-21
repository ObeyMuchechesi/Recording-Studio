import React, { useEffect, useRef, useState } from "react";

function InputMeter({ analyser }) {
  const [db, setDb] = useState(-60);
  const raf = useRef(0);

  useEffect(() => {
    if (!analyser) { setDb(-60); return; }
    const samples = new Float32Array(analyser.fftSize);
    let lastScan = 0;
    const tick = () => {
      const now = performance.now();
      if (now - lastScan >= 80) {
        lastScan = now;
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        setDb(peak > 0 ? 20 * Math.log10(peak) : -60);
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, [analyser]);

  const width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const meterColor = db >= -3 ? "bg-rec" : db >= -12 ? "bg-warn" : "bg-accent";
  return (
    <div className="flex min-w-28 items-center gap-2" aria-label={`Input peak ${db.toFixed(1)} dBFS`}>
      <span className="text-[10px] font-semibold tracking-widest text-dim">INPUT</span>
      <div className="h-2 w-20 overflow-hidden rounded bg-panel2">
        <div className={`h-full transition-[width] duration-75 ${meterColor}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 text-right font-mono text-[10px] text-dim">{db.toFixed(1)} dB</span>
    </div>
  );
}

export default function Transport({ state, onPlay, onStop, onRecord, onRewind, onBpm, onCountIn, onMetro, onCalibrate, onConnect, onMonitor, connected, monitoring, analyser, inputDevices, inputDeviceId, onInputDeviceChange }) {
  const { playhead, playing, recording, bpm, countIn, metro, recordTarget } = state;
  const t = playhead || 0;
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  const ms = String(Math.floor((t - Math.floor(t)) * 1000)).padStart(3, "0");

  return (
    <div className="flex shrink-0 items-center gap-3 px-4 py-2 bg-panel border-b border-line flex-wrap">
      <div className="font-mono text-accent text-xl min-w-[140px]">{mm}:{ss}.{ms}</div>
      <div className="flex gap-1">
        <button onClick={onRewind} className="w-9 h-8 grid place-items-center rounded border border-line bg-panel2 hover:bg-[#16202e]">⏮</button>
        <button onClick={playing ? onStop : onPlay} className="w-9 h-8 grid place-items-center rounded border border-line bg-panel2 hover:bg-[#16202e]">{playing ? "❚❚" : "▶"}</button>
        <button onClick={onStop} className="w-9 h-8 grid place-items-center rounded border border-line bg-panel2 hover:bg-[#16202e]">■</button>
        <button onClick={onRecord} aria-label={recording ? "Stop recording" : `Record to ${recordTarget || "armed vocal"}`}
          title={recording ? "Stop recording" : `Record to ${recordTarget || "arm a vocal track first"}`}
          className={`w-9 h-8 grid place-items-center rounded border border-line bg-panel2 text-rec hover:bg-[#16202e] ${recording ? "bg-rec text-white animate-pulse" : ""}`}>●</button>
      </div>
      <div className="hidden min-w-24 text-[10px] md:block">
        <div className="tracking-widest text-dim">REC TRACK</div>
        <div className="max-w-36 truncate font-semibold text-ink">{recording ? "● " : ""}{recordTarget || "Arm a vocal"}</div>
      </div>
      <button onClick={onMetro} className={`px-2 py-1 rounded border border-line text-xs ${metro ? "bg-[#14342a] border-[#2f8f6b] text-accent" : ""}`}>
        Metronome
      </button>
      <label className="flex items-center gap-1 text-xs text-dim">BPM
        <input type="number" value={bpm} min={30} max={300} onChange={(e) => onBpm(parseInt(e.target.value) || 100)} className="w-16" />
      </label>
      <label className="flex items-center gap-1 text-xs text-dim">Count-in
        <select value={countIn} onChange={(e) => onCountIn(parseInt(e.target.value))}>
          <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
        </select>
      </label>
      <button onClick={onCalibrate} className="text-xs px-2 py-1 rounded border border-line">Calibrate</button>
      <div className="hidden md:block"><InputMeter analyser={analyser} /></div>
      <div className="flex-1" />
      <button onClick={onMonitor} disabled={!connected} title="Use headphones to prevent feedback"
        className={`text-xs px-2 py-1 rounded border disabled:opacity-40 ${monitoring ? "border-warn text-warn" : "border-line"}`}>
        {monitoring ? "Monitor on · headphones" : "Monitor (headphones)"}
      </button>
      <label className="flex items-center gap-1 text-[10px] text-dim">
        Input
        <select value={inputDeviceId} onChange={(e) => onInputDeviceChange(e.target.value)} className="max-w-40 text-xs">
          <option value="">Default microphone</option>
          {(inputDevices || []).map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button onClick={onConnect} className={`text-xs px-3 py-1 rounded border ${connected ? "border-accent text-accent" : "border-line"}`}>
        {connected ? "Reconnect Input" : "Connect Input"}
      </button>
    </div>
  );
}
