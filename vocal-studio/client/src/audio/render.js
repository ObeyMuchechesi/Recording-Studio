import { buildVocalStrip, buildReverbBus, buildMasterChain, prepareContext } from "./effects.js";
import { encodeWAV } from "./wav.js";

export async function renderMixdown({ tracks, masterFx, sampleRate, lengthSec }) {
  const length = Math.ceil(lengthSec * sampleRate) + 1;
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  await prepareContext(ctx);

  const master = buildMasterChain(ctx, masterFx || {});
  const reverb = buildReverbBus(ctx, { decay: 2.5, size: 1 });
  reverb.output.connect(master.input);

  const anySolo = tracks.some((t) => t.solo);

  for (const track of tracks) {
    const strip = buildVocalStrip(ctx, track.fx || {}, reverb);
    strip.output.connect(master.input);
    const aud = !track.mute && (!anySolo || track.solo);
    strip.setGain(aud ? (track.gain ?? 1) : 0);
    strip.setPan(track.pan ?? 0);
    strip.setSend(track.fx?.reverb?.on ? track.fx.reverb.mix : 0);

    const takes = new Map((track.takes || []).map((take) => [String(take.id), take]));
    for (const region of track.regions || []) {
      const take = takes.get(String(region.takeId));
      if (!take?.data) continue;
      const sourceStart = Math.max(0, Number(region.sourceStart) || 0);
      const sourceEnd = Math.min(take.duration ?? take.data.length / take.sampleRate,
        Number.isFinite(Number(region.sourceEnd)) ? Number(region.sourceEnd) : take.duration ?? take.data.length / take.sampleRate);
      const duration = sourceEnd - sourceStart;
      if (!(duration > 0)) continue;
      const timelineStart = Math.max(0, Number(region.timelineStart) || 0);
      const buf = ctx.createBuffer(1, take.data.length, take.sampleRate);
      buf.copyToChannel(take.data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const regionGain = (region.gain ?? 1) * (take.gain ?? 1) * (take.mute ? 0 : 1);
      const fadeIn = Math.min(Math.max(0, Number(region.fadeIn) || 0), duration / 2);
      const fadeOut = Math.min(Math.max(0, Number(region.fadeOut) || 0), duration / 2);
      g.gain.setValueAtTime(fadeIn > 0 ? 0 : regionGain, timelineStart);
      if (fadeIn > 0) g.gain.linearRampToValueAtTime(regionGain, timelineStart + fadeIn);
      if (fadeOut > 0) {
        g.gain.setValueAtTime(regionGain, timelineStart + duration - fadeOut);
        g.gain.linearRampToValueAtTime(0, timelineStart + duration);
      }
      src.connect(g).connect(strip.input);
      src.start(timelineStart, sourceStart, duration);
    }
  }

  const rendered = await ctx.startRendering();
  const L = rendered.getChannelData(0);
  const R = rendered.getChannelData(1);
  return encodeWAV([L, R], sampleRate, 24);
}

export async function renderTakeAsWAV(take) {
  const { data, sampleRate } = take;
  return encodeWAV([data], sampleRate, 24);
}
