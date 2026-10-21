import React from "react";

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-dim">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-ink font-mono">{value.toFixed(2)}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export default function MasterPanel({ settings, lufs, onChange, onExport }) {
  const s = settings || {};
  const update = (k, v) => onChange({ ...s, [k]: { ...(s[k] || {}), ...v } });
  return (
    <div className="min-h-0 overflow-y-auto border-t border-line bg-panel p-3 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <div>
        <div className="text-[10px] tracking-widest text-dim uppercase mb-2">Master EQ</div>
        <Slider label="Low"  value={s.eq?.low ?? 0}  min={-10} max={10} step={0.5} unit=" dB" onChange={(v) => update("eq", { low: v })} />
        <Slider label="Mid"  value={s.eq?.mid ?? 0}  min={-10} max={10} step={0.5} unit=" dB" onChange={(v) => update("eq", { mid: v })} />
        <Slider label="High" value={s.eq?.high ?? 0} min={-10} max={10} step={0.5} unit=" dB" onChange={(v) => update("eq", { high: v })} />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-dim uppercase mb-2">Glue Comp</div>
        <Slider label="Threshold" value={s.comp?.threshold ?? -18} min={-40} max={0} step={0.5} unit=" dB" onChange={(v) => update("comp", { threshold: v })} />
        <Slider label="Ratio"     value={s.comp?.ratio ?? 2}       min={1} max={8} step={0.1} unit=":1" onChange={(v) => update("comp", { ratio: v })} />
        <Slider label="Makeup"    value={s.comp?.makeup ?? 0}      min={0} max={12} step={0.5} unit=" dB" onChange={(v) => update("comp", { makeup: v })} />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-dim uppercase mb-2">Limiter</div>
        <Slider label="Threshold" value={s.limiter?.threshold ?? -3} min={-20} max={0} step={0.5} unit=" dB" onChange={(v) => update("limiter", { threshold: v })} />
        <Slider label="Ceiling"   value={s.limiter?.ceiling ?? -1}   min={-6} max={0} step={0.5} unit=" dB" onChange={(v) => update("limiter", { ceiling: v })} />
        <Slider label="Release"   value={s.limiter?.release ?? 0.1}  min={0.01} max={1} step={0.01} unit=" s" onChange={(v) => update("limiter", { release: v })} />
        <Slider label="Output"    value={s.output ?? 1}              min={0} max={2} step={0.01} onChange={(v) => onChange({ ...s, output: v })} />
      </div>
      <div>
        <div className="text-[10px] tracking-widest text-dim uppercase mb-2">Meter (LUFS)</div>
        <div className="font-mono text-sm">
          <div>Momentary: <span className="text-accent">{isFinite(lufs.momentary) ? lufs.momentary.toFixed(1) : "—"} LUFS</span></div>
          <div>Short-term: <span className="text-accent">{isFinite(lufs.shortTerm) ? lufs.shortTerm.toFixed(1) : "—"} LUFS</span></div>
        </div>
        <button onClick={onExport} className="mt-3 bg-accent text-black font-semibold rounded px-3 py-1 text-sm">
          Export Mixdown (24-bit WAV)
        </button>
      </div>
    </div>
  );
}
