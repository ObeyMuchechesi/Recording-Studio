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

    for (const take of track.takes || []) {
      if (!take.data) continue;
      const buf = ctx.createBuffer(1, take.data.length, take.sampleRate);
      buf.copyToChannel(take.data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = (take.gain ?? 1) * (take.mute ? 0 : 1);
      src.connect(g).connect(strip.input);
      src.start(take.offset);
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
