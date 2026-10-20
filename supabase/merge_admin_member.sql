-- Merge an admin's household membership into their regular username account, then delete it.
-- Use when an admin email account joined the household before admins became silent, so the
-- person shows up twice (e.g. two "Garv"s). Everything the admin membership did (expenses paid,
-- splits, settle-ups, chores, shopping items, movies, ratings, guests) moves to the regular one.
--
-- Run in the Supabase SQL editor, in two steps:
--   1. Fill in the two values below and run ONLY the "Check" query. Make sure it shows exactly the
--      two rows you expect, in the same household.
--   2. Run the "Merge" block. It runs as one transaction: if anything fails, nothing changes.

-- ===== 1. Check =====
select m.id as member_id, m.display_name, u.email, m.household_id
from members m
join auth.users u on u.id = m.user_id
where lower(u.email) in (lower('ADMIN_EMAIL_HERE'), lower('USERNAME_HERE') || '@roommate-tab.local');

-- ===== 2. Merge =====
do $$
declare
  admin_email text := 'ADMIN_EMAIL_HERE';   -- the admin's real email
  username    text := 'USERNAME_HERE';      -- the same person's roommate username, e.g. garv
  old_id uuid;  -- admin's membership (goes away)
  new_id uuid;  -- regular membership (keeps everything)
  fk record;
begin
  select m.id into old_id
  from members m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(admin_email);

  select m.id into new_id
  from members m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(username) || '@roommate-tab.local'
    and m.household_id = (select household_id from members where id = old_id);

  if old_id is null then raise exception 'No household membership found for %', admin_email; end if;
  if new_id is null then raise exception 'No membership for username % in the same household', username; end if;

  -- Rows that would clash once both memberships become one person:
  -- an expense split between both of them: fold the admin's share into the regular one.
  if to_regclass('public.expense_splits') is not null then
    update expense_splits keep
    set share_cents = keep.share_cents + gone.share_cents
    from expense_splits gone
    where keep.member_id = new_id and gone.member_id = old_id and keep.expense_id = gone.expense_id;
    delete from expense_splits gone
    using expense_splits keep
    where gone.member_id = old_id and keep.member_id = new_id and keep.expense_id = gone.expense_id;
  end if;
  -- the same movie rated by both: keep the regular account's rating.
  if to_regclass('public.movie_ratings') is not null then
    delete from movie_ratings gone
    using movie_ratings keep
    where gone.member_id = old_id and keep.member_id = new_id and keep.movie_id = gone.movie_id;
  end if;
  -- settle-ups between the two would become paying yourself.
  if to_regclass('public.settlements') is not null then
    delete from settlements
    where (from_member = old_id and to_member = new_id) or (from_member = new_id and to_member = old_id);
  end if;

  -- Point every column that references members(id) at the regular membership.
  for fk in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.members'::regclass
      and array_length(con.conkey, 1) = 1
      and ns.nspname = 'public'
  loop
    execute format('update public.%I set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using new_id, old_id;
    raise notice 'moved %.%', fk.tbl, fk.col;
  end loop;

  delete from members where id = old_id;
  raise notice 'Merged admin membership % into %', old_id, new_id;
end $$;
