"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { CalendarDays, Clapperboard, House, ListChecks, LogOut, ShoppingCart, Wallet, type LucideIcon } from "lucide-react";
import { residentsOf, supabase, type Member } from "@/lib/supabase";
import { loginName } from "@/lib/usernames";
import { useLedger } from "@/lib/ledger";
import Login from "@/components/Login";
import Onboard from "@/components/Onboard";
import Header from "@/components/Header";
import Home from "@/components/Home";
import Chores from "@/components/Chores";
import Expenses from "@/components/Expenses";
import MovieNight from "@/components/MovieNight";
import ShoppingList from "@/components/ShoppingList";
import Upcoming from "@/components/Upcoming";
import AdminPanel from "@/components/AdminPanel";

export default function Page() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Membership is stored with the user it belongs to, so a different login never sees a stale one.
  const [authNotice, setAuthNotice] = useState("");
  const [membership, setMembership] = useState<({ userId: string } & Account) | null>(null);

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

  const loadMember = (userId: string) => fetchAccount(userId).then((a) => setMembership({ userId, ...a }));

  const userId = session?.user.id;
  useEffect(() => {
    if (userId) fetchAccount(userId).then((a) => setMembership({ userId, ...a }));
  }, [userId]);
  const account = membership && membership.userId === userId ? membership : undefined;
  const member = account?.member;

  // Admins are silent controllers: they only manage logins and never see or join a household.
  if (session && account?.isAdmin)
    return (
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pt-12 pb-16">
        <div className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-muted">
            Make a username login for each roommate, including yourself. This account stays hidden from the household.
          </p>
        </div>
        <AdminPanel defaultOpen />
        <SignOut email={session.user.email} />
      </main>
    );

  // Signed in and in a household: the tabbed app.
  if (session && member)
    return <HouseholdView member={member} email={session.user.email} hiddenUserIds={account.adminUserIds} />;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pt-12 pb-16">
      <h1 className="text-3xl font-semibold tracking-tight">Roommate Tab</h1>
      <p className="mt-1 mb-8 text-muted">Bills, chores, groceries and movie night for your place.</p>
      {session === undefined || (session && account === undefined) ? (
        <p className="text-center text-sm text-muted">Loading…</p>
      ) : !session ? (
        <Login notice={authNotice} />
      ) : (
        <div className="space-y-4">
          <Onboard onDone={() => loadMember(session.user.id)} />
          <SignOut email={session.user.email} />
        </div>
      )}
    </main>
  );
}

function SignOut({ email }: { email?: string }) {
  return (
    <button onClick={() => supabase.auth.signOut()} className="btn-soft h-11 w-full">
      <LogOut size={16} />
      Sign out ({loginName(email)})
    </button>
  );
}

type Account = { member: Member | null; isAdmin: boolean; adminUserIds: string[] };

// My household membership, plus whether I'm an admin and which accounts are admins (to hide them).
async function fetchAccount(userId: string): Promise<Account> {
  const { data: session } = await supabase.auth.getSession();
  const [{ data }, admins] = await Promise.all([
    supabase.from("members").select("*").eq("user_id", userId).limit(1),
    fetch("/api/admins", { headers: { Authorization: `Bearer ${session.session?.access_token ?? ""}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  return { member: data?.[0] ?? null, isAdmin: Boolean(admins?.isAdmin), adminUserIds: admins?.adminUserIds ?? [] };
}

type Tab = "home" | "money" | "chores" | "shopping" | "upcoming" | "movies";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "money", label: "Money", icon: Wallet },
  { id: "chores", label: "Chores", icon: ListChecks },
  { id: "shopping", label: "Shopping", icon: ShoppingCart },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "movies", label: "Movies", icon: Clapperboard },
];

// The main screen: header, one tab at a time, and the tab bar.
// Expense data is loaded once here so Home's balances and the Money tab share it.
function HouseholdView({ member, email, hiddenUserIds }: { member: Member; email?: string; hiddenUserIds: string[] }) {
  const ledger = useLedger(member.household_id, hiddenUserIds);
  // Money uses everyone (temps split bills too); chores, rotations, polls and movies use residents only.
  const residents = residentsOf(ledger.members);
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
        {/* My row from the live member list, so a new photo shows up right away. */}
        <Header member={ledger.members.find((m) => m.id === member.id) ?? member} email={email} onChanged={ledger.load} />
        {tab === "home" && <Home member={member} ledger={ledger} onOpen={open} />}
        {tab === "money" && <Expenses member={member} ledger={ledger} />}
        {tab === "chores" && <Chores member={member} members={residents} />}
        {tab === "shopping" && <ShoppingList member={member} />}
        {tab === "upcoming" && <Upcoming member={member} members={residents} />}
        {tab === "movies" && <MovieNight member={member} members={residents} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-6 px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => open(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium ${tab === id ? "text-primary" : "text-muted"}`}
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
