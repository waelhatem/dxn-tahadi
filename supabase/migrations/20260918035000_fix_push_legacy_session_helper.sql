-- Push subscriptions must work with the legacy/current session helper
-- already present in this production schema.
-- Do not depend on app_current_user_id(), which may not exist on older deployments.

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
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if nullif(trim(coalesce(p_endpoint,'')),'') is null
     or nullif(trim(coalesce(p_p256dh,'')),'') is null
     or nullif(trim(coalesce(p_auth,'')),'') is null then
    raise exception 'بيانات الاشتراك غير مكتملة';
  end if;

  insert into public.ai_agent_push_subscriptions(
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    active,
    updated_at
  )
  values(
    uid,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    nullif(left(trim(coalesce(p_user_agent,'')),500),''),
    true,
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
  uid := public.current_user_id(p_token);

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

grant execute on function public.upsert_ai_agent_push_subscription(
  uuid,text,text,text,text
) to anon, authenticated, service_role;

grant execute on function public.remove_ai_agent_push_subscription(
  uuid,text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
