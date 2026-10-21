import { buildVocalStrip, buildReverbBus, buildMasterChain, prepareContext } from "./effects.js";

const WORKLET_SRC = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.port.onmessage = (e) => { this.active = e.data === "start"; };
  }
  process(inputs) {
    const input = inputs[0];
    if (this.active && input && input.length) {
      const n = input[0].length;
      const mono = new Float32Array(n);
      const chCount = input.length;
      for (let c = 0; c < chCount; c++)
        for (let i = 0; i < n; i++) mono[i] += input[c][i] / chCount;
      this.port.postMessage(mono, [mono.buffer]);
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
    this.recNode = null;
    this.recSink = null;
    this.recording = false;
    this.chunks = [];
    this.recStartCtxTime = 0;
    this.analyser = null;
    this.reverbBus = null;
    this.master = null;
    this.strips = new Map();       // trackId → strip handle
    this.sources = [];             // playing buffer sources
    this.playing = false;
    this.playStartCtx = 0;
    this.playStartPos = 0;
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

  async connect(deviceId) {
    await this.init();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
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
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.recNode = new AudioWorkletNode(this.ctx, "recorder-processor");
    this.recNode.port.onmessage = (e) => {
      if (this.recording) this.chunks.push(new Float32Array(e.data));
    };
    this.recSink = this.ctx.createGain(); this.recSink.gain.value = 0;

    this.mic.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.recNode);
    this.recNode.connect(this.recSink).connect(this.ctx.destination);
  }

  setInputGain(db) { if (this.inputGain) this.inputGain.gain.value = Math.pow(10, db / 20); }

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
    this.chunks = [];
    this.recording = true;
    this.recStartCtxTime = this.ctx.currentTime;
    this.recNode.port.postMessage("start");
  }
  stopCapture() {
    this.recording = false;
    this.recNode.port.postMessage("stop");
    const total = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    this.chunks = [];
    return out;
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
  playTakes(tracks, fromPos) {
    this.stopPlay();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.06;
    for (const track of tracks) {
      const strip = this.getOrCreateStrip(track);
      for (const take of track.takes || []) {
        const end = take.offset + take.duration;
        if (end <= fromPos) continue;
        const buf = ctx.createBuffer(1, take.data.length, take.sampleRate);
        buf.copyToChannel(take.data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = take.gain ?? 1;
        if (take.mute) gain.gain.value = 0;
        src.connect(gain).connect(strip.input);
        const delay = Math.max(0, take.offset - fromPos);
        const inBuf = Math.max(0, fromPos - take.offset);
        src.start(t0 + delay, inBuf);
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
