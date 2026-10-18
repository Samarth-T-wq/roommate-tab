"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, netColor, type Member, type Movie } from "@/lib/supabase";
import { averageStars, movieKey, movieLabel, type Suggestion } from "@/lib/movies";

const IDEAS = ["funny horror", "cozy and feel-good", "mind-bending sci-fi", "90s action, nothing too long"];

export default function MovieNight({
  member,
  members,
  nets,
}: {
  member: Member;
  members: Member[];
  nets: Record<string, number>;
}) {
  const householdId = member.household_id;
  const me = member.id;
  const [movies, setMovies] = useState<Movie[] | null>(null); // null = still loading
  const [error, setError] = useState("");
  const [ask, setAsk] = useState("");
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
  const watchedKeys = new Set((movies ?? []).map((m) => movieKey(m.title, m.year)));

  async function recommend(e: React.FormEvent) {
    e.preventDefault();
    if (!ask.trim()) return;
    setAsking(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ request: ask.trim() }),
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
      <section className="card">
        <h2 className="section-title">🍿 Movie night</h2>
        <form onSubmit={recommend} className="space-y-2">
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={300}
            placeholder="What are you in the mood for?"
            className="input"
          />
          <div className="flex flex-wrap gap-1">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setAsk(idea)} className="btn-soft py-1 text-xs">
                {idea}
              </button>
            ))}
          </div>
          <button disabled={asking || !ask.trim()} className="btn w-full">
            {asking ? "Thinking…" : "Suggest movies"}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">Suggestions use everyone&apos;s ratings below. Rate more to get better picks.</p>

        {error && <p className="mt-3 text-sm font-bold text-neg">{error}</p>}

        {suggestions.length > 0 && (
          <ul className="mt-4">
            {suggestions.map((s) => {
              const logged = watchedKeys.has(movieKey(s.title, s.year));
              return (
                <li key={movieKey(s.title, s.year)} className="flex items-center gap-2 border-t border-line py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{movieLabel(s)}</p>
                    {s.why && <p className="text-sm text-muted">{s.why}</p>}
                  </div>
                  <button
                    disabled={logged}
                    onClick={() => logMovie(s.title, s.year)}
                    className="btn-soft shrink-0 text-sm"
                  >
                    {logged ? "Logged ✓" : "We watched it"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">🎬 Watched</h2>
        <form onSubmit={add} className="mb-4 flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Log a movie…" className="input min-w-0" />
          <input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Year"
            className="input w-20 shrink-0"
            aria-label="Year"
          />
          <button className="btn shrink-0">Add</button>
        </form>

        {movies === null && <p className="text-sm text-muted">Loading…</p>}
        {movies?.length === 0 && <p className="text-sm text-muted">Nothing logged yet. Rate what you watch to build your taste profile.</p>}
        <ul>
          {(movies ?? []).map((m) => {
            const mine = m.movie_ratings.find((r) => r.member_id === me)?.stars ?? 0;
            const others = m.movie_ratings.filter((r) => r.member_id !== me);
            const avg = averageStars(m);
            return (
              <li key={m.id} className="flex items-start gap-2 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {movieLabel(m)}
                    {avg !== null && <span className="ml-2 text-sm text-muted">avg {avg.toFixed(1)}★</span>}
                  </p>
                  <div className="flex items-center" role="group" aria-label={`Your rating for ${m.title}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => rate(m, n)}
                        className={`flex h-9 w-8 items-center justify-center text-xl ${n <= mine ? "text-sun" : "text-line"}`}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        aria-pressed={n <= mine}
                      >
                        ★
                      </button>
                    ))}
                    {!mine && <span className="ml-1 text-xs text-muted">rate it</span>}
                  </div>
                  {others.length > 0 && (
                    <p className="text-xs text-muted">
                      {others.map((r, i) => (
                        <span key={r.member_id}>
                          {i > 0 && " · "}
                          <b className={netColor(nets[r.member_id] ?? 0)}>{nameOf(r.member_id)}</b> {r.stars}★
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => remove(m)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-page hover:text-neg"
                  aria-label={`Remove ${m.title}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
