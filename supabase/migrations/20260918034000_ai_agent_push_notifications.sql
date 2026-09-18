-- Web Push subscriptions for محمد's background notifications.
create table if not exists public.ai_agent_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_push_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_push_subscriptions_user_idx
  on public.ai_agent_push_subscriptions(user_id);

create index if not exists ai_agent_push_subscriptions_active_idx
  on public.ai_agent_push_subscriptions(active,last_push_at);

alter table public.ai_agent_push_subscriptions enable row level security;

create or replace function public.upsert_ai_agent_push_subscription(
  p_token uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  sid uuid;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if nullif(trim(coalesce(p_endpoint,'')),'') is null
     or nullif(trim(coalesce(p_p256dh,'')),'') is null
     or nullif(trim(coalesce(p_auth,'')),'') is null then
    raise exception 'بيانات الاشتراك غير مكتملة';
  end if;

  insert into public.ai_agent_push_subscriptions(
    user_id,endpoint,p256dh,auth,user_agent,active,last_push_at,updated_at
  )
  values(
    uid,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    nullif(left(trim(coalesce(p_user_agent,'')),500),''),
    true,
    null,
    now()
  )
  on conflict(endpoint) do update set
    user_id=excluded.user_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    user_agent=excluded.user_agent,
    active=true,
    updated_at=now();

  select s.id into sid
  from public.ai_agent_push_subscriptions s
  where s.endpoint=trim(p_endpoint);

  return sid;
end;
$function$;

create or replace function public.remove_ai_agent_push_subscription(
  p_token uuid,
  p_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  changed integer;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  update public.ai_agent_push_subscriptions
  set active=false, updated_at=now()
  where user_id=uid
    and endpoint=trim(coalesce(p_endpoint,''));

  get diagnostics changed = row_count;
  return changed > 0;
end;
$function$;

create or replace function public.list_ai_agent_push_candidates(
  p_min_age_hours integer default 6
)
returns table(
  id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  objective text,
  session_type text,
  session_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $function$
  select
    s.id,
    s.user_id,
    s.endpoint,
    s.p256dh,
    s.auth,
    coalesce(ses.objective,'لديك جلسة تدريبية لم تكتمل بعد.') as objective,
    ses.session_type,
    ses.updated_at as session_updated_at
  from public.ai_agent_push_subscriptions s
  join public.ai_agent_coaching_sessions ses
    on ses.user_id=s.user_id
  where s.active=true
    and ses.active=true
    and ses.updated_at <= now() - make_interval(hours=>greatest(1,coalesce(p_min_age_hours,6)))
    and (s.last_push_at is null or s.last_push_at <= now() - interval '24 hours')
  order by ses.updated_at asc
  limit 500;
$function$;

create or replace function public.mark_ai_agent_push_sent(
  p_id uuid
)
returns void
language sql
security definer
set search_path = public
as $function$
  update public.ai_agent_push_subscriptions
  set last_push_at=now(), updated_at=now()
  where id=p_id;
$function$;

create or replace function public.deactivate_ai_agent_push_subscription(
  p_id uuid
)
returns void
language sql
security definer
set search_path = public
as $function$
  update public.ai_agent_push_subscriptions
  set active=false, updated_at=now()
  where id=p_id;
$function$;

revoke all on function public.upsert_ai_agent_push_subscription(uuid,text,text,text,text)
from public, anon, authenticated;
revoke all on function public.remove_ai_agent_push_subscription(uuid,text)
from public, anon, authenticated;
revoke all on function public.list_ai_agent_push_candidates(integer)
from public, anon, authenticated;
revoke all on function public.mark_ai_agent_push_sent(uuid)
from public, anon, authenticated;
revoke all on function public.deactivate_ai_agent_push_subscription(uuid)
from public, anon, authenticated;

grant execute on function public.upsert_ai_agent_push_subscription(uuid,text,text,text,text)
to anon, authenticated;
grant execute on function public.remove_ai_agent_push_subscription(uuid,text)
to anon, authenticated;

notify pgrst, 'reload schema';
