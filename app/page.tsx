"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Member } from "@/lib/supabase";
import Login from "@/components/Login";
import Onboard from "@/components/Onboard";
import Header from "@/components/Header";
import ShoppingList from "@/components/ShoppingList";
import Chores from "@/components/Chores";
import Expenses from "@/components/Expenses";
import Roommates from "@/components/Roommates";
import { useLedger } from "@/lib/ledger";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Membership is stored with the user it belongs to, so a different login never sees a stale one.
  const [membership, setMembership] = useState<{ userId: string; member: Member | null } | null>(null);

  // Track login state. supabase-js also finishes the magic-link login when the page loads with ?code=...
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
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
    content = <Login />;
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
        <button onClick={() => supabase.auth.signOut()} className="mt-10 text-sm text-muted underline">
          Sign out ({session.user.email})
        </button>
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
      </div>
    </>
  );
}
