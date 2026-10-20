"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";

// Small building blocks shared by every tab.

const AVATAR_COLORS = ["#4f46e5", "#0d9488", "#db2777", "#ea580c", "#7c3aed", "#0284c7"];

// Round initials badge; the color is stable per member.
export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// Bottom sheet on phones, centered panel on wide screens. Closes on the backdrop or Escape.
// Rendered into <body> so a parent with backdrop-blur (the sticky header) can't trap its fixed positioning.
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-3xl bg-card px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-ink sm:rounded-3xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-4 flex items-center">
          <h3 className="flex-1 text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// Floating "+" above the tab bar.
export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed right-[max(1rem,calc(50%-14rem))] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex h-13 w-13 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/30 active:scale-95"
    >
      <Plus size={24} />
    </button>
  );
}

// A delete button for the end of a row.
export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="icon-btn hover:text-neg" aria-label={label}>
      <X size={18} />
    </button>
  );
}
