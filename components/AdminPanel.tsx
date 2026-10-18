"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Account = { username: string; created_at: string };

async function call(method: "GET" | "POST", body?: object) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body && JSON.stringify(body),
  }).catch(() => null);
  const json = await res?.json().catch(() => null);
  return { status: res?.status ?? 0, json };
}

// Create roommate logins and reset forgotten passwords. Renders nothing for non-admins.
export default function AdminPanel() {
  const [accounts, setAccounts] = useState<Account[] | null>(null); // null = not an admin (or still checking)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(
    () =>
      call("GET").then(({ status, json }) => {
        if (status === 200) setAccounts(json.accounts);
        // 500 = an admin, but the server is missing its secret key: show why instead of hiding the panel.
        else if (status === 500) {
          setAccounts([]);
          setError(json?.error ?? "Admin tools aren't working.");
        }
      }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(body: object, done: string) {
    setBusy(true);
    setError("");
    setInfo("");
    const { status, json } = await call("POST", body);
    setBusy(false);
    if (status !== 200) {
      setError(json?.error ?? "Something went wrong.");
      return false;
    }
    setInfo(done);
    load();
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim().toLowerCase();
    if (await run({ action: "create", username: name, password }, `Made "${name}". Send them their username and password.`)) {
      setUsername("");
      setPassword("");
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    if (await run({ action: "reset", username: resetFor, password: newPassword }, `New password set for "${resetFor}".`)) {
      setResetFor(null);
      setNewPassword("");
    }
  }

  if (accounts === null) return null;

  return (
    <section className="card mt-6">
      <h2 className="section-title">🔑 Admin: logins</h2>
      <form onSubmit={create} className="mb-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="input"
          />
          <input
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="input"
          />
        </div>
        <button disabled={busy} className="btn w-full">Create login</button>
      </form>

      {error && <p className="mb-2 text-sm font-bold text-neg">{error}</p>}
      {info && <p className="mb-2 rounded-2xl bg-mint p-3 text-sm text-ink">{info}</p>}

      {accounts.length === 0 && <p className="text-sm text-muted">No username logins yet.</p>}
      <ul>
        {accounts.map((a) => (
          <li key={a.username} className="border-t border-line py-2 first:border-t-0">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{a.username}</span>
              <button
                onClick={() => {
                  setResetFor(resetFor === a.username ? null : a.username);
                  setNewPassword("");
                }}
                className="btn-soft text-sm"
              >
                Reset password
              </button>
            </div>
            {resetFor === a.username && (
              <form onSubmit={reset} className="mt-2 flex gap-2">
                <input
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="input min-w-0"
                />
                <button disabled={busy} className="btn shrink-0">Save</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
