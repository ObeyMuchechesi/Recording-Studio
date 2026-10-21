import React, { useEffect, useRef } from "react";

function TrackStrip({ track, selected, onSelect, onChange }) {
  return (
    <div onClick={onSelect}
      className={`w-24 shrink-0 p-2 rounded border cursor-pointer flex flex-col items-center gap-1
                  ${selected ? "border-accent bg-[#10211a]" : "border-line bg-panel2"}`}>
      <div className="text-xs font-semibold truncate w-full text-center">{track.name}</div>
      <div className="flex gap-1 text-[10px]">
        <button onClick={(e) => { e.stopPropagation(); onChange({ ...track, solo: !track.solo }); }}
          className={`px-1 rounded border ${track.solo ? "bg-accent text-black border-accent" : "border-line text-dim"}`}>S</button>
        <button onClick={(e) => { e.stopPropagation(); onChange({ ...track, mute: !track.mute }); }}
          className={`px-1 rounded border ${track.mute ? "bg-warn text-black border-warn" : "border-line text-dim"}`}>M</button>
      </div>
      <input type="range" min={0} max={1.5} step={0.01} value={track.gain ?? 1}
        onChange={(e) => onChange({ ...track, gain: parseFloat(e.target.value) })}
        className="h-28" style={{ writingMode: "vertical-lr", direction: "rtl" }} />
      <div className="text-[10px] text-dim font-mono">{((track.gain ?? 1) * 100).toFixed(0)}</div>
      <input type="range" min={-1} max={1} step={0.01} value={track.pan ?? 0}
        onChange={(e) => onChange({ ...track, pan: parseFloat(e.target.value) })}
        className="w-full" />
      <div className="text-[10px] text-dim">PAN</div>
    </div>
  );
}

export default function Mixer({ tracks, selectedId, onSelect, onTrackChange, onAddTrack }) {
  return (
    <div className="flex gap-2 p-3 bg-panel border-t border-line overflow-x-auto">
      {tracks.map((t) => (
        <TrackStrip key={t.id} track={t} selected={t.id === selectedId}
          onSelect={() => onSelect(t.id)} onChange={(n) => onTrackChange(n)} />
      ))}
      <button onClick={onAddTrack}
        className="w-24 shrink-0 rounded border border-dashed border-line text-dim text-2xl hover:border-accent hover:text-accent">
        +
      </button>
    </div>
  );
}
