-- Persistent guided coaching session state for محمد.
-- Allows the agent to conduct structured sessions instead of only answering questions.

create table if not exists public.ai_agent_coaching_sessions (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  active boolean not null default false,
  session_type text not null default 'coaching'
    check (session_type in ('coaching','practice','roleplay','review')),
  objective text,
  phase text not null default 'discover'
    check (phase in ('discover','explain','practice','feedback','next_step','complete')),
  turn_count integer not null default 0,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_agent_coaching_sessions enable row level security;

create or replace function public.get_ai_agent_coaching_session(p_token uuid)
returns table(
  active boolean,
  session_type text,
  objective text,
  phase text,
  turn_count integer,
  started_at timestamptz,
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
  select s.active,s.session_type,s.objective,s.phase,s.turn_count,s.started_at,s.updated_at
  from public.ai_agent_coaching_sessions s
  where s.user_id = uid;
end;
$function$;

create or replace function public.upsert_ai_agent_coaching_session(
  p_token uuid,
  p_active boolean,
  p_session_type text default 'coaching',
  p_objective text default null,
  p_phase text default 'discover',
  p_turn_count integer default 0,
  p_started_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  st text := lower(trim(coalesce(p_session_type,'coaching')));
  ph text := lower(trim(coalesce(p_phase,'discover')));
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if st not in ('coaching','practice','roleplay','review') then st := 'coaching'; end if;
  if ph not in ('discover','explain','practice','feedback','next_step','complete') then ph := 'discover'; end if;

  insert into public.ai_agent_coaching_sessions(
    user_id,active,session_type,objective,phase,turn_count,started_at,updated_at
  )
  values(
    uid,
    coalesce(p_active,false),
    st,
    nullif(left(trim(coalesce(p_objective,'')),500),''),
    ph,
    greatest(0,least(coalesce(p_turn_count,0),100)),
    p_started_at,
    now()
  )
  on conflict (user_id) do update set
    active=excluded.active,
    session_type=excluded.session_type,
    objective=excluded.objective,
    phase=excluded.phase,
    turn_count=excluded.turn_count,
    started_at=excluded.started_at,
    updated_at=now();
end;
$function$;

revoke all on function public.get_ai_agent_coaching_session(uuid)
from public, anon, authenticated;
revoke all on function public.upsert_ai_agent_coaching_session(uuid,boolean,text,text,text,integer,timestamptz)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_coaching_session(uuid) to anon, authenticated;
grant execute on function public.upsert_ai_agent_coaching_session(uuid,boolean,text,text,text,integer,timestamptz)
to anon, authenticated;

notify pgrst, 'reload schema';
