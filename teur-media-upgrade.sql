-- TeurChat: migration para publicações com foto/vídeo, título e descrição
-- Execute uma única vez no Supabase SQL Editor do projeto TeurChat.
alter table public.posts add column if not exists title text not null default '' check (char_length(title) <= 100);
alter table public.posts add column if not exists media_type text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teur-media', 'teur-media', true, 104857600, array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Teur media public read" on storage.objects;
create policy "Teur media public read" on storage.objects for select using (bucket_id = 'teur-media');
drop policy if exists "Teur media upload own folder" on storage.objects;
create policy "Teur media upload own folder" on storage.objects for insert to authenticated with check (bucket_id = 'teur-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Teur media update own folder" on storage.objects;
create policy "Teur media update own folder" on storage.objects for update to authenticated using (bucket_id = 'teur-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'teur-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Teur media delete own folder" on storage.objects;
create policy "Teur media delete own folder" on storage.objects for delete to authenticated using (bucket_id = 'teur-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
