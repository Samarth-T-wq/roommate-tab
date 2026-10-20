# Roommate Tab

Tracks shared expenses and who owes who between roommates. It only keeps records; it never moves money.
- Next.js (App Router) + Tailwind, all data access in the browser via `supabase-js`.
- Security comes from the existing Supabase RLS policies.
- Env vars (in `.env.local` locally, and in Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and for Movie Night `GROQ_API_KEY` (server-only, never prefix it with `NEXT_PUBLIC_`). Optional: `GROQ_MODEL` (default `openai/gpt-oss-120b`; see console.groq.com/docs/models).

```
npm install
npm run dev   # http://localhost:3000
```

Supabase setup: login is email + password. For instant sign-up with no confirmation email, turn off Authentication → Providers → Email → "Confirm email". Add your site URLs under Authentication → URL Configuration, and enable Realtime on the `expenses`, `settlements` and `members` tables.

Movie Night: run `supabase/movie_night.sql` once in the Supabase SQL editor. It creates the `movies` and `movie_ratings` tables, their RLS policies, and adds both to Realtime. Suggestions come from `app/api/recommend/route.ts`, which calls Groq with the household's ratings as a taste profile.

Logins: roommates sign in with a username and password (no email). Under the hood each username is a Supabase user with the address `<username>@roommate-tab.local`, which never receives mail. Admins sign in with their real email and pick the Admin tab on the login screen, then use "Manage logins" at the top of the page to create roommate logins and reset passwords.
- Vercel env vars: `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → secret key; server-only) and `ADMIN_EMAILS` (comma-separated, e.g. `a@x.com,b@y.com`).
- In Supabase → Authentication → Sign In / Providers, turn off "Allow new users to sign up" so only admins can make accounts.

Admin accounts are silent: signing in with an admin email shows only the admin screen (make logins, reset passwords) and never a household. Admins make a username login for themselves to use the app as a roommate. Any household membership an admin account already has is hidden from everyone else's lists (`/api/admins` tells the app which accounts are admins).

Guests: run `supabase/guests.sql` once in the Supabase SQL editor. When adding an expense, "Add a guest" puts a non-roommate (e.g. a friend at pizza night) in the split by name. Their share is listed under Money → Guests until someone taps Paid, and never changes roommate balances.

If an admin email account joined the household before admins became silent (so someone shows up twice), run `supabase/merge_admin_member.sql` in the Supabase SQL editor: fill in the admin email and that person's username, run the Check query, then the Merge block. It moves everything to the username account and deletes the admin's membership.

Profile photos: run `supabase/avatars.sql` once in the Supabase SQL editor. Photos are set by roommates: you can change or remove anyone's photo in your household except your own (account sheet → Roommates' photos). It adds `members.avatar_url`, a public `avatars` Storage bucket (random file names, so links can't be guessed), `set_avatar()`, and storage rules that only allow housemates (never yourself) to write to a member's folder. Every change deletes that member's previous photo, so each person stores one ~20 KB file. Photos are cropped square and shrunk to 256px JPEG in the browser before upload.

Polls: run `supabase/polls.sql` once. On Home, anyone can start a poll ("Grocery run tomorrow?") with an optional date and how many other people need to say yes (or everyone). The creator counts as a yes. Once it passes, it shows under Upcoming → Plans for the creator and everyone who voted yes.

Repeating tasks: run `supabase/repeating.sql` once. In Upcoming → Repeating, whoever creates a task picks how often it repeats (every day, 2 days, week, 2 weeks, month), when it starts, and who's in the rotation in turn order; each time it repeats, the next person is up. Anyone can tick off the current turn. Whose turn it is is worked out from the start date, so nothing runs on a schedule. The SQL starts each household with daily Clean the sink / Clean the living room / Take out the trash rotations through its roommates. Home's "Due today" shows chores and repeating turns due today, for you or everyone.

Residents vs temps: `supabase/residents.sql` adds `members.role`. Residents do chores, are in every rotation, and count for polls; temps (friends you sometimes split a bill with) only show up in Money, marked "Temp". Edit the two first-name lists at the top of the file and run it again whenever someone moves in or out; it also rebuilds every repeating task to rotate through the residents.
