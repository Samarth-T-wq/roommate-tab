"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<"signin" | "signup" | "code">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      // No session means the project still requires email confirmation.
      else if (!data.session) setInfo(`Check ${email} to confirm your account, then sign in.`);
    } else if (!codeSent) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) setError(error.message);
      else setCodeSent(true);
    } else {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) setError(error.message);
    }
    setBusy(false); // on success the page switches to the app by itself
  }

  function switchTo(next: typeof mode) {
    setMode(next);
    setCodeSent(false);
    setError("");
    setInfo("");
  }

  const label =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : codeSent ? "Log in with code" : "Email me a code";

  return (
    <form onSubmit={submit} className="card space-y-3">
      {notice && <p className="rounded-2xl bg-mint p-3 text-sm text-ink">{notice}</p>}

      {mode !== "code" && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-page p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={`min-h-10 rounded-xl text-sm font-bold ${mode === m ? "bg-primary text-white" : "text-muted"}`}
            >
              {m === "signin" ? "Sign in" : "New here"}
            </button>
          ))}
        </div>
      )}

      <label className="block text-sm font-medium">Email</label>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="input"
      />

      {mode !== "code" && (
        <>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 6 characters" : ""}
            className="input"
          />
        </>
      )}

      {mode === "code" && codeSent && (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code from email"
          className="input text-center font-mono text-lg tracking-widest"
        />
      )}

      <button disabled={busy} className="btn w-full">
        {busy ? "One sec…" : label}
      </button>
      {error && <p className="text-sm text-neg">{error}</p>}
      {info && <p className="text-sm text-ink">{info}</p>}

      {/* Accounts made before passwords existed have none, so they can still get in with an email code. */}
      <button
        type="button"
        onClick={() => switchTo(mode === "code" ? "signin" : "code")}
        className="text-sm text-muted underline"
      >
        {mode === "code" ? "Use a password instead" : "No password yet? Email me a login code"}
      </button>
    </form>
  );
}
