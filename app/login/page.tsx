"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      window.location.href = "/";
      return;
    }
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not sign in.");
    setPassword("");
    setBusy(false);
  }

  return (
    <div className="login">
      <h1>🔒 Reddit Market Intelligence</h1>
      <p className="caption">Enter the team password to access this dashboard.</p>
      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="primary" type="submit" disabled={busy}>Sign in</button>
        {error && <div className="msg error">{error}</div>}
      </form>
    </div>
  );
}
