import { createClient, type User } from "@supabase/supabase-js";
import { USERNAME_DOMAIN, USERNAME_RULE, loginEmail, loginName } from "@/lib/usernames";

// Admin-only account management. Admins are the real emails listed in ADMIN_EMAILS.
// Uses the Supabase secret key, which bypasses RLS, so it must never reach the browser.
const fail = (status: number, error: string) => Response.json({ error }, { status });

// Supabase's "Invalid API key" doesn't say which key or what to do about it.
const explain = (message: string) =>
  /invalid api key/i.test(message)
    ? "Supabase rejected SUPABASE_SECRET_KEY. In Vercel, paste the secret key (sb_secret_…) from this same Supabase project, with no quotes or spaces, then redeploy."
    : message;

function adminClient() {
  // Pasted values often pick up quotes or a trailing newline.
  const key = process.env.SUPABASE_SECRET_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The caller, if their login token belongs to an admin.
async function requireAdmin(request: Request) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { error: fail(401, "Log in first.") };
  // Check who's asking with the public key first, so non-admins never learn how the server is set up.
  const { data } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (!email || !admins.includes(email)) return { error: fail(403, "Admins only.") };
  const supabase = adminClient();
  if (!supabase) return { error: fail(500, "Admin tools aren't set up: SUPABASE_SECRET_KEY is missing on the server.") };
  return { supabase };
}

// Small households, so one page of users is plenty.
async function usernameAccounts(supabase: NonNullable<ReturnType<typeof adminClient>>) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { error: explain(error.message), users: [] as User[] };
  return { error: "", users: data.users.filter((u) => u.email?.endsWith(`@${USERNAME_DOMAIN}`)) };
}

export async function GET(request: Request) {
  const { supabase, error } = await requireAdmin(request);
  if (!supabase) return error;
  const list = await usernameAccounts(supabase);
  if (list.error) return fail(500, list.error);
  return Response.json({
    accounts: list.users
      .map((u) => ({ username: loginName(u.email), created_at: u.created_at }))
      .sort((a, b) => a.username.localeCompare(b.username)),
  });
}

// { action: "create" | "reset", username, password }
export async function POST(request: Request) {
  const { supabase, error } = await requireAdmin(request);
  if (!supabase) return error;

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!USERNAME_RULE.test(username))
    return fail(400, "Usernames are 3–20 characters: lowercase letters, numbers, dot, dash or underscore.");
  if (password.length < 6) return fail(400, "Passwords need at least 6 characters.");
  const email = loginEmail(username);

  if (body.action === "create") {
    // email_confirm: true marks it confirmed, so Supabase never tries to email the fake address.
    const { error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return fail(400, /already/i.test(error.message) ? `"${username}" is taken.` : explain(error.message));
    return Response.json({ ok: true });
  }

  if (body.action === "reset") {
    const list = await usernameAccounts(supabase);
    if (list.error) return fail(500, list.error);
    const user = list.users.find((u) => u.email === email);
    if (!user) return fail(404, `No account called "${username}".`);
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) return fail(400, explain(error.message));
    return Response.json({ ok: true });
  }

  return fail(400, "Unknown action.");
}
