// Roommates log in with a username; Supabase needs an email, so each username maps to an
// address on a domain that never receives mail. Admins log in with their real email.
export const USERNAME_DOMAIN = "roommate-tab.local";

// 3–20 characters: lowercase letters, numbers, dot, dash, underscore.
export const USERNAME_RULE = /^[a-z0-9._-]{3,20}$/;

// "Garv" -> "garv@roommate-tab.local"; anything with an "@" is already an email and is left alone.
export function loginEmail(usernameOrEmail: string) {
  const v = usernameOrEmail.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`;
}

// "garv@roommate-tab.local" -> "garv"; real emails are shown as they are.
export function loginName(email: string | undefined) {
  if (!email) return "";
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : email;
}
