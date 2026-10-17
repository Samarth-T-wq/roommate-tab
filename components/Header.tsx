"use client";

import { useEffect, useState } from "react";
import { supabase, type Household } from "@/lib/supabase";

export default function Header({ householdId }: { householdId: string }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from("households")
      .select("*")
      .eq("id", householdId)
      .single()
      .then(({ data }) => setHousehold(data));
  }, [householdId]);

  // Browser tab title follows the household name.
  useEffect(() => {
    if (!household) return;
    document.title = household.name;
    return () => {
      document.title = "Roommate Tab";
    };
  }, [household]);

  function copyCode() {
    if (!household) return;
    navigator.clipboard?.writeText(household.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <header className="mb-6">
      <h1 className="truncate text-4xl font-black tracking-tight text-ink">{household?.name ?? " "}</h1>
      <div className="mt-1 h-1.5 w-16 rounded-full bg-sun" />
      {household && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          Invite code <span className="rounded-full bg-sun px-3 py-1 font-mono font-bold text-ink">{household.invite_code}</span>
          <button onClick={copyCode} className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-primary-hover">
            {copied ? "Copied!" : "Copy"}
          </button>
        </p>
      )}
    </header>
  );
}
