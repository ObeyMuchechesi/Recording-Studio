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

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [engine, setEngine] = useState(null);
  const [connected, setConnected] = useState(false);

  const [session, setSession] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [lufs, setLufs] = useState({ momentary: -Infinity, shortTerm: -Infinity });
  const [bpm, setBpm] = useState(100);
  const [countIn, setCountIn] = useState(1);
  const [metro, setMetro] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);

  const rafRef = useRef(0);
  const recStartPosRef = useRef(0);
  const recRecordStartAtRef = useRef(0);
  const recCountInSecRef = useRef(0);

  /* ---------- boot ---------- */
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    (async () => {
      try {
        const list = await api.listSessions();
        if (list.length) {
          await loadSession(list[0]._id);
        } else {
          const s = await api.createSession({ name: "New Session" });
          setSession(normalizeSession(s));
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
    if (engineRef?.ctx) {
      for (const track of norm.tracks) {
        for (const take of track.takes) {
          if (take.wavBase64) {
            take.data = await decodeWAVBase64(take.wavBase64, engineRef.ctx);
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
    }
    setSession(norm);
    if (norm.tracks.length) setSelectedTrack(norm.tracks[0].id);
  };

  /* ---------- engine attach ---------- */
  const ensureEngine = useCallback(async () => {
    if (!engineRef) {
      engineRef = new StudioEngine();
      engineRef.onLufs = (v) => setLufs({ momentary: v.momentary, shortTerm: v.shortTerm });
      await engineRef.init();
      setEngine(engineRef);
    }
    return engineRef;
  }, []);

  const connect = async () => {
    const e = await ensureEngine();
    await e.connect();
    setConnected(true);
  };

  /* ---------- sync engine with session state ---------- */
  useEffect(() => {
    if (!engineRef || !session) return;
    engineRef.updateTrackMix(session.tracks);
    engineRef.updateMaster(session.masterFx);
    if (session.tracks.length && !selectedTrack) setSelectedTrack(session.tracks[0].id);
  }, [session, selectedTrack]);

  useEffect(() => {
    if (!engineRef || !session || !selectedTrack) return;
    const track = session.tracks.find((t) => t.id === selectedTrack);
    if (track) engineRef.updateTrackFx(track);
  }, [session, selectedTrack]);

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
  const play = () => {
    if (!engineRef || !session) return;
    engineRef.playTakes(session.tracks, playhead);
    setPlaying(true);
  };
  const stop = () => {
    if (!engineRef) return;
    engineRef.stopPlay();
    setPlaying(false);
  };
  const rewind = () => { stop(); setPlayhead(0); };

  const startRecord = async () => {
    if (!connected) return alert("Connect input first");
    if (recording) { stopRecord(); return; }
    await ensureEngine();
    stop();
    const countInSec = countIn * 4 * (60 / bpm);
    recStartPosRef.current = playhead;
    recCountInSecRef.current = countInSec;
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
    const raw = engineRef.stopCapture();
    const sr = engineRef.ctx.sampleRate;
    let trim = Math.round((recRecordStartAtRef.current - engineRef.recStartCtxTime + latencyMs / 1000) * sr);
    trim = Math.max(0, Math.min(trim, raw.length));
    const data = raw.slice(trim);
    if (data.length < sr * 0.15) { alert("Take too short"); return; }

    const trackId = selectedTrack || session.tracks[0].id;
    const take = makeTake(recStartPosRef.current, data, sr, `Take ${Date.now() % 1000}`);

    // persist
    try {
      const wavBlob = encodeWAV([data], sr, 24);
      const b64 = await blobToBase64(wavBlob);
      // Update via session PATCH (simple: overwrite the track array).
      const newTracks = session.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, takes: [...t.takes, { ...take, data: undefined, peaks: undefined, wavBase64: b64 }] };
      });
      await api.updateSession(session._id, { tracks: newTracks.map(serializeTrack) });
      setSession({ ...session, tracks: newTracks.map((t) => t.id === trackId ? { ...t, takes: [...t.takes, take] } : t) });
    } catch (e) {
      // local-only fallback
      setSession({ ...session, tracks: session.tracks.map((t) => t.id === trackId ? { ...t, takes: [...t.takes, take] } : t) });
      alert("Saved locally only (server error: " + e.message + ")");
    }
    setPlayhead(take.offset + take.duration);
  };

  const serializeTrack = (t) => ({
    name: t.name,
    color: t.color,
    gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
    fx: t.fx,
    takes: (t.takes || []).map((tk) => ({
      name: tk.name, offset: tk.offset, sampleRate: tk.sampleRate,
      gain: tk.gain, mute: tk.mute, wavBase64: tk.wavBase64,
    })),
  });

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
    const raw = engineRef.stopCapture();
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
    setSession({ ...session, tracks: session.tracks.map((t) => t.id === updated.id ? updated : t) });
  };

  const addTrack = () => {
    const id = "t" + Date.now();
    const tracks = [...session.tracks, {
      id, name: `Vocal ${session.tracks.length + 1}`, color: "#5fa8d4",
      gain: 1, pan: 0, mute: false, solo: false, fx: { ...DEFAULT_FX }, takes: [],
    }];
    setSession({ ...session, tracks });
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

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 bg-panel border-b border-line">
        <div className="font-bold tracking-widest text-accent text-sm">◆ VOCAL<span className="text-dim">STUDIO</span></div>
        <input className="flex-1 bg-panel2 border border-line rounded px-2 py-1 text-sm"
               value={session.name}
               onChange={(e) => setSession({ ...session, name: e.target.value })}
               onBlur={() => api.updateSession(session._id, { name: session.name }).catch(() => {})} />
        <div className="text-xs text-dim">{user.email}</div>
        <button className="text-xs px-2 py-1 rounded border border-line"
                onClick={() => { setToken(""); setUser(null); window.location.reload(); }}>Sign out</button>
      </header>

      <Transport
        state={{ playhead, playing, recording, bpm, countIn, metro }}
        onPlay={play} onStop={stop} onRecord={startRecord} onRewind={rewind}
        onBpm={setBpm} onCountIn={setCountIn}
        onMetro={() => {
          const v = !metro; setMetro(v);
          if (engineRef) engineRef.setMetronome(v, bpm);
        }}
        onCalibrate={calibrate} onConnect={connect} connected={connected}
      />

      <div className="flex-1 flex min-h-0">
        <Timeline tracks={session.tracks} playhead={playhead} onSeek={setPlayhead} />
        <aside className="w-80 border-l border-line bg-panel flex flex-col overflow-y-auto">
          <FXPanel track={selected} onChange={(fx) => selected && changeTrack({ ...selected, fx })} />
          <div className="flex-1" />
          <Tuner analyser={engineRef?.analyser || null} />
        </aside>
      </div>

      <Mixer
        tracks={session.tracks}
        selectedId={selectedTrack}
        onSelect={setSelectedTrack}
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
  );
}
