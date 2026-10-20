"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Lets a logged-in user set or change their password, e.g. after logging in with an email code.
export default function SetPassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setPassword("");
    setOpen(false);
    setSaved(true);
  }

  if (!open)
    return (
      <button
        onClick={() => {
          setOpen(true);
          setSaved(false);
        }}
        className="btn-soft h-11 w-full"
      >
        {saved ? <Check size={16} /> : <Lock size={16} />}
        {saved ? "Password saved" : "Change password"}
      </button>
    );

  return (
    <form onSubmit={save} className="space-y-2 rounded-2xl bg-subtle p-3">
      <label className="block text-sm font-medium">New password</label>
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 6 characters"
        className="input"
      />
      <div className="flex gap-2">
        <button disabled={busy} className="btn flex-1">
          {busy ? "Saving…" : "Save password"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-neg">{error}</p>}
    </form>
  );
}
