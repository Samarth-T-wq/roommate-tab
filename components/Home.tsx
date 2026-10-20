"use client";

import { useState } from "react";
import { netColor, residentsOf, signedDollars, type Member } from "@/lib/supabase";
import { balanceWith, type Ledger } from "@/lib/ledger";
import { todayString, useChores } from "@/lib/chores";
import { Avatar } from "@/components/ui";
import { useRepeating, currentTurn } from "@/lib/repeating";
import { ChoreRow } from "@/components/Chores";
import { RepeatingRow, dueToday } from "@/components/Repeating";
import Polls from "@/components/Polls";

// The first tab: my overall balance, my balance with each roommate, polls, and what's due today.
export default function Home({
  member,
  ledger,
  onOpen,
}: {
  member: Member;
  ledger: Ledger;
  onOpen: (tab: "money" | "upcoming") => void;
}) {
  const me = member.id;
  const { members, nets, expenses, settlements } = ledger;
  const residents = residentsOf(members); // chores, rotations and polls; balances below include temps
  const { todo, toggle } = useChores(member.household_id, me);
  const repeating = useRepeating(member.household_id, me);
  const [mineOnly, setMineOnly] = useState(true);
  const myNet = nets[me] ?? 0;
  const others = members.filter((m) => m.id !== me);
  const today = todayString();
  // Due today or late; "Mine" means assigned to me, or to anyone.
  const due = todo.filter(
    (c) => c.due_date && c.due_date <= today && (!mineOnly || c.assigned_to === me || c.assigned_to === null)
  );
  const dueTurns = (repeating.tasks ?? []).filter(
    (t) => dueToday(t, residents, repeating.doneBy) && (!mineOnly || currentTurn(t, residents)?.who === me)
  );
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
                  <Avatar member={m} size={24} />
                  {m.display_name}
                  <b className={`font-semibold tabular-nums ${netColor(cents)}`}>{signedDollars(cents)}</b>
                </span>
              );
            })}
          </div>
        )}
      </button>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="eyebrow mb-0">Due today</h2>
          <div className="seg w-36 grid-cols-2 p-0.5">
            {[true, false].map((m) => (
              <button key={String(m)} onClick={() => setMineOnly(m)} aria-pressed={mineOnly === m} className="min-h-7! text-xs!">
                {m ? "Mine" : "Everyone"}
              </button>
            ))}
          </div>
        </div>
        {due.length + dueTurns.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">{mineOnly ? "Nothing due for you today." : "Nothing due today."}</div>
        ) : (
          <ul className="card p-0">
            {dueTurns.map((t) => (
              <RepeatingRow
                key={t.id}
                task={t}
                members={residents}
                me={me}
                doneBy={repeating.doneBy}
                onToggle={(occurrence) => repeating.toggle(t, occurrence)}
              />
            ))}
            {due.map((c) => (
              <ChoreRow key={c.id} chore={c} nameOf={nameOf} onToggle={() => toggle(c)} />
            ))}
          </ul>
        )}
        <button onClick={() => onOpen("upcoming")} className="mt-2 text-sm font-medium text-primary">
          See what&apos;s coming up
        </button>
      </section>

      <Polls member={member} members={residents} />
    </div>
  );
}
