import React, { useEffect, useRef, useState } from "react";
import { detectPitch } from "../audio/pitch.js";

export default function Tuner({ analyser }) {
  const [note, setNote] = useState(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    let lastScan = 0;
    const tick = () => {
      const now = performance.now();
      if (now - lastScan >= 100) {
        lastScan = now;
        analyser.getFloatTimeDomainData(buf);
        setNote(detectPitch(buf, analyser.context.sampleRate));
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, [analyser]);

  const cents = note?.cents ?? 0;
  const left = Math.max(2, Math.min(98, 50 + cents / 2));
  return (
    <div className="p-3 border-t border-line text-center">
      <div className="text-[10px] tracking-widest text-dim uppercase mb-1">Pitch</div>
      <div className="font-mono text-2xl text-accent">{note?.name || "—"}</div>
      <div className="text-[10px] text-dim font-mono">
        {note ? `${cents > 0 ? "+" : ""}${cents} cents · ${note.freq.toFixed(1)} Hz` : "no signal"}
      </div>
      <div className="relative h-1.5 bg-[#0a0f16] border border-line rounded mt-2">
        <div className="absolute top-0 bottom-0 w-[3px] bg-accent" style={{ left: left + "%" }} />
      </div>
    </div>
  );
}
