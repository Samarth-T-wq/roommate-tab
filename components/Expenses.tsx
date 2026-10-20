"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, Receipt } from "lucide-react";
import { supabase, dollars, toCents, splitEvenly, type Member } from "@/lib/supabase";
import type { Ledger } from "@/lib/ledger";
import { Avatar, Fab, RemoveButton, Sheet } from "@/components/ui";

// tone "plus" = owed to / paid to me (green, +), "minus" = I owe (red, -), "plain" = neither.
type Tone = "plus" | "minus" | "plain";
// `cents` is signed for netting: positive = they owe me, negative = I owe them.
type Item = { key: string; date: string; cents: number; tone: Tone; text: ReactNode };

const toneColor = (tone: Tone) => (tone === "plus" ? "text-pos" : tone === "minus" ? "text-neg" : "text-ink");

function Money({ tone, cents }: { tone: Tone; cents: number }) {
  const sign = tone === "plus" ? "+" : tone === "minus" ? "-" : "";
  return (
    <b className={`font-semibold whitespace-nowrap tabular-nums ${toneColor(tone)}`}>
      {sign}
      {dollars(Math.abs(cents))}
    </b>
  );
}

// "Today", "Yesterday", or "Oct 14" for grouping history.
function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Expenses({ member, ledger }: { member: Member; ledger: Ledger }) {
  const householdId = member.household_id;
  const me = member.id;
  const { members, expenses, settlements, error, setError, load } = ledger;
  const [open, setOpen] = useState<string | null>(null);
  const [settle, setSettle] = useState<{ other: string; amount: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");

  // Everything between me and `other` that makes up our balance.
  function itemsWith(other: string): Item[] {
    const items: Item[] = [];
    for (const e of expenses) {
      for (const s of e.expense_splits) {
        if (e.paid_by === me && s.member_id === other)
          items.push({ key: e.id, date: e.created_at, cents: s.share_cents, tone: "plus", text: e.description });
        if (e.paid_by === other && s.member_id === me)
          items.push({ key: e.id, date: e.created_at, cents: -s.share_cents, tone: "minus", text: e.description });
      }
    }
    for (const s of settlements) {
      if (s.from_member === other && s.to_member === me)
        items.push({ key: s.id, date: s.created_at, cents: -s.cents, tone: "plus", text: `${nameOf(other)} paid you` });
      if (s.from_member === me && s.to_member === other)
        items.push({ key: s.id, date: s.created_at, cents: s.cents, tone: "plain", text: `You paid ${nameOf(other)}` });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }

  const balances = members
    .filter((m) => m.id !== me)
    .map((m) => {
      const items = itemsWith(m.id);
      return { other: m, items, net: items.reduce((t, i) => t + i.cents, 0) };
    });

  async function confirmSettle(other: string, net: number) {
    const cents = toCents(settle?.amount ?? "");
    if (cents === null) return setError("Enter an amount greater than $0.");
    const [from, to] = net > 0 ? [other, me] : [me, other];
    setError("");
    const { error } = await supabase.rpc("add_settlement", { h_id: householdId, from_m: from, to_m: to, amt: cents });
    if (error) return setError(error.message);
    setSettle(null);
    load();
  }

  async function remove(table: "expenses" | "settlements", id: string) {
    if (!confirm(table === "expenses" ? "Delete this expense?" : "Delete this settlement?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const history = [
    ...expenses.map((e) => ({ kind: "expense" as const, date: e.created_at, e })),
    ...settlements.map((s) => ({ kind: "settlement" as const, date: s.created_at, s })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const days: { label: string; rows: typeof history }[] = [];
  for (const h of history) {
    const label = dayLabel(h.date);
    if (days.at(-1)?.label === label) days.at(-1)!.rows.push(h);
    else days.push({ label, rows: [h] });
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="eyebrow">Balances</h2>
        {balances.length === 0 && <div className="card py-6 text-center text-sm text-muted">No roommates yet. Share the invite code.</div>}
        <ul className="card p-0">
          {balances.map(({ other, items, net }) => (
            <li key={other.id} className="border-t border-line first:border-t-0">
              <div className="flex min-h-16 items-center gap-3 px-4">
                <Avatar id={other.id} name={other.display_name} />
                <button
                  onClick={() => setOpen(open === other.id ? null : other.id)}
                  disabled={items.length === 0}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <span className="block truncate font-medium">
                    {net > 0 ? `${other.display_name} owes you` : net < 0 ? `You owe ${other.display_name}` : other.display_name}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted">
                    {net === 0 ? "All settled" : `${items.length} item${items.length === 1 ? "" : "s"}`}
                    {items.length > 0 && <ChevronDown size={14} className={open === other.id ? "rotate-180" : ""} />}
                  </span>
                </button>
                {net === 0 ? (
                  <span className="badge bg-subtle text-muted">Even</span>
                ) : (
                  <>
                    <Money tone={net > 0 ? "plus" : "minus"} cents={net} />
                    <button
                      onClick={() => setSettle({ other: other.id, amount: (Math.abs(net) / 100).toFixed(2) })}
                      className="btn-soft"
                    >
                      Settle
                    </button>
                  </>
                )}
              </div>

              {settle?.other === other.id && (
                <div className="mx-4 mb-3 rounded-xl bg-subtle p-3">
                  <p className="mb-2 text-sm">
                    {net > 0 ? `${other.display_name} paid you` : `You paid ${other.display_name}`} (outside the app):
                  </p>
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={settle.amount}
                      onChange={(e) => setSettle({ ...settle, amount: e.target.value })}
                      className="input min-w-0"
                      aria-label="Amount in dollars"
                    />
                    <button onClick={() => confirmSettle(other.id, net)} className="btn shrink-0">
                      Save
                    </button>
                    <RemoveButton onClick={() => setSettle(null)} label="Cancel" />
                  </div>
                </div>
              )}

              {open === other.id && (
                <ul className="mx-4 mb-3 space-y-1.5 rounded-xl bg-subtle p-3 text-sm">
                  {items.map((i) => (
                    <li key={i.key} className="flex gap-3">
                      <span className="min-w-0 flex-1 truncate">{i.text}</span>
                      <Money tone={i.tone} cents={i.cents} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm font-medium text-neg">{error}</p>}

      <section>
        <h2 className="eyebrow">History</h2>
        {history.length === 0 && <div className="card py-6 text-center text-sm text-muted">No expenses yet. Tap + to add one.</div>}
        {days.map((day) => (
          <div key={day.label} className="mb-4">
            <h3 className="mb-1.5 text-xs font-medium text-muted">{day.label}</h3>
            <ul className="card p-0">
              {day.rows.map((h) => (
                <li key={h.kind === "expense" ? h.e.id : h.s.id} className="flex items-center gap-3 border-t border-line py-3 pr-2 pl-4 first:border-t-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                    {h.kind === "expense" ? <Receipt size={18} /> : <ArrowLeftRight size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {h.kind === "expense" ? (
                      <>
                        <p className="truncate font-medium">{h.e.description}</p>
                        <p className="truncate text-sm text-muted">
                          {nameOf(h.e.paid_by)} paid ·{" "}
                          {h.e.expense_splits.length === members.length
                            ? `split ${members.length} ways`
                            : h.e.expense_splits.map((s) => nameOf(s.member_id)).join(", ")}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="truncate font-medium">
                          {nameOf(h.s.from_member)} paid {h.s.to_member === me ? "you" : nameOf(h.s.to_member)}
                        </p>
                        <p className="text-sm text-muted">Settle up</p>
                      </>
                    )}
                  </div>
                  {h.kind === "expense" ? (
                    <b className="font-semibold tabular-nums">{dollars(h.e.total_cents)}</b>
                  ) : (
                    <Money tone={h.s.to_member === me ? "plus" : "plain"} cents={h.s.cents} />
                  )}
                  <RemoveButton
                    onClick={() => (h.kind === "expense" ? remove("expenses", h.e.id) : remove("settlements", h.s.id))}
                    label="Delete"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Fab onClick={() => setAdding(true)} label="Add expense" />
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add expense">
        <AddExpense
          me={me}
          householdId={householdId}
          members={members}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      </Sheet>
    </div>
  );
}

// "" -> 0, "4.5" -> 450, invalid or negative -> null
function parseCents(v: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function AddExpense({
  me,
  householdId,
  members,
  onAdded,
}: {
  me: string;
  householdId: string;
  members: Member[];
  onAdded: () => void;
}) {
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [payer, setPayer] = useState(me);
  // Track who is *un*checked, so everyone (including roommates who join later) starts checked.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const included = members.filter((m) => !excluded.includes(m.id));
  const totalCents = toCents(total);
  const even = totalCents ? splitEvenly(totalCents, included.length) : [];
  const customCents = included.map((m) => parseCents(amounts[m.id] ?? ""));
  const customSum = customCents.reduce<number>((t, c) => t + (c ?? 0), 0);

  function toggleCustom() {
    // Start custom mode from the equal split so small tweaks are easy.
    if (!custom) setAmounts(Object.fromEntries(included.map((m, i) => [m.id, ((even[i] ?? 0) / 100).toFixed(2)])));
    setCustom(!custom);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (totalCents === null) return setError("Enter a total greater than $0.");
    if (!description.trim()) return setError("Add a description.");
    if (included.length === 0) return setError("Pick at least one person to split with.");
    if (custom && customCents.some((c) => c === null)) return setError("Custom amounts must be $0 or more.");
    if (custom && customSum !== totalCents)
      return setError(`Custom amounts add up to ${dollars(customSum)}, but the total is ${dollars(totalCents)}.`);

    const splits = included
      .map((m, i) => ({ member_id: m.id, share_cents: custom ? customCents[i]! : even[i] }))
      .filter((s) => s.share_cents > 0);

    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("add_expense", {
      h_id: householdId,
      payer,
      descr: description.trim(),
      total: totalCents,
      splits,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onAdded();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-line px-3.5 focus-within:border-primary">
        <span className="text-3xl font-semibold text-muted">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="0.00"
          aria-label="Total"
          className="h-16 min-w-0 flex-1 border-0! bg-transparent! text-3xl font-semibold tabular-nums shadow-none!"
        />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it? e.g. Electric bill" className="input" />
      <label className="block text-sm font-medium">
        Paid by
        <select value={payer} onChange={(e) => setPayer(e.target.value)} className="input mt-1.5">
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me ? `${m.display_name} (me)` : m.display_name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Split between</span>
          <button type="button" onClick={toggleCustom} className="font-medium text-primary">
            {custom ? "Split equally" : "Custom amounts"}
          </button>
        </div>
        {custom ? (
          <ul className="space-y-2">
            {members.map((m) => {
              const i = included.indexOf(m);
              return (
                <li key={m.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={i !== -1}
                    onChange={() => setExcluded(i === -1 ? excluded.filter((id) => id !== m.id) : [...excluded, m.id])}
                    className="check"
                    aria-label={`Include ${m.display_name}`}
                  />
                  <span className="flex-1 font-medium">{m.display_name}</span>
                  {i !== -1 && (
                    <input
                      inputMode="decimal"
                      value={amounts[m.id] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [m.id]: e.target.value })}
                      placeholder="0.00"
                      className="input h-10 w-24 text-right tabular-nums"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          // Tap a person to include or leave them out.
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const i = included.indexOf(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={i !== -1}
                  onClick={() => setExcluded(i === -1 ? excluded.filter((id) => id !== m.id) : [...excluded, m.id])}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${
                    i !== -1 ? "border-primary bg-primary-soft" : "border-line text-muted opacity-60"
                  }`}
                >
                  <Avatar id={m.id} name={m.display_name} size={24} />
                  {m.id === me ? "You" : m.display_name}
                  {i !== -1 && even[i] !== undefined && <span className="text-muted tabular-nums">{dollars(even[i])}</span>}
                </button>
              );
            })}
          </div>
        )}
        {custom && totalCents !== null && (
          <p className={`mt-2 text-right text-sm font-medium ${customSum === totalCents ? "text-pos" : "text-neg"}`}>
            {customSum === totalCents ? "Adds up" : `${dollars(totalCents - customSum)} left`}
          </p>
        )}
      </div>

      {error && <p className="text-sm font-medium text-neg">{error}</p>}
      <button disabled={busy} className="btn h-12 w-full">
        {busy ? "Saving…" : "Add expense"}
      </button>
    </form>
  );
}
