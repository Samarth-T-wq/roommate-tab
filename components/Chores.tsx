"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, netColor, type Chore, type Member } from "@/lib/supabase";

// "2026-10-20" -> "Tue, Oct 20" (parsed as a local date, so it never shifts a day).
function formatDue(due: string) {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Chores({
  member,
  members,
  nets,
}: {
  member: Member;
  members: Member[];
  nets: Record<string, number>;
}) {
  const householdId = member.household_id;
  const me = member.id;
  const [chores, setChores] = useState<Chore[] | null>(null); // null = still loading
  const [error, setError] = useState("");
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(""); // "" = Anyone
  const [due, setDue] = useState("");

  const load = useCallback(
    () =>
      supabase
        .from("chores")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          setError(error ? `Couldn't load chores: ${error.message}` : "");
          setChores(data ?? []);
        }),
    [householdId]
  );

  // Reload whenever anyone adds, completes, or deletes a chore. DELETE events can't be filtered by column.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`chores-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chores", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chores", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chores" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  const who = (id: string) => <b className={netColor(nets[id] ?? 0)}>{nameOf(id)}</b>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("chores").insert({
      household_id: householdId,
      created_by: me,
      title: title.trim(),
      assigned_to: assignee || null,
      due_date: due || null,
    });
    if (error) return setError(error.message);
    setTitle("");
    setAssignee("");
    setDue("");
    load();
  }

  async function toggle(chore: Chore) {
    const changes = chore.done
      ? { done: false, done_by: null, done_at: null }
      : { done: true, done_by: me, done_at: new Date().toISOString() };
    // Update on screen right away, then save.
    setChores((chores ?? []).map((c) => (c.id === chore.id ? { ...c, ...changes } : c)));
    const { error } = await supabase.from("chores").update(changes).eq("id", chore.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("chores").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const today = new Date().toLocaleDateString("en-CA"); // local "YYYY-MM-DD"
  const shown = (chores ?? []).filter((c) => !mine || c.assigned_to === me);
  // To do: soonest due first, no due date last, then newest (the query already returns newest first).
  const todo = shown
    .filter((c) => !c.done)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const done = shown
    .filter((c) => c.done)
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  function dueLabel(c: Chore) {
    if (!c.due_date) return null;
    if (c.due_date < today) return <span className="font-bold text-neg">Overdue · {formatDue(c.due_date)}</span>;
    if (c.due_date === today) return <span className="rounded-full bg-sun px-2 font-bold text-ink">Due today</span>;
    return <span>Due {formatDue(c.due_date)}</span>;
  }

  function row(c: Chore) {
    return (
      <li key={c.id} className="flex items-center gap-2 border-t border-line first:border-t-0">
        <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2">
          <input type="checkbox" checked={c.done} onChange={() => toggle(c)} className="check" />
          <span className="min-w-0">
            <span className={`block truncate ${c.done ? "text-muted line-through" : "font-semibold text-ink"}`}>{c.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {c.done ? (
                <span>done by {c.done_by ? who(c.done_by) : "someone"}</span>
              ) : (
                <>
                  <span>{c.assigned_to ? who(c.assigned_to) : "Anyone"}</span>
                  {dueLabel(c)}
                </>
              )}
            </span>
          </span>
        </label>
        <button
          onClick={() => remove(c.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-page hover:text-neg"
          aria-label={`Delete ${c.title}`}
        >
          ✕
        </button>
      </li>
    );
  }

  return (
    <section className="card">
      <h2 className="section-title">✅ Chores</h2>

      <form onSubmit={add} className="mb-4 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a chore…" className="input" />
        <div className="grid grid-cols-2 gap-2">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input" aria-label="Assign to">
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me ? `${m.display_name} (me)` : m.display_name}
              </option>
            ))}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input" aria-label="Due date" />
        </div>
        <button className="btn w-full">Add</button>
      </form>

      <div className="mb-2 grid grid-cols-2 gap-1 rounded-2xl bg-page p-1">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            onClick={() => setMine(m)}
            className={`min-h-10 rounded-xl text-sm font-bold ${mine === m ? "bg-primary text-white" : "text-muted"}`}
          >
            {m ? "Mine" : "Everyone"}
          </button>
        ))}
      </div>

      {error && <p className="mb-2 text-sm font-bold text-neg">{error}</p>}
      {chores === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {chores !== null && !error && todo.length === 0 && (
        <p className="py-2 text-sm text-muted">{mine ? "Nothing assigned to you." : "No chores to do. 🎉"}</p>
      )}
      <ul>{todo.map(row)}</ul>

      {done.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-sm font-bold text-muted">Done</h3>
          <ul>{done.map(row)}</ul>
        </>
      )}
    </section>
  );
}
