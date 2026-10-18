# Roommate Tab

Tracks shared expenses and who owes who between roommates. It only keeps records; it never moves money.

- Next.js (App Router) + Tailwind, all data access in the browser via `supabase-js`.
- Security comes from the existing Supabase RLS policies.
- Env vars (in `.env.local` locally, and in Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and for Movie Night `GROQ_API_KEY` (server-only, never prefix it with `NEXT_PUBLIC_`). Optional: `GROQ_MODEL` (default `llama-3.3-70b-versatile`).

```
npm install
npm run dev   # http://localhost:3000
```

Supabase setup: login is email + password. For instant sign-up with no confirmation email, turn off Authentication → Providers → Email → "Confirm email". Add your site URLs under Authentication → URL Configuration, and enable Realtime on the `expenses`, `settlements` and `members` tables.

Movie Night: run `supabase/movie_night.sql` once in the Supabase SQL editor. It creates the `movies` and `movie_ratings` tables, their RLS policies, and adds both to Realtime. Suggestions come from `app/api/recommend/route.ts`, which calls Groq with the household's ratings as a taste profile.

Logins: roommates sign in with a username and password (no email). Under the hood each username is a Supabase user with the address `<username>@roommate-tab.local`, which never receives mail. Admins sign in with their real email and pick the Admin tab on the login screen, then use "Manage logins" at the top of the page to create roommate logins and reset passwords.
- Vercel env vars: `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → secret key; server-only) and `ADMIN_EMAILS` (comma-separated, e.g. `a@x.com,b@y.com`).
- In Supabase → Authentication → Sign In / Providers, turn off "Allow new users to sign up" so only admins can make accounts.

