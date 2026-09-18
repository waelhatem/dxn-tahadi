-- Temporary test mode for the background Push test.
-- Allows p_min_age_hours = 0 so the next Cron run can target an active session immediately.
-- Reverts to the normal >=6-hour behavior after the test phase.

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
    coalesce(
      ses.objective,
      'لديك جلسة تدريبية لم تكتمل بعد.'
    ) as objective,
    ses.session_type,
    ses.updated_at as session_updated_at
  from public.ai_agent_push_subscriptions s
  join public.ai_agent_coaching_sessions ses
    on ses.user_id=s.user_id
  where s.active=true
    and ses.active=true
    and ses.updated_at <= now()
      - make_interval(hours=>greatest(0,coalesce(p_min_age_hours,6)))
    and (
      s.last_push_at is null
      or s.last_push_at <= now() - interval '24 hours'
    )
  order by ses.updated_at asc
  limit 500;
$function$;

grant execute on function public.list_ai_agent_push_candidates(integer)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
