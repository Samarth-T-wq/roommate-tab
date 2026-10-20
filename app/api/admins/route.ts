import { adminClient, adminEmails, callerOf } from "@/lib/admin-server";

// For any logged-in user: whether they're an admin, and which user ids are admins.
// Admin accounts are silent: the app shows them an admin screen instead of a household,
// and hides any household membership an admin already has from everyone else.
export async function GET(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return Response.json({ error: "Log in first." }, { status: 401 });
  const emails = adminEmails();
  const isAdmin = emails.includes(caller.email?.toLowerCase() ?? "");

  // Looking up the other admins' user ids needs the secret key; without it, hide nobody rather than fail.
  const supabase = adminClient();
  let adminUserIds: string[] = isAdmin ? [caller.id] : [];
  if (supabase) {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (data) adminUserIds = data.users.filter((u) => emails.includes(u.email?.toLowerCase() ?? "")).map((u) => u.id);
  }
  return Response.json({ isAdmin, adminUserIds });
}
