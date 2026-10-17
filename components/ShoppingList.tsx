"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Member, type ShoppingItem } from "@/lib/supabase";

export default function ShoppingList({ member }: { member: Member }) {
  const householdId = member.household_id;
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      supabase
        .from("shopping_items")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          setError(error?.message ?? "");
          setItems(data ?? []);
        }),
    [householdId]
  );

  // Reload whenever anyone adds, checks, or deletes an item. DELETE events can't be filtered by column.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`shopping-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shopping_items", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shopping_items", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shopping_items" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase
      .from("shopping_items")
      .insert({ household_id: householdId, added_by: member.id, name: name.trim() });
    if (error) return setError(error.message);
    setName("");
    load();
  }

  async function toggle(item: ShoppingItem) {
    // Flip it on screen right away, then save.
    setItems(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    const { error } = await supabase.from("shopping_items").update({ done: !item.done }).eq("id", item.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  // Still-needed items first, bought ones underneath.
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <section className="card">
      <h2 className="section-title">🛒 Shopping list</h2>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" className="input" />
        <button className="btn shrink-0">Add</button>
      </form>
      {error && <p className="mb-2 text-sm text-neg">{error}</p>}
      {items.length === 0 && <p className="text-sm text-muted">Nothing on the list.</p>}
      <ul>
        {sorted.map((item) => (
          <li key={item.id} className="flex items-center gap-2 border-t border-line first:border-t-0">
            <label className="flex min-h-12 flex-1 items-center gap-3 py-2">
              <input type="checkbox" checked={item.done} onChange={() => toggle(item)} className="check" />
              <span className={item.done ? "text-muted line-through" : "font-semibold"}>{item.name}</span>
            </label>
            <button
              onClick={() => remove(item.id)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-page hover:text-neg"
              aria-label={`Delete ${item.name}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
