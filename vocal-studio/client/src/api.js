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

export const api = {
  register: (email, password) => req("POST", "/auth/register", { email, password }),
  login:    (email, password) => req("POST", "/auth/login", { email, password }),
  listSessions:      ()      => req("GET", "/sessions"),
  createSession:     (data)  => req("POST", "/sessions", data),
  getSession:        (id)    => req("GET", `/sessions/${id}`),
  updateSession:     (id, d) => req("PATCH", `/sessions/${id}`, d),
  deleteSession:     (id)    => req("DELETE", `/sessions/${id}`),
};
