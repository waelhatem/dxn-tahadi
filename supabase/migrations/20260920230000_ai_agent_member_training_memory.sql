-- ============================================================
-- Permanent personal training memory per member
-- Each member gets a durable training journal.
-- New learning is appended; old training events are immutable.
-- ============================================================

create table if not exists public.ai_agent_member_training_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id),
  member_id uuid,
  training_session_id text,
  session_type text not null default 'coaching',
  topic text,
  objective text,
  phase text,
  member_statement text,
  coach_action text,
  outcome text,
  lesson text,
  next_step text,
  member_facts jsonb not null default '[]'::jsonb,
  source_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_member_training_memory_member_idx
  on public.ai_agent_member_training_memory(member_id, created_at desc);

create index if not exists ai_agent_member_training_memory_user_idx
  on public.ai_agent_member_training_memory(user_id, created_at desc);

alter table public.ai_agent_member_training_memory enable row level security;

revoke all on table public.ai_agent_member_training_memory from public, anon, authenticated;

create or replace function public.prevent_member_training_memory_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'سجل التدريب الشخصي للعضو محفوظ ولا يسمح بتعديله أو حذفه. أضف جلسة أو تعلمًا جديدًا.';
end;
$function$;

drop trigger if exists trg_member_training_memory_immutable
on public.ai_agent_member_training_memory;

create trigger trg_member_training_memory_immutable
before update or delete
on public.ai_agent_member_training_memory
for each row
execute function public.prevent_member_training_memory_mutation();

create or replace function public.append_ai_agent_member_training_memory(
  p_token uuid,
  p_memory jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_id uuid;
  m jsonb := coalesce(p_memory, '{}'::jsonb);
  v_session_type text := lower(trim(coalesce(m->>'session_type','coaching')));
  v_phase text := lower(trim(coalesce(m->>'phase','')));
  v_facts jsonb := coalesce(m->'member_facts','[]'::jsonb);
begin
  select s.user_id, au.member_id
    into v_user_id, v_member_id
  from public.sessions s
  join public.app_users au on au.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and au.active = true
  limit 1;

  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  if v_session_type not in ('coaching','practice','roleplay','review') then
    v_session_type := 'coaching';
  end if;

  if v_phase not in ('discover','explain','practice','feedback','next_step','complete') then
    v_phase := null;
  end if;

  if jsonb_typeof(v_facts) <> 'array' then
    v_facts := '[]'::jsonb;
  end if;

  if nullif(trim(coalesce(m->>'topic','')), '') is null
     and nullif(trim(coalesce(m->>'lesson','')), '') is null
     and nullif(trim(coalesce(m->>'outcome','')), '') is null
     and nullif(trim(coalesce(m->>'next_step','')), '') is null
     and jsonb_array_length(v_facts) = 0 then
    return null;
  end if;

  insert into public.ai_agent_member_training_memory(
    user_id,
    member_id,
    training_session_id,
    session_type,
    topic,
    objective,
    phase,
    member_statement,
    coach_action,
    outcome,
    lesson,
    next_step,
    member_facts,
    source_message_id
  )
  values(
    v_user_id,
    v_member_id,
    nullif(left(trim(coalesce(m->>'training_session_id','')),200),''),
    v_session_type,
    nullif(left(trim(coalesce(m->>'topic','')),500),''),
    nullif(left(trim(coalesce(m->>'objective','')),500),''),
    v_phase,
    nullif(left(trim(coalesce(m->>'member_statement','')),3000),''),
    nullif(left(trim(coalesce(m->>'coach_action','')),3000),''),
    nullif(left(trim(coalesce(m->>'outcome','')),1200),''),
    nullif(left(trim(coalesce(m->>'lesson','')),2000),''),
    nullif(left(trim(coalesce(m->>'next_step','')),1200),''),
    v_facts,
    nullif(left(trim(coalesce(m->>'source_message_id','')),200),'')
  )
  returning id into v_id;

  perform public.ai_agent_append_permanent_event(
    v_user_id,
    v_member_id,
    'created',
    'member_training_memory',
    v_id::text,
    jsonb_build_object(
      'training_memory_id', v_id,
      'memory', m
    )
  );

  return v_id;
end;
$function$;

create or replace function public.get_ai_agent_member_training_memory(
  p_token uuid,
  p_limit integer default 80
)
returns table(
  id uuid,
  training_session_id text,
  session_type text,
  topic text,
  objective text,
  phase text,
  member_statement text,
  coach_action text,
  outcome text,
  lesson text,
  next_step text,
  member_facts jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_member_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit,80),300));
begin
  select s.user_id, au.member_id
    into v_user_id, v_member_id
  from public.sessions s
  join public.app_users au on au.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and au.active = true
  limit 1;

  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select
    t.id,
    t.training_session_id,
    t.session_type,
    t.topic,
    t.objective,
    t.phase,
    t.member_statement,
    t.coach_action,
    t.outcome,
    t.lesson,
    t.next_step,
    t.member_facts,
    t.created_at
  from public.ai_agent_member_training_memory t
  where t.user_id = v_user_id
    and (v_member_id is null or t.member_id = v_member_id)
  order by t.created_at desc
  limit v_limit;
end;
$function$;

revoke all on function public.append_ai_agent_member_training_memory(uuid,jsonb)
from public, anon, authenticated;

grant execute on function public.append_ai_agent_member_training_memory(uuid,jsonb)
to service_role;

revoke all on function public.get_ai_agent_member_training_memory(uuid,integer)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_member_training_memory(uuid,integer)
to service_role;

notify pgrst, 'reload schema';
