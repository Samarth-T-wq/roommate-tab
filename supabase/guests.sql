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
