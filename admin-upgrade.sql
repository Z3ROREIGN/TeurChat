-- TeurChat: upgrade de administração e moderação.
-- Pode ser executado novamente no SQL Editor do Supabase.
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username));

create table if not exists public.user_bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null default 'Violação das regras da comunidade' check (char_length(reason) between 1 and 500),
  banned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.user_bans enable row level security;
drop policy if exists "Admins manage user bans" on public.user_bans;
create policy "Admins manage user bans" on public.user_bans for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'));
revoke all on public.user_bans from anon, authenticated;

alter table public.profile_badges drop constraint if exists profile_badges_badge_key_check;
alter table public.profile_badges add constraint profile_badges_badge_key_check
  check (badge_key ~ '^[a-z0-9_]{2,32}$');

insert into public.user_roles(user_id,role)
select id,'admin' from public.profiles where lower(username)='teurchat'
on conflict (user_id,role) do nothing;
insert into public.profile_badges(user_id,badge_key)
select id,'admin' from public.profiles where lower(username)='teurchat'
on conflict (user_id,badge_key) do nothing;
insert into public.profile_badges(user_id,badge_key)
select id,'verified' from public.profiles where lower(username)='teurchat'
on conflict (user_id,badge_key) do nothing;

create or replace function public.teurchat_is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin');
$$;
revoke all on function public.teurchat_is_admin() from public,anon;
grant execute on function public.teurchat_is_admin() to authenticated;

create or replace function public.admin_set_badge(target_user uuid,target_badge text,should_grant boolean default true)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if target_badge !~ '^[a-z0-9_]{2,32}$' then raise exception 'Emblema inválido. Use 2 a 32 caracteres: letras minúsculas, números ou _.'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_user) then raise exception 'Usuário não encontrado.'; end if;
  if should_grant then
    insert into public.profile_badges(user_id,badge_key) values(target_user,target_badge) on conflict(user_id,badge_key) do nothing;
  else
    if target_badge='admin' and exists(select 1 from public.user_roles r where r.user_id=target_user and r.role='admin') then
      raise exception 'Não remova a insígnia administrativa de uma conta administradora por esta ação.';
    end if;
    delete from public.profile_badges where user_id=target_user and badge_key=target_badge;
  end if;
end;
$$;
revoke all on function public.admin_set_badge(uuid,text,boolean) from public,anon;
grant execute on function public.admin_set_badge(uuid,text,boolean) to authenticated;

create or replace function public.admin_set_ban(target_user uuid,should_ban boolean,ban_reason text default 'Violação das regras da comunidade',ban_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if target_user=auth.uid() then raise exception 'Você não pode banir sua própria conta.'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_user) then raise exception 'Usuário não encontrado.'; end if;
  if should_ban then
    insert into public.user_bans(user_id,reason,banned_by,expires_at)
    values(target_user,left(coalesce(nullif(trim(ban_reason),''),'Violação das regras da comunidade'),500),auth.uid(),ban_expires_at)
    on conflict(user_id) do update set reason=excluded.reason,banned_by=excluded.banned_by,created_at=now(),expires_at=excluded.expires_at;
  else delete from public.user_bans where user_id=target_user;
  end if;
end;
$$;
revoke all on function public.admin_set_ban(uuid,boolean,text,timestamptz) from public,anon;
grant execute on function public.admin_set_ban(uuid,boolean,text,timestamptz) to authenticated;

create or replace function public.admin_list_users()
returns table(id uuid,username text,display_name text,created_at timestamptz,badges text[],is_banned boolean,ban_reason text)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select p.id,p.username,p.display_name,p.created_at,
    coalesce((select array_agg(pb.badge_key order by pb.badge_key) from public.profile_badges pb where pb.user_id=p.id),'{}'::text[]),
    exists(select 1 from public.user_bans b where b.user_id=p.id and (b.expires_at is null or b.expires_at>now())),
    (select b.reason from public.user_bans b where b.user_id=p.id and (b.expires_at is null or b.expires_at>now()))
  from public.profiles p order by p.created_at desc limit 500;
end;
$$;
revoke all on function public.admin_list_users() from public,anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.teurchat_is_banned(target_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
  if target_user is distinct from auth.uid() and not public.teurchat_is_admin() then return false; end if;
  return exists(select 1 from public.user_bans b where b.user_id=target_user and (b.expires_at is null or b.expires_at>now()));
end;
$$;
revoke all on function public.teurchat_is_banned(uuid) from public,anon;
grant execute on function public.teurchat_is_banned(uuid) to authenticated;

drop policy if exists "Authenticated users create own posts" on public.posts;
create policy "Authenticated users create own posts" on public.posts for insert to authenticated
  with check (auth.uid()=user_id and not public.teurchat_is_banned(auth.uid()));
drop policy if exists "Users like as themselves" on public.likes;
create policy "Users like as themselves" on public.likes for insert to authenticated
  with check (auth.uid()=user_id and not public.teurchat_is_banned(auth.uid()));
drop policy if exists "Authenticated users comment as themselves" on public.comments;
create policy "Authenticated users comment as themselves" on public.comments for insert to authenticated
  with check (auth.uid()=user_id and not public.teurchat_is_banned(auth.uid()));
drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves" on public.follows for insert to authenticated
  with check (auth.uid()=follower_id and not public.teurchat_is_banned(auth.uid()));
drop policy if exists "Members send messages as themselves" on public.messages;
create policy "Members send messages as themselves" on public.messages for insert to authenticated
  with check (auth.uid()=sender_id and public.is_conversation_member(conversation_id,auth.uid()) and not public.teurchat_is_banned(auth.uid()));

create or replace function public.start_conversation(target_username text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare current_user_id uuid:=auth.uid(); target_user_id uuid; existing_conversation uuid; new_conversation uuid;
begin
  if current_user_id is null then raise exception 'É necessário entrar na conta.'; end if;
  if public.teurchat_is_banned(current_user_id) then raise exception 'Sua conta está impedida de iniciar conversas por uma decisão de moderação.'; end if;
  select p.id into target_user_id from public.profiles p where lower(p.username)=lower(trim(leading '@' from target_username)) limit 1;
  if target_user_id is null then raise exception 'Não encontramos esse nome de usuário.'; end if;
  if target_user_id=current_user_id then raise exception 'Você não pode iniciar uma conversa consigo mesmo.'; end if;
  select cm1.conversation_id into existing_conversation from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id=cm1.conversation_id
    where cm1.user_id=current_user_id and cm2.user_id=target_user_id
      and (select count(*) from public.conversation_members cm3 where cm3.conversation_id=cm1.conversation_id)=2 limit 1;
  if existing_conversation is not null then return existing_conversation; end if;
  insert into public.conversations default values returning id into new_conversation;
  insert into public.conversation_members(conversation_id,user_id) values(new_conversation,current_user_id),(new_conversation,target_user_id);
  return new_conversation;
end;
$$;
revoke all on function public.start_conversation(text) from public,anon;
grant execute on function public.start_conversation(text) to authenticated;

create or replace function public.admin_delete_post(target_post uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  delete from public.posts where id=target_post;
  if not found then raise exception 'Publicação não encontrada.'; end if;
end;
$$;
revoke all on function public.admin_delete_post(uuid) from public,anon;
grant execute on function public.admin_delete_post(uuid) to authenticated;

create or replace function public.admin_delete_comment(target_comment uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  delete from public.comments where id=target_comment;
  if not found then raise exception 'Comentário não encontrado.'; end if;
end;
$$;
revoke all on function public.admin_delete_comment(uuid) from public,anon;
grant execute on function public.admin_delete_comment(uuid) to authenticated;
