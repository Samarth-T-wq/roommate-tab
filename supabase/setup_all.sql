-- Roommate Tab: every feature's database setup in one script.
-- Paste into Supabase -> SQL Editor -> New query, then Run. Safe to run more than once.
-- Run it after everyone has joined the household (the starter chore rotations use the current members).

-- ================================================================
-- supabase/movie_night.sql
-- ================================================================
-- Movie Night: movies a household has watched, and each roommate's 1–5 star rating.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- True when the logged-in user is a member of household h.
-- security definer so it works no matter what the RLS policy on `members` looks like.
create or replace function public.movie_night_is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

-- True when member m is the logged-in user's own membership in household h.
create or replace function public.movie_night_is_me(m uuid, h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where id = m and household_id = h and user_id = auth.uid());
$$;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  added_by uuid not null references public.members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  year int check (year between 1880 and 2100),
  watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

-- One row per title+year per household, ignoring case.
create unique index if not exists movies_household_title_year
  on public.movies (household_id, lower(title), coalesce(year, 0));

create table if not exists public.movie_ratings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  movie_id uuid not null,
  member_id uuid not null references public.members (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  -- A rating must be for a movie in the same household (also lets realtime filter by household_id).
  foreign key (movie_id, household_id) references public.movies (id, household_id) on delete cascade,
  unique (movie_id, member_id)
);

alter table public.movies enable row level security;
alter table public.movie_ratings enable row level security;

drop policy if exists "members read movies" on public.movies;
drop policy if exists "members add movies" on public.movies;
drop policy if exists "members delete movies" on public.movies;
create policy "members read movies" on public.movies
  for select using (movie_night_is_member(household_id));
create policy "members add movies" on public.movies
  for insert with check (movie_night_is_me(added_by, household_id));
create policy "members delete movies" on public.movies
  for delete using (movie_night_is_member(household_id));

-- Anyone in the household can see ratings; you can only write your own.
drop policy if exists "members read ratings" on public.movie_ratings;
drop policy if exists "rate as yourself" on public.movie_ratings;
drop policy if exists "change own rating" on public.movie_ratings;
drop policy if exists "remove own rating" on public.movie_ratings;
create policy "members read ratings" on public.movie_ratings
  for select using (movie_night_is_member(household_id));
create policy "rate as yourself" on public.movie_ratings
  for insert with check (movie_night_is_me(member_id, household_id));
create policy "change own rating" on public.movie_ratings
  for update using (movie_night_is_me(member_id, household_id))
  with check (movie_night_is_me(member_id, household_id));
create policy "remove own rating" on public.movie_ratings
  for delete using (movie_night_is_me(member_id, household_id));

-- Live updates in the app.
do $$
begin
  alter publication supabase_realtime add table public.movies;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.movie_ratings;
exception when duplicate_object then null;
end $$;

-- ================================================================
-- supabase/guests.sql
-- ================================================================
-- Guests: a non-roommate's share of a single expense ("Mike, $12 of pizza night").
-- Tracked separately from roommate balances until someone marks it paid.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- True when the logged-in user is a member of household h.
-- security definer so it works no matter what the RLS policy on `members` looks like.
create or replace function public.guests_is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

create table if not exists public.expense_guests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  share_cents int not null check (share_cents > 0),
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.expense_guests enable row level security;

drop policy if exists "members read guests" on public.expense_guests;
drop policy if exists "members add guests" on public.expense_guests;
drop policy if exists "members mark guests paid" on public.expense_guests;
drop policy if exists "members remove guests" on public.expense_guests;
create policy "members read guests" on public.expense_guests
  for select using (guests_is_member(household_id));
-- The expense must belong to the same household.
create policy "members add guests" on public.expense_guests
  for insert with check (
    guests_is_member(household_id)
    and exists (select 1 from expenses e where e.id = expense_id and e.household_id = expense_guests.household_id)
  );
create policy "members mark guests paid" on public.expense_guests
  for update using (guests_is_member(household_id)) with check (guests_is_member(household_id));
create policy "members remove guests" on public.expense_guests
  for delete using (guests_is_member(household_id));

