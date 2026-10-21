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

const TABS = ["gate", "eq", "deEsser", "comp", "sat", "reverb", "tune", "automation", "delay"];

export default function FXPanel({ track, onChange, playhead = 0, sampleRate = 48000, onPitchChange, onAutomationAdd, onAutomationChange, onAutomationDelete, onLatencyChange }) {
  const [tab, setTab] = useState("comp");
  const [automationLane, setAutomationLane] = useState("volume");
  if (!track) return null;
  const fx = track.fx || {};
  const pitch = track.pitch || { enabled: false, key: "C", scale: "major", amount: 0.85, speedMs: 70 };
  const points = track.automation?.[automationLane] || [];
  const update = (k, v) => onChange({ ...fx, [k]: { ...(fx[k] || {}), ...v } });
  const updatePitch = (v) => onPitchChange?.({ ...pitch, ...v });
  const timeLabel = `${String(Math.floor(playhead / 60)).padStart(2, "0")}:${String(Math.floor(playhead % 60)).padStart(2, "0")}`;

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

      {tab === "tune" && (
        <div className="flex flex-col gap-2">
          <Toggle label="Pitch correction" value={pitch.enabled} onChange={(v) => updatePitch({ enabled: v })} />
          <label className="flex items-center justify-between gap-2 text-xs text-dim">Key
            <select value={pitch.key || "C"} onChange={(e) => updatePitch({ key: e.target.value })}>
              {["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map((note) => <option key={note} value={note}>{note}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-dim">Scale
            <select value={pitch.scale || "major"} onChange={(e) => updatePitch({ scale: e.target.value })}>
              <option value="major">Major</option><option value="minor">Minor</option><option value="chromatic">Chromatic</option>
            </select>
          </label>
          <Slider label="Correction amount" value={(pitch.amount ?? 0.85) * 100} min={0} max={100} step={1} unit="%" onChange={(v) => updatePitch({ amount: v / 100 })} />
          <Slider label="Retune speed" value={pitch.speedMs ?? 70} min={5} max={200} step={1} unit=" ms" onChange={(v) => updatePitch({ speedMs: v })} />
          <p className="text-[10px] leading-relaxed text-dim">Scale-aware, non-destructive tuning for the selected vocalist. It is applied during playback and mixdown; correction analyzes the take before playback.</p>
        </div>
      )}

      {tab === "automation" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2 text-xs text-dim">Lane
            <select value={automationLane} onChange={(e) => setAutomationLane(e.target.value)}>
              <option value="volume">Volume</option><option value="pan">Pan</option><option value="send">Reverb send</option>
            </select>
          </label>
          <button onClick={() => onAutomationAdd?.(automationLane)} className="rounded border border-accent/50 px-2 py-1 text-xs text-accent hover:bg-[#14342a]">
            Add point at {timeLabel}
          </button>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {points.length ? points.map((point, index) => {
              const bounds = automationLane === "volume" ? [0, 2, 0.01] : automationLane === "pan" ? [-1, 1, 0.01] : [0, 1, 0.01];
              return <div key={`${point.time}-${index}`} className="grid grid-cols-[1fr_1.1fr_auto] items-center gap-1 rounded border border-line p-1">
                <label className="text-[9px] text-dim">Time
                  <input type="number" min="0" step="0.01" value={Number(point.time).toFixed(2)}
                    onChange={(e) => onAutomationChange?.(automationLane, index, { time: Math.max(0, Number(e.target.value) || 0) })} className="mt-0.5 w-full text-[10px]" />
                </label>
                <label className="text-[9px] text-dim">Value
                  <input type="number" min={bounds[0]} max={bounds[1]} step={bounds[2]} value={Number(point.value).toFixed(2)}
                    onChange={(e) => onAutomationChange?.(automationLane, index, { value: Math.max(bounds[0], Math.min(bounds[1], Number(e.target.value) || 0)) })} className="mt-0.5 w-full text-[10px]" />
                </label>
                <button type="button" aria-label={`Delete ${automationLane} automation point`} onClick={() => onAutomationDelete?.(automationLane, index)}
                  className="mt-3 rounded border border-line px-1 text-[10px] text-rec">×</button>
              </div>;
            }) : <div className="py-2 text-[10px] text-dim">No points on this lane yet.</div>}
          </div>
          <p className="text-[10px] leading-relaxed text-dim">Linear automation runs in playback and exported mixdowns. Times are measured in session seconds.</p>
        </div>
      )}

      {tab === "delay" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-dim">Reported insert latency
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="96000" step="1" value={track.pluginLatencySamples || 0}
                onChange={(e) => onLatencyChange?.(Math.max(0, Math.min(96000, Math.round(Number(e.target.value) || 0))))}
                className="w-full" />
              <span className="shrink-0 font-mono text-[10px]">samples</span>
            </div>
          </label>
          <div className="text-[10px] font-mono text-dim">≈ {((track.pluginLatencySamples || 0) / sampleRate * 1000).toFixed(2)} ms at {sampleRate} Hz</div>
          <p className="text-[10px] leading-relaxed text-dim">Playback and export delay the lower-latency tracks to match the slowest reported path. Built-in browser effects report zero; enter latency reported by any externally processed take.</p>
        </div>
      )}
    </div>
  );
}
