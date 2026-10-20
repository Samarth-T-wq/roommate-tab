"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import type { Member } from "@/lib/supabase";
import { SCHEDULES, currentTurn, scheduleLabel, today, turnWhen, type RepeatingTask } from "@/lib/repeating";
import { Avatar, RemoveButton, Sheet } from "@/components/ui";

// One repeating task's current turn: checkbox, title, whose turn and when, and who's next. Shared by Home and Upcoming.
export function RepeatingRow({
  task,
  members,
  me,
  doneBy,
  onToggle,
  onRemove,
}: {
  task: RepeatingTask;
  members: Member[];
  me: string;
  doneBy: (taskId: string, occurrence: string) => string | null;
  onToggle: (occurrence: string) => void;
  onRemove?: () => void;
}) {
  const turn = currentTurn(task, members);
  if (!turn) return null;
  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  const who = members.find((m) => m.id === turn.who);
  const by = doneBy(task.id, turn.occurrence);
  const mine = turn.who === me;

  return (
    <li className="flex items-center gap-3 border-t border-line pr-2 pl-4 first:border-t-0">
      <label className="flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2">
        <input
          type="checkbox"
          checked={Boolean(by)}
          disabled={turn.upcoming}
          onChange={() => onToggle(turn.occurrence)}
          className="check disabled:opacity-40"
        />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${by ? "text-muted line-through" : "font-medium"}`}>{task.title}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            {by ? (
              `Done by ${nameOf(by)}`
            ) : (
              <>
                <span className={mine ? "font-medium text-primary" : ""}>{mine ? "Your turn" : `${nameOf(turn.who)}'s turn`}</span>
                <span>· {turnWhen(turn, task.freq)}</span>
              </>
            )}
            {turn.next !== turn.who && <span>· next {nameOf(turn.next)}</span>}
            {task.every > 1 && <span>· {scheduleLabel(task).toLowerCase()}</span>}
          </span>
        </span>
        {who && <Avatar member={who} size={28} />}
      </label>
      {onRemove && <RemoveButton onClick={onRemove} label={`Stop repeating ${task.title}`} />}
    </li>
  );
}

// True when a repeating task's current turn is due today (its last day is today) and nobody has done it yet.
export function dueToday(task: RepeatingTask, members: Member[], doneBy: (taskId: string, occurrence: string) => string | null) {
  const turn = currentTurn(task, members);
  return Boolean(turn && !turn.upcoming && turn.lastDay === today() && !doneBy(task.id, turn.occurrence));
}

const PRESETS = ["Clean the bathroom", "Clean the kitchen", "Take out the trash", "Vacuum", "Clean the sink"];

// Set up a repeating task: name, how often, when it starts, and who's in the rotation (in the order tapped).
export function NewRepeatingSheet({
  open,
  onClose,
  members,
  me,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  me: string;
  onCreate: (task: Pick<RepeatingTask, "title" | "freq" | "every" | "starts_on" | "rotation">) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState(2); // index into SCHEDULES; "Every week"
  const [startsOn, setStartsOn] = useState(today());
  const [rotation, setRotation] = useState<string[]>([]);
  const [error, setError] = useState("");

  const toggle = (id: string) => setRotation(rotation.includes(id) ? rotation.filter((x) => x !== id) : [...rotation, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give it a name.");
    if (rotation.length === 0) return setError("Pick at least one person for the rotation.");
    const { freq, every } = SCHEDULES[schedule];
    if (await onCreate({ title: title.trim(), freq, every, starts_on: startsOn, rotation })) {
      setTitle("");
      setRotation([]);
      setError("");
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New repeating task">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Clean the bathroom" className="input" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setTitle(p)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink">
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">
            How often
            <select value={schedule} onChange={(e) => setSchedule(Number(e.target.value))} className="input mt-1.5">
              {SCHEDULES.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Starts
            <input type="date" value={startsOn} onChange={(e) => e.target.value && setStartsOn(e.target.value)} className="input mt-1.5" />
          </label>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">
            Rotation <span className="font-normal text-muted">(tap in turn order)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const n = rotation.indexOf(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={n !== -1}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${
                    n !== -1 ? "border-primary bg-primary-soft" : "border-line text-muted"
                  }`}
                >
                  <Avatar member={m} size={24} />
                  {m.id === me ? "You" : m.display_name}
                  {n !== -1 && <span className="font-semibold text-primary tabular-nums">{n + 1}</span>}
                </button>
              );
            })}
          </div>
          {rotation.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              {members.find((m) => m.id === rotation[0])?.display_name} goes first, then it moves down the list each time.
            </p>
          )}
        </div>
        {error && <p className="text-sm font-medium text-neg">{error}</p>}
        <button className="btn w-full">
          <Repeat size={18} />
          Start rotation
        </button>
      </form>
    </Sheet>
  );
}

