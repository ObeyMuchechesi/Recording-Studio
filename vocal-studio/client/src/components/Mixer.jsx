import React, { useEffect, useState } from "react";

function TrackStrip({ track, selected, armed, onSelect, onArm, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.name || "");

  useEffect(() => setDraft(track.name || ""), [track.name]);

  const saveName = (event) => {
    event.preventDefault();
    const name = draft.trim();
    if (name) onChange({ ...track, name });
    setEditing(false);
  };

  return (
    <div onClick={onSelect}
      className={`h-full max-h-full w-32 shrink-0 overflow-hidden rounded border p-1.5 cursor-pointer flex flex-col items-center gap-0.5
                  ${selected ? "border-accent bg-[#10211a]" : "border-line bg-panel2"}`}>
      {editing ? (
        <form className="flex w-full items-center gap-1" onSubmit={saveName} onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
            aria-label="Singer or vocal part name" className="min-w-0 w-full text-[10px]" />
          <button type="submit" className="text-accent text-xs" title="Save name">✓</button>
        </form>
      ) : (
        <div className="flex w-full min-w-0 items-center justify-center gap-1">
          <div className="truncate text-[11px] font-semibold text-center" title={track.name}>{track.name}</div>
          <button onClick={(e) => { e.stopPropagation(); setDraft(track.name || ""); setEditing(true); }}
            className="shrink-0 text-[10px] text-dim hover:text-accent" title="Rename vocal track" aria-label={`Rename ${track.name}`}>
            ✎
          </button>
        </div>
      )}

      <button onClick={(e) => { e.stopPropagation(); onArm(); }} aria-pressed={armed}
        className={`w-full rounded border px-1 py-0.5 text-[9px] font-semibold tracking-widest ${armed ? "border-rec bg-[#34151b] text-rec" : "border-line text-dim hover:border-rec hover:text-rec"}`}>
        {armed ? "● REC ARMED" : "○ ARM TO RECORD"}
      </button>

      <div className="flex gap-1 text-[9px]">
        <button onClick={(e) => { e.stopPropagation(); onChange({ ...track, solo: !track.solo }); }}
          aria-pressed={!!track.solo} className={`rounded border px-1 ${track.solo ? "bg-accent text-black border-accent" : "border-line text-dim"}`}>S</button>
        <button onClick={(e) => { e.stopPropagation(); onChange({ ...track, mute: !track.mute }); }}
          aria-pressed={!!track.mute} className={`rounded border px-1 ${track.mute ? "bg-warn text-black border-warn" : "border-line text-dim"}`}>M</button>
      </div>

      <input type="range" min={0} max={1.5} step={0.01} value={track.gain ?? 1}
        aria-label={`${track.name} volume`} onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ ...track, gain: parseFloat(e.target.value) })}
        className="h-10 w-4" style={{ writingMode: "vertical-lr", direction: "rtl" }} />
      <div className="text-[9px] text-dim font-mono">{((track.gain ?? 1) * 100).toFixed(0)}% · {(track.takes || []).length} takes</div>
      <input type="range" min={-1} max={1} step={0.01} value={track.pan ?? 0}
        aria-label={`${track.name} pan`} onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ ...track, pan: parseFloat(e.target.value) })} className="w-full" />
      <div className="text-[9px] text-dim">PAN</div>
    </div>
  );
}

export default function Mixer({ tracks, selectedId, armedId, onSelect, onArm, onTrackChange, onAddTrack }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [vocalName, setVocalName] = useState("");
  const armedTrack = tracks.find((track) => track.id === armedId);

  const addVocal = (event) => {
    event.preventDefault();
    const name = vocalName.trim();
    if (!name) return;
    onAddTrack(name);
    setVocalName("");
    setShowAddDialog(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line bg-panel">
      <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-3">
        <div className="text-[9px] font-semibold tracking-[0.2em] text-dim">VOCAL TRACKS</div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="truncate text-[10px] text-dim">Recording target: <span className="text-rec">{armedTrack?.name || "No track armed"}</span></div>
          <button onClick={() => setShowAddDialog(true)}
            className="shrink-0 rounded border border-accent/50 px-2 py-0.5 text-[10px] font-semibold text-accent hover:bg-[#14342a]">
            + Add Vocal
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden px-3 pb-2">
        {tracks.map((track) => (
          <TrackStrip key={track.id} track={track} selected={track.id === selectedId} armed={track.id === armedId}
            onSelect={() => onSelect(track.id)} onArm={() => onArm(track.id)}
            onChange={(next) => onTrackChange(next)} />
        ))}
      </div>

      {showAddDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false); }}>
          <form onSubmit={addVocal} className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl">
            <div className="mb-1 text-sm font-semibold text-ink">Add a vocalist</div>
            <p className="mb-4 text-xs leading-relaxed text-dim">Create a separate track for one singer or vocal part. Arm it when that person is ready to record.</p>
            <label className="mb-4 block text-xs text-dim">
              Singer or part name
              <input autoFocus value={vocalName} onChange={(e) => setVocalName(e.target.value)}
                placeholder={`e.g. ${tracks.length + 1} · Alto`} className="mt-1 w-full" required maxLength={48} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddDialog(false)} className="rounded border border-line px-3 py-1.5 text-xs text-dim">Cancel</button>
              <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black">Add vocal track</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
