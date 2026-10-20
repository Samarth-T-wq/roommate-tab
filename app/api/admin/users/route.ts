import type { User } from "@supabase/supabase-js";
import { USERNAME_DOMAIN, USERNAME_RULE, loginEmail, loginName } from "@/lib/usernames";
import { adminClient, explain, requireAdmin } from "@/lib/admin-server";

// Admin-only account management. Admins are the real emails listed in ADMIN_EMAILS.
const fail = (status: number, error: string) => Response.json({ error }, { status });

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
