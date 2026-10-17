# Roommate Tab

Tracks shared expenses and who owes who between roommates. It only keeps records; it never moves money.

- Next.js (App Router) + Tailwind, all data access in the browser via `supabase-js`.
- Security comes from the existing Supabase RLS policies.
- Env vars (in `.env.local` locally, and in Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

```
npm install
npm run dev   # http://localhost:3000
```

Supabase setup: add your site URLs under Authentication → URL Configuration, and enable Realtime on the `expenses`, `settlements` and `members` tables.
