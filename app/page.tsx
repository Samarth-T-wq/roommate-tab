"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Member } from "@/lib/supabase";
import Login from "@/components/Login";
import SetPassword from "@/components/SetPassword";
import Onboard from "@/components/Onboard";
import Header from "@/components/Header";
import ShoppingList from "@/components/ShoppingList";
import Chores from "@/components/Chores";
import Expenses from "@/components/Expenses";
import Roommates from "@/components/Roommates";
import MovieNight from "@/components/MovieNight";
import { useLedger } from "@/lib/ledger";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Membership is stored with the user it belongs to, so a different login never sees a stale one.
  const [authNotice, setAuthNotice] = useState("");
  const [membership, setMembership] = useState<{ userId: string; member: Member | null } | null>(null);

  // Track login state. supabase-js also finishes the magic-link login when the page loads with ?code=...
  useEffect(() => {
    // If we arrived from a login link that didn't work, say why instead of silently showing the form.
    const url = new URL(window.location.href);
    const linkError =
      url.searchParams.get("error_description") ?? new URLSearchParams(url.hash.slice(1)).get("error_description");
    const fromLink = Boolean(linkError) || url.searchParams.has("code");
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!fromLink) return;
      window.history.replaceState(null, "", "/");
      if (!data.session)
        setAuthNotice(
          (linkError ? `Login link didn't work: ${linkError}. ` : "That login link couldn't be used in this browser. ") +
            "Send a new email and type the code from it below, or open the link in the same browser you requested it from."
        );
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMember = (userId: string) =>
    fetchMember(userId).then((member) => setMembership({ userId, member }));

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) fetchMember(userId).then((member) => setMembership({ userId, member }));
  }, [userId]);
  const member = membership && membership.userId === userId ? membership.member : undefined;

  let content;
  if (session === undefined || (session && member === undefined)) {
    content = <p className="text-center text-sm text-muted">Loading…</p>;
  } else if (!session) {
    content = <Login notice={authNotice} />;
  } else if (!member) {
    content = <Onboard onDone={() => loadMember(session.user.id)} />;
  } else {
    content = <HouseholdView member={member} />;
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 pb-16">
      {!member && <h1 className="mb-6 text-4xl font-black tracking-tight">Roommate Tab</h1>}
      {content}
      {session && (
        <>
          <button onClick={() => supabase.auth.signOut()} className="mt-10 text-sm text-muted underline">
            Sign out ({session.user.email})
          </button>
          <SetPassword />
        </>
      )}
    </main>
  );
}

async function fetchMember(userId: string): Promise<Member | null> {
  const { data } = await supabase.from("members").select("*").eq("user_id", userId).limit(1);
  return data?.[0] ?? null;
}

// The main screen. Expense data is loaded once here so the roommate chips and the expense sections share it.
function HouseholdView({ member }: { member: Member }) {
  const ledger = useLedger(member.household_id);
  return (
    <>
      <Header householdId={member.household_id} />
      <Roommates me={member.id} members={ledger.members} nets={ledger.nets} />
      <div className="space-y-6">
        <ShoppingList member={member} />
        <Chores member={member} members={ledger.members} nets={ledger.nets} />
        <Expenses member={member} ledger={ledger} />
        <MovieNight member={member} members={ledger.members} nets={ledger.nets} />
      </div>
    </>
  );
}
