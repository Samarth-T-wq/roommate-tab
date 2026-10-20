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
