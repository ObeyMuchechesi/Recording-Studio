// Each worklet is registered from a Blob URL so it works in Vite and offline contexts.

export const GATE_WORKLET = `
class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -100, maxValue: 0 },
      { name: 'attack',    defaultValue: 0.002, minValue: 0.0001, maxValue: 0.5 },
      { name: 'release',   defaultValue: 0.15, minValue: 0.005, maxValue: 2 },
    ];
  }
  constructor() { super(); this.env = 1; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const thr = Math.pow(10, params.threshold[0] / 20);
    const atk = 1 - Math.exp(-1 / (sampleRate * params.attack[0]));
    const rel = 1 - Math.exp(-1 / (sampleRate * params.release[0]));
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      const peak = Math.abs(inp[0][i]);
      const target = peak > thr ? 1 : 0;
      const coef = target > this.env ? atk : rel;
      this.env += (target - this.env) * coef;
      out[0][i] = inp[0][i] * this.env;
    }
    return true;
  }
}
registerProcessor('gate-processor', GateProcessor);
`;

export const LUFS_WORKLET = `
// Rolling loudness windows, an absolute -70 LUFS gate, and 4x interpolated peak.
// This browser meter uses high-pass weighting and is an estimate, not a standards lab.
class LufsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mBuf = new Float32Array(Math.max(1, Math.round(sampleRate * 0.4)));
    this.sBuf = new Float32Array(Math.max(1, Math.round(sampleRate * 3)));
    this.mIdx = 0; this.sIdx = 0; this.mCount = 0; this.sCount = 0;
    this.mSum = 0; this.sSum = 0; this.states = []; this.previous = [];
    this.integratedEnergy = 0; this.integratedBlocks = 0;
    this.blockEnergy = 0; this.blockSamples = 0;
    this.peak = 0; this.truePeak = 0; this.lastReport = 0;
    const w = 2 * Math.PI * 38 / sampleRate, q = 0.5;
    const alpha = Math.sin(w) / (2 * q), cw = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = ((1 + cw) / 2) / a0; this.b1 = (-(1 + cw)) / a0; this.b2 = ((1 + cw) / 2) / a0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
    this.port.onmessage = (event) => {
      if (event.data === "reset") {
        this.integratedEnergy = 0; this.integratedBlocks = 0;
        this.peak = 0; this.truePeak = 0;
      }
    };
  }
  process(inputs, outputs) {
    for (const channel of outputs[0] || []) channel.fill(0);
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    const length = channels[0].length, channelCount = channels.length;
    while (this.states.length < channelCount) {
      this.states.push({ x1:0, x2:0, y1:0, y2:0 }); this.previous.push(0);
    }
    for (let i = 0; i < length; i++) {
      let energy = 0, samplePeak = 0, interpolatedPeak = 0;
      for (let c = 0; c < channelCount; c++) {
        const x = channels[c][i], state = this.states[c];
        const y = this.b0*x + this.b1*state.x1 + this.b2*state.x2 - this.a1*state.y1 - this.a2*state.y2;
        state.x2=state.x1; state.x1=x; state.y2=state.y1; state.y1=y;
        energy += y*y;
        samplePeak = Math.max(samplePeak, Math.abs(x));
        let previous = this.previous[c];
        for (let step = 1; step <= 4; step++) {
          const interpolated = previous + (x - previous) * step / 4;
          interpolatedPeak = Math.max(interpolatedPeak, Math.abs(interpolated));
        }
        this.previous[c] = x;
      }
      energy /= channelCount;
      const oldM = this.mBuf[this.mIdx], oldS = this.sBuf[this.sIdx];
      this.mBuf[this.mIdx] = energy; this.mIdx = (this.mIdx + 1) % this.mBuf.length;
      this.sBuf[this.sIdx] = energy; this.sIdx = (this.sIdx + 1) % this.sBuf.length;
      this.mSum += energy - oldM; this.sSum += energy - oldS;
      this.mCount = Math.min(this.mCount + 1, this.mBuf.length);
      this.sCount = Math.min(this.sCount + 1, this.sBuf.length);
      this.blockEnergy += energy; this.blockSamples++;
      this.peak = Math.max(this.peak, samplePeak); this.truePeak = Math.max(this.truePeak, interpolatedPeak);
      if (this.blockSamples >= sampleRate / 10) {
        const blockMean = this.blockEnergy / this.blockSamples;
        const blockLufs = blockMean > 0 ? -0.691 + 10 * Math.log10(blockMean) : -Infinity;
        if (blockLufs > -70) { this.integratedEnergy += blockMean; this.integratedBlocks++; }
        this.blockEnergy = 0; this.blockSamples = 0;
      }
    }
    if (currentTime - this.lastReport > 0.1) {
      this.lastReport = currentTime;
      const mMean = this.mCount ? this.mSum / this.mCount : 0;
      const sMean = this.sCount ? this.sSum / this.sCount : 0;
      const iMean = this.integratedBlocks ? this.integratedEnergy / this.integratedBlocks : 0;
      const toLufs = (value) => value > 0 ? -0.691 + 10 * Math.log10(value) : -Infinity;
      const toDb = (value) => value > 0 ? 20 * Math.log10(value) : -Infinity;
      this.port.postMessage({ momentary: toLufs(mMean), shortTerm: toLufs(sMean),
        integrated: toLufs(iMean), samplePeak: toDb(this.peak), truePeak: toDb(this.truePeak) });
    }
    return true;
  }
}
registerProcessor('lufs-processor', LufsProcessor);
`;

export const LIMITER_WORKLET = `
// Peak limiter with hard ceiling — instant attack, smooth release.
class LimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -3, minValue: -60, maxValue: 0 },
      { name: 'ceiling',   defaultValue: -1, minValue: -30, maxValue: 0 },
      { name: 'release',   defaultValue: 0.1, minValue: 0.01, maxValue: 2 },
    ];
  }
  constructor() { super(); this.env = 1; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const n = inp[0].length, ch = inp.length;
    const thr = Math.pow(10, params.threshold[0] / 20);
    const ceil = Math.pow(10, params.ceiling[0] / 20);
    const rel = 1 - Math.exp(-1 / (sampleRate * params.release[0]));
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (let c = 0; c < ch; c++) {
        const a = Math.abs(inp[c][i]);
        if (a > peak) peak = a;
      }
      const target = peak > thr ? thr / peak : 1;
      if (target < this.env) this.env = target;         // instant attack
      else this.env += (target - this.env) * rel;       // smooth release
      for (let c = 0; c < ch; c++) {
        let v = inp[c][i] * this.env;
        if (v >  ceil) v =  ceil;
        if (v < -ceil) v = -ceil;
        out[c][i] = v;
      }
    }
    return true;
  }
}
registerProcessor('limiter-processor', LimiterProcessor);
`;

export async function installWorklets(ctx) {
  const sources = [GATE_WORKLET, LUFS_WORKLET, LIMITER_WORKLET];
  for (const src of sources) {
    const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
  }
}
