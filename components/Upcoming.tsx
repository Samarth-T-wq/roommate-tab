"use client";

import { useState } from "react";
import { CalendarCheck, Plus } from "lucide-react";
import type { Member } from "@/lib/supabase";
import { useChores } from "@/lib/chores";
import { useRepeating } from "@/lib/repeating";
import { formatWhen, isOver, pollStatus, usePolls } from "@/lib/polls";
import { Avatar } from "@/components/ui";
import { ChoreRow } from "@/components/Chores";
import { NewRepeatingSheet, RepeatingRow } from "@/components/Repeating";

// What's coming up: whose turn it is on each repeating task, plans I said yes to, and my chores with due dates.
export default function Upcoming({ member, members }: { member: Member; members: Member[] }) {
  const me = member.id;
  const householdId = member.household_id;
  const repeating = useRepeating(householdId, me);
  const { polls, error: pollError } = usePolls(householdId, me);
  const { todo, toggle } = useChores(householdId, me);
  const [adding, setAdding] = useState(false);
  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");

  // A poll becomes a plan once it passes, and it's only on my list if I said yes (the creator always has).
  const plans = (polls ?? [])
    .map((p) => ({ poll: p, ...pollStatus(p, members) }))
    .filter((p) => p.passed && p.yes.includes(me) && !isOver(p.poll))
    .sort((a, b) => (a.poll.happens_at ?? "9999").localeCompare(b.poll.happens_at ?? "9999"));
  const myChores = todo.filter((c) => c.due_date && (c.assigned_to === me || c.assigned_to === null));

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow mb-0">Repeating</h2>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-sm font-medium text-primary">
            <Plus size={16} />
            New
          </button>
        </div>
        {repeating.error && <p className="mb-2 text-sm text-neg">{repeating.error}</p>}
        {repeating.tasks?.length === 0 ? (
          <button onClick={() => setAdding(true)} className="card w-full py-6 text-center text-sm text-muted">
            Set up a rotation, like cleaning the bathroom every week, and it picks whose turn it is.
          </button>
        ) : (
          // Grouped by schedule so daily jobs sit together above weekly and monthly ones.
          (["day", "week", "month"] as const).map((freq) => {
            const group = (repeating.tasks ?? []).filter((t) => t.freq === freq);
            if (group.length === 0) return null;
            return (
              <div key={freq} className="mb-3">
                <h3 className="mb-1.5 text-xs font-medium text-muted">{freq === "day" ? "Daily" : freq === "week" ? "Weekly" : "Monthly"}</h3>
                <ul className="card p-0">
                  {group.map((t) => (
                    <RepeatingRow
                      key={t.id}
                      task={t}
                      members={members}
                      me={me}
                      doneBy={repeating.doneBy}
                      onToggle={(occurrence) => repeating.toggle(t, occurrence)}
                      onRemove={t.created_by === me ? () => repeating.remove(t) : undefined}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <NewRepeatingSheet open={adding} onClose={() => setAdding(false)} members={members} me={me} onCreate={repeating.create} />
      </section>

      <section>
        <h2 className="eyebrow">Plans</h2>
        {pollError && <p className="mb-2 text-sm text-neg">{pollError}</p>}
        {plans.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">
            Nothing planned yet. Polls from Home land here once enough people say yes.
          </div>
        ) : (
          <ul className="card p-0">
            {plans.map(({ poll, yes }) => (
              <li key={poll.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <CalendarCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{poll.title}</p>
                  <p className="text-sm text-muted">
                    {poll.happens_at ? formatWhen(poll.happens_at) : "No date yet"} · {yes.length} going
                  </p>
                </div>
                <div className="flex -space-x-1.5">
                  {yes
                    .map((id) => members.find((m) => m.id === id))
                    .filter((m): m is Member => Boolean(m))
                    .slice(0, 4)
                    .map((m) => (
                      <span key={m.id} className="rounded-full ring-2 ring-card">
                        <Avatar member={m} size={24} />
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="eyebrow">Your chores</h2>
        {myChores.length === 0 ? (
          <div className="card py-6 text-center text-sm text-muted">No chores with a due date for you.</div>
        ) : (
          <ul className="card p-0">
            {myChores.map((c) => (
              <ChoreRow key={c.id} chore={c} nameOf={nameOf} onToggle={() => toggle(c)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
