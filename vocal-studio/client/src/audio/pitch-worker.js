import { correctPitch } from "./pitch.js";

self.onmessage = (event) => {
  try {
    const samples = new Float32Array(event.data.samples);
    const corrected = correctPitch(samples, event.data.sampleRate, event.data.settings);
    self.postMessage(corrected.buffer, [corrected.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || "Pitch correction failed" });
  }
};
