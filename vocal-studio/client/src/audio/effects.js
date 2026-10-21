import { installWorklets } from "./worklets.js";

/* ---- reverb impulse response (generated noise w/ exponential decay) ---- */
export function makeImpulse(ctx, decay = 2.5, preDelay = 0.02, size = 1.0) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * decay * size));
  const pre = Math.floor(sr * preDelay);
  const buf = ctx.createBuffer(2, len + pre, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[pre + i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
  }
  return buf;
}

/* ---- EQ: HPF → low shelf → low-mid peak → hi-mid peak → high shelf ---- */
export function buildEQ(ctx, p = {}) {
  const hpf    = ctx.createBiquadFilter(); hpf.type = "highpass";    hpf.frequency.value = p.hpf ?? 80;
  const low    = ctx.createBiquadFilter(); low.type = "lowshelf";    low.frequency.value = 200;  low.gain.value  = p.low ?? 0;
  const loMid  = ctx.createBiquadFilter(); loMid.type = "peaking";   loMid.frequency.value = p.loMidFreq ?? 800;  loMid.Q.value = 1.2; loMid.gain.value = p.loMidGain ?? 0;
  const hiMid  = ctx.createBiquadFilter(); hiMid.type = "peaking";   hiMid.frequency.value = p.hiMidFreq ?? 3000; hiMid.Q.value = 1.2; hiMid.gain.value = p.hiMidGain ?? 0;
  const high   = ctx.createBiquadFilter(); high.type = "highshelf";  high.frequency.value = 8000; high.gain.value = p.high ?? 0;
  hpf.connect(low).connect(loMid).connect(hiMid).connect(high);
  return {
    input: hpf, output: high,
    update(q) {
      if (q.hpf   != null) hpf.frequency.value   = q.hpf;
      if (q.low   != null) low.gain.value         = q.low;
      if (q.loMidFreq != null) loMid.frequency.value = q.loMidFreq;
      if (q.loMidGain != null) loMid.gain.value      = q.loMidGain;
      if (q.hiMidFreq != null) hiMid.frequency.value = q.hiMidFreq;
      if (q.hiMidGain != null) hiMid.gain.value      = q.hiMidGain;
      if (q.high  != null) high.gain.value        = q.high;
    },
  };
}

/* ---- Compressor (native DynamicsCompressorNode + makeup gain) ---- */
export function buildCompressor(ctx, p = {}) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = p.threshold ?? -24;
  comp.ratio.value     = p.ratio     ?? 4;
  comp.attack.value    = p.attack    ?? 0.005;
  comp.release.value   = p.release   ?? 0.15;
  comp.knee.value      = p.knee      ?? 6;
  const makeup = ctx.createGain();
  makeup.gain.value = p.makeup != null ? Math.pow(10, p.makeup / 20) : 1;
  comp.connect(makeup);
  return {
    input: comp, output: makeup,
    update(q) {
      if (q.threshold != null) comp.threshold.value = q.threshold;
      if (q.ratio     != null) comp.ratio.value     = q.ratio;
      if (q.attack    != null) comp.attack.value    = q.attack;
      if (q.release   != null) comp.release.value   = q.release;
      if (q.knee      != null) comp.knee.value      = q.knee;
      if (q.makeup    != null) makeup.gain.value = Math.pow(10, q.makeup / 20);
    },
  };
}

/* ---- De-esser: highpass split → compressor → sum ---- */
export function buildDeEsser(ctx, p = {}) {
  const split   = ctx.createGain();
  const dry     = ctx.createGain();
  const hp      = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = p.freq ?? 5500;
  const comp    = ctx.createDynamicsCompressor();
  comp.threshold.value = -22; comp.ratio.value = 6; comp.attack.value = 0.001; comp.release.value = 0.05; comp.knee.value = 2;
  const wet     = ctx.createGain(); wet.gain.value = 0;
  const sum     = ctx.createGain();
  split.connect(dry).connect(sum);
  split.connect(hp).connect(comp).connect(wet).connect(sum);
  return {
    input: split, output: sum,
    update(q) {
      if (q.freq   != null) hp.frequency.value = q.freq;
      if (q.amount != null) wet.gain.value = q.amount;  // 0..1 controls amount of de-essing
    },
  };
}

/* ---- Saturation: soft tanh waveshaper + parallel mix ---- */
export function buildSaturation(ctx, p = {}) {
  const input = ctx.createGain();
  const dry   = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const wet   = ctx.createGain();
  const output = ctx.createGain();

  const N = 2048;
  const curve = new Float32Array(N);
  const drive = p.drive ?? 0.4;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * (1 + drive * 8));
  }
  shaper.curve = curve;
  shaper.oversample = "4x";

  input.connect(dry).connect(output);
  input.connect(shaper).connect(wet).connect(output);
  dry.gain.value = 1 - (p.mix ?? 0.4);
  wet.gain.value = p.mix ?? 0.4;

  return {
    input, output,
    update(q) {
      if (q.drive != null) {
        const c = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * 2 - 1;
          c[i] = Math.tanh(x * (1 + q.drive * 8));
        }
        shaper.curve = c;
      }
      if (q.mix != null) { dry.gain.value = 1 - q.mix; wet.gain.value = q.mix; }
    },
  };
}

