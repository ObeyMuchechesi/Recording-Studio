const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export function detectPitch(buf, sampleRate) {
  const n = Math.min(buf.length, 2048);
  const off = buf.length - n;
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 60);
  const W = n - maxLag;
  if (W < 128) return null;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[off + i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) { const v = buf[off + i] - mean; energy += v * v; }
  if (energy / n < 1e-5) return null;

  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < W; i++) s += (buf[off + i] - mean) * (buf[off + i + lag] - mean);
    corr[lag] = s;
  }
  let maxV = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > maxV) maxV = corr[lag];
  if (maxV <= 0) return null;
  const thr = maxV * 0.9;
  let chosen = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= thr && corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      chosen = lag; break;
    }
  }
  if (chosen < 0) return null;
  const y1 = corr[chosen - 1], y2 = corr[chosen], y3 = corr[chosen + 1];
  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  const lagF = a !== 0 ? chosen - b / (2 * a) : chosen;
  const freq = sampleRate / lagF;
  if (!isFinite(freq) || freq <= 0 || freq > 1200) return null;

  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12] + (Math.floor(nearest / 12) - 1);
  return { freq, midi, nearest, cents, name };
}
