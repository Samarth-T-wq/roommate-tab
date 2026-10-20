"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import type { Member } from "@/lib/supabase";
import { setAvatar } from "@/lib/avatars";
import { Avatar } from "@/components/ui";

// My own profile photo: pick one (camera or library on phones), or remove it.
export default function PhotoPicker({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(file: File | null) {
    setBusy(true);
    setError("");
    try {
      await setAvatar(member, file);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your photo.");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar member={member} size={72} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* A label around a hidden file input, so the whole button opens the photo picker. */}
          <label className={`btn-soft cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
            <Camera size={16} />
            {busy ? "Saving…" : member.avatar_url ? "Change photo" : "Add photo"}
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
          {member.avatar_url && (
            <button onClick={() => change(null)} disabled={busy} className="btn-soft text-neg">
              <Trash2 size={16} />
              Remove
            </button>
          )}
        </div>
        {error ? <p className="text-sm text-neg">{error}</p> : <p className="text-sm text-muted">Everyone in the house sees it.</p>}
      </div>
    </div>
  );
}