/* ---- Reverb: send return fed from a per-track send ---- */
export function buildReverbBus(ctx, p = {}) {
  const input  = ctx.createGain();
  const conv   = ctx.createConvolver();
  const damp   = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 6500;
  const output = ctx.createGain();
  conv.buffer = makeImpulse(ctx, p.decay ?? 2.5, 0.02, p.size ?? 1);
  input.connect(conv).connect(damp).connect(output);
  return {
    input, output,
    update(q) {
      if (q.decay != null || q.size != null) {
        conv.buffer = makeImpulse(ctx, q.decay ?? 2.5, 0.02, q.size ?? 1);
      }
      if (q.damp != null) damp.frequency.value = q.damp;
    },
  };
}

/* ---- Limiter (AudioWorklet) ---- */
export function buildLimiter(ctx, p = {}) {
  const node = new AudioWorkletNode(ctx, "limiter-processor", {
    parameterData: {
      threshold: p.threshold ?? -3,
      ceiling:   p.ceiling   ?? -1,
      release:   p.release   ?? 0.1,
    },
  });
  return {
    input: node, output: node,
    update(q) {
      if (q.threshold != null) node.parameters.get("threshold").value = q.threshold;
      if (q.ceiling   != null) node.parameters.get("ceiling").value   = q.ceiling;
      if (q.release   != null) node.parameters.get("release").value   = q.release;
    },
  };
}

/* ---- Gate (AudioWorklet) ---- */
export function buildGate(ctx, p = {}) {
  const node = new AudioWorkletNode(ctx, "gate-processor", {
    parameterData: {
      threshold: p.threshold ?? -50,
      attack:    p.attack    ?? 0.002,
      release:   p.release   ?? 0.15,
    },
  });
  return {
    input: node, output: node,
    update(q) {
      if (q.threshold != null) node.parameters.get("threshold").value = q.threshold;
      if (q.attack    != null) node.parameters.get("attack").value    = q.attack;
      if (q.release   != null) node.parameters.get("release").value   = q.release;
    },
  };
}

/* ---- LUFS meter (AudioWorklet, analysis-only) ---- */
export function buildLufsMeter(ctx, onReport) {
  const node = new AudioWorkletNode(ctx, "lufs-processor", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
  });
  node.port.onmessage = (e) => onReport(e.data);
  // The processor's output is silent; connecting it keeps analysis active.
  node.connect(ctx.destination);
  return node;
}

/* ---- Full vocal strip in professional signal order ---- */
export function buildVocalStrip(ctx, settings = {}, reverbSendBus) {
  const chain = {
    gate:     buildGate(ctx, settings.gate),
    eq:       buildEQ(ctx, settings.eq),
    deEsser:  buildDeEsser(ctx, settings.deEsser),
    comp:     buildCompressor(ctx, settings.comp),
    sat:      buildSaturation(ctx, settings.sat),
  };
  // routing: gate → eq → de-esser → comp → sat
  const nodes = [chain.gate, chain.eq, chain.deEsser, chain.comp, chain.sat];
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].output.connect(nodes[i + 1].input);

  const out   = ctx.createGain();
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const send  = ctx.createGain(); send.gain.value = settings.reverb?.mix ?? 0;

  chain.sat.output.connect(out);
  if (panner) out.connect(panner);
  chain.sat.output.connect(send);
  if (reverbSendBus) send.connect(reverbSendBus.input);

  return {
    input: chain.gate.input,
    output: panner || out,
    gainParam: out.gain,
    panParam: panner?.pan || null,
    sendParam: send.gain,
    setGain(v)  { out.gain.value = v; },
    setPan(v)   { if (panner) panner.pan.value = v; },
    setSend(v)  { send.gain.value = v; },
    updateFx(s) {
      if (s.gate)     chain.gate.update(s.gate);
      if (s.eq)       chain.eq.update(s.eq);
      if (s.deEsser)  chain.deEsser.update(s.deEsser);
      if (s.comp)     chain.comp.update(s.comp);
      if (s.sat)      chain.sat.update(s.sat);
    },
  };
}

/* ---- Full master chain ---- */
export function buildMasterChain(ctx, settings = {}, onLufs) {
  const eq      = buildEQ(ctx, { hpf: 20, ...settings.eq });
  const glue    = buildCompressor(ctx, { threshold: -18, ratio: 2, attack: 0.03, release: 0.15, knee: 6, makeup: 0, ...settings.comp });
  const limiter = buildLimiter(ctx, settings.limiter);
  const out     = ctx.createGain(); out.gain.value = settings.output ?? 1;
  const meter   = buildLufsMeter(ctx, onLufs);

  eq.output.connect(glue.input);
  glue.output.connect(limiter.input);
  limiter.output.connect(out);
  out.connect(ctx.destination);
  out.connect(meter);

  return {
    input: eq.input,
    output: out,
    resetMeter() { meter.port.postMessage("reset"); },
    update(s) {
      if (s.eq)      eq.update(s.eq);
      if (s.comp)    glue.update(s.comp);
      if (s.limiter) limiter.update(s.limiter);
      if (s.output != null) out.gain.value = s.output;
    },
  };
}

/* Install worklets on any context (realtime or offline) */
export async function prepareContext(ctx) {
  await installWorklets(ctx);
}
