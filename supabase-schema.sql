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
as $
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
$;
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
