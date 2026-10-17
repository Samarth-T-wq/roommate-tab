import { netColor, signedDollars, type Member } from "@/lib/supabase";

// One chip per member (me first) showing their overall net, color-coded.
export default function Roommates({ me, members, nets }: { me: string; members: Member[]; nets: Record<string, number> }) {
  const ordered = [...members].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  if (ordered.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold text-muted">Roommates</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {ordered.map((m) => {
          const net = nets[m.id] ?? 0;
          return (
            <div key={m.id} className="shrink-0 rounded-2xl bg-card px-4 py-2 text-center shadow-soft border border-line">
              <p className={`font-extrabold ${netColor(net)}`}>{m.id === me ? "You" : m.display_name}</p>
              <p className={`text-sm font-bold tabular-nums ${netColor(net)}`}>{signedDollars(net)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
