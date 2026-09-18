-- Persistent daily execution state for محمد.
-- Stores completed daily task keys so the agent can advance through the plan.

create table if not exists public.ai_agent_daily_coaching_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  plan_date date not null default current_date,
  completed_task_keys jsonb not null default '[]'::jsonb,
  current_task_key text,
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_daily_coaching_state_plan_date_idx
  on public.ai_agent_daily_coaching_state(plan_date);

alter table public.ai_agent_daily_coaching_state enable row level security;

create or replace function public.get_ai_agent_daily_coaching_state(p_token uuid)
returns table(
  plan_date date,
  completed_task_keys jsonb,
  current_task_key text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select s.plan_date,s.completed_task_keys,s.current_task_key,s.updated_at
  from public.ai_agent_daily_coaching_state s
  where s.user_id = uid;
end;
$function$;

create or replace function public.upsert_ai_agent_daily_coaching_state(
  p_token uuid,
  p_plan_date date default current_date,
  p_completed_task_keys jsonb default '[]'::jsonb,
  p_current_task_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  d date := coalesce(p_plan_date,current_date);
  keys jsonb := case
    when jsonb_typeof(coalesce(p_completed_task_keys,'[]'::jsonb))='array'
      then coalesce(p_completed_task_keys,'[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  insert into public.ai_agent_daily_coaching_state(
    user_id,plan_date,completed_task_keys,current_task_key,updated_at
  )
  values(
    uid,
    d,
    keys,
    nullif(left(trim(coalesce(p_current_task_key,'')),200),''),
    now()
  )
  on conflict (user_id) do update set
    plan_date=excluded.plan_date,
    completed_task_keys=excluded.completed_task_keys,
    current_task_key=excluded.current_task_key,
    updated_at=now();
end;
$function$;

create or replace function public.complete_ai_agent_daily_task(
  p_token uuid,
  p_task_key text
)
returns table(
  completed_task_key text,
  completed_count integer
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  key text := nullif(left(trim(coalesce(p_task_key,'')),200),'');
  d date := current_date;
  keys jsonb := '[]'::jsonb;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if key is null then
    raise exception 'مفتاح المهمة مطلوب';
  end if;

  select coalesce(s.plan_date,current_date),
         case when jsonb_typeof(s.completed_task_keys)='array'
              then s.completed_task_keys else '[]'::jsonb end
    into d, keys
  from public.ai_agent_daily_coaching_state s
  where s.user_id=uid;

  if not (keys @> jsonb_build_array(key)) then
    keys := keys || jsonb_build_array(key);
  end if;

  insert into public.ai_agent_daily_coaching_state(
    user_id,plan_date,completed_task_keys,current_task_key,updated_at
  )
  values(uid,d,keys,null,now())
  on conflict (user_id) do update set
    plan_date=excluded.plan_date,
    completed_task_keys=excluded.completed_task_keys,
    current_task_key=null,
    updated_at=now();

  return query select key, jsonb_array_length(keys);
end;
$function$;

revoke all on function public.get_ai_agent_daily_coaching_state(uuid)
from public, anon, authenticated;
revoke all on function public.upsert_ai_agent_daily_coaching_state(uuid,date,jsonb,text)
from public, anon, authenticated;
revoke all on function public.complete_ai_agent_daily_task(uuid,text)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_daily_coaching_state(uuid)
to anon, authenticated;
grant execute on function public.upsert_ai_agent_daily_coaching_state(uuid,date,jsonb,text)
to anon, authenticated;
grant execute on function public.complete_ai_agent_daily_task(uuid,text)
to anon, authenticated;

notify pgrst, 'reload schema';
