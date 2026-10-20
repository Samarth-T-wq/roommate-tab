import { createClient } from "@supabase/supabase-js";

// Server-only helpers for admin features. Admins are the real emails listed in ADMIN_EMAILS.
// The secret key bypasses RLS, so nothing here may be imported by browser code.
const fail = (status: number, error: string) => Response.json({ error }, { status });

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// Supabase's "Invalid API key" doesn't say which key or what to do about it.
export const explain = (message: string) =>
  /invalid api key/i.test(message)
    ? "Supabase rejected SUPABASE_SECRET_KEY. In Vercel, paste the secret key (sb_secret_…) from this same Supabase project, with no quotes or spaces, then redeploy."
    : message;

export function adminClient() {
  // Pasted values often pick up quotes or a trailing newline.
  const key = process.env.SUPABASE_SECRET_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The caller, if their login token belongs to an admin.
export async function requireAdmin(request: Request) {
  const admins = adminEmails();
  const caller = await callerOf(request);
  if (!caller) return { error: fail(401, "Log in first.") };
  const email = caller.email?.toLowerCase();
  if (!email || !admins.includes(email)) return { error: fail(403, "Admins only.") };
  const supabase = adminClient();
  if (!supabase) return { error: fail(500, "Admin tools aren't set up: SUPABASE_SECRET_KEY is missing on the server.") };
  return { supabase };
}

// The logged-in user behind a request's Bearer token, checked with the public key.
export async function callerOf(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(token);
  return data.user;
}
