"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { Clapperboard, House, ListChecks, LogOut, Wallet, type LucideIcon } from "lucide-react";
import { supabase, type Member } from "@/lib/supabase";
import { loginName } from "@/lib/usernames";
import { useLedger } from "@/lib/ledger";
import Login from "@/components/Login";
import Onboard from "@/components/Onboard";
import Header from "@/components/Header";
import Home from "@/components/Home";
import Chores from "@/components/Chores";
import Expenses from "@/components/Expenses";
import MovieNight from "@/components/MovieNight";
import AdminPanel from "@/components/AdminPanel";

export default function Page() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Membership is stored with the user it belongs to, so a different login never sees a stale one.
  const [authNotice, setAuthNotice] = useState("");
  const [membership, setMembership] = useState<{ userId: string; member: Member | null } | null>(null);

  // Track login state. supabase-js also finishes the magic-link login when the page loads with ?code=...
  useEffect(() => {
    // If we arrived from a login link that didn't work, say why instead of silently showing the form.
    const url = new URL(window.location.href);
    let linkError =
      url.searchParams.get("error_description") ?? new URLSearchParams(url.hash.slice(1)).get("error_description");
    // Links from our email templates carry ?token_hash=...&type=..., which works in any browser
    // (unlike ?code=..., which only works in the browser that asked for the email).
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    const fromLink = Boolean(linkError) || url.searchParams.has("code") || Boolean(tokenHash);
    (tokenHash && type
      ? supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
          if (error) linkError = error.message;
        })
      : Promise.resolve()
    )
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        setSession(data.session);
        if (!fromLink) return;
        window.history.replaceState(null, "", "/");
        if (!data.session)
          setAuthNotice(
            (linkError ? `Login link didn't work: ${linkError}. ` : "That login link couldn't be used in this browser. ") +
              "Sign in with your username and password below."
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

  // Signed in and in a household: the tabbed app.
  if (session && member) return <HouseholdView member={member} email={session.user.email} />;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pt-12 pb-16">
      <h1 className="text-3xl font-semibold tracking-tight">Roommate Tab</h1>
      <p className="mt-1 mb-8 text-muted">Bills, chores, groceries and movie night for your place.</p>
      {session === undefined || (session && member === undefined) ? (
        <p className="text-center text-sm text-muted">Loading…</p>
      ) : !session ? (
        <Login notice={authNotice} />
      ) : (
        <div className="space-y-4">
          <Onboard onDone={() => loadMember(session.user.id)} />
          <AdminPanel />
          <button onClick={() => supabase.auth.signOut()} className="btn-soft h-11 w-full">
            <LogOut size={16} />
            Sign out ({loginName(session.user.email)})
          </button>
        </div>
      )}
    </main>
  );
}

async function fetchMember(userId: string): Promise<Member | null> {
  const { data } = await supabase.from("members").select("*").eq("user_id", userId).limit(1);
  return data?.[0] ?? null;
}

type Tab = "home" | "money" | "chores" | "movies";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "money", label: "Money", icon: Wallet },
  { id: "chores", label: "Chores", icon: ListChecks },
  { id: "movies", label: "Movies", icon: Clapperboard },
];

// The main screen: header, one tab at a time, and the tab bar.
// Expense data is loaded once here so Home's balances and the Money tab share it.
function HouseholdView({ member, email }: { member: Member; email?: string }) {
  const ledger = useLedger(member.household_id);
  // Reopen on the tab you were last on. This view only renders in the browser (after login), so reading storage here is safe.
  // Storage can be unavailable (private mode), so failures are ignored.
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem("tab");
      return TABS.find((t) => t.id === saved)?.id ?? "home";
    } catch {
      return "home";
    }
  });
  function open(t: Tab) {
    setTab(t);
    window.scrollTo(0, 0);
    try {
      localStorage.setItem("tab", t);
    } catch {}
  }

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <Header member={member} email={email} />
        {tab === "home" && <Home member={member} ledger={ledger} onOpen={open} />}
        {tab === "money" && <Expenses member={member} ledger={ledger} />}
        {tab === "chores" && <Chores member={member} members={ledger.members} />}
        {tab === "movies" && <MovieNight member={member} members={ledger.members} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => open(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium ${tab === id ? "text-primary" : "text-muted"}`}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.25 : 1.75} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
