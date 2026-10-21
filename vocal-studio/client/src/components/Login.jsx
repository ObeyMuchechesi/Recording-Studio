import React, { useState } from "react";
import { api, setToken } from "../api.js";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const r = mode === "login" ? await api.login(email, password)
                                 : await api.register(email, password);
      setToken(r.token);
      onAuth(r.user);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <form onSubmit={submit} className="bg-panel border border-line rounded-lg p-6 w-80 flex flex-col gap-3">
        <h1 className="text-accent font-bold tracking-widest text-sm">◆ VOCAL STUDIO</h1>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setMode("login")}
            className={`px-2 py-1 rounded ${mode === "login" ? "bg-accent text-black" : "bg-panel2"}`}>Sign in</button>
          <button type="button" onClick={() => setMode("register")}
            className={`px-2 py-1 rounded ${mode === "register" ? "bg-accent text-black" : "bg-panel2"}`}>Register</button>
        </div>
        <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {err && <div className="text-rec text-xs">{err}</div>}
        <button className="bg-accent text-black font-semibold py-1.5 rounded">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
