"use client";

import { useState } from "react";
import { CalendarDays, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Member } from "@/lib/supabase";
import { formatWhen, isOver, pollStatus, usePolls, type Poll } from "@/lib/polls";
import { Avatar, RemoveButton, Sheet } from "@/components/ui";

// Home's poll section: suggest a plan, everyone votes thumbs up/down, and it moves to Upcoming once enough say yes.
export default function Polls({ member, members }: { member: Member; members: Member[] }) {
  const me = member.id;
  const { polls, error, create, vote, remove } = usePolls(member.household_id, me);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(""); // datetime-local value, "" = no date
  const [needed, setNeeded] = useState(""); // "" = everyone
  const others = members.filter((m) => m.id !== me);
  const byId = (id: string) => members.find((m) => m.id === id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await create({
      title: title.trim(),
      happens_at: when ? new Date(when).toISOString() : null,
      needed: needed === "" ? null : Number(needed),
    });
    if (ok) {
      setTitle("");
      setWhen("");
      setNeeded("");
      setAdding(false);
    }
  }

  const shown = (polls ?? []).filter((p) => !isOver(p));

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="eyebrow mb-0">Polls</h2>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-sm font-medium text-primary">
          <Plus size={16} />
          New poll
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-neg">{error}</p>}
      {polls !== null && shown.length === 0 && !error && (
        <button onClick={() => setAdding(true)} className="card w-full py-6 text-center text-sm text-muted">
          Got an idea? Start a poll and see who&apos;s in.
        </button>
      )}

      <ul className="space-y-3">
        {shown.map((p) => (
          <PollCard
            key={p.id}
            poll={p}
            me={me}
            members={members}
            creator={byId(p.created_by)}
            onVote={(up) => vote(p, up)}
            onRemove={p.created_by === me ? () => remove(p) : undefined}
          />
        ))}
      </ul>

      <Sheet open={adding} onClose={() => setAdding(false)} title="New poll">
        <form onSubmit={submit} className="space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Grocery run tomorrow?"
            className="input"
          />
          <label className="block text-sm font-medium">
            When <span className="font-normal text-muted">(optional)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input mt-1.5" />
          </label>
          <label className="block text-sm font-medium">
            Goes to Upcoming when
            <select value={needed} onChange={(e) => setNeeded(e.target.value)} className="input mt-1.5">
              <option value="">Everyone says yes</option>
              {others.slice(0, -1).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} other {i === 0 ? "person says" : "people say"} yes
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted">You count as a yes. It shows in Upcoming for you and everyone who says yes.</p>
          <button className="btn w-full">Start poll</button>
        </form>
      </Sheet>
    </section>
  );
}

function PollCard({
  poll,
  me,
  members,
  creator,
  onVote,
  onRemove,
}: {
  poll: Poll;
  me: string;
  members: Member[];
  creator?: Member;
  onVote: (up: boolean) => void;
  onRemove?: () => void;
}) {
  const { yes, no, needed, yesOthers, passed } = pollStatus(poll, members);
  const mine = poll.poll_votes.find((v) => v.member_id === me)?.vote;
  const going = yes.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => Boolean(m));

  return (
    <li className="card">
      <div className="flex items-start gap-3">
        {creator && <Avatar member={creator} size={28} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{creator ? (creator.id === me ? "You asked" : `${creator.display_name} asked`) : "Someone asked"}</p>
          <p className="font-semibold">{poll.title}</p>
          {poll.happens_at && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays size={14} />
              {formatWhen(poll.happens_at)}
            </p>
          )}
        </div>
        {onRemove && <RemoveButton onClick={onRemove} label="Delete poll" />}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onVote(true)}
          aria-pressed={mine === true}
          aria-label="Thumbs up"
          className={`btn-soft ${mine === true ? "border-primary! bg-primary-soft! text-primary!" : ""}`}
        >
          <ThumbsUp size={16} />
          {yes.length}
        </button>
        <button
          onClick={() => onVote(false)}
          aria-pressed={mine === false}
          aria-label="Thumbs down"
          className={`btn-soft ${mine === false ? "border-neg! bg-neg-soft! text-neg!" : ""}`}
        >
          <ThumbsDown size={16} />
          {no.length}
        </button>
        <div className="ml-1 flex -space-x-1.5">
          {going.slice(0, 5).map((m) => (
            <span key={m.id} className="rounded-full ring-2 ring-card">
              <Avatar member={m} size={22} />
            </span>
          ))}
        </div>
        <span className="ml-auto text-right text-xs text-muted">
          {passed ? (
            <span className="badge bg-primary-soft text-primary">On · in Upcoming</span>
          ) : (
            `${yesOthers} of ${needed} yes`
          )}
        </span>
      </div>
    </li>
  );
}
