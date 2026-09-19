-- Short-term conversational state for محمد.
-- Tracks the live topic and unresolved "open loops" separately from durable memory.

create table if not exists public.ai_agent_conversation_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  current_topic text,
  open_loop text,
  pending_question text,
  pending_member_action text,
  state_status text not null default 'open'
    check (state_status in ('open','waiting_member','closed')),
  last_member_message_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_agent_conversation_state enable row level security;

create or replace function public.get_ai_agent_conversation_state(p_token uuid)
returns table(
  current_topic text,
  open_loop text,
  pending_question text,
  pending_member_action text,
  state_status text,
  last_member_message_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select
    s.current_topic,
    s.open_loop,
    s.pending_question,
    s.pending_member_action,
    s.state_status,
    s.last_member_message_at,
    s.updated_at
  from public.ai_agent_conversation_state s
  where s.user_id = uid;
end;
$function$;

create or replace function public.upsert_ai_agent_conversation_state(
  p_token uuid,
  p_current_topic text default null,
  p_open_loop text default null,
  p_pending_question text default null,
  p_pending_member_action text default null,
  p_state_status text default 'open',
  p_last_member_message_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  st text := lower(trim(coalesce(p_state_status,'open')));
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if st not in ('open','waiting_member','closed') then st := 'open'; end if;

  insert into public.ai_agent_conversation_state(
    user_id,current_topic,open_loop,pending_question,pending_member_action,
    state_status,last_member_message_at,updated_at
  )
  values(
    uid,
    nullif(left(trim(coalesce(p_current_topic,'')),500),''),
    nullif(left(trim(coalesce(p_open_loop,'')),1000),''),
    nullif(left(trim(coalesce(p_pending_question,'')),700),''),
    nullif(left(trim(coalesce(p_pending_member_action,'')),700),''),
    st,
    p_last_member_message_at,
    now()
  )
  on conflict (user_id) do update set
    current_topic=excluded.current_topic,
    open_loop=excluded.open_loop,
    pending_question=excluded.pending_question,
    pending_member_action=excluded.pending_member_action,
    state_status=excluded.state_status,
    last_member_message_at=excluded.last_member_message_at,
    updated_at=now();
end;
$function$;

revoke all on function public.get_ai_agent_conversation_state(uuid)
from public, anon, authenticated;
revoke all on function public.upsert_ai_agent_conversation_state(uuid,text,text,text,text,text,timestamptz)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_conversation_state(uuid) to anon, authenticated;
grant execute on function public.upsert_ai_agent_conversation_state(uuid,text,text,text,text,text,timestamptz)
to anon, authenticated;

notify pgrst, 'reload schema';
