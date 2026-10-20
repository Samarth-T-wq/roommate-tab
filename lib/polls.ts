"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Member } from "@/lib/supabase";

export type Poll = {
  id: string;
  household_id: string;
  created_by: string;
  title: string;
  happens_at: string | null;
  needed: number | null; // yes votes needed besides the creator; null = everyone else
  created_at: string;
  poll_votes: { member_id: string; vote: boolean }[];
};

// Where a poll stands. The creator counts as a yes (their vote is cast when they create it),
// and it "passes" once enough of the others say yes. Then it's an event for everyone who said yes.
export function pollStatus(poll: Poll, members: Member[]) {
  const yes = poll.poll_votes.filter((v) => v.vote).map((v) => v.member_id);
  const no = poll.poll_votes.filter((v) => !v.vote).map((v) => v.member_id);
  const others = members.filter((m) => m.id !== poll.created_by).length;
  const needed = Math.min(poll.needed ?? others, others);
  const yesOthers = yes.filter((id) => id !== poll.created_by).length;
  const passed = yes.includes(poll.created_by) && yesOthers >= needed;
  return { yes, no, needed, yesOthers, passed };
}

// A plan dated before today is over; undated plans never expire on their own.
export const isOver = (poll: Poll) => {
  if (!poll.happens_at) return false;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  return new Date(poll.happens_at).getTime() < startOfToday;
};

// "Sat, Oct 24 · 6:00 PM"
export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// A household's polls with their votes, kept live with realtime, plus the actions on them.
export function usePolls(householdId: string, me: string) {
  const [polls, setPolls] = useState<Poll[] | null>(null); // null = still loading
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      supabase
        .from("polls")
        .select("*, poll_votes(member_id, vote)")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          setError(
            error ? (/polls/.test(error.message) && /exist|find/i.test(error.message) ? "Polls aren't set up yet: run supabase/polls.sql." : error.message) : ""
          );
          setPolls((data ?? []) as Poll[]);
        }),
    [householdId]
  );

  // Reload when anyone creates, votes on, or deletes a poll. DELETE events can't be filtered by column.
  // The channel name includes a random part because Home and Upcoming can each hold one.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`polls-${householdId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "polls", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "polls" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "poll_votes", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "poll_votes", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "poll_votes" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  async function create(poll: { title: string; happens_at: string | null; needed: number | null }) {
    const { data, error } = await supabase
      .from("polls")
      .insert({ household_id: householdId, created_by: me, ...poll })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      return false;
    }
    // The creator is in by default.
    await supabase.from("poll_votes").insert({ household_id: householdId, poll_id: data.id, member_id: me, vote: true });
    load();
    return true;
  }

  // Tapping the vote you already gave takes it back.
  async function vote(poll: Poll, up: boolean) {
    const current = poll.poll_votes.find((v) => v.member_id === me)?.vote;
    const others = poll.poll_votes.filter((v) => v.member_id !== me);
    // Update on screen right away, then save.
    setPolls((list) =>
      (list ?? []).map((p) =>
        p.id === poll.id ? { ...p, poll_votes: current === up ? others : [...others, { member_id: me, vote: up }] } : p
      )
    );
    const { error } =
      current === up
        ? await supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("member_id", me)
        : await supabase
            .from("poll_votes")
            .upsert({ household_id: householdId, poll_id: poll.id, member_id: me, vote: up }, { onConflict: "poll_id,member_id" });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(poll: Poll) {
    if (!confirm(`Delete the poll "${poll.title}"?`)) return;
    const { error } = await supabase.from("polls").delete().eq("id", poll.id);
    if (error) setError(error.message);
    else load();
  }

  return { polls, error, create, vote, remove };
}
