const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const pitchCache = new WeakMap();

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

function nearestScaleMidi(midi, key, scale) {
  const root = Math.max(0, NOTE_NAMES.indexOf(key));
  const degrees = SCALES[scale] || SCALES.major;
  let nearest = Math.round(midi), distance = Infinity;
  for (let candidate = Math.max(0, Math.floor(midi) - 2); candidate <= Math.ceil(midi) + 2; candidate++) {
    if (!degrees.includes(((candidate - root) % 12 + 12) % 12)) continue;
    const nextDistance = Math.abs(candidate - midi);
    if (nextDistance < distance) { nearest = candidate; distance = nextDistance; }
  }
  return nearest;
}

// Phrase-safe granular pitch correction. It shifts voiced frames toward the
// closest note in the selected scale and overlap-adds each frame at its
// original timeline position, so timing and comp boundaries stay unchanged.
export function correctPitch(data, sampleRate, settings = {}) {
  if (!settings.enabled || !data?.length || !(sampleRate > 0)) return data;
  const amount = Math.max(0, Math.min(1, Number(settings.amount ?? 0.85)));
  if (amount < 0.001) return data;
  const frameSize = 2048;
  const hop = 512;
  const analysisSize = 512;
  const downsample = 4;
  const output = new Float32Array(data.length);
  const weight = new Float32Array(data.length);
  const analysis = new Float32Array(analysisSize);
  const speedSeconds = Math.max(0.005, Number(settings.speedMs ?? 70) / 1000);
  const smoothing = 1 - Math.exp(-hop / sampleRate / speedSeconds);
  let ratio = 1;
  const key = NOTE_NAMES.includes(settings.key) ? settings.key : "C";
  const scale = SCALES[settings.scale] ? settings.scale : "major";

  for (let center = -frameSize / 2; center < data.length + frameSize / 2; center += hop) {
    for (let i = 0; i < analysisSize; i++) {
      const source = Math.max(0, Math.min(data.length - 1, center - frameSize / 2 + i * downsample));
      analysis[i] = data[source];
    }
    const pitch = detectPitch(analysis, sampleRate / downsample);
    let targetRatio = 1;
    if (pitch) {
      const targetMidi = nearestScaleMidi(pitch.midi, key, scale);
      targetRatio = 2 ** (((targetMidi - pitch.midi) * amount) / 12);
    }
    ratio += (targetRatio - ratio) * smoothing;

    for (let i = 0; i < frameSize; i++) {
      const outIndex = center - frameSize / 2 + i;
      if (outIndex < 0 || outIndex >= data.length) continue;
      const source = center + (i - frameSize / 2) * ratio;
      const low = Math.floor(source);
      if (low < 0 || low >= data.length) continue;
      const fraction = source - low;
      const sample = data[low] * (1 - fraction) + data[Math.min(data.length - 1, low + 1)] * fraction;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      output[outIndex] += sample * window;
      weight[outIndex] += window;
    }
  }

  for (let i = 0; i < output.length; i++) {
    output[i] = weight[i] > 1e-5 ? output[i] / weight[i] : data[i];
  }
  return output;
}

export function correctedTrack(track) {
  if (!track?.pitch?.enabled) return track;
  const settings = track.pitch;
  const key = `${settings.key}:${settings.scale}:${settings.amount}:${settings.speedMs}`;
  const takes = (track.takes || []).map((take) => {
    if (!take.data?.length) return take;
    let cached = pitchCache.get(take);
    if (!cached || cached.key !== key) {
      cached = { key, data: correctPitch(take.data, take.sampleRate, settings) };
      pitchCache.set(take, cached);
    }
    return { ...take, data: cached.data };
  });
  return { ...track, takes };
}

async function correctedTake(take, settings) {
  if (!take.data?.length) return take;
  const key = `${settings.key}:${settings.scale}:${settings.amount}:${settings.speedMs}`;
  const cached = pitchCache.get(take);
  if (cached?.key === key) return { ...take, data: cached.data };
  if (typeof Worker === "undefined") {
    const data = correctPitch(take.data, take.sampleRate, settings);
    pitchCache.set(take, { key, data });
    return { ...take, data };
  }
  const copy = take.data.slice();
  const worker = new Worker(new URL("./pitch-worker.js", import.meta.url), { type: "module" });
  let data;
  try {
    data = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => event.data?.error
        ? reject(new Error(event.data.error))
        : resolve(new Float32Array(event.data));
      worker.onerror = (event) => reject(new Error(event.message || "Pitch correction worker failed"));
      worker.postMessage({ samples: copy.buffer, sampleRate: take.sampleRate, settings }, [copy.buffer]);
    });
  } catch {
    data = correctPitch(take.data, take.sampleRate, settings);
  } finally { worker.terminate(); }
  pitchCache.set(take, { key, data });
  return { ...take, data };
}

export async function correctedTracks(tracks) {
  const output = [];
  for (const track of tracks || []) {
    if (!track.pitch?.enabled) { output.push(track); continue; }
    const takes = [];
    for (const take of track.takes || []) takes.push(await correctedTake(take, track.pitch));
    output.push({ ...track, takes });
  }
  return output;
}
