-- Ragwan Success Plan completion records.
-- A sponsor records the member with whom they completed the ten-step plan.
-- Records are append-only; existing member/team data is never deleted or overwritten.

create table if not exists public.ragwan_plan_completions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  sponsor_user_id uuid not null references public.app_users(id) on delete cascade,
  sponsor_member_id uuid references public.members(id) on delete set null,
  member_name text not null,
  sponsor_member_name text not null,
  completed_at timestamptz not null default now()
);

create index if not exists ragwan_plan_completions_member_idx
  on public.ragwan_plan_completions(member_id, completed_at desc);

create index if not exists ragwan_plan_completions_sponsor_idx
  on public.ragwan_plan_completions(sponsor_member_id, completed_at desc);

alter table public.ragwan_plan_completions enable row level security;
revoke all on public.ragwan_plan_completions from public, anon, authenticated;

create or replace function public.record_ragwan_plan_completion(
  p_token uuid,
  p_member_name text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  sponsor_member_id uuid;
  sponsor_team_id uuid;
  sponsor_name text;
  target_member_id uuid;
  target_name text;
  target_count integer;
  completion_id uuid;
  leader_row record;
begin
  uid := public.app_current_user_id(p_token);

  if uid is null or public.app_current_role(p_token) <> 'member' then
    raise exception 'هذه العملية متاحة للسبونسر فقط';
  end if;

  select au.member_id, m.team_id, m.name
    into sponsor_member_id, sponsor_team_id, sponsor_name
  from public.app_users au
  join public.members m on m.id = au.member_id
  where au.id = uid
    and au.active = true
    and m.active = true
  limit 1;

  if sponsor_member_id is null then
    raise exception 'تعذر تحديد حساب السبونسر الحالي';
  end if;

  target_name := trim(coalesce(p_member_name, ''));
  if target_name = '' then
    raise exception 'اكتب اسم العضو أولًا';
  end if;

  select count(*)
    into target_count
  from public.members m
  where m.active = true
    and m.team_id = sponsor_team_id
    and lower(trim(coalesce(m.name,''))) = lower(target_name);

  if target_count = 0 then
    raise exception 'لم يتم العثور على عضو بهذا الاسم ضمن فريقك';
  end if;

  if target_count > 1 then
    raise exception 'يوجد أكثر من عضو بهذا الاسم؛ اكتب الاسم الكامل للتمييز بينهم';
  end if;

  select m.id, m.name
    into target_member_id, target_name
  from public.members m
  where m.active = true
    and m.team_id = sponsor_team_id
    and lower(trim(coalesce(m.name,''))) = lower(target_name)
  limit 1;

  insert into public.ragwan_plan_completions(
    member_id,
    sponsor_user_id,
    sponsor_member_id,
    member_name,
    sponsor_member_name
  )
  values(
    target_member_id,
    uid,
    sponsor_member_id,
    target_name,
    sponsor_name
  )
  returning id into completion_id;

  -- Notify every active leader. This keeps the event durable in the existing
  -- database-backed notification system and preserves the completion record.
  for leader_row in
    select u.id as user_id, u.member_id
    from public.app_users u
    where u.role = 'leader'
      and u.active = true
  loop
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
    values(
      leader_row.user_id,
      leader_row.member_id,
      'ragwan_plan_completed',
      completion_id,
      '🏆',
      'إكمال خطة رجوان جديدة',
      format('%s أكمل الخطة مع العضو %s.', sponsor_name, target_name),
      'teams',
      'فتح ملف العضو'
    )
    on conflict (recipient_user_id, event_type, source_id) do nothing;
  end loop;

  return json_build_object(
    'ok', true,
    'completion_id', completion_id,
    'member_id', target_member_id,
    'member_name', target_name,
    'sponsor_member_name', sponsor_name,
    'completed_at', now()
  );
end;
$$;

create or replace function public.get_ragwan_plan_completions(
  p_token uuid,
  p_member_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  role_name text;
  own_member_id uuid;
begin
  uid := public.app_current_user_id(p_token);
  role_name := public.app_current_role(p_token);

  if uid is null or role_name is null then
    raise exception 'انتهت الجلسة';
  end if;

  if role_name = 'member' then
    select member_id into own_member_id
    from public.app_users
    where id = uid and active = true;

    if own_member_id is null or own_member_id <> p_member_id then
      raise exception 'غير مصرح';
    end if;
  elsif role_name <> 'leader' then
    raise exception 'غير مصرح';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'id', r.id,
          'member_id', r.member_id,
          'member_name', r.member_name,
          'sponsor_member_name', r.sponsor_member_name,
          'completed_at', r.completed_at
        )
        order by r.completed_at desc
      )
      from public.ragwan_plan_completions r
      where r.member_id = p_member_id
    ),
    '[]'::json
  );
end;
$$;

revoke all on function public.record_ragwan_plan_completion(uuid,text)
  from public, anon, authenticated;

revoke all on function public.get_ragwan_plan_completions(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.record_ragwan_plan_completion(uuid,text)
  to anon, authenticated;

grant execute on function public.get_ragwan_plan_completions(uuid,uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
