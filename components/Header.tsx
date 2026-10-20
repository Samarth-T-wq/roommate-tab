"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LogOut } from "lucide-react";
import { supabase, type Household, type Member } from "@/lib/supabase";
import { loginName } from "@/lib/usernames";
import { Avatar, Sheet } from "@/components/ui";
import SetPassword from "@/components/SetPassword";
import PhotoPicker from "@/components/PhotoPicker";

// Household name, plus the account button that opens my photo, invite code, password and sign out.
// `onChanged` reloads the household after I change my photo.
export default function Header({ member, email, onChanged }: { member: Member; email?: string; onChanged: () => void }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    supabase
      .from("households")
      .select("*")
      .eq("id", member.household_id)
      .single()
      .then(({ data }) => setHousehold(data));
  }, [member.household_id]);

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
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 bg-page/90 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">{household?.name ?? " "}</h1>
      <button onClick={() => setMenu(true)} aria-label="Account" className="rounded-full">
        <Avatar member={member} />
      </button>

      <Sheet open={menu} onClose={() => setMenu(false)} title={member.display_name}>
        <div className="space-y-5">
          <PhotoPicker member={member} onChanged={onChanged} />
          {household && (
            <div>
              <h4 className="eyebrow">Invite code</h4>
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-xl bg-subtle px-4 py-2.5 font-mono text-lg font-semibold tracking-widest">
                  {household.invite_code}
                </span>
                <button onClick={copyCode} className="btn-soft h-11">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 text-sm text-muted">Roommates enter this after their first sign-in.</p>
            </div>
          )}
          <SetPassword />
          <button onClick={() => supabase.auth.signOut()} className="btn-soft h-11 w-full text-neg">
            <LogOut size={16} />
            Sign out{email ? ` (${loginName(email)})` : ""}
          </button>
        </div>
      </Sheet>
    </header>
  );
}
