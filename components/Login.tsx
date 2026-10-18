"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { loginEmail } from "@/lib/usernames";

// Roommates type their username; admins type their real email. Accounts are made by an admin, so there's no sign-up.
export default function Login({ notice }: { notice?: string }) {
  const [admin, setAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
    if (error)
      setError(/invalid login/i.test(error.message) ? `Wrong ${admin ? "email" : "username"} or password.` : error.message);
    setBusy(false); // on success the page switches to the app by itself
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      {notice && <p className="rounded-2xl bg-mint p-3 text-sm text-ink">{notice}</p>}

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-page p-1">
        {[false, true].map((a) => (
          <button
            key={String(a)}
            type="button"
            onClick={() => {
              setAdmin(a);
              setUsername("");
              setError("");
            }}
            className={`min-h-10 rounded-xl text-sm font-bold ${admin === a ? "bg-primary text-white" : "text-muted"}`}
          >
            {a ? "Admin" : "Roommate"}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium">{admin ? "Admin email" : "Username"}</label>
      <input
        required
        type={admin ? "email" : "text"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete={admin ? "email" : "username"}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={admin ? "you@example.com" : "e.g. garv"}
        className="input"
      />

      <label className="block text-sm font-medium">Password</label>
      <input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input"
      />

      <button disabled={busy} className="btn w-full">
        {busy ? "One sec…" : "Sign in"}
      </button>
      {error && <p className="text-sm text-neg">{error}</p>}
      <p className="text-sm text-muted">
        {admin
          ? "After signing in, use Manage logins at the top to make roommate accounts."
          : "No account or forgot your password? Ask an admin to set one up."}
      </p>
    </form>
  );
}
