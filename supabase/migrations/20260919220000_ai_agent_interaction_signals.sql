-- طبقة الإشارات الحالية الخفيفة لمحمد.
-- هذه الإشارة قصيرة المدى وليست تشخيصًا نفسيًا ولا ذاكرة شخصية دائمة.

alter table public.ai_agent_conversation_state
  add column if not exists interaction_signal text
    check (
      interaction_signal is null
      or interaction_signal in (
        'neutral',
        'positive',
        'hesitant',
        'confused',
        'frustrated',
        'rushed'
      )
    ),
  add column if not exists interaction_confidence numeric(3,2)
    check (
      interaction_confidence is null
      or (interaction_confidence >= 0 and interaction_confidence <= 1)
    );

drop function if exists public.get_ai_agent_conversation_state(uuid);
drop function if exists public.upsert_ai_agent_conversation_state(uuid,text,text,text,text,text,timestamptz);

create or replace function public.get_ai_agent_conversation_state(p_token uuid)
returns table(
  current_topic text,
  open_loop text,
  pending_question text,
  pending_member_action text,
  state_status text,
  interaction_signal text,
  interaction_confidence numeric,
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
    s.interaction_signal,
    s.interaction_confidence,
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
  p_last_member_message_at timestamptz default null,
  p_interaction_signal text default null,
  p_interaction_confidence numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  st text := lower(trim(coalesce(p_state_status,'open')));
  sig text := lower(trim(coalesce(p_interaction_signal,'')));
  conf numeric := p_interaction_confidence;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if st not in ('open','waiting_member','closed') then
    st := 'open';
  end if;

  if sig not in ('neutral','positive','hesitant','confused','frustrated','rushed') then
    sig := null;
  end if;

  if conf is not null then
    conf := greatest(0, least(1, conf));
  end if;

  insert into public.ai_agent_conversation_state(
    user_id,
    current_topic,
    open_loop,
    pending_question,
    pending_member_action,
    state_status,
    interaction_signal,
    interaction_confidence,
    last_member_message_at,
    updated_at
  )
  values(
    uid,
    nullif(left(trim(coalesce(p_current_topic,'')),500),''),
    nullif(left(trim(coalesce(p_open_loop,'')),1000),''),
    nullif(left(trim(coalesce(p_pending_question,'')),700),''),
    nullif(left(trim(coalesce(p_pending_member_action,'')),700),''),
    st,
    nullif(sig,''),
    conf,
    p_last_member_message_at,
    now()
  )
  on conflict (user_id) do update set
    current_topic=excluded.current_topic,
    open_loop=excluded.open_loop,
    pending_question=excluded.pending_question,
    pending_member_action=excluded.pending_member_action,
    state_status=excluded.state_status,
    interaction_signal=excluded.interaction_signal,
    interaction_confidence=excluded.interaction_confidence,
    last_member_message_at=excluded.last_member_message_at,
    updated_at=now();
end;
$function$;

revoke all on function public.get_ai_agent_conversation_state(uuid)
from public, anon, authenticated;

revoke all on function public.upsert_ai_agent_conversation_state(uuid,text,text,text,text,text,timestamptz,text,numeric)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_conversation_state(uuid)
to service_role;

grant execute on function public.upsert_ai_agent_conversation_state(uuid,text,text,text,text,text,timestamptz,text,numeric)
to service_role;

notify pgrst, 'reload schema';