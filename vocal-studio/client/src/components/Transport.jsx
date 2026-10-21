import React from "react";

export default function Transport({ state, onPlay, onStop, onRecord, onRewind, onBpm, onCountIn, onMetro, onCalibrate, onConnect, connected }) {
  const { playhead, playing, recording, bpm, countIn, metro } = state;
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
        <button onClick={onRecord} className={`w-9 h-8 grid place-items-center rounded border border-line bg-panel2 text-rec hover:bg-[#16202e] ${recording ? "bg-rec text-white animate-pulse" : ""}`}>●</button>
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
      <div className="flex-1" />
      <button onClick={onConnect} className={`text-xs px-3 py-1 rounded border ${connected ? "border-accent text-accent" : "border-line"}`}>
        {connected ? "● Connected" : "Connect Input"}
      </button>
    </div>
  );
}
