-- Ragwan trainee tracking: final completion, table status, and sponsor + leader notifications.
-- This migration is compatible with the existing ragwan_plan_completions schema
-- created by 20261002120000_ragwan_plan_member_completion.sql.

create or replace function public.save_ragwan_training_step(
  p_token uuid,
  p_trainee_member_id uuid,
  p_step integer,
  p_status text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  previous_missing integer;
  v_status text := lower(trim(coalesce(p_status,'')));
begin
  if p_step is null or p_step < 1 or p_step > 10 then
    raise exception 'رقم الخطوة غير صالح';
  end if;

  if v_status not in ('started','completed') then
    raise exception 'حالة الخطوة غير صالحة';
  end if;

  select * into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id = s.user_id
    and trainee_member_id = p_trainee_member_id
  limit 1;

  if e.id is null then
    raise exception 'اختر المتدرب أولًا';
  end if;

  if p_step > 1 then
    select count(*) into previous_missing
    from generate_series(1, p_step - 1) n(step)
    where not exists (
      select 1
      from public.ragwan_training_progress p
      where p.enrollment_id = e.id
        and p.step = n.step
        and p.status = 'completed'
    );

    if previous_missing > 0 then
      raise exception 'لا يمكنك متابعة هذه الخطوة قبل إكمال الخطوات السابقة بالترتيب';
    end if;
  end if;

  insert into public.ragwan_training_progress(
    enrollment_id,
    sponsor_user_id,
    trainee_member_id,
    step,
    status,
    started_at,
    completed_at,
    updated_at
  )
  values(
    e.id,
    s.user_id,
    e.trainee_member_id,
    p_step,
    v_status,
    now(),
    case when v_status = 'completed' then now() else null end,
    now()
  )
  on conflict(enrollment_id, step) do update set
    status = case
      when ragwan_training_progress.status = 'completed' then 'completed'
      else excluded.status
    end,
    started_at = coalesce(ragwan_training_progress.started_at, excluded.started_at),
    completed_at = case
      when ragwan_training_progress.status = 'completed' then ragwan_training_progress.completed_at
      else excluded.completed_at
    end,
    updated_at = now();

  -- The plan-level completed_at is deliberately NOT set here.
  -- It is set only after the sponsor confirms the trainee in the final completion field.
  update public.ragwan_training_enrollments
  set last_activity_at = now()
  where id = e.id;

  return public.get_ragwan_training_progress(p_token, p_trainee_member_id);
end;
$$;

create or replace function public.record_ragwan_plan_completion_for_member(
  p_token uuid,
  p_member_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  sponsor_name text;
  sponsor_member_no text;
  trainee_name text;
  trainee_member_no text;
  completion_id uuid;
  completion_time timestamptz;
begin
  select * into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  select trim(coalesce(m.name,'')),
         nullif(trim(coalesce(m.member_no::text,'')),'')
    into sponsor_name, sponsor_member_no
  from public.members m
  where m.id = s.member_id
  limit 1;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id = s.user_id
    and trainee_member_id = p_member_id
  limit 1;

  if e.id is null then
    raise exception 'اختر المتدرب أولًا';
  end if;

  if exists (
    select 1
    from generate_series(1,10) n(step)
    where not exists (
      select 1
      from public.ragwan_training_progress p
      where p.enrollment_id = e.id
        and p.step = n.step
        and p.status = 'completed'
    )
  ) then
    raise exception 'لا يمكن تسجيل إكمال الخطة قبل إكمال الأبواب العشرة بالترتيب';
  end if;

  select trim(coalesce(m.name,'')),
         nullif(trim(coalesce(m.member_no::text,'')),'')
    into trainee_name, trainee_member_no
  from public.members m
  where m.id = e.trainee_member_id
    and m.active = true
  limit 1;

  if trainee_name is null or trainee_name = '' then
    trainee_name := e.trainee_name;
  end if;

  if trainee_member_no is null or trainee_member_no = '' then
    trainee_member_no := nullif(trim(coalesce(e.trainee_member_no,'')),'');
  end if;

  select r.id, r.completed_at
    into completion_id, completion_time
  from public.ragwan_plan_completions r
  where r.sponsor_user_id = s.user_id
    and r.completed_member_id = e.trainee_member_id
  order by r.completed_at desc
  limit 1;

  if completion_id is null then
    insert into public.ragwan_plan_completions(
      sponsor_user_id,
      sponsor_member_id,
      completed_member_id,
      completed_member_name,
      completed_member_no
    )
    values(
      s.user_id,
      s.member_id,
      e.trainee_member_id,
      trainee_name,
      trainee_member_no
    )
    returning id, completed_at into completion_id, completion_time;
  end if;

  update public.ragwan_training_enrollments
  set completed_at = coalesce(completed_at, completion_time, now()),
      last_activity_at = now(),
      trainee_name = trainee_name,
      trainee_member_no = trainee_member_no
  where id = e.id;

  -- Notify the sponsor who completed the plan.
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
    s.user_id,
    s.member_id,
    'ragwan_plan_completed',
    completion_id,
    '🏆',
    'تم إكمال خطة رجوان',
    format(
      'أكملتَ خطة رجوان مع المتدرب %s (رقم العضوية: %s). السبونسر: %s (رقم العضوية: %s).',
      trainee_name,
      coalesce(trainee_member_no,'غير مسجل'),
      sponsor_name,
      coalesce(sponsor_member_no,'غير مسجل')
    ),
    'training',
    'فتح خطة رجوان'
  )
  on conflict(recipient_user_id, event_type, source_id) do nothing;

  -- Notify every active leader. The message contains both identities and membership numbers.
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
    completion_id,
    '🏆',
    'إكمال خطة رجوان جديدة',
    format(
      'أكمل السبونسر %s (رقم العضوية: %s) خطة رجوان مع المتدرب %s (رقم العضوية: %s).',
      sponsor_name,
      coalesce(sponsor_member_no,'غير مسجل'),
      trainee_name,
      coalesce(trainee_member_no,'غير مسجل')
    ),
    'teams',
    'عرض فريق العضو'
  from public.app_users au
  where au.role = 'leader'
    and au.active = true
  on conflict(recipient_user_id, event_type, source_id) do nothing;

  return json_build_object(
    'ok', true,
    'completion_id', completion_id,
    'member_id', e.trainee_member_id,
    'member_name', trainee_name,
    'member_no', trainee_member_no,
    'sponsor_member_name', sponsor_name,
    'sponsor_member_no', sponsor_member_no,
    'completed_at', coalesce(completion_time, now())
  );
end;
$$;

revoke all on function public.save_ragwan_training_step(uuid,uuid,integer,text)
from public, anon, authenticated;
grant execute on function public.save_ragwan_training_step(uuid,uuid,integer,text)
to anon, authenticated;

revoke all on function public.record_ragwan_plan_completion_for_member(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.record_ragwan_plan_completion_for_member(uuid,uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
