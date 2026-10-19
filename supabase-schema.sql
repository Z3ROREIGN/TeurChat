-- TeurChat: estrutura inicial do banco de dados Supabase
-- Execute no SQL Editor do projeto Supabase dedicado ao TeurChat.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 180),
  avatar_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  media_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, post_id)
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists comments_post_id_idx on public.comments(post_id,created_at);
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Posts are public to read" on public.posts;
create policy "Posts are public to read" on public.posts for select using (true);
drop policy if exists "Authenticated users create own posts" on public.posts;
create policy "Authenticated users create own posts" on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete own posts" on public.posts;
create policy "Users delete own posts" on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Likes readable by everyone" on public.likes;
create policy "Likes readable by everyone" on public.likes for select using (true);
drop policy if exists "Users like as themselves" on public.likes;
create policy "Users like as themselves" on public.likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users remove own likes" on public.likes;
create policy "Users remove own likes" on public.likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Comments are public to read" on public.comments;
create policy "Comments are public to read" on public.comments for select using (true);
drop policy if exists "Authenticated users comment as themselves" on public.comments;
create policy "Authenticated users comment as themselves" on public.comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users delete own comments" on public.comments;
create policy "Users delete own comments" on public.comments for delete to authenticated using (auth.uid() = user_id);

-- Função SECURITY DEFINER evita recursão de RLS ao verificar membros da conversa.
create or replace function public.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Never allow callers to test membership on behalf of another user.
  if target_user is distinct from auth.uid() then
    return false;
  end if;
  return exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation and cm.user_id = auth.uid()
  );
end;
$$;
revoke all on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations" on public.conversations for select to authenticated using (
  public.is_conversation_member(id, auth.uid())
);
drop policy if exists "Authenticated users can start conversations" on public.conversations;
create policy "Authenticated users can start conversations" on public.conversations for insert to authenticated with check (true);

drop policy if exists "Members list conversation members" on public.conversation_members;
create policy "Members list conversation members" on public.conversation_members for select to authenticated using (
  public.is_conversation_member(conversation_id, auth.uid())
);
drop policy if exists "Users join themselves to conversations" on public.conversation_members;
create policy "Users join themselves to conversations" on public.conversation_members for insert to authenticated with check (auth.uid()=user_id);

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages" on public.messages for select to authenticated using (
  public.is_conversation_member(conversation_id, auth.uid())
);
drop policy if exists "Members send messages as themselves" on public.messages;
create policy "Members send messages as themselves" on public.messages for insert to authenticated with check (
  auth.uid()=sender_id and public.is_conversation_member(conversation_id, auth.uid())
);

-- Para atualizações em tempo real, habilite public.messages no publication supabase_realtime
-- pelo painel Supabase caso ainda não esteja habilitado.

-- TeurChat: operação segura para iniciar conversas entre dois usuários.
-- Pode ser executada mais de uma vez.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function public.start_conversation(target_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_user_id uuid;
  existing_conversation uuid;
  new_conversation uuid;
begin
  if current_user_id is null then
    raise exception 'É necessário entrar na conta.';
  end if;

  select p.id into target_user_id
  from public.profiles p
  where lower(p.username) = lower(trim(leading '@' from target_username))
  limit 1;

  if target_user_id is null then
    raise exception 'Não encontramos esse nome de usuário.';
  end if;
  if target_user_id = current_user_id then
    raise exception 'Você não pode iniciar uma conversa consigo mesmo.';
  end if;

  select cm1.conversation_id into existing_conversation
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
  where cm1.user_id = current_user_id
    and cm2.user_id = target_user_id
    and (select count(*) from public.conversation_members cm3
         where cm3.conversation_id = cm1.conversation_id) = 2
  limit 1;

  if existing_conversation is not null then
    return existing_conversation;
  end if;

  insert into public.conversations default values returning id into new_conversation;
  insert into public.conversation_members(conversation_id,user_id)
  values (new_conversation,current_user_id),(new_conversation,target_user_id);
  return new_conversation;
end;
$$;

revoke all on function public.start_conversation(text) from public, anon;
grant execute on function public.start_conversation(text) to authenticated;

-- Garanta acesso via Data API junto com as políticas RLS existentes.
grant select on public.profiles, public.posts, public.likes, public.comments to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.likes to authenticated;
grant insert, delete on public.comments to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

-- Realtime pode ser ativado no Dashboard para posts e messages se ainda não estiver.


-- Relações de seguir para a aba "Seguindo".
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_no_self check (follower_id <> followed_id)
);
create index if not exists follows_followed_id_idx on public.follows(followed_id);
alter table public.follows enable row level security;
drop policy if exists "Users can read their own follows" on public.follows;
create policy "Users can read their own follows" on public.follows
  for select to authenticated using (auth.uid() = follower_id);
drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);
drop policy if exists "Users unfollow as themselves" on public.follows;
create policy "Users unfollow as themselves" on public.follows
  for delete to authenticated using (auth.uid() = follower_id);
