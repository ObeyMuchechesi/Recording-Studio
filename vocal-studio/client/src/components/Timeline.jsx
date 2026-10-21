import React, { useEffect, useRef } from "react";

export default function Timeline({ tracks, playhead, onSeek }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ppsec = 120;
  const scroll = Math.max(0, playhead - 4);

  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0e13"; ctx.fillRect(0, 0, w, h);

    const RULER = 24;
    ctx.fillStyle = "#121821"; ctx.fillRect(0, 0, w, RULER);

    const lanes = Math.max(1, tracks.length);
    const laneH = Math.min(80, (h - RULER - 8) / lanes);

    tracks.forEach((track, i) => {
      const y = RULER + 4 + i * laneH;
      const laneHh = laneH - 6;
      const cy = y + laneHh / 2;
      ctx.fillStyle = i % 2 ? "#0c1017" : "#0a0e14";
      ctx.fillRect(0, y - 2, w, laneHh + 2);
      for (const take of track.takes || []) {
        if (!take.peaks) continue;
        const x1 = (take.offset - scroll) * ppsec;
        const x2 = x1 + take.duration * ppsec;
        if (x2 < 0 || x1 > w) continue;
        const bx = Math.max(x1, 0);
        const bw = Math.min(x2, w) - bx;
        if (bw <= 0) continue;
        ctx.fillStyle = "#12202f";
        ctx.fillRect(bx, y, bw, laneHh);
        ctx.strokeStyle = "#1f4a6b"; ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, laneHh - 1);

        const peaks = take.peaks;
        const nb = peaks.length / 2;
        ctx.strokeStyle = "#5fd4a0"; ctx.beginPath();
        for (let px = Math.max(0, Math.floor(x1)); px < Math.min(w, Math.ceil(x2)); px++) {
          const tA = scroll + px / ppsec;
          const tB = scroll + (px + 1) / ppsec;
          let b0 = Math.floor((tA - take.offset) * take.sampleRate / 64);
          let b1 = Math.max(b0 + 1, Math.ceil((tB - take.offset) * take.sampleRate / 64));
          if (b0 < 0) b0 = 0; if (b1 > nb) b1 = nb;
          let mn = 1, mx = -1;
          for (let b = b0; b < b1; b++) {
            if (peaks[b * 2] < mn) mn = peaks[b * 2];
            if (peaks[b * 2 + 1] > mx) mx = peaks[b * 2 + 1];
          }
          if (mx < mn) continue;
          const amp = (laneHh / 2) * 0.88;
          ctx.moveTo(px + 0.5, cy - mx * amp);
          ctx.lineTo(px + 0.5, cy - mn * amp);
        }
        ctx.stroke();
      }
    });

    const px = (playhead - scroll) * ppsec;
    ctx.strokeStyle = "#5fd4a0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
  }, [tracks, playhead]);

  const handleClick = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    onSeek(scroll + (e.clientX - rect.left) / ppsec);
  };

  return (
    <div ref={wrapRef} className="flex-1 relative bg-[#0b0e13] overflow-hidden" onClick={handleClick}>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
    </div>
  );
}
