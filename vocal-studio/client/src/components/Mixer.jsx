import React, { useEffect, useMemo, useRef, useState } from "react";

function formatTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const wholeSeconds = Math.floor(safe % 60).toString().padStart(2, "0");
  const millis = Math.floor((safe % 1) * 1000).toString().padStart(3, "0");
  return `${minutes}:${wholeSeconds}.${millis}`;
}

function TakeRangeWaveform({ take, duration, sourceIn, sourceOut, onRangeChange }) {
  const waveformRef = useRef(null);
  const dragStartRef = useRef(null);
  const peaks = take.peaks;
  const bars = useMemo(() => {
    if (!peaks?.length) return [];
    const peakCount = peaks.length / 2;
    const count = Math.min(240, peakCount);
    return Array.from({ length: count }, (_, index) => {
      const first = Math.floor(index * peakCount / count);
      const last = Math.max(first + 1, Math.floor((index + 1) * peakCount / count));
      let min = 1, max = -1;
      for (let bin = first; bin < last; bin++) {
        min = Math.min(min, peaks[bin * 2]);
        max = Math.max(max, peaks[bin * 2 + 1]);
      }
      return { x: (index + 0.5) * 1000 / count, min, max };
    });
  }, [peaks]);

  const positionAt = (event) => {
    const rect = waveformRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration;
  };
  const updateRange = (event) => {
    if (dragStartRef.current === null) return;
    const endAt = positionAt(event);
    if (Math.abs(endAt - dragStartRef.current) < 0.008) return;
    onRangeChange(Math.min(dragStartRef.current, endAt), Math.max(dragStartRef.current, endAt));
  };

  const left = duration > 0 ? Math.max(0, Math.min(100, (Number(sourceIn) / duration) * 100)) : 0;
  const right = duration > 0 ? Math.max(left, Math.min(100, (Number(sourceOut) / duration) * 100)) : 0;
  return (
    <div ref={waveformRef} role="group" aria-label={`Waveform range selector for ${take.name || "take"}`}
      onPointerDown={(event) => { waveformRef.current.setPointerCapture(event.pointerId); dragStartRef.current = positionAt(event); }}
      onPointerMove={updateRange}
      onPointerUp={(event) => { updateRange(event); dragStartRef.current = null; }}
      onPointerCancel={() => { dragStartRef.current = null; }}
      className="relative mt-2 h-12 touch-none cursor-crosshair overflow-hidden rounded border border-line bg-[#0a0e14]">
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 1000 64" preserveAspectRatio="none">
        <g stroke="#65bda0" strokeWidth="2">
          {bars.map((bar, index) => <line key={index} x1={bar.x} x2={bar.x} y1={32 - bar.max * 27} y2={32 - bar.min * 27} />)}
        </g>
      </svg>
      <div aria-hidden="true" className="absolute inset-y-0 border-x border-accent bg-accent/20"
        style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%`, pointerEvents: "none" }} />
      <span className="absolute bottom-0.5 left-1 text-[8px] text-dim">0:00</span>
      <span className="absolute bottom-0.5 right-1 text-[8px] text-dim">{formatTime(duration)}</span>
    </div>
  );
}

function TakeRow({ track, take, index, regions, recording, onDelete, onAddCompRegion }) {
  const duration = Math.max(0, Number(take.duration) || (take.data?.length || 0) / (take.sampleRate || 1));
  const [sourceIn, setSourceIn] = useState("0.000");
  const [sourceOut, setSourceOut] = useState(duration.toFixed(3));
  const [timelineOverride, setTimelineOverride] = useState(null);
  const timelineStart = timelineOverride === null
    ? (Number(take.offset) || 0) + (Number(sourceIn) || 0)
    : timelineOverride;

  useEffect(() => {
    setSourceIn("0.000");
    setSourceOut(duration.toFixed(3));
    setTimelineOverride(null);
  }, [take.id, duration]);

  const label = take.name || `Take ${index + 1}`;
  const inComp = regions.some((region) => String(region.takeId) === String(take.id));

  return (
    <div className="rounded border border-line bg-panel2 px-3 py-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-ink">{label}{inComp && <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider text-accent">In comp</span>}</div>
          <div className="font-mono text-[10px] text-dim">Original position {formatTime(take.offset)} · {formatTime(duration)}</div>
        </div>
        <button type="button" disabled={recording}
          onClick={() => { if (window.confirm(`Delete “${label}” and its comp regions from ${track.name}? You can undo this before leaving the project.`)) onDelete(track.id, take.id); }}
          title={recording ? "Stop recording before deleting a take" : `Delete ${label}`}
          className="shrink-0 rounded border border-rec/50 px-2 py-1 text-[10px] font-semibold text-rec hover:bg-[#34151b] disabled:cursor-not-allowed disabled:opacity-40">
          Delete take
        </button>
      </div>
      <TakeRangeWaveform take={take} duration={duration} sourceIn={sourceIn} sourceOut={sourceOut}
        onRangeChange={(start, end) => { setSourceIn(start.toFixed(3)); setSourceOut(end.toFixed(3)); }} />
      <div className="mt-1 text-[9px] text-dim">Drag across the waveform to select a phrase.</div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[9px] text-dim">Phrase in (s)
          <input type="number" min="0" max={duration} step="0.001" value={sourceIn}
            onChange={(e) => setSourceIn(e.target.value)} disabled={recording} className="mt-0.5 block w-24 text-xs" />
        </label>
        <label className="text-[9px] text-dim">Phrase out (s)
          <input type="number" min="0" max={duration} step="0.001" value={sourceOut}
            onChange={(e) => setSourceOut(e.target.value)} disabled={recording} className="mt-0.5 block w-24 text-xs" />
        </label>
        <label className="text-[9px] text-dim">Comp start (s)
          <input type="number" min="0" step="0.001" value={timelineStart}
            onChange={(e) => setTimelineOverride(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={recording} className="mt-0.5 block w-24 text-xs" />
        </label>
        <button type="button" disabled={recording || !(duration > 0)}
          onClick={() => onAddCompRegion(track.id, take.id, Number(sourceIn), Number(sourceOut), Number(timelineStart))}
          title="Add this source phrase to the comp; overlapping comp audio will be split non-destructively"
          className="rounded bg-accent px-2 py-1.5 text-[10px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">
          Add phrase to comp
        </button>
      </div>
    </div>
  );
}

function TakeManager({ track, recording, onClose, onDelete, onAddCompRegion, onDeleteRegion }) {
  if (!track) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="take-manager-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 id="take-manager-title" className="truncate text-sm font-semibold text-ink">Take comp · {track.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close takes" className="rounded border border-line px-2 py-1 text-xs text-dim">Close</button>
        </div>
        <p className="mb-3 text-xs text-dim">Takes are original recordings. Add a phrase to build the comp; overlapping comp regions are split without changing the source audio. Edits autosave and can be undone.</p>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <section>
            <h3 className="mb-2 text-[10px] font-semibold tracking-widest text-dim">SOURCE TAKES · {track.takes.length}</h3>
            {track.takes.length ? (
              <div className="space-y-2">
                {track.takes.map((take, index) => (
                  <TakeRow key={take.id} track={track} take={take} index={index} regions={track.regions || []}
                    recording={recording} onDelete={onDelete} onAddCompRegion={onAddCompRegion} />
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-line px-3 py-6 text-center text-xs text-dim">No recordings on this track yet.</div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold tracking-widest text-dim">COMP LANE · {track.regions?.length || 0} REGIONS</h3>
            {track.regions?.length ? (
              <div className="space-y-1.5">
                {track.regions.map((region, index) => {
                  const source = track.takes.find((take) => String(take.id) === String(region.takeId));
                  const regionEnd = region.timelineStart + region.sourceEnd - region.sourceStart;
                  return (
                    <div key={region.id} className="flex items-center gap-3 rounded border border-accent/30 bg-[#10211a] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-ink">{source?.name || "Missing source"} · Phrase {index + 1}</div>
                        <div className="font-mono text-[10px] text-dim">Source {formatTime(region.sourceStart)}–{formatTime(region.sourceEnd)} · Timeline {formatTime(region.timelineStart)}–{formatTime(regionEnd)}</div>
                      </div>
                      <button type="button" disabled={recording}
                        onClick={() => { if (window.confirm("Remove this phrase from the comp? The original take will remain.")) onDeleteRegion(track.id, region.id); }}
                        className="shrink-0 rounded border border-line px-2 py-1 text-[10px] text-dim hover:border-rec hover:text-rec disabled:opacity-40">
                        Remove phrase
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded border border-dashed border-line px-3 py-4 text-center text-xs text-dim">The comp lane is empty. Add a phrase from any source take above.</div>
            )}
          </section>
        </div>
        {recording && <p className="mt-3 text-[10px] text-warn">Stop recording before removing a take.</p>}
      </section>
    </div>
  );
}

function TrackStrip({ track, selected, armed, onSelect, onArm, onChange, onManageTakes }) {
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
      <div className="text-[9px] text-dim font-mono">{((track.gain ?? 1) * 100).toFixed(0)}%</div>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); onManageTakes(track.id); }}
        className="w-full truncate rounded border border-accent/40 px-1 py-0.5 text-[9px] font-semibold text-accent hover:bg-[#14342a]">
        Manage takes · {track.takes?.length || 0}
      </button>
      <input type="range" min={-1} max={1} step={0.01} value={track.pan ?? 0}
        aria-label={`${track.name} pan`} onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ ...track, pan: parseFloat(e.target.value) })} className="w-full" />
      <div className="text-[9px] text-dim">PAN</div>
    </div>
  );
}

export default function Mixer({ tracks, selectedId, armedId, onSelect, onArm, onTrackChange, onAddTrack, onDeleteTake, recording }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [vocalName, setVocalName] = useState("");
  const [managingTrackId, setManagingTrackId] = useState(null);
  const armedTrack = tracks.find((track) => track.id === armedId);
  const selectedTrack = tracks.find((track) => track.id === selectedId) || tracks[0];
  const managingTrack = tracks.find((track) => track.id === managingTrackId);

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
          <button type="button" disabled={!selectedTrack} onClick={() => selectedTrack && setManagingTrackId(selectedTrack.id)}
            title={`Manage takes for ${selectedTrack?.name || "selected vocal"}`}
            className="shrink-0 rounded border border-accent px-2 py-0.5 text-[10px] font-semibold text-accent hover:bg-[#14342a] disabled:opacity-40">
            Manage Takes · {selectedTrack?.takes?.length || 0}
          </button>
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
            onChange={(next) => onTrackChange(next)} onManageTakes={setManagingTrackId} />
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

      <TakeManager track={managingTrack} recording={recording} onClose={() => setManagingTrackId(null)}
        onDelete={onDeleteTake} onAddCompRegion={onAddCompRegion} onDeleteRegion={onDeleteRegion} />
    </div>
  );
}
