import type { Member, Movie } from "@/lib/supabase";

// One AI suggestion, as returned by /api/recommend.
export type Suggestion = { title: string; year: number | null; why: string };

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