grant select, insert, delete on public.follows to authenticated;

-- Cria o perfil no cadastro, inclusive quando a confirmação de e-mail está ativada.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  base_username text;
  safe_display_name text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',''), '[^a-z0-9_]', '', 'g'));
  base_username := lower(regexp_replace(split_part(coalesce(new.email, 'usuario'), '@', 1), '[^a-z0-9_]', '', 'g'));
  if char_length(base_username) < 3 then
    base_username := 'user_' || left(new.id::text, 8);
  end if;
  safe_display_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), base_username), 40);

  if char_length(requested_username) between 3 and 24 then
    begin
      insert into public.profiles(id, username, display_name)
      values(new.id, requested_username, safe_display_name)
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      -- Nome ocupado: usar um identificador único derivado do UUID.
      null;
    end;
  end if;

  insert into public.profiles(id, username, display_name)
  values(new.id, left(base_username, 17) || '_' || left(replace(new.id::text, '-', ''), 6), safe_display_name)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Conversas e participantes devem ser criados somente pelo RPC validado.
drop policy if exists "Authenticated users can start conversations" on public.conversations;
drop policy if exists "Users join themselves to conversations" on public.conversation_members;


-- Extra social features: media metadata, saved posts, notifications and storage.
alter table public.posts add column if not exists media_type text;
alter table public.posts add column if not exists edited_at timestamptz;
alter table public.posts add column if not exists hashtags text[] not null default '{}';

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists bookmarks_post_id_idx on public.bookmarks(post_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  kind text not null check (kind in ('like','comment','follow','message')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists comments_user_id_idx on public.comments(user_id);
create index if not exists conversation_members_user_id_idx on public.conversation_members(user_id);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists posts_user_id_created_idx on public.posts(user_id, created_at desc);

alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "Users read own bookmarks" on public.bookmarks;
create policy "Users read own bookmarks" on public.bookmarks for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own bookmarks" on public.bookmarks;
create policy "Users create own bookmarks" on public.bookmarks for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users remove own bookmarks" on public.bookmarks;
create policy "Users remove own bookmarks" on public.bookmarks for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.bookmarks to authenticated;
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = recipient_id);
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
grant select, update on public.notifications to authenticated;

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

create or replace function public.notify_social_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient uuid; actor uuid; post uuid; notification_kind text;
begin
  if tg_table_name = 'likes' then
    actor := new.user_id; post := new.post_id; notification_kind := 'like';
    select p.user_id into recipient from public.posts p where p.id = new.post_id;
  elsif tg_table_name = 'comments' then
    actor := new.user_id; post := new.post_id; notification_kind := 'comment';
    select p.user_id into recipient from public.posts p where p.id = new.post_id;
  elsif tg_table_name = 'follows' then
    actor := new.follower_id; recipient := new.followed_id; notification_kind := 'follow';
  elsif tg_table_name = 'messages' then
    actor := new.sender_id; notification_kind := 'message';
    insert into public.notifications(recipient_id, actor_id, kind)
    select cm.user_id, actor, notification_kind from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> actor;
    return new;
  else return new;
  end if;
  if recipient is not null and recipient <> actor then
    insert into public.notifications(recipient_id, actor_id, post_id, kind)
    values (recipient, actor, post, notification_kind);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_social_event() from public, anon, authenticated;
drop trigger if exists notify_on_like on public.likes;
create trigger notify_on_like after insert on public.likes for each row execute function public.notify_social_event();
drop trigger if exists notify_on_comment on public.comments;
create trigger notify_on_comment after insert on public.comments for each row execute function public.notify_social_event();
drop trigger if exists notify_on_follow on public.follows;
create trigger notify_on_follow after insert on public.follows for each row execute function public.notify_social_event();
drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages for each row execute function public.notify_social_event();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


-- Hardening: keep the RLS membership helper outside the exposed public API schema.
create or replace function private.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  if target_user is distinct from auth.uid() then return false; end if;
  return exists (select 1 from public.conversation_members cm where cm.conversation_id=target_conversation and cm.user_id=auth.uid());
end;
$$;
revoke all on function private.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid, uuid) to authenticated;
drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations" on public.conversations for select to authenticated using (private.is_conversation_member(id, (select auth.uid())));
drop policy if exists "Members list conversation members" on public.conversation_members;
create policy "Members list conversation members" on public.conversation_members for select to authenticated using (private.is_conversation_member(conversation_id, (select auth.uid())));
drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages" on public.messages for select to authenticated using (private.is_conversation_member(conversation_id, (select auth.uid())));
drop policy if exists "Members send messages as themselves" on public.messages;
create policy "Members send messages as themselves" on public.messages for insert to authenticated with check ((select auth.uid())=sender_id and private.is_conversation_member(conversation_id, (select auth.uid())));
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon, authenticated;
