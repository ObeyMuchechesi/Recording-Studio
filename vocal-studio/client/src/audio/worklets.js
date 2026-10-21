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
// Momentary (400ms) + short-term (3s) LUFS using simplified K-weighting.
class LufsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mBuf = new Float32Array(sampleRate * 0.4);
    this.sBuf = new Float32Array(sampleRate * 3);
    this.mIdx = 0; this.sIdx = 0;
    // K-weighting approximation: HPF 38Hz + highshelf ~+4dB @ 1.5kHz
    this.hp = { x1:0, x2:0, y1:0, y2:0 };
    const w = 2 * Math.PI * 38 / sampleRate;
    const q = 0.5;
    const alpha = Math.sin(w) / (2 * q);
    const cw = Math.cos(w);
    this.hpB0 = (1 + cw) / 2; this.hpB1 = -(1 + cw); this.hpB2 = (1 + cw) / 2;
    this.hpA0 = 1 + alpha; this.hpA1 = -2 * cw; this.hpA2 = 1 - alpha;
    this.lastReport = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const data = inp[0];
    for (let i = 0; i < data.length; i++) {
      // HPF
      const x = data[i];
      const y = this.hpB0 * x + this.hpB1 * this.hp.x1 + this.hpB2 * this.hp.x2
                - this.hpA1 * this.hp.y1 - this.hpA2 * this.hp.y2;
      this.hp.x2 = this.hp.x1; this.hp.x1 = x;
      this.hp.y2 = this.hp.y1; this.hp.y1 = y;
      const v = y * y;
      this.mBuf[this.mIdx++ % this.mBuf.length] = v;
      this.sBuf[this.sIdx++ % this.sBuf.length] = v;
    }
    const now = currentTime;
    if (now - this.lastReport > 0.1) {
      this.lastReport = now;
      const mMean = this.mBuf.reduce((a, b) => a + b, 0) / this.mBuf.length;
      const sMean = this.sBuf.reduce((a, b) => a + b, 0) / this.sBuf.length;
      const lufsM = mMean > 0 ? -0.691 + 10 * Math.log10(mMean) : -Infinity;
      const lufsS = sMean > 0 ? -0.691 + 10 * Math.log10(sMean) : -Infinity;
      this.port.postMessage({ momentary: lufsM, shortTerm: lufsS });
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
