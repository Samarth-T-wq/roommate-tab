"use client";

import { useState, type ReactNode } from "react";
import { supabase, dollars, netColor, toCents, splitEvenly, type Member } from "@/lib/supabase";
import type { Ledger } from "@/lib/ledger";

// tone "plus" = owed to / paid to me (green, +), "minus" = I owe (red, -), "plain" = neither.
type Tone = "plus" | "minus" | "plain";
// `cents` is signed for netting: positive = they owe me, negative = I owe them.
type Item = { key: string; date: string; cents: number; tone: Tone; text: ReactNode };

function Money({ tone, cents, children }: { tone: Tone; cents: number; children: ReactNode }) {
  const color = tone === "plus" ? "text-pos" : tone === "minus" ? "text-neg" : "text-muted";
  const sign = tone === "plus" ? "+" : tone === "minus" ? "-" : "";
  return (
    <span>
      <b className={`tabular-nums ${color}`}>
        {sign}
        {dollars(Math.abs(cents))}
      </b>{" "}
      <span className="text-ink">{children}</span>
    </span>
  );
}

export default function Expenses({ member, ledger }: { member: Member; ledger: Ledger }) {
  const householdId = member.household_id;
  const me = member.id;
  const { members, expenses, settlements, nets, error, setError, load } = ledger;
  const [open, setOpen] = useState<string | null>(null);
  const [settle, setSettle] = useState<{ other: string; amount: string } | null>(null);

  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  // A name colored by that person's overall net.
  const who = (id: string) => <b className={netColor(nets[id] ?? 0)}>{nameOf(id)}</b>;

  // Everything between me and `other` that makes up our balance.
  function itemsWith(other: string): Item[] {
    const items: Item[] = [];
    for (const e of expenses) {
      for (const s of e.expense_splits) {
        if (e.paid_by === me && s.member_id === other)
          items.push({ key: e.id, date: e.created_at, cents: s.share_cents, tone: "plus", text: <>{who(other)} owes you · {e.description}</> });
        if (e.paid_by === other && s.member_id === me)
          items.push({ key: e.id, date: e.created_at, cents: -s.share_cents, tone: "minus", text: <>{who(me)} owe {who(other)} · {e.description}</> });
      }
    }
    for (const s of settlements) {
      if (s.from_member === other && s.to_member === me)
        items.push({ key: s.id, date: s.created_at, cents: -s.cents, tone: "plus", text: <>{who(other)} paid you</> });
      if (s.from_member === me && s.to_member === other)
        items.push({ key: s.id, date: s.created_at, cents: s.cents, tone: "plain", text: <>{who(me)} paid {who(other)}</> });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }

  const balances = members
    .filter((m) => m.id !== me)
    .map((m) => {
      const items = itemsWith(m.id);
      return { other: m, items, net: items.reduce((t, i) => t + i.cents, 0) };
    })
    .filter((b) => b.net !== 0);

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

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="section-title">💸 Balances</h2>
        {balances.length === 0 && <p className="text-sm text-muted">All settled up. Nice.</p>}
        <ul>
          {balances.map(({ other, items, net }) => (
            <li key={other.id} className="border-t border-line first:border-t-0">
              <div className="flex min-h-12 items-center gap-2">
                <button onClick={() => setOpen(open === other.id ? null : other.id)} className="min-w-0 flex-1 py-2 text-left">
                  {net > 0 ? (
                    <Money tone="plus" cents={net}>{who(other.id)} owes you</Money>
                  ) : (
                    <Money tone="minus" cents={net}>{who(me)} owe {who(other.id)}</Money>
                  )}
                  <span className="ml-1 text-xs text-muted">{open === other.id ? "▲" : "▼"}</span>
                </button>
                <button
                  onClick={() => setSettle({ other: other.id, amount: (Math.abs(net) / 100).toFixed(2) })}
                  className="btn-soft shrink-0 text-sm"
                >
                  Settle up
                </button>
              </div>

              {settle?.other === other.id && (
                <div className="mb-2 rounded-2xl bg-mint p-3">
                  <p className="mb-2 text-sm text-ink">
                    {net > 0 ? <>{who(other.id)} paid you</> : <>{who(me)} paid {who(other.id)}</>} (outside the app):
                  </p>
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={settle.amount}
                      onChange={(e) => setSettle({ ...settle, amount: e.target.value })}
                      className="input min-w-0"
                      aria-label="Amount in dollars"
                    />
                    <button onClick={() => confirmSettle(other.id, net)} className="btn shrink-0">Save</button>
                    <button onClick={() => setSettle(null)} className="shrink-0 px-2 text-sm text-muted" aria-label="Cancel">
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {open === other.id && (
                <ul className="mb-2 space-y-1 rounded-2xl bg-page p-3 text-sm">
                  {items.map((i) => (
                    <li key={i.key} className="truncate">
                      <Money tone={i.tone} cents={i.cents}>{i.text}</Money>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <AddExpense me={me} householdId={householdId} members={members} nets={nets} onAdded={load} onError={setError} />

      {error && <p className="text-sm font-bold text-neg">{error}</p>}

      <section className="card">
        <h2 className="section-title">History</h2>
        {history.length === 0 && <p className="text-sm text-muted">No expenses yet.</p>}
        <ul>
          {history.map((h) => (
            <li
              key={h.kind === "expense" ? h.e.id : h.s.id}
              className="flex items-center gap-2 border-t border-line py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                {h.kind === "expense" ? (
                  <>
                    <p className="truncate">
                      <b>{h.e.description}</b> · {who(h.e.paid_by)} paid <b>{dollars(h.e.total_cents)}</b>
                    </p>
                    <p className="truncate text-xs text-muted">
                      Split:{" "}
                      {h.e.expense_splits.map((s, i) => (
                        <span key={s.member_id}>
                          {i > 0 && ", "}
                          {who(s.member_id)}
                        </span>
                      ))}
                    </p>
                  </>
                ) : (
                  <p className="truncate">
                    {h.s.to_member === me ? (
                      <Money tone="plus" cents={h.s.cents}>{who(h.s.from_member)} paid you</Money>
                    ) : (
                      <Money tone="plain" cents={h.s.cents}>{who(h.s.from_member)} paid {who(h.s.to_member)}</Money>
                    )}
                  </p>
                )}
                <p className="text-xs text-muted">{new Date(h.date).toLocaleString()}</p>
              </div>
              <button
                onClick={() => (h.kind === "expense" ? remove("expenses", h.e.id) : remove("settlements", h.s.id))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-page hover:text-neg"
                aria-label="Delete"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
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
  nets,
  onAdded,
  onError,
}: {
  me: string;
  householdId: string;
  members: Member[];
  nets: Record<string, number>;
  onAdded: () => void;
  onError: (msg: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [payer, setPayer] = useState(me);
  // Track who is *un*checked, so everyone (including roommates who join later) starts checked.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const included = members.filter((m) => !excluded.includes(m.id));
  const totalCents = toCents(total);
  const even = totalCents ? splitEvenly(totalCents, included.length) : [];
  const customCents = included.map((m) => parseCents(amounts[m.id] ?? ""));
  const customSum = customCents.reduce<number>((t, c) => t + (c ?? 0), 0);
  const colorOf = (id: string) => netColor(nets[id] ?? 0);

  function toggleCustom() {
    // Start custom mode from the equal split so small tweaks are easy.
    if (!custom) setAmounts(Object.fromEntries(included.map((m, i) => [m.id, ((even[i] ?? 0) / 100).toFixed(2)])));
    setCustom(!custom);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return onError("Add a description.");
    if (totalCents === null) return onError("Enter a total greater than $0.");
    if (included.length === 0) return onError("Pick at least one person to split with.");
    if (custom && customCents.some((c) => c === null)) return onError("Custom amounts must be $0 or more.");
    if (custom && customSum !== totalCents)
      return onError(`Custom amounts add up to ${dollars(customSum)}, but the total is ${dollars(totalCents)}.`);

    const splits = included
      .map((m, i) => ({ member_id: m.id, share_cents: custom ? customCents[i]! : even[i] }))
      .filter((s) => s.share_cents > 0);

    setBusy(true);
    onError("");
    const { error } = await supabase.rpc("add_expense", {
      h_id: householdId,
      payer,
      descr: description.trim(),
      total: totalCents,
      splits,
    });
    setBusy(false);
    if (error) return onError(error.message);
    setDescription("");
    setTotal("");
    setPayer(me);
    setExcluded([]);
    setCustom(false);
    setAmounts({});
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="section-title">Add expense</h2>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it? e.g. Electric bill" className="input" />
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-muted">$</span>
        <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total" className="input" />
      </div>
      <label className="block text-sm">
        <span className="font-bold text-muted">Paid by</span>
        <select value={payer} onChange={(e) => setPayer(e.target.value)} className={`input mt-1 font-bold ${colorOf(payer)}`}>
          {members.map((m) => (
            <option key={m.id} value={m.id} className={colorOf(m.id)}>
              {m.id === me ? `${m.display_name} (me)` : m.display_name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1 font-bold text-muted">Split between</span>
          <button type="button" onClick={() => setExcluded([])} className="btn-soft py-1.5">Select all</button>
          <button type="button" onClick={() => setExcluded(members.map((m) => m.id))} className="btn-soft py-1.5">Clear</button>
        </div>
        <ul className="space-y-1">
          {members.map((m) => {
            const i = included.indexOf(m);
            return (
              <li key={m.id} className="flex items-center gap-2">
                <label className="flex min-h-12 flex-1 items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={i !== -1}
                    onChange={() =>
                      setExcluded(i === -1 ? excluded.filter((id) => id !== m.id) : [...excluded, m.id])
                    }
                    className="check"
                  />
                  <span className={colorOf(m.id)}>{m.display_name}</span>
                </label>
                {i !== -1 &&
                  (custom ? (
                    <input
                      inputMode="decimal"
                      value={amounts[m.id] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [m.id]: e.target.value })}
                      placeholder="0.00"
                      className="input w-24 text-right"
                    />
                  ) : (
                    <span className="text-sm tabular-nums text-muted">{even[i] !== undefined ? dollars(even[i]) : ""}</span>
                  ))}
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex items-center justify-between text-sm">
          <button type="button" onClick={toggleCustom} className="py-2 font-bold text-primary-hover underline">
            {custom ? "Split equally instead" : "Use custom amounts"}
          </button>
          {custom && totalCents !== null && (
            <span className={`font-bold ${customSum === totalCents ? "text-pos" : "text-neg"}`}>
              {customSum === totalCents ? "Adds up ✓" : `${dollars(totalCents - customSum)} left`}
            </span>
          )}
        </div>
      </div>

      <button disabled={busy} className="btn w-full">{busy ? "Saving…" : "Add expense"}</button>
    </form>
  );
}
