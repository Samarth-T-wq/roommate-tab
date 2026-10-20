"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import type { Member } from "@/lib/supabase";
import { setAvatar } from "@/lib/avatars";
import { Avatar } from "@/components/ui";

// Photos are set by roommates: you can change anyone's photo except your own.
// Shows my own photo (read-only) and a row per roommate with Change / Remove.
export default function RoommatePhotos({ me, members, onChanged }: { me: Member; members: Member[]; onChanged: () => void }) {
  const others = members.filter((m) => m.id !== me.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar member={me} size={64} />
        <p className="min-w-0 flex-1 text-sm text-muted">
          Your photo is picked by your roommates. You can set theirs below.
        </p>
      </div>
      {others.length > 0 && (
        <div>
          <h4 className="eyebrow">Roommates&apos; photos</h4>
          <ul className="space-y-1">
            {others.map((m) => (
              <PhotoRow key={m.id} target={m} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PhotoRow({ target, onChanged }: { target: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(file: File | null) {
    setBusy(true);
    setError("");
    try {
      await setAvatar(target, file);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the photo.");
    }
    setBusy(false);
  }

  return (
    <li className="py-1">
      <div className="flex items-center gap-3">
        <Avatar member={target} size={36} />
        <span className="min-w-0 flex-1 truncate font-medium">{target.display_name}</span>
        {/* A label around a hidden file input, so the whole button opens the photo picker (camera or library on phones). */}
        <label className={`btn-soft cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`} aria-label={`Change ${target.display_name}'s photo`}>
          <Camera size={16} />
          {busy ? "Saving…" : target.avatar_url ? "Change" : "Add"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so picking the same photo again still fires
              if (file) change(file);
            }}
          />
        </label>
        {target.avatar_url && (
          <button onClick={() => change(null)} disabled={busy} className="icon-btn hover:text-neg" aria-label={`Remove ${target.display_name}'s photo`}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-neg">{error}</p>}
    </li>
  );
}
