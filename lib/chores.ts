"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Chore } from "@/lib/supabase";

// "2026-10-20" -> "Tue, Oct 20" (parsed as a local date, so it never shifts a day).
export function formatDue(due: string) {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Whole days between two "YYYY-MM-DD" dates.
function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

export const todayString = () => new Date().toLocaleDateString("en-CA"); // local "YYYY-MM-DD"

// How urgent a chore is, for its badge: overdue, today, or a later date.
export function dueStatus(c: Chore, today = todayString()) {
  if (!c.due_date) return null;
  if (c.due_date < today) {
    const late = daysBetween(c.due_date, today);
    return { tone: "late" as const, text: late === 1 ? "1 day late" : `${late} days late` };
  }
  if (c.due_date === today) return { tone: "today" as const, text: "Today" };
  return { tone: "later" as const, text: formatDue(c.due_date) };
}

// A household's chores, kept live with realtime, plus the actions on them.
export function useChores(householdId: string, me: string) {
  const [chores, setChores] = useState<Chore[] | null>(null); // null = still loading
  const [error, setError] = useState("");

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
  // The channel name includes a random part because Home and the Chores tab can each hold one.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`chores-${householdId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chores", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chores", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chores" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  async function add(chore: { title: string; assigned_to: string | null; due_date: string | null }) {
    const { error } = await supabase.from("chores").insert({ household_id: householdId, created_by: me, ...chore });
    if (error) {
      setError(error.message);
      return false;
    }
    load();
    return true;
  }

  async function toggle(chore: Chore) {
    const changes = chore.done
      ? { done: false, done_by: null, done_at: null }
      : { done: true, done_by: me, done_at: new Date().toISOString() };
    // Update on screen right away, then save.
    setChores((list) => (list ?? []).map((c) => (c.id === chore.id ? { ...c, ...changes } : c)));
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

  // To do: soonest due first, no due date last, then newest (the query already returns newest first).
  const todo = (chores ?? [])
    .filter((c) => !c.done)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const done = (chores ?? []).filter((c) => c.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  return { chores, todo, done, error, add, toggle, remove };
}
