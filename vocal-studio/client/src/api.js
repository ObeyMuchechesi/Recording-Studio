const BASE = "/api";
let TOKEN = localStorage.getItem("vs_token") || "";

export function setToken(t) {
  TOKEN = t || "";
  if (t) localStorage.setItem("vs_token", t);
  else localStorage.removeItem("vs_token");
}
export function getToken() { return TOKEN; }

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.json();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function fetchAudioChunk(sessionId, takeKey, index) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/audio/${encodeURIComponent(takeKey)}/chunks/${index}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Audio download failed (${res.status})`);
  }
  return res.arrayBuffer();
}

export const api = {
  me:       ()              => req("GET", "/auth/me"),
  register: (email, password) => req("POST", "/auth/register", { email, password }),
  login:    (email, password) => req("POST", "/auth/login", { email, password }),
  listSessions:      ()      => req("GET", "/sessions"),
  createSession:     (data)  => req("POST", "/sessions", data),
  getSession:        (id)    => req("GET", `/sessions/${id}`),
  updateSession:     (id, d) => req("PATCH", `/sessions/${id}`, d),
  deleteSession:     (id)    => req("DELETE", `/sessions/${id}`),
  async uploadTakeAudio(sessionId, takeKey, blob) {
    const chunkSize = 1024 * 1024;
    const total = Math.ceil(blob.size / chunkSize);
    if (!total || total > 2048) throw new Error("A take must be smaller than 2 GB");
    for (let index = 0; index < total; index++) {
      const bytes = await blob.slice(index * chunkSize, Math.min(blob.size, (index + 1) * chunkSize)).arrayBuffer();
      await req("PUT", `/sessions/${sessionId}/audio/${encodeURIComponent(takeKey)}/chunks/${index}`, {
        total, data: arrayBufferToBase64(bytes),
      });
    }
    return req("POST", `/sessions/${sessionId}/audio/${encodeURIComponent(takeKey)}/complete`, {
      total, bytes: blob.size,
    });
  },
  async downloadTakeAudio(sessionId, takeKey, chunkCount) {
    const parts = new Array(chunkCount);
    // Keep a small concurrency window so long recordings do not open hundreds
    // of simultaneous serverless requests or buffer every response at once.
    for (let start = 0; start < chunkCount; start += 4) {
      const indexes = Array.from({ length: Math.min(4, chunkCount - start) }, (_, n) => start + n);
      const batch = await Promise.all(indexes.map((index) => fetchAudioChunk(sessionId, takeKey, index)));
      batch.forEach((part, offset) => { parts[start + offset] = part; });
    }
    return new Blob(parts, { type: "audio/wav" });
  },
};
