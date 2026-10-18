"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  // Typing the code from the email works in any browser, and can't be used up by email link scanners.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setError("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) setError(error.message);
    setStatus("sent"); // on success the page switches to the app by itself
  }

  if (status === "sent" || status === "verifying") {
    return (
      <form onSubmit={verify} className="card space-y-3">
        <p>
          Check <b>{email}</b> for a login email.
        </p>
        <p className="text-sm text-muted">
          Tap the link in it (open it in this same browser), or type the code from the email here:
        </p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code from email"
          className="input text-center font-mono text-lg tracking-widest"
        />
        <button disabled={status === "verifying" || !code.trim()} className="btn w-full">
          {status === "verifying" ? "Checking…" : "Log in with code"}
        </button>
        {error && <p className="text-sm text-neg">{error}</p>}
        <button type="button" onClick={() => setStatus("idle")} className="text-sm text-muted underline">
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      {notice && <p className="rounded-2xl bg-mint p-3 text-sm text-ink">{notice}</p>}
      <label className="block text-sm font-medium">Email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="input"
      />
      <button disabled={status === "sending"} className="btn w-full">
        {status === "sending" ? "Sending…" : "Send login email"}
      </button>
      {error && <p className="text-sm text-neg">{error}</p>}
    </form>
  );
}
