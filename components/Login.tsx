"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { loginEmail } from "@/lib/usernames";

// Roommates sign in with a username + password an admin made for them.
// Admins sign in with their real email: Supabase emails them a login link and a code.
export default function Login({ notice }: { notice?: string }) {
  const [admin, setAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (!admin) {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
      if (error) setError(/invalid login/i.test(error.message) ? "Wrong username or password." : error.message);
    } else if (!codeSent) {
      // shouldCreateUser: false, so this only works for accounts that already exist.
      const { error } = await supabase.auth.signInWithOtp({
        email: username.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
      });
      if (error) setError(/signups not allowed|not found/i.test(error.message) ? "No admin account with that email." : error.message);
      else setCodeSent(true);
    } else {
      // Typing the code works in any browser, including the home-screen app, where email links never open.
      const { error } = await supabase.auth.verifyOtp({ email: username.trim(), token: code.trim(), type: "email" });
      if (error) setError(error.message);
    }
    setBusy(false); // on success the page switches to the app by itself
  }

  function switchTo(a: boolean) {
    setAdmin(a);
    setUsername("");
    setCode("");
    setCodeSent(false);
    setError("");
  }

  const label = !admin ? "Sign in" : codeSent ? "Log in with code" : "Email me a login link";

  return (
    <form onSubmit={submit} className="card space-y-3">
      {notice && <p className="rounded-2xl bg-mint p-3 text-sm text-ink">{notice}</p>}

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-page p-1">
        {[false, true].map((a) => (
          <button
            key={String(a)}
            type="button"
            onClick={() => switchTo(a)}
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
        disabled={admin && codeSent}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete={admin ? "email" : "username"}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={admin ? "you@example.com" : "e.g. garv"}
        className="input"
      />

      {!admin && (
        <>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </>
      )}

      {admin && codeSent && (
        <>
          <p className="text-sm text-muted">
            Check <b>{username.trim()}</b>. Tap the link in the email, or type the code from it here:
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code from email"
            className="input text-center font-mono text-lg tracking-widest"
          />
        </>
      )}

      <button disabled={busy} className="btn w-full">
        {busy ? "One sec…" : label}
      </button>
      {error && <p className="text-sm text-neg">{error}</p>}
      {admin && codeSent ? (
        <button type="button" onClick={() => switchTo(true)} className="text-sm text-muted underline">
          Use a different email
        </button>
      ) : (
        <p className="text-sm text-muted">
          {admin
            ? "After signing in, use Manage logins at the top to make roommate accounts."
            : "No account or forgot your password? Ask an admin to set one up."}
        </p>
      )}
    </form>
  );
}
