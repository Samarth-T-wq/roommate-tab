-- Even out every repeating task's rotation across the residents.
-- Tasks on the same schedule (all the daily ones, all the weekly ones, ...) get the same resident order,
-- shifted by one person per task, and the same start date. So on any day each of those tasks goes to a
-- different person, and over a full cycle everyone does every task equally often.
-- (That holds as long as a schedule has no more tasks than there are residents.)
-- Run in the Supabase SQL editor (project wsdirryhvdbxszflbksq). Safe to re-run.
-- Note: this resets whose turn it is right now.

alter table public.members
  add column if not exists role text not null default 'resident' check (role in ('resident', 'temp'));

do $$
declare
  g record;
  t record;
  people uuid[];
  n int;
begin
  for g in
    select household_id, freq, every, min(starts_on) as starts_on
    from public.repeating_tasks
    group by household_id, freq, every
  loop
    -- Residents in alphabetical order, one membership per person: if someone is in twice
    -- (e.g. an admin email that joined before admins were silent), use their username login.
    select array_agg(id order by display_name) into people
    from (
      select distinct on (lower(split_part(trim(m.display_name), ' ', 1))) m.id, m.display_name
      from public.members m
      left join auth.users u on u.id = m.user_id
      where m.household_id = g.household_id and m.role = 'resident'
      order by lower(split_part(trim(m.display_name), ' ', 1)), (u.email like '%@roommate-tab.local') desc
    ) one_each;
    continue when people is null;

    n := 0;
    for t in
      select id from public.repeating_tasks
      where household_id = g.household_id and freq = g.freq and every = g.every
      order by created_at, title
    loop
      update public.repeating_tasks
      set rotation = people[(n % cardinality(people)) + 1 :] || people[: n % cardinality(people)],
          starts_on = g.starts_on
      where id = t.id;
      n := n + 1;
    end loop;
  end loop;
end $$;

-- Check: each task's rotation. Within a schedule, every task should start with a different person.
select t.freq, t.every, t.starts_on, t.title,
       (select string_agg(m.display_name, ' -> ' order by r.ord)
        from unnest(t.rotation) with ordinality as r(id, ord)
        join public.members m on m.id = r.id) as rotation
from public.repeating_tasks t
order by t.freq, t.every, t.created_at, t.title;
