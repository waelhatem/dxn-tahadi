-- Ragwan plan completion records: a sponsor can record which member completed the plan with them.
create table if not exists public.ragwan_plan_completions (
  id uuid primary key default gen_random_uuid(),
  sponsor_user_id uuid not null references public.app_users(id) on delete cascade,
  sponsor_member_id uuid references public.members(id) on delete set null,
  completed_member_id uuid references public.members(id) on delete set null,
  completed_member_name text not null,
  completed_member_no text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ragwan_plan_completion_name_nonempty check (char_length(trim(completed_member_name)) > 0)
);

create index if not exists ragwan_plan_completions_member_idx
  on public.ragwan_plan_completions(completed_member_id, completed_at desc);

create index if not exists ragwan_plan_completions_sponsor_idx
  on public.ragwan_plan_completions(sponsor_user_id, completed_at desc);

alter table public.ragwan_plan_completions enable row level security;
revoke all on public.ragwan_plan_completions from public, anon, authenticated;

create or replace function public.record_ragwan_plan_completion(
  p_token uuid,
  p_member_id uuid,
  p_member_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_sponsor_member_id uuid;
  v_role text;
  v_member_name text;
  v_member_no text;
  v_id uuid;
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  select au.role, au.member_id
    into v_role, v_sponsor_member_id
  from public.app_users au
  where au.id = v_user_id
    and au.active = true
  limit 1;

  if v_role <> 'member' then
    raise exception 'تسجيل إكمال خطة رجوان متاح لحساب العضو فقط';
  end if;

  if p_member_id is null then
    raise exception 'اختر العضو الذي أكملت معه الخطة من قائمة الأعضاء';
  end if;

  select trim(coalesce(m.name,'')), trim(coalesce(m.member_no::text,''))
    into v_member_name, v_member_no
  from public.members m
  where m.id = p_member_id
  limit 1;

  if v_member_name is null or v_member_name = '' then
    raise exception 'العضو المحدد غير موجود';
  end if;

  if trim(coalesce(p_member_name,'')) <> v_member_name then
    raise exception 'بيانات العضو المحدد غير متطابقة';
  end if;

  insert into public.ragwan_plan_completions(
    sponsor_user_id,
    sponsor_member_id,
    completed_member_id,
    completed_member_name,
    completed_member_no
  )
  values(
    v_user_id,
    v_sponsor_member_id,
    p_member_id,
    v_member_name,
    nullif(v_member_no,'')
  )
  returning id into v_id;

  -- Notify every active leader account.
  insert into public.app_notifications(
    recipient_user_id,
    recipient_member_id,
    event_type,
    source_id,
    icon,
    title,
    body,
    action_tab,
    action_label
  )
  select
    au.id,
    au.member_id,
    'ragwan_plan_completed',
    v_id,
    '🏆',
    'إكمال خطة رجوان',
    format(
      'أكمل العضو %s خطة رجوان كاملة مع السبونسر %s.',
      v_member_name,
      coalesce((select trim(coalesce(m2.name,'')) from public.members m2 where m2.id=v_sponsor_member_id),'السبونسر')
    ),
    'teams',
    'عرض الأعضاء'
  from public.app_users au
  where au.role = 'leader'
    and au.active = true
  on conflict (recipient_user_id, event_type, source_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'member_id', p_member_id,
    'member_name', v_member_name,
    'member_no', nullif(v_member_no,'')
  );
end;
$function$;

revoke all on function public.record_ragwan_plan_completion(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.record_ragwan_plan_completion(uuid,uuid,text)
to anon, authenticated;

create or replace function public.get_ragwan_plan_completions(
  p_token uuid,
  p_member_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid;
  v_role text;
  result json;
begin
  v_uid := public.app_current_user_id(p_token);
  if v_uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  select au.role into v_role
  from public.app_users au
  where au.id=v_uid and au.active=true
  limit 1;

  if v_role not in ('leader','member') then
    raise exception 'غير مصرح';
  end if;

  if v_role='member' and not exists(
    select 1
    from public.ragwan_plan_completions r
    where r.completed_member_id=p_member_id
      and (
        r.sponsor_user_id=v_uid
        or r.sponsor_member_id=(select member_id from public.app_users where id=v_uid)
      )
  ) and not exists(
    select 1 from public.app_users au where au.id=v_uid and au.member_id=p_member_id
  ) then
    raise exception 'غير مصرح بعرض سجل هذا العضو';
  end if;

  select coalesce(json_agg(
    json_build_object(
      'id',r.id,
      'sponsor_member_id',r.sponsor_member_id,
      'sponsor_member_name',(select trim(coalesce(m.name,'')) from public.members m where m.id=r.sponsor_member_id),
      'completed_member_id',r.completed_member_id,
      'completed_member_name',r.completed_member_name,
      'completed_member_no',r.completed_member_no,
      'completed_at',r.completed_at
    ) order by r.completed_at desc
  ),'[]'::json)
  into result
  from public.ragwan_plan_completions r
  where r.completed_member_id=p_member_id;

  return result;
end;
$function$;

revoke all on function public.get_ragwan_plan_completions(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.get_ragwan_plan_completions(uuid,uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
