import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./components/Login.jsx";
import Transport from "./components/Transport.jsx";
import Timeline from "./components/Timeline.jsx";
import Mixer from "./components/Mixer.jsx";
import FXPanel from "./components/FXPanel.jsx";
import MasterPanel from "./components/MasterPanel.jsx";
import Tuner from "./components/Tuner.jsx";
import { api, getToken, setToken } from "./api.js";
import { StudioEngine } from "./audio/engine.js";
import { renderMixdown } from "./audio/render.js";
import { encodeWAV, download, blobToBase64, decodeWAVBase64 } from "./audio/wav.js";

let engineRef = null;

const DEFAULT_FX = {
  gate:    { threshold: -50, attack: 0.002, release: 0.15 },
  eq:      { hpf: 80, low: 0, loMidFreq: 800, loMidGain: 0, hiMidFreq: 3000, hiMidGain: 0, high: 0 },
  deEsser: { on: false, freq: 5500, amount: 0.5 },
  comp:    { on: true, threshold: -22, ratio: 3, attack: 0.005, release: 0.15, knee: 6, makeup: 2 },
  sat:     { on: false, drive: 0.3, mix: 0.3 },
  reverb:  { on: false, mix: 0.15, decay: 2.5, size: 1 },
};

const DEFAULT_MASTER = {
  eq: { low: 0, mid: 0, high: 0 },
  comp: { on: true, threshold: -18, ratio: 2, makeup: 1 },
  limiter: { threshold: -3, ceiling: -1, release: 0.1 },
  output: 1,
};

function makeTake(offset, data, sampleRate, name) {
  const peaks = new Float32Array(Math.ceil(data.length / 64) * 2);
  for (let i = 0; i < data.length; i += 64) {
    let mn = 1, mx = -1;
    const end = Math.min(data.length, i + 64);
    for (let j = i; j < end; j++) {
      if (data[j] < mn) mn = data[j];
      if (data[j] > mx) mx = data[j];
    }
    const b = (i / 64) | 0;
    peaks[b * 2] = mn;
    peaks[b * 2 + 1] = mx;
  }
  return { name, offset, sampleRate, data, gain: 1, mute: false, peaks,
           duration: data.length / sampleRate };
}

