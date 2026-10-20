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
