-- TeurChat: central de suporte, denúncias, auditoria e emblemas oficiais.
-- Requer admin-upgrade.sql previamente aplicado.
-- A migration correspondente já foi aplicada ao projeto Supabase.

create table if not exists public.community_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('support','report','bug','appeal')),
  subject text not null check (char_length(trim(subject)) between 3 and 120),
  message text not null check (char_length(trim(message)) between 10 and 4000),
  target_username text,
  target_url text,
  status text not null default 'open' check (status in ('open','in_progress','waiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists community_cases_status_created_idx on public.community_cases(status,created_at desc);
create index if not exists community_cases_user_created_idx on public.community_cases(user_id,created_at desc);
alter table public.community_cases enable row level security;
drop policy if exists "Users read own cases or admins read all" on public.community_cases;
create policy "Users read own cases or admins read all" on public.community_cases for select to authenticated
using (user_id=auth.uid() or public.teurchat_is_admin());
revoke all on public.community_cases from anon,authenticated;
grant select on public.community_cases to authenticated;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user uuid references public.profiles(id) on delete set null,
  target_case uuid references public.community_cases(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit_log(created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public,anon,authenticated;

create or replace function public.submit_community_case(case_category text,case_subject text,case_message text,case_target_username text default null,case_target_url text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na conta para abrir um chamado.'; end if;
  if public.teurchat_is_banned(auth.uid()) and case_category <> 'appeal' then
    raise exception 'Sua conta pode enviar recurso de moderação, mas não abrir outros chamados enquanto o banimento estiver ativo.';
  end if;
  if case_category not in ('support','report','bug','appeal') then raise exception 'Categoria inválida.'; end if;
  if char_length(trim(coalesce(case_subject,''))) not between 3 and 120 then raise exception 'O assunto deve ter entre 3 e 120 caracteres.'; end if;
  if char_length(trim(coalesce(case_message,''))) not between 10 and 4000 then raise exception 'A mensagem deve ter entre 10 e 4.000 caracteres.'; end if;
  if nullif(trim(case_target_url),'') is not null and trim(case_target_url) !~* '^https?://' then raise exception 'O link precisa começar com http:// ou https://.'; end if;
  insert into public.community_cases(user_id,category,subject,message,target_username,target_url)
  values(auth.uid(),case_category,trim(case_subject),trim(case_message),nullif(trim(case_target_username),''),nullif(trim(case_target_url),'')) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_community_case(text,text,text,text,text) from public,anon;
grant execute on function public.submit_community_case(text,text,text,text,text) to authenticated;

create or replace function public.admin_list_cases(filter_status text default 'all')
returns table(id uuid,user_id uuid,username text,display_name text,category text,subject text,message text,target_username text,target_url text,status text,priority text,assigned_to uuid,resolution text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select c.id,c.user_id,p.username,p.display_name,c.category,c.subject,c.message,c.target_username,c.target_url,c.status,c.priority,c.assigned_to,c.resolution,c.created_at,c.updated_at
  from public.community_cases c join public.profiles p on p.id=c.user_id
  where filter_status='all' or c.status=filter_status
  order by case c.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,c.created_at asc limit 500;
end;
$$;
revoke all on function public.admin_list_cases(text) from public,anon;
grant execute on function public.admin_list_cases(text) to authenticated;

create or replace function public.admin_update_case(target_case uuid,new_status text,new_priority text default 'normal',case_resolution text default null,assign_to_self boolean default false)
returns void language plpgsql security definer set search_path=''
as $$
declare prior_status text;
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if new_status not in ('open','in_progress','waiting_user','resolved','closed') then raise exception 'Status inválido.'; end if;
  if new_priority not in ('low','normal','high','urgent') then raise exception 'Prioridade inválida.'; end if;
  select status into prior_status from public.community_cases where id=target_case;
  if prior_status is null then raise exception 'Chamado não encontrado.'; end if;
  update public.community_cases set status=new_status,priority=new_priority,
    resolution=case when case_resolution is null then resolution else left(trim(case_resolution),4000) end,
    assigned_to=case when assign_to_self then auth.uid() else assigned_to end,
    updated_at=now(),resolved_at=case when new_status in ('resolved','closed') then coalesce(resolved_at,now()) else null end
  where id=target_case;
  insert into public.admin_audit_log(actor_id,action,target_case,details)
  values(auth.uid(),'case_status_changed',target_case,jsonb_build_object('from',prior_status,'to',new_status,'priority',new_priority,'resolution',left(coalesce(case_resolution,''),500)));
end;
$$;
revoke all on function public.admin_update_case(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.admin_update_case(uuid,text,text,text,boolean) to authenticated;

create or replace function public.admin_list_audit(limit_rows integer default 100)
returns table(id bigint,actor_username text,action text,target_username text,target_case uuid,details jsonb,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  return query select l.id,a.username,l.action,t.username,l.target_case,l.details,l.created_at
  from public.admin_audit_log l left join public.profiles a on a.id=l.actor_id left join public.profiles t on t.id=l.target_user
  order by l.created_at desc limit greatest(1,least(coalesce(limit_rows,100),250));
end;
$$;
revoke all on function public.admin_list_audit(integer) from public,anon;
grant execute on function public.admin_list_audit(integer) to authenticated;

create or replace function public.admin_set_badge(target_user uuid,target_badge text,should_grant boolean default true)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  if target_badge not in ('admin','bug_hunter','verified','partner') then raise exception 'Emblema inválido. Catálogo oficial: Administrador, Caçador de Bugs, Verificado e Parceiro.'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_user) then raise exception 'Usuário não encontrado.'; end if;
  if should_grant then
    insert into public.profile_badges(user_id,badge_key) values(target_user,target_badge) on conflict(user_id,badge_key) do nothing;
  else
    if target_badge='admin' and exists(select 1 from public.user_roles r where r.user_id=target_user and r.role='admin') then raise exception 'Não remova a insígnia administrativa de uma conta administradora por esta ação.'; end if;
    delete from public.profile_badges where user_id=target_user and badge_key=target_badge;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_user,details)
  values(auth.uid(),case when should_grant then 'badge_granted' else 'badge_removed' end,target_user,jsonb_build_object('badge',target_badge));
end;
$$;
revoke all on function public.admin_set_badge(uuid,text,boolean) from public,anon;
grant execute on function public.admin_set_badge(uuid,text,boolean) to authenticated;

-- As ações de banimento e remoção de conteúdo também registram o autor e o alvo na auditoria.
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
  insert into public.admin_audit_log(actor_id,action,target_user,details)
  values(auth.uid(),case when should_ban then 'user_banned' else 'user_unbanned' end,target_user,jsonb_build_object('reason',left(coalesce(ban_reason,''),500),'expires_at',ban_expires_at));
end;
$$;
revoke all on function public.admin_set_ban(uuid,boolean,text,timestamptz) from public,anon;
grant execute on function public.admin_set_ban(uuid,boolean,text,timestamptz) to authenticated;

create or replace function public.admin_delete_post(target_post uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare post_owner uuid;
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  select user_id into post_owner from public.posts where id=target_post;
  if post_owner is null then raise exception 'Publicação não encontrada.'; end if;
  delete from public.posts where id=target_post;
  insert into public.admin_audit_log(actor_id,action,target_user,details) values(auth.uid(),'post_deleted',post_owner,jsonb_build_object('post_id',target_post));
end;
$$;
revoke all on function public.admin_delete_post(uuid) from public,anon;
grant execute on function public.admin_delete_post(uuid) to authenticated;

create or replace function public.admin_delete_comment(target_comment uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare comment_owner uuid;
begin
  if auth.uid() is null or not public.teurchat_is_admin() then raise exception 'Acesso restrito à administração.'; end if;
  select user_id into comment_owner from public.comments where id=target_comment;
  if comment_owner is null then raise exception 'Comentário não encontrado.'; end if;
  delete from public.comments where id=target_comment;
  insert into public.admin_audit_log(actor_id,action,target_user,details) values(auth.uid(),'comment_deleted',comment_owner,jsonb_build_object('comment_id',target_comment));
end;
$$;
revoke all on function public.admin_delete_comment(uuid) from public,anon;
grant execute on function public.admin_delete_comment(uuid) to authenticated;
