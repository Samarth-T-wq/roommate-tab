"use client";

import { useState } from "react";
import type { Chore, Member } from "@/lib/supabase";
import { dueStatus, useChores } from "@/lib/chores";
import { Fab, RemoveButton, Sheet } from "@/components/ui";

const nameIn = (members: Member[], me: string) => (id: string) =>
  id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone";

// One chore line: checkbox, title, who, and how urgent. Shared by the Chores tab and Home.
export function ChoreRow({
  chore,
  nameOf,
  onToggle,
  onRemove,
}: {
  chore: Chore;
  nameOf: (id: string) => string;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const status = chore.done ? null : dueStatus(chore);
  return (
    <li className="flex items-center gap-3 border-t border-line px-4 first:border-t-0">
      <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2">
        <input type="checkbox" checked={chore.done} onChange={onToggle} className="check" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${chore.done ? "text-muted line-through" : "font-medium"}`}>{chore.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {chore.done
              ? `done by ${chore.done_by ? nameOf(chore.done_by) : "someone"}`
              : chore.assigned_to
                ? nameOf(chore.assigned_to)
                : "Anyone"}
            {status?.tone === "late" && <span className="badge bg-neg-soft text-neg">{status.text}</span>}
            {status?.tone === "today" && <span className="badge bg-sun-soft text-sun">{status.text}</span>}
            {status?.tone === "later" && <span>· {status.text}</span>}
          </span>
        </span>
      </label>
      {onRemove && <RemoveButton onClick={onRemove} label={`Delete ${chore.title}`} />}
    </li>
  );
}

export default function Chores({ member, members }: { member: Member; members: Member[] }) {
  const me = member.id;
  const { chores, todo, done, error, add, toggle, remove } = useChores(member.household_id, me);
  const [mine, setMine] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(""); // "" = Anyone
  const [due, setDue] = useState("");
  const nameOf = nameIn(members, me);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await add({ title: title.trim(), assigned_to: assignee || null, due_date: due || null })) {
      setTitle("");
      setAssignee("");
      setDue("");
      setAdding(false);
    }
  }

  const shownTodo = todo.filter((c) => !mine || c.assigned_to === me);
  const shownDone = done.filter((c) => !mine || c.assigned_to === me);

  return (
    <div className="space-y-6">
      <div className="seg grid-cols-2">
        {[false, true].map((m) => (
          <button key={String(m)} onClick={() => setMine(m)} aria-pressed={mine === m}>
            {m ? "Mine" : "Everyone"}
          </button>
        ))}
      </div>

      {error && <p className="text-sm font-medium text-neg">{error}</p>}

      <section>
        {chores === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {chores !== null && shownTodo.length === 0 && (
          <div className="card py-8 text-center text-sm text-muted">{mine ? "Nothing assigned to you." : "No chores to do."}</div>
        )}
        {shownTodo.length > 0 && (
          <ul className="card p-0">
            {shownTodo.map((c) => (
              <ChoreRow key={c.id} chore={c} nameOf={nameOf} onToggle={() => toggle(c)} onRemove={() => remove(c.id)} />
            ))}
          </ul>
        )}
      </section>

      {shownDone.length > 0 && (
        <section>
          <h2 className="eyebrow">Done</h2>
          <ul className="card p-0">
            {shownDone.map((c) => (
              <ChoreRow key={c.id} chore={c} nameOf={nameOf} onToggle={() => toggle(c)} onRemove={() => remove(c.id)} />
            ))}
          </ul>
        </section>
      )}

      <Fab onClick={() => setAdding(true)} label="Add chore" />
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add chore">
        <form onSubmit={submit} className="space-y-3">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take out recycling" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              Who
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input mt-1.5">
                <option value="">Anyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === me ? `${m.display_name} (me)` : m.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Due
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input mt-1.5" />
            </label>
          </div>
          <button className="btn w-full">Add chore</button>
        </form>
      </Sheet>
    </div>
  );
}
