import React, { useState } from "react";

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-dim">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-ink font-mono">{typeof value === "number" ? value.toFixed(2) : value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const TABS = ["gate", "eq", "deEsser", "comp", "sat", "reverb"];

export default function FXPanel({ track, onChange }) {
  const [tab, setTab] = useState("comp");
  if (!track) return null;
  const fx = track.fx || {};
  const update = (k, v) => onChange({ ...fx, [k]: { ...(fx[k] || {}), ...v } });

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="text-[10px] tracking-widest text-dim uppercase">FX — {track.name}</div>
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs px-2 py-0.5 rounded border border-line ${tab === t ? "bg-accent text-black" : "bg-panel2"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "gate" && (
        <div className="flex flex-col gap-2">
          <Slider label="Threshold" value={fx.gate?.threshold ?? -50} min={-80} max={0} step={1} unit=" dB"
                  onChange={(v) => update("gate", { threshold: v })} />
          <Slider label="Attack"    value={fx.gate?.attack ?? 0.002}  min={0.0001} max={0.1} step={0.0001} unit=" s"
                  onChange={(v) => update("gate", { attack: v })} />
          <Slider label="Release"   value={fx.gate?.release ?? 0.15}  min={0.005} max={1} step={0.005} unit=" s"
                  onChange={(v) => update("gate", { release: v })} />
        </div>
      )}

      {tab === "eq" && (
        <div className="flex flex-col gap-2">
          <Slider label="HPF"        value={fx.eq?.hpf ?? 80}      min={20} max={300} step={1} unit=" Hz" onChange={(v) => update("eq", { hpf: v })} />
          <Slider label="Low shelf"  value={fx.eq?.low ?? 0}       min={-15} max={15} step={0.5} unit=" dB" onChange={(v) => update("eq", { low: v })} />
          <Slider label="Low-mid freq" value={fx.eq?.loMidFreq ?? 800}  min={100} max={2000} step={10} unit=" Hz" onChange={(v) => update("eq", { loMidFreq: v })} />
          <Slider label="Low-mid gain" value={fx.eq?.loMidGain ?? 0}    min={-15} max={15} step={0.5} unit=" dB" onChange={(v) => update("eq", { loMidGain: v })} />
          <Slider label="Hi-mid freq"  value={fx.eq?.hiMidFreq ?? 3000} min={1000} max={10000} step={50} unit=" Hz" onChange={(v) => update("eq", { hiMidFreq: v })} />
          <Slider label="Hi-mid gain"  value={fx.eq?.hiMidGain ?? 0}    min={-15} max={15} step={0.5} unit=" dB" onChange={(v) => update("eq", { hiMidGain: v })} />
          <Slider label="High shelf"   value={fx.eq?.high ?? 0}         min={-15} max={15} step={0.5} unit=" dB" onChange={(v) => update("eq", { high: v })} />
        </div>
      )}

      {tab === "deEsser" && (
        <div className="flex flex-col gap-2">
          <Toggle label="Enabled" value={fx.deEsser?.on} onChange={(v) => update("deEsser", { on: v })} />
          <Slider label="Frequency" value={fx.deEsser?.freq ?? 5500} min={3000} max={12000} step={100} unit=" Hz" onChange={(v) => update("deEsser", { freq: v })} />
          <Slider label="Amount"    value={fx.deEsser?.amount ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => update("deEsser", { amount: v })} />
        </div>
      )}

      {tab === "comp" && (
        <div className="flex flex-col gap-2">
          <Toggle label="Enabled" value={fx.comp?.on} onChange={(v) => update("comp", { on: v })} />
          <Slider label="Threshold" value={fx.comp?.threshold ?? -24} min={-60} max={0} step={1} unit=" dB" onChange={(v) => update("comp", { threshold: v })} />
          <Slider label="Ratio"     value={fx.comp?.ratio ?? 4}       min={1} max={20} step={0.1} unit=":1" onChange={(v) => update("comp", { ratio: v })} />
          <Slider label="Attack"    value={fx.comp?.attack ?? 0.005}  min={0.001} max={0.3} step={0.001} unit=" s" onChange={(v) => update("comp", { attack: v })} />
          <Slider label="Release"   value={fx.comp?.release ?? 0.15}  min={0.01} max={1} step={0.01} unit=" s" onChange={(v) => update("comp", { release: v })} />
          <Slider label="Knee"      value={fx.comp?.knee ?? 6}        min={0} max={40} step={1} unit=" dB" onChange={(v) => update("comp", { knee: v })} />
          <Slider label="Makeup"    value={fx.comp?.makeup ?? 0}      min={0} max={18} step={0.5} unit=" dB" onChange={(v) => update("comp", { makeup: v })} />
        </div>
      )}

      {tab === "sat" && (
        <div className="flex flex-col gap-2">
          <Toggle label="Enabled" value={fx.sat?.on} onChange={(v) => update("sat", { on: v })} />
          <Slider label="Drive" value={fx.sat?.drive ?? 0.4} min={0} max={1} step={0.01} onChange={(v) => update("sat", { drive: v })} />
          <Slider label="Mix"   value={fx.sat?.mix ?? 0.4}   min={0} max={1} step={0.01} onChange={(v) => update("sat", { mix: v })} />
        </div>
      )}

      {tab === "reverb" && (
        <div className="flex flex-col gap-2">
          <Toggle label="Enabled" value={fx.reverb?.on} onChange={(v) => update("reverb", { on: v })} />
          <Slider label="Mix"   value={fx.reverb?.mix ?? 0}   min={0} max={1} step={0.01} onChange={(v) => update("reverb", { mix: v })} />
          <Slider label="Decay" value={fx.reverb?.decay ?? 2.5} min={0.3} max={8} step={0.1} unit=" s" onChange={(v) => update("reverb", { decay: v })} />
          <Slider label="Size"  value={fx.reverb?.size ?? 1}  min={0.3} max={2} step={0.05} onChange={(v) => update("reverb", { size: v })} />
        </div>
      )}
    </div>
  );
}
