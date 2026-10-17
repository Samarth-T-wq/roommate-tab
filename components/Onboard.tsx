"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Onboard({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(rpc: "create_household" | "join_household", args: Record<string, string>) {
    if (!displayName.trim()) return setError("Enter your name first.");
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc(rpc, args);
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <label className="block text-sm font-medium">Your name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" className="input" />
      </div>

      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("create_household", { h_name: householdName.trim(), d_name: displayName.trim() });
        }}
      >
        <h2 className="text-xl font-extrabold">Create a household</h2>
        <input required value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Apartment 4B" className="input" />
        <button disabled={busy} className="btn w-full">Create</button>
      </form>

      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("join_household", { code: code.trim(), d_name: displayName.trim() });
        }}
      >
        <h2 className="text-xl font-extrabold">Join with an invite code</h2>
        <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" className="input" />
        <button disabled={busy} className="btn w-full">Join</button>
      </form>

      {error && <p className="text-sm font-bold text-neg">{error}</p>}
    </div>
  );
}
