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
