import { buildVocalStrip, buildReverbBus, buildMasterChain, prepareContext } from "./effects.js";
import { scheduleAutomation } from "./automation.js";

const WORKLET_SRC = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.chunkSize = Math.max(2048, Math.round(sampleRate * 0.25));
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
    this.flush = () => {
      if (!this.offset) return;
      const samples = this.buffer.slice(0, this.offset);
      this.buffer = new Float32Array(this.chunkSize);
      this.offset = 0;
      this.port.postMessage({ type: "chunk", samples }, [samples.buffer]);
    };
    this.port.onmessage = (e) => {
      if (e.data === "start") {
        this.offset = 0;
        this.active = true;
      } else if (e.data === "stop") {
        this.active = false;
        this.flush();
        this.port.postMessage({ type: "stopped" });
      }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (this.active && input && input.length) {
      const n = input[0].length;
      const chCount = input.length;
      for (let i = 0; i < n; i++) {
        let mono = 0;
        for (let c = 0; c < chCount; c++) mono += input[c][i];
        this.buffer[this.offset++] = mono / chCount;
        if (this.offset === this.chunkSize) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

export class StudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.mic = null;
    this.inputGain = null;
    this.monitorGain = null;
    this.monitoringMode = "hardware";
    this.recNode = null;
    this.recSink = null;
    this.recording = false;
    this.chunks = [];
    this.captureStopPromise = null;
    this.captureStopResolve = null;
    this.recStartCtxTime = 0;
    this.analyser = null;
    this.reverbBus = null;
    this.master = null;
    this.strips = new Map();       // trackId → strip handle
    this.sources = [];             // playing buffer sources
    this.playing = false;
    this.playStartCtx = 0;
    this.playStartPos = 0;
    this.compensationLatencySeconds = 0;
    this.metronome = { enabled: false, bpm: 100, nextNote: 0, beat: 0, timer: null };
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    await this.ctx.resume();
    await prepareContext(this.ctx);

    // master
    this.master = buildMasterChain(this.ctx, {}, (lufs) => this.onLufs?.(lufs));

    // reverb bus
    this.reverbBus = buildReverbBus(this.ctx, { decay: 2.5, size: 1 });
    this.reverbBus.output.connect(this.master.input);

    // recorder worklet
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
  }

  async connect(deviceId, monitoringMode = this.monitoringMode) {
    await this.init();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    for (const node of [this.mic, this.inputGain, this.analyser, this.recNode, this.recSink, this.monitorGain]) {
      try { node?.disconnect(); } catch {}
    }
    try { this.recNode?.port.close(); } catch {}
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.mic = this.ctx.createMediaStreamSource(this.stream);
    this.inputGain = this.ctx.createGain();
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.recNode = new AudioWorkletNode(this.ctx, "recorder-processor");
    this.recNode.port.onmessage = (e) => {
      if (e.data?.type === "chunk" && this.recording) {
        this.chunks.push(e.data.samples);
      } else if (e.data?.type === "stopped") {
        this.recording = false;
        const total = this.chunks.reduce((a, c) => a + c.length, 0);
        const out = new Float32Array(total);
        let offset = 0;
        for (const chunk of this.chunks) { out.set(chunk, offset); offset += chunk.length; }
        this.chunks = [];
        const resolve = this.captureStopResolve;
        this.captureStopResolve = null;
        this.captureStopPromise = null;
        resolve?.(out);
      }
    };
    this.recSink = this.ctx.createGain(); this.recSink.gain.value = 0;

    this.mic.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.recNode);
    this.inputGain.connect(this.monitorGain);
    this.setMonitoringMode(monitoringMode);
    this.recNode.connect(this.recSink).connect(this.ctx.destination);
  }

  setInputGain(db) { if (this.inputGain) this.inputGain.gain.value = Math.pow(10, db / 20); }

  setMonitoringMode(mode) {
    if (!["hardware", "software", "off"].includes(mode)) return false;
    this.monitoringMode = mode;
    if (!this.monitorGain) return false;
    try { this.monitorGain.disconnect(); } catch {}
    if (mode === "software") this.monitorGain.connect(this.master.input);
    this.monitorGain.gain.setTargetAtTime(mode === "software" ? 1 : 0, this.ctx.currentTime, 0.015);
    return true;
  }

  /* ---------- takes / strips ---------- */
  getOrCreateStrip(track) {
    if (this.strips.has(track.id)) return this.strips.get(track.id);
    const strip = buildVocalStrip(this.ctx, track.fx || {}, this.reverbBus);
    strip.output.connect(this.master.input);
    strip.setGain(track.mute ? 0 : track.gain ?? 1);
    strip.setPan(track.pan ?? 0);
    strip.setSend(track.fx?.reverb?.mix ?? 0);
    this.strips.set(track.id, strip);
    return strip;
  }

  updateTrackFx(track) {
    const strip = this.strips.get(track.id);
    if (strip) strip.updateFx(track.fx || {});
  }

  updateTrackMix(tracks) {
    const anySolo = tracks.some((t) => t.solo);
    for (const t of tracks) {
      const strip = this.getOrCreateStrip(t);
      const aud = !t.mute && (!anySolo || t.solo);
      strip.setGain(aud ? (t.gain ?? 1) : 0);
      strip.setPan(t.pan ?? 0);
      strip.setSend(t.fx?.reverb?.on ? t.fx.reverb.mix : 0);
    }
  }

  updateMaster(settings) { this.master.update(settings); }

  /* ---------- recording ---------- */
  startCapture() {
    if (!this.recNode) throw new Error("Connect an input before recording");
    if (this.recording) throw new Error("A recording is already in progress");
    this.chunks = [];
    this.recording = true;
    this.recStartCtxTime = this.ctx.currentTime;
    this.recNode.port.postMessage("start");
  }
  stopCapture() {
    if (!this.recording || !this.recNode) return Promise.resolve(new Float32Array(0));
    if (this.captureStopPromise) return this.captureStopPromise;
    this.captureStopPromise = new Promise((resolve) => { this.captureStopResolve = resolve; });
    this.recNode.port.postMessage("stop");
    return this.captureStopPromise;
  }

  /* ---------- metronome ---------- */
  setMetronome(enabled, bpm) {
    this.metronome.enabled = enabled;
    this.metronome.bpm = bpm;
    if (!enabled) this.stopMetronome();
  }
  startMetronome(atTime) {
    this.stopMetronome();
    const m = this.metronome;
    m.nextNote = atTime ?? this.ctx.currentTime + 0.1;
    m.beat = 0;
    m.timer = setInterval(() => {
      while (m.nextNote < this.ctx.currentTime + 0.12) {
        this.metroClick(m.nextNote, m.beat % 4 === 0);
        m.nextNote += 60 / m.bpm;
        m.beat++;
      }
    }, 25);
  }
  stopMetronome() {
    if (this.metronome.timer) clearInterval(this.metronome.timer);
    this.metronome.timer = null;
  }
  metroClick(t, accent) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.06);
  }

  /* ---------- playback ---------- */
  playRegions(tracks, fromPos) {
    this.stopPlay();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.06;
    const maxLatencySamples = Math.max(0, ...tracks.map((track) => Number(track.pluginLatencySamples) || 0));
    this.compensationLatencySeconds = maxLatencySamples / ctx.sampleRate;
    const anySolo = tracks.some((track) => track.solo);
    for (const track of tracks) {
      const strip = this.getOrCreateStrip(track);
      const compensation = (maxLatencySamples - (Number(track.pluginLatencySamples) || 0)) / ctx.sampleRate;
      const automationAt = t0 + compensation;
      const audible = !track.mute && (!anySolo || track.solo);
      const automationVolume = (track.automation?.volume || []).map((point) => ({ ...point, value: audible ? point.value : 0 }));
      scheduleAutomation(strip.gainParam, automationVolume, audible ? track.gain ?? 1 : 0, automationAt, fromPos);
      scheduleAutomation(strip.panParam, track.automation?.pan, track.pan ?? 0, automationAt, fromPos);
      scheduleAutomation(strip.sendParam, track.automation?.send, track.fx?.reverb?.on ? track.fx.reverb.mix ?? 0 : 0, automationAt, fromPos);
      const takes = new Map((track.takes || []).map((take) => [String(take.id), take]));
      for (const region of track.regions || []) {
        const take = takes.get(String(region.takeId));
        if (!take?.data?.length || !Number.isFinite(take.sampleRate) || take.sampleRate <= 0) continue;
        const sourceStart = Math.max(0, Number(region.sourceStart) || 0);
        const takeDuration = take.duration ?? take.data.length / take.sampleRate;
        const requestedEnd = Number(region.sourceEnd);
        const sourceEnd = Math.min(takeDuration, Number.isFinite(requestedEnd) ? requestedEnd : takeDuration);
        const duration = sourceEnd - sourceStart;
        if (!(duration > 0)) continue;
        const timelineStart = Math.max(0, Number(region.timelineStart) || 0);
        const end = timelineStart + duration;
        if (end <= fromPos) continue;
        const buf = ctx.createBuffer(1, take.data.length, take.sampleRate);
        buf.copyToChannel(take.data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        const elapsed = Math.max(0, fromPos - timelineStart);
        const fadeIn = Math.min(duration / 2, Math.max(0, Number(region.fadeIn) || 0));
        const fadeOut = Math.min(duration / 2, Math.max(0, Number(region.fadeOut) || 0));
        const fadeInLevel = fadeIn > 0 ? Math.min(1, elapsed / fadeIn) : 1;
        const fadeOutLevel = fadeOut > 0 ? Math.min(1, (duration - elapsed) / fadeOut) : 1;
        const regionGain = (region.gain ?? 1) * (take.gain ?? 1) * (take.mute ? 0 : 1);
        const when = t0 + compensation + Math.max(0, timelineStart - fromPos);
        gain.gain.setValueAtTime(regionGain * fadeInLevel * fadeOutLevel, when);
        if (fadeIn > elapsed) gain.gain.linearRampToValueAtTime(regionGain, when + fadeIn - elapsed);
        const fadeOutAt = duration - fadeOut - elapsed;
        if (fadeOut > 0 && fadeOutAt >= 0) {
          gain.gain.setValueAtTime(regionGain, when + fadeOutAt);
          gain.gain.linearRampToValueAtTime(0, when + duration - elapsed);
        } else if (fadeOut > 0 && fadeOutLevel > 0) {
          gain.gain.linearRampToValueAtTime(0, when + duration - elapsed);
        }
        src.connect(gain).connect(strip.input);
        src.start(when, sourceStart + elapsed, duration - elapsed);
        this.sources.push(src);
      }
    }
    this.playStartCtx = t0;
    this.playStartPos = fromPos;
    this.playing = true;
  }
  stopPlay() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources = [];
    this.playing = false;
  }
}
