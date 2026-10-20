-- Residents vs temps.
-- Residents live here: they do chores, are in every rotation, and count for polls.
-- Temps (friends you sometimes split a bill with) only show up in Money.
-- Run in the Supabase SQL editor (project wsdirryhvdbxszflbksq), AFTER setup_all.sql. Safe to re-run.
-- To change who's who later, edit the two name lists below and run it again.

alter table public.members
  add column if not exists role text not null default 'resident' check (role in ('resident', 'temp'));

do $$
declare
  residents text[] := array['garv', 'shaurya', 'samarth', 'raafae', 'prathik']; -- first names, any case
  temps     text[] := array['aneesh', 'vinay'];
  unmatched text;
  h record;
  t record;
  people uuid[];
  n int;
begin
  -- Match on the first word of the display name, ignoring case ("Garv N" matches garv).
  update members set role = 'temp'
  where lower(split_part(trim(display_name), ' ', 1)) = any (temps);
  update members set role = 'resident'
  where lower(split_part(trim(display_name), ' ', 1)) = any (residents);

  select string_agg(display_name, ', ') into unmatched
  from members
  where lower(split_part(trim(display_name), ' ', 1)) <> all (residents || temps);
  if unmatched is not null then
    raise notice 'Not in either list (left as they were): %', unmatched;
  end if;

  -- Every repeating task rotates through the residents (alphabetical), each task starting one person
  -- further along so the same person isn't up for everything on the same day.
  if to_regclass('public.repeating_tasks') is not null then
    for h in select distinct household_id from repeating_tasks loop
      -- One membership per person: if someone is in twice (e.g. an admin email that joined before
      -- admins were silent), use their username login.
      select array_agg(id order by display_name) into people
      from (
        select distinct on (lower(split_part(trim(m.display_name), ' ', 1))) m.id, m.display_name
        from members m
        left join auth.users u on u.id = m.user_id
        where m.household_id = h.household_id
          and lower(split_part(trim(m.display_name), ' ', 1)) = any (residents)
        order by lower(split_part(trim(m.display_name), ' ', 1)), (u.email like '%@roommate-tab.local') desc
      ) one_each;
      continue when people is null;
      n := 0;
      for t in select id from repeating_tasks where household_id = h.household_id order by created_at, title loop
        update repeating_tasks
        set rotation = people[(n % cardinality(people)) + 1 :] || people[: n % cardinality(people)]
        where id = t.id;
        n := n + 1;
      end loop;
      raise notice 'Rotations now go through % residents in % tasks', cardinality(people), n;
    end loop;
  end if;

  -- Temps shouldn't be holding chores either.
  if to_regclass('public.chores') is not null then
    update chores set assigned_to = null
    where done = false and assigned_to in (select id from members where role = 'temp');
  end if;
end $$;

-- Check the result. The SQL editor only shows the last query's output, so this one comes last:
-- each repeating task's rotation, which should list only residents.
-- (setup_all.sql must have been run before this file: it's what creates the starter rotations.)
select t.title,
       (select string_agg(m.display_name || ' (' || m.role || ')', ' -> ' order by r.ord)
        from unnest(t.rotation) with ordinality as r(id, ord)
        join public.members m on m.id = r.id) as rotation
from public.repeating_tasks t
order by t.created_at, t.title;
