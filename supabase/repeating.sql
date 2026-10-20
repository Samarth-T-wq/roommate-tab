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