function serializeTrack(track) {
  return {
    name: track.name,
    color: track.color,
    gain: track.gain, pan: track.pan, mute: track.mute, solo: track.solo,
    fx: track.fx,
    takes: (track.takes || []).map((take) => ({
      name: take.name, offset: take.offset, sampleRate: take.sampleRate,
      gain: take.gain, mute: take.mute, wavBase64: take.wavBase64,
    })),
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [engine, setEngine] = useState(null);
  const [connected, setConnected] = useState(false);
  const [inputDevices, setInputDevices] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState("");

  const [session, setSession] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [armedTrackId, setArmedTrackId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [playhead, setPlayhead] = useState(0);
  const [lufs, setLufs] = useState({ momentary: -Infinity, shortTerm: -Infinity });
  const [bpm, setBpm] = useState(100);
  const [countIn, setCountIn] = useState(1);
  const [metro, setMetro] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);

  const rafRef = useRef(0);
  const skipAutoSaveRef = useRef(false);
  const saveRevisionRef = useRef(0);
  const recStartPosRef = useRef(0);
  const recRecordStartAtRef = useRef(0);
  const recCountInSecRef = useRef(0);
  const recTrackIdRef = useRef(null);

  /* ---------- boot ---------- */
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    (async () => {
      try {
        setUser(await api.me());
        const list = await api.listSessions();
        if (list.length) {
          await loadSession(list[0]._id);
        } else {
          const s = await api.createSession({ name: "New Session" });
          const norm = normalizeSession(s);
          skipAutoSaveRef.current = true;
          setSession(norm);
          setBpm(norm.bpm || 100);
          if (norm.tracks.length) {
            setSelectedTrack(norm.tracks[0].id);
            setArmedTrackId(norm.tracks[0].id);
          }
        }
      } catch (e) { setToken(""); }
      setBooting(false);
    })();
  }, []);

  const normalizeSession = (raw) => ({
    ...raw,
    tracks: (raw.tracks || []).map((t, i) => ({
      ...t,
      id: t._id || t.id || `t${i}`,
      color: t.color || ["#5fd4a0","#5fa8d4","#d4a05f","#d45fa8"][i % 4],
      fx: { ...DEFAULT_FX, ...(t.fx || {}) },
      takes: (t.takes || []).map((tk, j) => ({
        ...tk,
        id: tk._id || `tk${j}`,
        data: null, // hydrated async
        peaks: null,
      })),
    })),
    masterFx: { ...DEFAULT_MASTER, ...(raw.masterFx || {}) },
  });

  const loadSession = async (id) => {
    const s = await api.getSession(id);
    const norm = normalizeSession(s);
    // decode all take data
    for (const track of norm.tracks) {
      for (const take of track.takes) {
        if (take.wavBase64) {
          take.data = await decodeWAVBase64(take.wavBase64, engineRef?.ctx, take.sampleRate);
          const peaks = new Float32Array(Math.ceil(take.data.length / 64) * 2);
          for (let i = 0; i < take.data.length; i += 64) {
            let mn = 1, mx = -1;
            const end = Math.min(take.data.length, i + 64);
            for (let j = i; j < end; j++) {
              if (take.data[j] < mn) mn = take.data[j];
              if (take.data[j] > mx) mx = take.data[j];
            }
            const b = (i / 64) | 0;
            peaks[b * 2] = mn; peaks[b * 2 + 1] = mx;
          }
          take.peaks = peaks;
          take.duration = take.data.length / take.sampleRate;
        }
      }
    }
    skipAutoSaveRef.current = true;
    setSession(norm);
    setBpm(norm.bpm || 100);
    if (norm.tracks.length) {
      setSelectedTrack(norm.tracks[0].id);
      setArmedTrackId(norm.tracks[0].id);
    }
  };

  useEffect(() => {
    if (!session || booting) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      setSaveState("saved");
      return;
    }

    const revision = ++saveRevisionRef.current;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await api.updateSession(session._id, {
          name: session.name,
          bpm,
          sampleRate: session.sampleRate || 48000,
          masterFx: session.masterFx,
          tracks: session.tracks.map(serializeTrack),
        });
        if (revision === saveRevisionRef.current) setSaveState("saved");
      } catch {
        if (revision === saveRevisionRef.current) setSaveState("error");
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [session, bpm, booting]);

  /* ---------- engine attach ---------- */
  const ensureEngine = useCallback(async () => {
    if (!engineRef) {
      engineRef = new StudioEngine();
      engineRef.onLufs = (v) => setLufs({ momentary: v.momentary, shortTerm: v.shortTerm });
      await engineRef.init();
      setEngine(engineRef);
    }
    if (engineRef.ctx.state === "suspended") await engineRef.ctx.resume();
    return engineRef;
  }, []);

  const connect = async () => {
    if (recording) return alert("Stop the current take before changing the input");
    const e = await ensureEngine();
    await e.connect(inputDeviceId || undefined);
    e.setMonitorEnabled(monitoring);
    setConnected(true);
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput");
    setInputDevices(inputs);
    const activeId = e.stream?.getAudioTracks?.()[0]?.getSettings?.().deviceId;
    if (activeId) setInputDeviceId(activeId);
  };

  const toggleMonitor = () => {
    if (!connected || !engineRef) return;
    const next = !monitoring;
    engineRef.setMonitorEnabled(next);
    setMonitoring(next);
  };

  /* ---------- sync engine with session state ---------- */
  useEffect(() => {
    if (!engineRef || !session) return;
    engineRef.updateTrackMix(session.tracks);
    engineRef.updateMaster(session.masterFx);
    if (session.tracks.length && !selectedTrack) setSelectedTrack(session.tracks[0].id);
  }, [engine, session, selectedTrack]);

  useEffect(() => {
    if (!engineRef || !session || !selectedTrack) return;
    const track = session.tracks.find((t) => t.id === selectedTrack);
    if (track) engineRef.updateTrackFx(track);
  }, [engine, session, selectedTrack]);

  /* ---------- playhead loop ---------- */
  useEffect(() => {
    const tick = () => {
      if (engineRef?.playing) {
        const pos = engineRef.playStartPos + (engineRef.ctx.currentTime - engineRef.playStartCtx);
        setPlayhead(pos);
        if (pos > (session?.tracks?.reduce((m, t) => Math.max(m, ...(t.takes || []).map((k) => k.offset + (k.duration || 0))), 0) ?? 0) + 0.4) {
          engineRef.stopPlay();
          setPlaying(false);
        }
      } else if (engineRef?.recording) {
        const elapsed = engineRef.ctx.currentTime - engineRef.recStartCtxTime - recCountInSecRef.current;
        setPlayhead(recStartPosRef.current + Math.max(0, elapsed));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [session]);

  /* ---------- transport handlers ---------- */
  const play = async () => {
    if (!session || playing) return;
    const e = await ensureEngine();
    e.playTakes(session.tracks, playhead);
    setPlaying(true);
  };
  const stop = () => {
    if (recording) { stopRecord(); return; }
    if (!engineRef) return;
    engineRef.stopPlay();
    setPlaying(false);
  };
  const rewind = () => { stop(); setPlayhead(0); };

  const changeBpm = (value) => {
    const next = Math.max(30, Math.min(300, value || 100));
    setBpm(next);
    setSession((current) => current ? { ...current, bpm: next } : current);
  };

  const startRecord = async () => {
    if (!connected) return alert("Connect input first");
    if (recording) { stopRecord(); return; }
    if (!armedTrackId) return alert("Add and arm a vocal track before recording");
    await ensureEngine();
    stop();
    const countInSec = countIn * 4 * (60 / bpm);
    recStartPosRef.current = playhead;
    recCountInSecRef.current = countInSec;
    recTrackIdRef.current = armedTrackId;
    engineRef.startCapture();
    engineRef.recStartCtxTime = engineRef.ctx.currentTime;
    recRecordStartAtRef.current = engineRef.ctx.currentTime + countInSec + 0.12;
    if (metro) engineRef.setMetronome(true, bpm);
    if (metro) engineRef.startMetronome(engineRef.ctx.currentTime + 0.06);
    setRecording(true);
  };

  const stopRecord = async () => {
    if (!recording) return;
    setRecording(false);
    if (metro) engineRef.stopMetronome();
    const raw = await engineRef.stopCapture();
    const sr = engineRef.ctx.sampleRate;
    let trim = Math.round((recRecordStartAtRef.current - engineRef.recStartCtxTime + latencyMs / 1000) * sr);
    trim = Math.max(0, Math.min(trim, raw.length));
    const data = raw.slice(trim);
    if (data.length < sr * 0.15) { alert("Take too short"); return; }

    const trackId = recTrackIdRef.current || armedTrackId;
    const targetTrack = session.tracks.find((track) => track.id === trackId);
    const take = makeTake(recStartPosRef.current, data, sr, `Take ${(targetTrack?.takes?.length || 0) + 1}`);
    let savedTake = take;
    try {
      const wavBlob = encodeWAV([data], sr, 24);
      const b64 = await blobToBase64(wavBlob);
      savedTake = { ...take, wavBase64: b64 };
    } catch (e) {
      setSaveState("error");
      alert("This take is playable for now, but its audio could not be prepared for saving: " + e.message);
    }
    setSession((current) => ({ ...current, tracks: current.tracks.map((track) => track.id === trackId
      ? { ...track, takes: [...track.takes, savedTake] }
      : track) }));
    setPlayhead(take.offset + take.duration);
  };

  const calibrate = async () => {
    if (!connected) return alert("Connect first");
    await ensureEngine();
    // Simple round-trip: emit a blip, capture, find the peak.
    engineRef.startCapture();
    engineRef.recStartCtxTime = engineRef.ctx.currentTime;
    const ctx = engineRef.ctx;
    const t0 = ctx.currentTime + 0.25;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = 1000;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    osc.connect(g).connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.06);
    await new Promise((r) => setTimeout(r, 900));
    const raw = await engineRef.stopCapture();
    const sr = ctx.sampleRate;
    let peakIdx = 0, peakVal = 0;
    for (let i = 0; i < raw.length; i++) {
      const a = Math.abs(raw[i]);
      if (a > peakVal) { peakVal = a; peakIdx = i; }
    }
    if (peakVal < 0.01) return alert("Calibration failed (no signal)");
    const expected = t0 - engineRef.recStartCtxTime;
    const actual = peakIdx / sr;
    setLatencyMs(Math.round((actual - expected) * 1000));
  };

  const exportMixdown = async () => {
    if (!session) return;
    const lengthSec = session.tracks.reduce((m, t) =>
      Math.max(m, ...(t.takes || []).map((k) => k.offset + (k.duration || 0))), 0) + 1;
    if (lengthSec <= 1) return alert("Nothing to export");
    const blob = await renderMixdown({
      tracks: session.tracks,
      masterFx: session.masterFx,
      sampleRate: engineRef?.ctx?.sampleRate || 48000,
      lengthSec,
    });
    download(blob, `mixdown-${Date.now()}.wav`);
  };

  const changeTrack = (updated) => {
    setSession((current) => ({ ...current, tracks: current.tracks.map((track) => track.id === updated.id ? updated : track) }));
  };

  const addTrack = (name) => {
    const id = globalThis.crypto?.randomUUID?.() || "t" + Date.now();
    const index = session.tracks.length;
    const colors = ["#5fd4a0", "#63a9ef", "#e3aa5b", "#d47be0", "#f07878", "#73c6c0"];
    const track = {
      id, name: name || `Vocal ${index + 1}`, color: colors[index % colors.length],
      gain: 1, pan: 0, mute: false, solo: false, fx: { ...DEFAULT_FX }, takes: [],
    };
    setSession((current) => ({ ...current, tracks: [...current.tracks, track] }));
    setSelectedTrack(id);
    setArmedTrackId(id);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.code === "Space") { e.preventDefault(); playing ? stop() : play(); }
      if (e.key === "r" || e.key === "R") startRecord();
      if (e.key === "Escape") stop();
      if (e.key === "Home") rewind();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, recording, session, selectedTrack]);

  /* ---------- render ---------- */
  if (booting) return <div className="min-h-screen grid place-items-center text-dim">Loading…</div>;
  if (!user) return <Login onAuth={(u) => { setUser(u); window.location.reload(); }} />;
  if (!session) return <div className="min-h-screen grid place-items-center text-dim">No session</div>;

  const selected = session.tracks.find((t) => t.id === selectedTrack);
  const armedTrack = session.tracks.find((t) => t.id === armedTrackId);
  const retrySave = () => setSession((current) => current ? { ...current } : current);

  return (
    <div className="studio-shell flex flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-4 px-4 py-2 bg-panel border-b border-line">
        <div className="font-bold tracking-widest text-accent text-sm">◆ VOCAL<span className="text-dim">STUDIO</span></div>
        <input className="flex-1 bg-panel2 border border-line rounded px-2 py-1 text-sm"
               value={session.name}
               onChange={(e) => setSession({ ...session, name: e.target.value })}
               aria-label="Project name" />
        <button onClick={saveState === "error" ? retrySave : undefined} disabled={saveState === "saving"}
          aria-live="polite" title={saveState === "error" ? "Click to retry saving this project" : undefined}
          className={`shrink-0 text-[10px] ${saveState === "error" ? "text-rec" : saveState === "saving" ? "text-dim" : "text-accent"}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed · Retry" : "Saved"}
        </button>
        <div className="text-xs text-dim">{user.email}</div>
        <button className="text-xs px-2 py-1 rounded border border-line"
                onClick={() => { setToken(""); setUser(null); window.location.reload(); }}>Sign out</button>
      </header>

      <Transport
        state={{ playhead, playing, recording, bpm, countIn, metro, recordTarget: armedTrack?.name }}
        onPlay={play} onStop={stop} onRecord={startRecord} onRewind={rewind}
        onBpm={changeBpm} onCountIn={setCountIn}
        onMetro={() => {
          const v = !metro; setMetro(v);
          if (engineRef) engineRef.setMetronome(v, bpm);
        }}
        onCalibrate={calibrate} onConnect={connect} onMonitor={toggleMonitor}
        connected={connected} monitoring={monitoring} analyser={engineRef?.analyser || null}
        inputDevices={inputDevices} inputDeviceId={inputDeviceId} onInputDeviceChange={setInputDeviceId}
      />

      <div className="min-h-0 flex-1 grid grid-rows-[minmax(0,1fr)_minmax(150px,22vh)_minmax(190px,27vh)]">
        <div className="flex min-h-0 min-w-0">
          <Timeline tracks={session.tracks} playhead={playhead} onSeek={setPlayhead} />
          <aside className="w-72 shrink-0 border-l border-line bg-panel flex flex-col overflow-y-auto xl:w-80">
          <FXPanel track={selected} onChange={(fx) => selected && changeTrack({ ...selected, fx })} />
          <div className="flex-1" />
          <Tuner analyser={engineRef?.analyser || null} />
          </aside>
        </div>

        <Mixer
          tracks={session.tracks}
          selectedId={selectedTrack}
          armedId={armedTrackId}
          onSelect={setSelectedTrack}
          onArm={(id) => { setSelectedTrack(id); setArmedTrackId(id); }}
          onTrackChange={changeTrack}
          onAddTrack={addTrack}
        />

        <MasterPanel
          settings={session.masterFx}
          lufs={lufs}
          onChange={(m) => setSession({ ...session, masterFx: m })}
          onExport={exportMixdown}
        />
      </div>
    </div>
  );
}
