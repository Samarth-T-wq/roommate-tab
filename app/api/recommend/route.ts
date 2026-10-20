import { createClient } from "@supabase/supabase-js";
import type { Member, Movie } from "@/lib/supabase";
import { chosen, tasteProfile, type Suggestion } from "@/lib/movies";

// Server-only: the Groq key never reaches the browser. The caller's Supabase login is
// passed through, so RLS decides which household's movies we can read.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const MAX_REQUEST = 300;

const SYSTEM = `You recommend movies for a group of roommates picking something to watch tonight.
Use their request (mood, genre, keywords), their hard requirements, and their taste history: lean toward what they loved, away from what they disliked.
Every suggestion must meet all of the hard requirements. Only suggest real, released feature films. Never suggest anything in the "Already watched" list.
Reply with JSON only, shaped exactly like:
{"suggestions":[{"title":"string","year":1999,"why":"one short sentence tying it to their request and taste"}]}
Give 6 suggestions.`;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fail(500, "Movie suggestions aren't set up: GROQ_API_KEY is missing on the server.");

  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return fail(401, "Log in first.");

  const body = await request.json().catch(() => null);
  const ask = typeof body?.request === "string" ? body.request.trim() : "";
  const picks = chosen(body?.criteria ?? {});
  if (!ask && picks.length === 0) return fail(400, "Say what you're in the mood for, or pick an era, length or intensity.");
  if (ask.length > MAX_REQUEST) return fail(400, `Keep it under ${MAX_REQUEST} characters.`);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await supabase.auth.getUser(token);
  if (!auth.user) return fail(401, "Your login expired. Sign in again.");

  // Same rule as the main page: a user belongs to one household.
  const { data: me } = await supabase.from("members").select("*").eq("user_id", auth.user.id).limit(1);
  const member = me?.[0] as Member | undefined;
  if (!member) return fail(403, "Join a household first.");

  const [m, mv] = await Promise.all([
    supabase.from("members").select("*").eq("household_id", member.household_id),
    supabase
      .from("movies")
      .select("*, movie_ratings(member_id, stars)")
      .eq("household_id", member.household_id)
      .order("watched_at", { ascending: false }),
  ]);
  if (m.error || mv.error) return fail(500, (m.error ?? mv.error)!.message);
  const movies = (mv.data ?? []) as Movie[];

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              `Taste history:\n${tasteProfile(movies, (m.data ?? []) as Member[])}`,
              `Tonight's request: ${ask || "no specific mood, surprise us"}`,
              picks.length > 0 && `Hard requirements: ${picks.map((p) => p.prompt).join("; ")}.`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return fail(504, "The movie AI took too long. Try again.");
  }
  if (res.status === 429) return fail(429, "Too many requests to the movie AI. Wait a minute and try again.");
  // 404 = Groq doesn't have this model (they retire models), so say which one and how to change it.
  if (res.status === 404) return fail(502, `Groq doesn't offer the model "${MODEL}" anymore. Set GROQ_MODEL in Vercel to a current one.`);
  if (!res.ok) return fail(502, `The movie AI returned an error (${res.status}).`);

  const completion = await res.json();
  const suggestions = parseSuggestions(completion?.choices?.[0]?.message?.content);
  if (!suggestions) return fail(502, "The movie AI sent back something unreadable. Try again.");

  // The model sometimes ignores the "already watched" list or the era, so check both here too.
  // It's asked for 6 so there are still 5 left after dropping one.
  const watched = new Set(movies.map((x) => x.title.trim().toLowerCase()));
  const min = Math.max(...picks.map((p) => p.min ?? 0));
  const max = Math.min(...picks.map((p) => p.max ?? 9999));
  return Response.json({
    suggestions: suggestions
      .filter((s) => !watched.has(s.title.toLowerCase()))
      .filter((s) => s.year === null || (s.year >= min && s.year <= max))
      .slice(0, 5),
  });
}

function parseSuggestions(content: unknown): Suggestion[] | null {
  if (typeof content !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const list = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return null;
  return list
    .filter((s) => typeof s?.title === "string" && s.title.trim())
    .slice(0, 8)
    .map((s) => ({
      title: String(s.title).trim().slice(0, 200),
      year: Number.isInteger(s.year) && s.year >= 1880 && s.year <= 2100 ? s.year : null,
      why: typeof s.why === "string" ? s.why.trim().slice(0, 300) : "",
    }));
}
