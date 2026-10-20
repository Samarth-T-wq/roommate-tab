"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Expense, type ExpenseGuest, type Member, type Settlement } from "@/lib/supabase";

// Members, expenses (with splits), settlements and guest shares for a household, kept live with realtime.
// Members whose user is in `hiddenUserIds` (admin accounts) are left out of `members`, so they never show up
// in lists or pickers; their past expenses still count toward everyone's balances.
export function useLedger(householdId: string, hiddenUserIds: string[] = []) {
  const [allMembers, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [guests, setGuests] = useState<ExpenseGuest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      fetchLedger(householdId).then((d) => {
        setError(d.error);
        setMembers(d.members);
        setExpenses(d.expenses);
        setSettlements(d.settlements);
        setGuests(d.guests);
      }),
    [householdId]
  );

  // Reload on any change. DELETE events can't be filtered by column.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`ledger-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "expenses", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "expenses" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "settlements", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "settlements" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "members", filter }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "expense_guests", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "expense_guests", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "expense_guests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  const members = allMembers.filter((m) => !hiddenUserIds.includes(m.user_id));
  return { members, expenses, settlements, guests, error, setError, load, nets: netByMember(expenses, settlements) };
}

export type Ledger = ReturnType<typeof useLedger>;

// Each member's overall position: positive = others owe them, negative = they owe others.
// A settlement from A to B pays down A's debt, so it raises A's net and lowers B's. Nets always sum to 0.
export function netByMember(expenses: Expense[], settlements: Settlement[]): Record<string, number> {
  const net: Record<string, number> = {};
  const add = (id: string, cents: number) => (net[id] = (net[id] ?? 0) + cents);
  for (const e of expenses) {
    for (const s of e.expense_splits) {
      if (s.member_id === e.paid_by) continue;
      add(e.paid_by, s.share_cents);
      add(s.member_id, -s.share_cents);
    }
  }
  for (const s of settlements) {
    add(s.from_member, s.cents);
    add(s.to_member, -s.cents);
  }
  return net;
}

// What `other` owes me (positive) or I owe them (negative), from expenses between just us two and settlements.
export function balanceWith(me: string, other: string, expenses: Expense[], settlements: Settlement[]): number {
  let cents = 0;
  for (const e of expenses)
    for (const s of e.expense_splits) {
      if (e.paid_by === me && s.member_id === other) cents += s.share_cents;
      if (e.paid_by === other && s.member_id === me) cents -= s.share_cents;
    }
  for (const s of settlements) {
    if (s.from_member === other && s.to_member === me) cents -= s.cents;
    if (s.from_member === me && s.to_member === other) cents += s.cents;
  }
  return cents;
}

async function fetchLedger(householdId: string) {
  const [m, e, s, g] = await Promise.all([
    supabase.from("members").select("*").eq("household_id", householdId).order("display_name"),
    supabase
      .from("expenses")
      .select("*, expense_splits(member_id, share_cents)")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase.from("settlements").select("*").eq("household_id", householdId).order("created_at", { ascending: false }),
    supabase.from("expense_guests").select("*").eq("household_id", householdId).order("created_at"),
  ]);
  return {
    // Guest errors are left out: until supabase/guests.sql is run that table doesn't exist, and the rest still works.
    error: (m.error ?? e.error ?? s.error)?.message ?? "",
    members: (m.data ?? []) as Member[],
    expenses: (e.data ?? []) as Expense[],
    settlements: (s.data ?? []) as Settlement[],
    guests: (g.data ?? []) as ExpenseGuest[],
  };
}
