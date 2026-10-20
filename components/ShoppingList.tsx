"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase, type Member, type ShoppingItem } from "@/lib/supabase";
import { RemoveButton } from "@/components/ui";

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
  const left = items.filter((i) => !i.done).length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="eyebrow mb-0">Shopping list</h2>
        {items.length > 0 && <span className="text-sm text-muted">{left === 0 ? "All bought" : `${left} left`}</span>}
      </div>
      <div className="card p-0">
        <ul>
          {sorted.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b border-line px-4">
              <label className="flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2">
                <input type="checkbox" checked={item.done} onChange={() => toggle(item)} className="check" />
                <span className={`truncate ${item.done ? "text-muted line-through" : "font-medium"}`}>{item.name}</span>
              </label>
              <RemoveButton onClick={() => remove(item.id)} label={`Delete ${item.name}`} />
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex items-center gap-3 px-4">
          <Plus size={20} className="shrink-0 text-muted" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add an item"
            className="h-13 min-w-0 flex-1 border-0! bg-transparent! shadow-none!"
          />
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-neg">{error}</p>}
    </section>
  );
}
