-- Profile pictures, set by your roommates: you can change or remove anyone's photo in your household
-- except your own.
-- Photos live in a public Storage bucket under avatars/<member id>/<random>.jpg, so a link can't be guessed.
-- Each member's folder only ever keeps their current photo: the app deletes the old file on every change.
-- Run once in the Supabase SQL editor. Safe to re-run (it replaces the earlier "own photo only" rules).

alter table public.members add column if not exists avatar_url text;

-- Earlier version let people change only their own photo.
drop function if exists public.set_my_avatar(uuid, text);

-- Set (or clear, with null) member m's photo. Allowed only for someone else in the same household,
-- and only to a link inside m's own folder.
create or replace function public.set_avatar(m uuid, url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from members where id = m and user_id = auth.uid()) then
    raise exception 'You can''t change your own photo. Ask a roommate.';
  end if;
  if not exists (
    select 1 from members target
    join members mine on mine.household_id = target.household_id and mine.user_id = auth.uid()
    where target.id = m
  ) then
    raise exception 'You can only change photos of people in your household';
  end if;
  if url is not null and url not like '%/storage/v1/object/public/avatars/' || m::text || '/%' then
    raise exception 'That photo link is not in their avatars folder';
  end if;
  update members set avatar_url = url where id = m;
end;
$$;

-- Public bucket: anyone with the exact link can view a photo. 1 MB cap, JPEG only (the app resizes to ~20 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the first folder of a storage path belongs to a housemate of the caller (never the caller).
drop function if exists public.avatar_folder_is_mine(text) cascade;
create or replace function public.avatar_folder_is_housemate(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from members target
    join members mine on mine.household_id = target.household_id and mine.user_id = auth.uid()
    where target.id::text = (storage.foldername(path))[1]
      and target.user_id is distinct from auth.uid()
  );
$$;

drop policy if exists "avatars: see own files" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: replace own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
drop policy if exists "avatars: see housemates' files" on storage.objects;
drop policy if exists "avatars: upload for housemates" on storage.objects;
drop policy if exists "avatars: replace for housemates" on storage.objects;
drop policy if exists "avatars: delete housemates' files" on storage.objects;
-- Viewing goes through the public link; this policy is only so the app can list a folder to clean it out.
create policy "avatars: see housemates' files" on storage.objects
  for select using (bucket_id = 'avatars' and avatar_folder_is_housemate(name));
create policy "avatars: upload for housemates" on storage.objects
  for insert with check (bucket_id = 'avatars' and avatar_folder_is_housemate(name));
create policy "avatars: replace for housemates" on storage.objects
  for update using (bucket_id = 'avatars' and avatar_folder_is_housemate(name));
create policy "avatars: delete housemates' files" on storage.objects
  for delete using (bucket_id = 'avatars' and avatar_folder_is_housemate(name));
