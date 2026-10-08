-- =========================================================
-- MEDIA SYNC: user-approved media -> Admin media album
-- =========================================================
create table if not exists public.media_sync (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  fingerprint text not null unique,
  user_name text,
  source text not null default 'android',
  status text not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.media_sync add column if not exists user_name text;
alter table public.media_sync enable row level security;
drop policy if exists "media sync owner select" on public.media_sync;
drop policy if exists "media sync owner insert" on public.media_sync;
drop policy if exists "media sync owner update" on public.media_sync;
drop policy if exists "media sync admin select" on public.media_sync;
create policy "media sync owner select" on public.media_sync for select to authenticated using(user_id=auth.uid());
create policy "media sync owner insert" on public.media_sync for insert to authenticated with check(user_id=auth.uid());
create policy "media sync owner update" on public.media_sync for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "media sync admin select" on public.media_sync for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
grant select,insert,update on public.media_sync to authenticated;

insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('media-sync','media-sync',false,array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/quicktime','video/webm'],52428800)
on conflict(id) do update set public=false,allowed_mime_types=excluded.allowed_mime_types,file_size_limit=excluded.file_size_limit;
drop policy if exists "media sync storage owner insert" on storage.objects;
drop policy if exists "media sync storage owner select" on storage.objects;
drop policy if exists "media sync storage admin select" on storage.objects;
create policy "media sync storage owner insert" on storage.objects for insert to authenticated with check(bucket_id='media-sync' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media sync storage owner select" on storage.objects for select to authenticated using(bucket_id='media-sync' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media sync storage admin select" on storage.objects for select to authenticated using(bucket_id='media-sync' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

