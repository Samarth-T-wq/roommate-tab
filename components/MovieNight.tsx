"use client";

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Sparkles, Star } from "lucide-react";
import { supabase, type Member, type Movie } from "@/lib/supabase";
import { CRITERIA, NO_CRITERIA, averageStars, movieKey, movieLabel, type Criteria, type Suggestion } from "@/lib/movies";

import { RemoveButton } from "@/components/ui";

// Five tappable stars; filled up to `value`.
function Stars({ value, onRate, label }: { value: number; onRate?: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          <button key={n} onClick={() => onRate(n)} className="flex h-9 w-8 items-center justify-center" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={n <= value}>
            <Star size={20} className={n <= value ? "fill-sun text-sun" : "text-line"} />
          </button>
        ) : (
          <Star key={n} size={12} className={n <= value ? "fill-sun text-sun" : "text-line"} />
        )
      )}
    </div>
  );
}

export default function MovieNight({ member, members }: { member: Member; members: Member[] }) {
  const householdId = member.household_id;
  const me = member.id;
  const [movies, setMovies] = useState<Movie[] | null>(null); // null = still loading
  const [error, setError] = useState("");
  const [ask, setAsk] = useState("");
  const [criteria, setCriteria] = useState<Criteria>(NO_CRITERIA);
  const [asking, setAsking] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");

  const load = useCallback(
    () =>
      supabase
        .from("movies")
        .select("*, movie_ratings(member_id, stars)")
        .eq("household_id", householdId)
        .order("watched_at", { ascending: false })
        .then(({ data, error }) => {
          setError(error ? `Couldn't load movies: ${error.message}` : "");
          setMovies((data ?? []) as Movie[]);
        }),
    [householdId]
  );

  // Reload whenever anyone logs, rates, or removes a movie. DELETE events can't be filtered by column.
  useEffect(() => {
    load();
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`movies-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "movies", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "movies" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "movie_ratings", filter }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "movie_ratings", filter }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "movie_ratings" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  const nameOf = (id: string) => (id === me ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  const canAsk = Boolean(ask.trim()) || Object.values(criteria).some((v) => v !== "any");
  const watchedKeys = new Set((movies ?? []).map((m) => movieKey(m.title, m.year)));

  async function recommend(e: React.FormEvent) {
    e.preventDefault();
    if (!canAsk) return;
    setAsking(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ request: ask.trim(), criteria }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setAsking(false);
    if (!res?.ok) return setError(body?.error ?? "Couldn't reach the movie AI. Check your connection.");
    setSuggestions(body.suggestions);
    if (body.suggestions.length === 0) setError("No new ideas for that. Try different words.");
  }

  async function logMovie(t: string, y: number | null) {
    const { error } = await supabase
      .from("movies")
      .insert({ household_id: householdId, added_by: me, title: t.trim(), year: y });
    // 23505 = unique violation: this title+year is already logged.
    if (error) return setError(error.code === "23505" ? `${movieLabel({ title: t, year: y })} is already logged.` : error.message);
    setError("");
    load();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1880 || y > 2100)) return setError("Year should look like 1999.");
    if (await logMovie(title, y)) {
      setTitle("");
      setYear("");
    }
  }

  // Tapping the star you already gave clears your rating.
  async function rate(movie: Movie, stars: number) {
    const current = movie.movie_ratings.find((r) => r.member_id === me)?.stars;
    const others = movie.movie_ratings.filter((r) => r.member_id !== me);
    // Update on screen right away, then save.
    setMovies((movies ?? []).map((m) =>
      m.id === movie.id ? { ...m, movie_ratings: current === stars ? others : [...others, { member_id: me, stars }] } : m
    ));
    const { error } =
      current === stars
        ? await supabase.from("movie_ratings").delete().eq("movie_id", movie.id).eq("member_id", me)
        : await supabase
            .from("movie_ratings")
            .upsert({ household_id: householdId, movie_id: movie.id, member_id: me, stars }, { onConflict: "movie_id,member_id" });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(movie: Movie) {
    if (!confirm(`Remove ${movieLabel(movie)} and everyone's ratings?`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", movie.id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={recommend} className="card space-y-3">
        <h2 className="font-semibold">What are you in the mood for?</h2>
        <div className="relative">
          <Sparkles size={18} className="pointer-events-none absolute top-3.5 left-3.5 text-muted" />
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={300}
            placeholder="Mood or keywords, e.g. funny horror"
            className="input pl-10"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CRITERIA) as (keyof Criteria)[]).map((k) => (
            <select
              key={k}
              value={criteria[k]}
              onChange={(e) => setCriteria({ ...criteria, [k]: e.target.value })}
              className={`input h-10 px-2 text-sm ${criteria[k] === "any" ? "text-muted" : "border-primary! font-medium"}`}
              aria-label={k}
            >
              {CRITERIA[k].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
        </div>
        <button disabled={asking || !canAsk} className="btn w-full">
          <Sparkles size={18} />
          {asking ? "Thinking…" : "Suggest movies"}
        </button>
        <p className="text-xs text-muted">Picks use everyone&apos;s ratings below. Rate more to get better ones.</p>
      </form>

      {error && <p className="text-sm font-medium text-neg">{error}</p>}

      {suggestions.length > 0 && (
        <section>
          <h2 className="eyebrow">Tonight&apos;s picks</h2>
          <ul className="card p-0">
            {suggestions.map((s) => {
              const logged = watchedKeys.has(movieKey(s.title, s.year));
              return (
                <li key={movieKey(s.title, s.year)} className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-muted">
                      {s.year && <>{s.year} · </>}
                      {s.why}
                    </p>
                  </div>
                  <button disabled={logged} onClick={() => logMovie(s.title, s.year)} className="btn-soft shrink-0">
                    {logged ? "Logged" : "Watched"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="eyebrow mb-0">Watched</h2>
          {movies && movies.length > 0 && <span className="text-sm text-muted">{movies.length} movies</span>}
        </div>
        <div className="card p-0">
          <form onSubmit={add} className="flex items-center gap-2 border-b border-line p-2 pl-4">
            <Clapperboard size={18} className="shrink-0 text-muted" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Log a movie"
              className="h-10 min-w-0 flex-1 border-0! bg-transparent! shadow-none!"
            />
            <input
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Year"
              className="input h-9 w-18 shrink-0 px-2 text-sm"
              aria-label="Year"
            />
            <button className="btn h-9 shrink-0 px-3 text-sm">Add</button>
          </form>

          {movies === null && <p className="p-4 text-sm text-muted">Loading…</p>}
          {movies?.length === 0 && <p className="p-4 text-sm text-muted">Nothing logged yet. Rate what you watch to build your taste profile.</p>}
          <ul>
            {(movies ?? []).map((m) => {
              const mine = m.movie_ratings.find((r) => r.member_id === me)?.stars ?? 0;
              const others = m.movie_ratings.filter((r) => r.member_id !== me);
              const avg = averageStars(m);
              return (
                <li key={m.id} className="flex items-start gap-2 border-t border-line py-3 pr-2 pl-4 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.title}
                      {m.year && <span className="ml-1.5 font-normal text-muted">{m.year}</span>}
                    </p>
                    <div className="-ml-1.5 flex items-center gap-2">
                      <Stars value={mine} onRate={(n) => rate(m, n)} label={`Your rating for ${m.title}`} />
                      {avg !== null && <span className="text-xs text-muted">avg {avg.toFixed(1)}</span>}
                    </div>
                    {others.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        {others.map((r) => (
                          <span key={r.member_id} className="flex items-center gap-1">
                            {nameOf(r.member_id)} <Stars value={r.stars} label={`${nameOf(r.member_id)}: ${r.stars} stars`} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <RemoveButton onClick={() => remove(m)} label={`Remove ${m.title}`} />
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
