-- Persistent AI Agent memory for cross-session continuity.
-- Stores only the authenticated user's recent conversation turns.
-- Server-side RPCs enforce session ownership; the table itself is not exposed to the browser.

create table if not exists public.ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_messages_user_created_idx
  on public.ai_agent_messages(user_id, created_at desc);

alter table public.ai_agent_messages enable row level security;

create or replace function public.get_ai_agent_memory(
  p_token uuid,
  p_limit integer default 24
)
returns table(
  role text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  lim integer := greatest(2, least(coalesce(p_limit,24), 48));
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select m.role, m.content, m.created_at
  from (
    select *
    from public.ai_agent_messages
    where user_id = uid
    order by created_at desc
    limit lim
  ) m
  order by m.created_at asc;
end;
$function$;

create or replace function public.save_ai_agent_message(
  p_token uuid,
  p_role text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if p_role not in ('user','assistant') then
    raise exception 'دور الرسالة غير صالح';
  end if;

  if trim(coalesce(p_content,'')) = '' then
    raise exception 'محتوى الرسالة فارغ';
  end if;

  insert into public.ai_agent_messages(user_id,role,content)
  values(uid,p_role,left(trim(p_content),6000))
  returning id into mid;

  -- Keep the memory compact. The newest 48 turns are retained.
  delete from public.ai_agent_messages x
  where x.user_id = uid
    and x.id in (
      select id
      from (
        select id,
               row_number() over(order by created_at desc) as rn
        from public.ai_agent_messages
        where user_id = uid
      ) q
      where q.rn > 48
    );

  return mid;
end;
$function$;

revoke all on function public.get_ai_agent_memory(uuid,integer)
from public, anon, authenticated;
revoke all on function public.save_ai_agent_message(uuid,text,text)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_memory(uuid,integer) to anon, authenticated;
grant execute on function public.save_ai_agent_message(uuid,text,text) to anon, authenticated;

notify pgrst, 'reload schema';
