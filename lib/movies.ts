import type { Member, Movie } from "@/lib/supabase";

// One AI suggestion, as returned by /api/recommend.
export type Suggestion = { title: string; year: number | null; why: string };

// The optional dropdowns on the Movie Night form. `prompt` is what the model is told; the first option means "no preference".
type Option = { value: string; label: string; prompt?: string; min?: number; max?: number };
export const CRITERIA = {
  era: [
    { value: "any", label: "Any era" },
    { value: "new", label: "New (2020+)", prompt: "released 2020 or later", min: 2020 },
    { value: "modern", label: "2000s–2010s", prompt: "released 2000–2019", min: 2000, max: 2019 },
    { value: "old", label: "Old (1970–99)", prompt: "released 1970–1999", min: 1970, max: 1999 },
    { value: "super-old", label: "Super old (pre-1970)", prompt: "released before 1970", max: 1969 },
  ],
  length: [
    { value: "any", label: "Any length" },
    { value: "short", label: "Under 90 min", prompt: "runtime under 90 minutes" },
    { value: "normal", label: "About 2 hours", prompt: "runtime roughly 90–130 minutes" },
    { value: "epic", label: "Long is fine", prompt: "long epics over 2.5 hours are welcome" },
  ],
  intensity: [
    { value: "any", label: "Any intensity" },
    { value: "light", label: "Light & easy", prompt: "light and easy to watch, nothing disturbing or heavy" },
    { value: "medium", label: "Some tension", prompt: "some tension or scares are fine, but nothing too graphic" },
    { value: "intense", label: "Intense", prompt: "intense, gripping or graphic is welcome" },
  ],
} satisfies Record<string, Option[]>;

export type Criteria = Record<keyof typeof CRITERIA, string>;
export const NO_CRITERIA: Criteria = { era: "any", length: "any", intensity: "any" };

// The chosen option for each dropdown, ignoring unknown values (the server never trusts the client's strings).
export function chosen(c: Partial<Criteria>) {
  return (Object.keys(CRITERIA) as (keyof Criteria)[])
    .map((k) => (CRITERIA[k] as Option[]).find((o) => o.value === c[k] && o.prompt))
    .filter((o): o is Option => Boolean(o));
}

// "Alien (1979)" or just "Alien".
export const movieLabel = (m: { title: string; year: number | null }) => (m.year ? `${m.title} (${m.year})` : m.title);

// Used to spot the same movie regardless of case or stray spaces.
export const movieKey = (title: string, year: number | null) => `${title.trim().toLowerCase()}|${year ?? ""}`;

export function averageStars(m: Movie): number | null {
  if (m.movie_ratings.length === 0) return null;
  return m.movie_ratings.reduce((t, r) => t + r.stars, 0) / m.movie_ratings.length;
}

// Plain-text summary of the household's taste, fed to the model.
// Lists what each roommate loved and disliked, plus everything already watched so it isn't suggested again.
export function tasteProfile(movies: Movie[], members: Member[]): string {
  if (movies.length === 0) return "No movies logged yet, so there is no taste history.";
  const lines: string[] = [];
  for (const member of members) {
    const mine = movies
      .map((m) => ({ m, stars: m.movie_ratings.find((r) => r.member_id === member.id)?.stars }))
      .filter((x): x is { m: Movie; stars: number } => x.stars !== undefined);
    const loved = mine.filter((x) => x.stars >= 4).map((x) => `${movieLabel(x.m)} ${x.stars}/5`);
    const disliked = mine.filter((x) => x.stars <= 2).map((x) => `${movieLabel(x.m)} ${x.stars}/5`);
    if (loved.length === 0 && disliked.length === 0) continue;
    lines.push(
      `${member.display_name}: loved ${loved.join(", ") || "nothing yet"}; disliked ${disliked.join(", ") || "nothing yet"}.`
    );
  }
  // Newest first, capped so the prompt stays small for households with a long history.
  const watched = movies.slice(0, 150).map(movieLabel).join("; ");
  return [...lines, `Already watched (do not suggest these): ${watched}.`].join("\n");
}
