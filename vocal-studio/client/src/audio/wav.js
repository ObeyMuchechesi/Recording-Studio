export function encodeWAV(channels, sampleRate, bitDepth = 24) {
  const numCh = channels.length;
  const chLen = channels[0].length;
  const bytesPer = bitDepth / 8;
  const blockAlign = numCh * bytesPer;
  const dataSize = chLen * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44;
  const cl = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
  if (bitDepth === 16) {
    for (let i = 0; i < chLen; i++)
      for (let c = 0; c < numCh; c++) {
        const s = cl(channels[c][i]);
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
      }
  } else {
    for (let i = 0; i < chLen; i++)
      for (let c = 0; c < numCh; c++) {
        const s = cl(channels[c][i]);
        const int = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(off, int & 0xff);
        v.setUint8(off + 1, (int >> 8) & 0xff);
        v.setUint8(off + 2, (int >> 16) & 0xff);
        off += 3;
      }
  }
  return new Blob([buf], { type: "audio/wav" });
}

export function blobToBase64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });
}

export async function decodeWAVBase64(b64, ctx) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buf = await ctx.decodeAudioData(bytes.buffer);
  return buf.getChannelData(0).slice();
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
