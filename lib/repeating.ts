"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Member } from "@/lib/supabase";

export type Freq = "day" | "week" | "month";
export type RepeatingTask = {
  id: string;
  household_id: string;
  created_by: string;
  title: string;
  freq: Freq;
  every: number;
  starts_on: string; // "YYYY-MM-DD"
  rotation: string[]; // member ids, in turn order
  created_at: string;
};
type Done = { task_id: string; occurrence: string; done_by: string };

// The choices on the "how often" picker.
export const SCHEDULES: { label: string; freq: Freq; every: number }[] = [
  { label: "Every day", freq: "day", every: 1 },
  { label: "Every 2 days", freq: "day", every: 2 },
  { label: "Every week", freq: "week", every: 1 },
  { label: "Every 2 weeks", freq: "week", every: 2 },
  { label: "Every month", freq: "month", every: 1 },
];
export const scheduleLabel = (t: Pick<RepeatingTask, "freq" | "every">) =>
  SCHEDULES.find((s) => s.freq === t.freq && s.every === t.every)?.label ?? `Every ${t.every} ${t.freq}s`;

// Plain calendar dates, done in UTC so daylight saving never shifts a day.
const toUtc = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86_400_000);
const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  // Clamp to the month's last day (Jan 31 + 1 month = Feb 28).
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(y, m - 1 + n, Math.min(day, last)));
};

// Today's date as "YYYY-MM-DD". Until 5am still counts as the day before, so a 1am trash run counts for last night.
export const today = () => new Date(Date.now() - 5 * 3_600_000).toLocaleDateString("en-CA");

// The turn that `day` falls in: when it started and ends, whose it is, and who's next.
// Turns go round the rotation in order; a turn nobody ticked off still passes to the next person.
// Members who have left the household are skipped.
export function currentTurn(task: RepeatingTask, members: Member[], day = today()) {
  const people = task.rotation.filter((id) => members.some((m) => m.id === id));
  if (people.length === 0) return null;
  const start = (i: number) =>
    task.freq === "month" ? addMonths(task.starts_on, i * task.every) : addDays(task.starts_on, i * task.every * (task.freq === "week" ? 7 : 1));

  let index = 0;
  if (day >= task.starts_on) {
    if (task.freq === "month") {
      const [y1, m1] = task.starts_on.split("-").map(Number);
      const [y2, m2] = day.split("-").map(Number);
      index = Math.floor(((y2 - y1) * 12 + (m2 - m1)) / task.every);
      if (start(index) > day) index--; // not yet reached this month's start day
    } else {
      const period = task.every * (task.freq === "week" ? 7 : 1);
      index = Math.floor((toUtc(day) - toUtc(task.starts_on)) / (period * 86_400_000));
    }
  }
  const occurrence = start(index);
  const lastDay = addDays(start(index + 1), -1);
  return {
    occurrence,
    lastDay,
    upcoming: day < task.starts_on, // the very first turn hasn't started yet
    who: people[index % people.length],
    next: people[(index + 1) % people.length],
  };
}

// "today", "by Sun, Oct 25", or "starts Mon, Oct 26".
export function turnWhen(turn: NonNullable<ReturnType<typeof currentTurn>>, freq: Freq) {
  const fmt = (d: string) => new Date(toUtc(d)).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  if (turn.upcoming) return `starts ${fmt(turn.occurrence)}`;
  if (freq === "day" && turn.occurrence === turn.lastDay) return "today";
  return `by ${fmt(turn.lastDay)}`;
}

// A household's repeating tasks and which recent turns are done, kept live with realtime.
export function useRepeating(householdId: string, me: string) {
  const [tasks, setTasks] = useState<RepeatingTask[] | null>(null); // null = still loading
  const [done, setDone] = useState<Done[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        supabase.from("repeating_tasks").select("*").eq("household_id", householdId).order("created_at"),
        // Only recent turns matter (the longest turn is a month).
        supabase
          .from("repeating_done")
          .select("task_id, occurrence, done_by")
          .eq("household_id", householdId)
          .gte("occurrence", addDays(today(), -62)),
      ]).then(([t, d]) => {
        const err = t.error ?? d.error;
        setError(
          err
            ? /repeating/.test(err.message) && /exist|find/i.test(err.message)
              ? "Repeating tasks aren't set up yet: run supabase/repeating.sql."
              : err.message
            : ""
        );
        setTasks((t.data ?? []) as RepeatingTask[]);
        setDone((d.data ?? []) as Done[]);
      }),
    [householdId]
  );

  // Reload on any change. DELETE events can't be filtered by column.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`repeating-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "repeating_tasks", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "repeating_tasks" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "repeating_done", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "repeating_done" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  const doneBy = (taskId: string, occurrence: string) =>
    done.find((d) => d.task_id === taskId && d.occurrence === occurrence)?.done_by ?? null;

  // Tick the current turn off as me, or untick it.
  async function toggle(task: RepeatingTask, occurrence: string) {
    const existing = done.find((d) => d.task_id === task.id && d.occurrence === occurrence);
    // Update on screen right away, then save.
    setDone(existing ? done.filter((d) => d !== existing) : [...done, { task_id: task.id, occurrence, done_by: me }]);
    const { error } = existing
      ? await supabase.from("repeating_done").delete().eq("task_id", task.id).eq("occurrence", occurrence)
      : await supabase.from("repeating_done").insert({ household_id: householdId, task_id: task.id, occurrence, done_by: me });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function create(task: Pick<RepeatingTask, "title" | "freq" | "every" | "starts_on" | "rotation">) {
    const { error } = await supabase.from("repeating_tasks").insert({ household_id: householdId, created_by: me, ...task });
    if (error) {
      setError(error.message);
      return false;
    }
    load();
    return true;
  }

  async function remove(task: RepeatingTask) {
    if (!confirm(`Stop repeating "${task.title}"?`)) return;
    const { error } = await supabase.from("repeating_tasks").delete().eq("id", task.id);
    if (error) setError(error.message);
    else load();
  }

  return { tasks, doneBy, error, toggle, create, remove };
}