-- Live updates in the app.
do $$
begin
  alter publication supabase_realtime add table public.expense_guests;
exception when duplicate_object then null;
end $$;

-- ================================================================
-- supabase/avatars.sql
-- ================================================================
-- Profile pictures: each member uploads their own photo.
-- Photos live in a public Storage bucket under avatars/<member id>/<random>.jpg, so a link can't be guessed,
-- and only the member who owns that folder can add, replace or remove files in it.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.members add column if not exists avatar_url text;

-- Members may not be allowed to update their own row directly, so changes go through this function,
-- which only ever touches the caller's own membership and only accepts a link into their own folder.
create or replace function public.set_my_avatar(m uuid, url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if url is not null and url not like '%/storage/v1/object/public/avatars/' || m::text || '/%' then
    raise exception 'That photo link is not in your avatars folder';
  end if;
  update members set avatar_url = url where id = m and user_id = auth.uid();
  if not found then
    raise exception 'You can only change your own photo';
  end if;
end;
$$;

-- Public bucket: anyone with the exact link can view a photo. 1 MB cap, JPEG only (the app resizes to ~20 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the first folder of a storage path is one of the caller's own member ids.
create or replace function public.avatar_folder_is_mine(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members where id::text = (storage.foldername(path))[1] and user_id = auth.uid()
  );
$$;

drop policy if exists "avatars: see own files" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: replace own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
-- Viewing goes through the public link; this policy is only so you can manage (list/remove) your own files.
create policy "avatars: see own files" on storage.objects
  for select using (bucket_id = 'avatars' and avatar_folder_is_mine(name));
create policy "avatars: upload own" on storage.objects
  for insert with check (bucket_id = 'avatars' and avatar_folder_is_mine(name));
create policy "avatars: replace own" on storage.objects
  for update using (bucket_id = 'avatars' and avatar_folder_is_mine(name));
create policy "avatars: delete own" on storage.objects
  for delete using (bucket_id = 'avatars' and avatar_folder_is_mine(name));

-- ================================================================
-- supabase/polls.sql
-- ================================================================
-- Polls: someone suggests a plan ("Grocery run tomorrow 6pm?"), everyone votes thumbs up/down.
-- Once enough people say yes, the app lists it under Upcoming for the creator and everyone who said yes.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- True when the logged-in user is a member of household h.
create or replace function public.polls_is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

-- True when member m is the logged-in user's own membership in household h.
create or replace function public.polls_is_me(m uuid, h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where id = m and household_id = h and user_id = auth.uid());
$$;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references public.members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  happens_at timestamptz,                    -- optional date/time of the plan
  needed int check (needed is null or needed >= 0), -- yes votes needed besides the creator; null = everyone
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.poll_votes (
  household_id uuid not null,
  poll_id uuid not null,
  member_id uuid not null references public.members (id) on delete cascade,
  vote boolean not null,                     -- true = thumbs up, false = thumbs down
  created_at timestamptz not null default now(),
  primary key (poll_id, member_id),
  -- A vote must be on a poll in the same household (also lets realtime filter by household_id).
  foreign key (poll_id, household_id) references public.polls (id, household_id) on delete cascade
);

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "members read polls" on public.polls;
drop policy if exists "create polls as yourself" on public.polls;
drop policy if exists "creator deletes poll" on public.polls;
create policy "members read polls" on public.polls
  for select using (polls_is_member(household_id));
create policy "create polls as yourself" on public.polls
  for insert with check (polls_is_me(created_by, household_id));
create policy "creator deletes poll" on public.polls
  for delete using (polls_is_me(created_by, household_id));

-- Everyone sees every vote; you can only cast, change or take back your own.
drop policy if exists "members read votes" on public.poll_votes;
drop policy if exists "vote as yourself" on public.poll_votes;
drop policy if exists "change own vote" on public.poll_votes;
drop policy if exists "take back own vote" on public.poll_votes;
create policy "members read votes" on public.poll_votes
  for select using (polls_is_member(household_id));
create policy "vote as yourself" on public.poll_votes
  for insert with check (polls_is_me(member_id, household_id));
create policy "change own vote" on public.poll_votes
  for update using (polls_is_me(member_id, household_id)) with check (polls_is_me(member_id, household_id));
create policy "take back own vote" on public.poll_votes
  for delete using (polls_is_me(member_id, household_id));

-- Live updates in the app.
do $$
begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;

-- ================================================================
-- supabase/repeating.sql
-- ================================================================
-- Repeating tasks with a rotation: "Clean the bathroom, every week, Alex -> Sam -> Garv".
-- Each time the task repeats, the next person in the rotation is up. Whose turn it is comes from the
-- start date and how often it repeats, so nothing needs to run on a schedule.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- True when the logged-in user is a member of household h.
create or replace function public.repeating_is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

-- True when member m is the logged-in user's own membership in household h.
create or replace function public.repeating_is_me(m uuid, h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where id = m and household_id = h and user_id = auth.uid());
$$;

create table if not exists public.repeating_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references public.members (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  freq text not null check (freq in ('day', 'week', 'month')),
  every int not null default 1 check (every between 1 and 12), -- e.g. freq week + every 2 = every 2 weeks
  starts_on date not null default current_date,
  rotation uuid[] not null check (cardinality(rotation) >= 1),  -- member ids, in turn order
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

-- One row per turn that was done. `occurrence` is the date that turn started.
create table if not exists public.repeating_done (
  household_id uuid not null,
  task_id uuid not null,
  occurrence date not null,
  done_by uuid not null references public.members (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, occurrence),
  foreign key (task_id, household_id) references public.repeating_tasks (id, household_id) on delete cascade
);

alter table public.repeating_tasks enable row level security;
alter table public.repeating_done enable row level security;

-- Everyone sees every task; only its creator sets one up or removes it.
drop policy if exists "members read repeating" on public.repeating_tasks;
drop policy if exists "create repeating as yourself" on public.repeating_tasks;
drop policy if exists "creator removes repeating" on public.repeating_tasks;
create policy "members read repeating" on public.repeating_tasks
  for select using (repeating_is_member(household_id));
create policy "create repeating as yourself" on public.repeating_tasks
  for insert with check (repeating_is_me(created_by, household_id));
create policy "creator removes repeating" on public.repeating_tasks
  for delete using (repeating_is_me(created_by, household_id));

-- Anyone can tick a turn off as themselves (covering for someone counts), or untick it.
drop policy if exists "members read repeating done" on public.repeating_done;
drop policy if exists "tick off turn as yourself" on public.repeating_done;
drop policy if exists "members untick turn" on public.repeating_done;
create policy "members read repeating done" on public.repeating_done
  for select using (repeating_is_member(household_id));
create policy "tick off turn as yourself" on public.repeating_done
  for insert with check (repeating_is_me(done_by, household_id));
create policy "members untick turn" on public.repeating_done
  for delete using (repeating_is_member(household_id));

-- Start each household that has none yet with three daily tasks rotating through its roommates
-- (username logins only, so admin accounts are left out; everyone if there are none).
-- Each task's rotation is shifted by one, so the same person isn't up for all three on the same day.
with roommates as (
  select m.household_id,
         coalesce(
           array_agg(m.id order by m.display_name) filter (where u.email like '%@roommate-tab.local'),
           array_agg(m.id order by m.display_name)
         ) as people
  from public.members m
  join auth.users u on u.id = m.user_id
  group by m.household_id
),
shifted as (
  select r.household_id, t.title,
         r.people[(t.n % cardinality(r.people)) + 1 :] || r.people[: t.n % cardinality(r.people)] as rotation
  from roommates r
  cross join (values (0, 'Clean the sink'), (1, 'Clean the living room'), (2, 'Take out the trash')) as t(n, title)
  where not exists (select 1 from public.repeating_tasks x where x.household_id = r.household_id)
)
insert into public.repeating_tasks (household_id, created_by, title, freq, every, starts_on, rotation)
select household_id, rotation[1], title, 'day', 1, current_date, rotation
from shifted;

-- Live updates in the app.
do $$
begin
  alter publication supabase_realtime add table public.repeating_tasks;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.repeating_done;
exception when duplicate_object then null;
end $$;
