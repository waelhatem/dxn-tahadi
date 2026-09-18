-- Persistent coaching profile for محمد.
-- Stores only non-sensitive learning/coaching context explicitly inferred from the member's
-- conversations: goal, experience level, focus, strengths, gaps and next step.

create table if not exists public.ai_agent_coaching_profile (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  goal text,
  experience_level text not null default 'unknown'
    check (experience_level in ('unknown','beginner','intermediate','advanced')),
  focus_area text,
  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  current_next_step text,
  updated_at timestamptz not null default now()
);

alter table public.ai_agent_coaching_profile enable row level security;

create or replace function public.get_ai_agent_coaching_profile(p_token uuid)
returns table(
  goal text,
  experience_level text,
  focus_area text,
  strengths jsonb,
  gaps jsonb,
  current_next_step text,
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
  select
    p.goal,
    p.experience_level,
    p.focus_area,
    p.strengths,
    p.gaps,
    p.current_next_step,
    p.updated_at
  from public.ai_agent_coaching_profile p
  where p.user_id = uid;
end;
$function$;

create or replace function public.upsert_ai_agent_coaching_profile(
  p_token uuid,
  p_goal text default null,
  p_experience_level text default 'unknown',
  p_focus_area text default null,
  p_strengths jsonb default '[]'::jsonb,
  p_gaps jsonb default '[]'::jsonb,
  p_current_next_step text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  lvl text := lower(trim(coalesce(p_experience_level,'unknown')));
begin
  uid := public.app_current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if lvl not in ('unknown','beginner','intermediate','advanced') then
    lvl := 'unknown';
  end if;

  insert into public.ai_agent_coaching_profile(
    user_id,goal,experience_level,focus_area,strengths,gaps,current_next_step,updated_at
  )
  values(
    uid,
    nullif(left(trim(coalesce(p_goal,'')),500),''),
    lvl,
    nullif(left(trim(coalesce(p_focus_area,'')),300),''),
    case when jsonb_typeof(coalesce(p_strengths,'[]'::jsonb))='array' then p_strengths else '[]'::jsonb end,
    case when jsonb_typeof(coalesce(p_gaps,'[]'::jsonb))='array' then p_gaps else '[]'::jsonb end,
    nullif(left(trim(coalesce(p_current_next_step,'')),500),''),
    now()
  )
  on conflict (user_id) do update set
    goal=excluded.goal,
    experience_level=excluded.experience_level,
    focus_area=excluded.focus_area,
    strengths=excluded.strengths,
    gaps=excluded.gaps,
    current_next_step=excluded.current_next_step,
    updated_at=now();
end;
$function$;

revoke all on function public.get_ai_agent_coaching_profile(uuid)
from public, anon, authenticated;
revoke all on function public.upsert_ai_agent_coaching_profile(uuid,text,text,text,jsonb,jsonb,text)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_coaching_profile(uuid) to anon, authenticated;
grant execute on function public.upsert_ai_agent_coaching_profile(uuid,text,text,text,jsonb,jsonb,text) to anon, authenticated;

notify pgrst, 'reload schema';
