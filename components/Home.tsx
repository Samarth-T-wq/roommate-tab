"use client";

import { netColor, signedDollars, type Member } from "@/lib/supabase";
import { balanceWith, type Ledger } from "@/lib/ledger";
import { todayString, useChores } from "@/lib/chores";
import { Avatar } from "@/components/ui";
import { ChoreRow } from "@/components/Chores";
import ShoppingList from "@/components/ShoppingList";

// The first tab: my overall balance, my balance with each roommate, what's due, and the shopping list.
export default function Home({
  member,
  ledger,
  onOpen,
}: {
  member: Member;
  ledger: Ledger;
  onOpen: (tab: "money" | "chores") => void;
}) {
  const me = member.id;
  const { members, nets, expenses, settlements } = ledger;
  const { todo, toggle } = useChores(member.household_id, me);
  const myNet = nets[me] ?? 0;
  const others = members.filter((m) => m.id !== me);
  const today = todayString();
  const due = todo.filter((c) => c.due_date && c.due_date <= today);
  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");

  return (
    <div className="space-y-6">
      <button onClick={() => onOpen("money")} className="card block w-full p-5 text-left">
        <p className="text-sm text-muted">{myNet > 0 ? "Overall, you're owed" : myNet < 0 ? "Overall, you owe" : "Overall"}</p>
        <p className={`mt-0.5 text-4xl font-semibold tracking-tight tabular-nums ${netColor(myNet)}`}>
          {myNet === 0 ? "All settled" : signedDollars(myNet)}
        </p>
        {others.length > 0 && (
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
            {others.map((m) => {
              const cents = balanceWith(me, m.id, expenses, settlements);
              return (
                <span key={m.id} className="flex shrink-0 items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-sm">
                  <Avatar id={m.id} name={m.display_name} size={24} />
                  {m.display_name}
                  <b className={`font-semibold tabular-nums ${netColor(cents)}`}>{signedDollars(cents)}</b>
                </span>
              );
            })}
          </div>
        )}
      </button>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow mb-0">Due today</h2>
          <button onClick={() => onOpen("chores")} className="text-sm font-medium text-primary">
            All chores
          </button>
        </div>
        {due.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">Nothing due. Nice.</div>
        ) : (
          <ul className="card p-0">
            {due.map((c) => (
              <ChoreRow key={c.id} chore={c} nameOf={nameOf} onToggle={() => toggle(c)} />
            ))}
          </ul>
        )}
      </section>

      <ShoppingList member={member} />
    </div>
  );
}
