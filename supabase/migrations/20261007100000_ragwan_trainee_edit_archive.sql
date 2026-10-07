-- Ragwan trainees: per-trainer display name and archive (soft delete).
--
-- * trainee_display_name belongs to ONE enrollment (one trainer + one trainee).
--   It is only a label for that trainer. members.name, dxn_team_members and the
--   membership number are never changed. Official names stay in
--   enrollment.trainee_name (refreshed from members by select_ragwan_trainee)
--   and are what completion and the certificate use.
-- * Deleting a trainee from a trainer's list ARCHIVES the enrollment
--   (archived_at = now()). Nothing is deleted: the enrollment, its progress,
--   completed_at, members, app_users and other trainers' enrollments are kept.
-- * Archived enrollments are ignored by list/select/progress/save/completion.
-- * Re-adding the same trainee for the same trainer reuses the SAME enrollment
--   row (UNIQUE sponsor_user_id + trainee_member_id) and clears archived_at,
--   so the previous progress comes back unchanged.
-- * Ownership is enforced here: every function resolves the trainer through
--   ragwan_current_sponsor (unchanged) and filters by sponsor_user_id.
-- * search_ragwan_trainees is intentionally not created (it does not exist live
--   and the front-end search path that would call it is unreachable).

-- 1) New columns (nullable; existing rows are untouched and stay active).
alter table public.ragwan_training_enrollments
  add column if not exists archived_at timestamptz,
  add column if not exists trainee_display_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ragwan_training_enrollment_display_name_len'
      and conrelid = 'public.ragwan_training_enrollments'::regclass
  ) then
    alter table public.ragwan_training_enrollments
      add constraint ragwan_training_enrollment_display_name_len
      check (trainee_display_name is null or char_length(trainee_display_name) between 2 and 120);
  end if;
end;
$$;

create index if not exists ragwan_training_enrollments_active_idx
  on public.ragwan_training_enrollments(sponsor_user_id, last_activity_at desc)
  where archived_at is null;

-- 2) Existing LIVE functions (text as extracted from Supabase on 2026-10-07),
--    changed only to ignore archived enrollments and to return display_name.
--    Official names (trainee_name / members.name) are never replaced.

CREATE OR REPLACE FUNCTION public.get_ragwan_training_progress(p_token uuid, p_trainee_member_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sponsor_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
begin
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  select *
    into enrollment_row
  from public.ragwan_training_enrollments
  where sponsor_user_id = sponsor_row.user_id
    and trainee_member_id = p_trainee_member_id
    and archived_at is null
  limit 1;

  if enrollment_row.id is null then
    raise exception 'لم تبدأ خطة رجوان مع هذا العضو بعد';
  end if;

  return json_build_object(
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'display_name', enrollment_row.trainee_display_name,
    'member_no', enrollment_row.trainee_member_no,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at,
    'steps',
    coalesce((
      select json_agg(
        json_build_object(
          'step', n.step,
          'status', coalesce(p.status, 'locked'),
          'started_at', p.started_at,
          'completed_at', p.completed_at,
          'updated_at', p.updated_at
        )
        order by n.step
      )
      from generate_series(1, 10) n(step)
      left join public.ragwan_training_progress p
        on p.enrollment_id = enrollment_row.id
       and p.step = n.step
    ), '[]'::json)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_ragwan_trainees(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
begin
  select *
    into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  return coalesce((
    select json_agg(
      x
      order by x.last_activity_at desc nulls last, x.name asc
    )
    from (
      select
        e.id as enrollment_id,
        e.trainee_member_id as member_id,
        coalesce(e.trainee_display_name, e.trainee_name) as name,
        e.trainee_name as official_name,
        e.trainee_display_name as display_name,
        e.trainee_member_no as member_no,
        e.started_at,
        e.last_activity_at,
        e.completed_at,

        coalesce((
          select count(*)::int
          from public.ragwan_training_progress p
          where p.enrollment_id = e.id
            and p.status = 'completed'
        ), 0) as completed_count,

        coalesce((
          select max(p.step)::int
          from public.ragwan_training_progress p
          where p.enrollment_id = e.id
            and p.status = 'completed'
        ), 0) as last_completed_step

      from public.ragwan_training_enrollments e

      where e.sponsor_user_id = s.user_id
        and e.archived_at is null
    ) x
  ), '[]'::json);
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_ragwan_plan_completion_for_member(p_member_id uuid, p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sponsor_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
  completed_count integer;
begin
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  select *
    into enrollment_row
  from public.ragwan_training_enrollments
  where sponsor_user_id = sponsor_row.user_id
    and trainee_member_id = p_member_id
    and archived_at is null
  limit 1;

  if enrollment_row.id is null then
    raise exception 'لا توجد خطة رجوان مسجلة لهذا المتدرب مع هذا السبونسر';
  end if;

  select count(*)
    into completed_count
  from public.ragwan_training_progress
  where enrollment_id = enrollment_row.id
    and step between 1 and 10
    and status = 'completed';

  if completed_count < 10 then
    raise exception 'لا يمكن تسجيل اكتمال الخطة قبل إكمال الأبواب العشرة (المكتمل حاليًا: % من 10)', completed_count;
  end if;

  update public.ragwan_training_enrollments
  set completed_at = coalesce(completed_at, now()),
      last_activity_at = now()
  where id = enrollment_row.id
  returning * into enrollment_row;

  return json_build_object(
    'success', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'member_no', enrollment_row.trainee_member_no,
    'completed_at', enrollment_row.completed_at,
    'completed_count', completed_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_ragwan_training_step(p_token uuid, p_trainee_member_id uuid, p_step integer, p_status text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  previous_missing integer;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  -- التحقق من رقم الخطوة
  if p_step is null or p_step < 1 or p_step > 10 then
    raise exception 'رقم الخطوة غير صالح';
  end if;

  -- التحقق من حالة الخطوة
  if v_status not in ('started', 'completed') then
    raise exception 'حالة الخطوة غير صالحة';
  end if;

  -- التحقق من حساب السبونسر
  select *
    into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  -- العثور على تسجيل المتدرب
  select *
    into e
  from public.ragwan_training_enrollments
  where sponsor_user_id = s.user_id
    and trainee_member_id = p_trainee_member_id
    and archived_at is null
  limit 1;

  if e.id is null then
    raise exception 'اختر المتدرب أولًا';
  end if;

  -- منع تجاوز الخطوات
  if p_step > 1 then
    select count(*)
      into previous_missing
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

  -- حفظ تقدم الخطوة
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
    case
      when v_status = 'completed' then now()
      else null
    end,
    now()
  )
  on conflict(enrollment_id, step)
  do update set
    status = case
      when public.ragwan_training_progress.status = 'completed'
        then 'completed'
      else excluded.status
    end,
    started_at = coalesce(
      public.ragwan_training_progress.started_at,
      excluded.started_at
    ),
    completed_at = case
      when public.ragwan_training_progress.status = 'completed'
        then public.ragwan_training_progress.completed_at
      else excluded.completed_at
    end,
    updated_at = now();

  -- تحديث آخر نشاط وإكمال الخطة عند الباب العاشر
  update public.ragwan_training_enrollments
  set
    last_activity_at = now(),
    completed_at = case
      when p_step = 10 and v_status = 'completed'
        then coalesce(completed_at, now())
      else completed_at
    end
  where id = e.id;

  -- إعادة حالة تقدم المتدرب كاملة
  return public.get_ragwan_training_progress(
    p_token,
    p_trainee_member_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_ragwan_trainee(p_token uuid, p_trainee_member_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sponsor_row record;
  member_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
begin
  select * into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  select
    m.id,
    trim(coalesce(m.name,'')) as name,
    nullif(trim(coalesce(m.member_no::text,'')),'') as member_no
  into member_row
  from public.ragwan_training_enrollments e
  join public.members m on m.id = e.trainee_member_id
  where e.sponsor_user_id = sponsor_row.user_id
    and e.trainee_member_id = p_trainee_member_id
    and e.archived_at is null
    and m.active = true
  limit 1;

  if member_row.id is null then
    raise exception 'المتدرب غير موجود في خطة رجوان الخاصة بك';
  end if;

  select * into enrollment_row
  from public.ragwan_training_enrollments
  where sponsor_user_id = sponsor_row.user_id
    and trainee_member_id = p_trainee_member_id
    and archived_at is null
  limit 1;

  update public.ragwan_training_enrollments
  set trainee_name = member_row.name,
      trainee_member_no = member_row.member_no,
      last_activity_at = now()
  where id = enrollment_row.id
  returning * into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'display_name', enrollment_row.trainee_display_name,
    'member_no', enrollment_row.trainee_member_no,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );
end;
$function$;

-- 3) add_ragwan_trainee_by_member_no (as merged and applied in PR #105):
--    re-adding an archived trainee reuses the SAME enrollment row through the
--    existing ON CONFLICT (sponsor_user_id, trainee_member_id) and clears
--    archived_at, so enrollment_id, progress, completed_at and the display name
--    are all kept.
create or replace function public.add_ragwan_trainee_by_member_no(
  p_token uuid,
  p_trainee_member_no text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sponsor_row record;
  v_sponsor_member_no text;
  target_dxn record;
  local_member record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
  normalized_no text := trim(coalesce(p_trainee_member_no, ''));
  found_depth integer := null;
begin

  if normalized_no = '' then
    raise exception 'أدخل رقم عضوية المتدرب أولًا';
  end if;

  if normalized_no !~ '^[0-9]{9}$' then
    raise exception 'رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;

  -- The operation is available to a member/sponsor account only.
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  -- Resolve the sponsor's DXN membership number from the local member record.
  select trim(m.member_no)
    into v_sponsor_member_no
  from public.members m
  where m.id = sponsor_row.member_id
  limit 1;

  if v_sponsor_member_no is null or v_sponsor_member_no = '' then
    raise exception 'تعذر تحديد رقم عضوية السبونسر في سجل DXN';
  end if;

  -- Resolve the trainee from the authoritative DXN registry.
  select
    trim(m.member_no) as member_no,
    trim(coalesce(m.member_name,'')) as member_name,
    trim(coalesce(m.sponsor_member_no,'')) as sponsor_member_no
  into target_dxn
  from public.dxn_team_members m
  where trim(m.member_no) = normalized_no
  limit 1;

  if target_dxn.member_no is null then
    raise exception 'لم يتم العثور على هذه العضوية في سجل DXN';
  end if;

  if target_dxn.member_name is null or target_dxn.member_name = '' then
    raise exception 'تم العثور على العضوية في DXN، لكن اسم العضو غير متوفر';
  end if;

  /*
    Verify that the trainee belongs to the sponsor's COMPLETE downline.

    Direct sponsor is NOT required.
    Any generation is accepted.

    The path array prevents infinite recursion if the imported DXN data
    contains a sponsorship cycle.
  */
  with recursive downline as (
    select
      trim(m.member_no) as member_no,
      0 as depth,
      array[trim(m.member_no)]::text[] as path
    from public.dxn_team_members m
    where trim(m.member_no) = v_sponsor_member_no

    union all

    select
      trim(d.member_no),
      dline.depth + 1,
      dline.path || trim(d.member_no)
    from public.dxn_team_members d
    join downline dline
      on trim(d.sponsor_member_no) = dline.member_no
    where not trim(d.member_no) = any(dline.path)
  )
  select d.depth
    into found_depth
  from downline d
  where d.member_no = normalized_no
  order by d.depth
  limit 1;

  if found_depth is null then
    raise exception 'هذا العضو موجود في سجل DXN لكنه ليس ضمن فريقك';
  end if;

  -- Do not allow the sponsor to add himself as a trainee.
  if found_depth = 0 then
    raise exception 'لا يمكن إضافة حسابك كمتدرب في خطتك';
  end if;

  /*
    The training tables use public.members as their internal FK.
    If the DXN member is not yet materialized locally, create the minimum
    local member record. No app_user/login is created here.
  */
  select *
    into local_member
  from public.members m
  where trim(m.member_no) = normalized_no
  limit 1;

  if local_member.id is null then

    insert into public.members(
      member_no,
      name,
      team_id,
      active
    )
    values(
      normalized_no,
      target_dxn.member_name,
      sponsor_row.team_id,
      true
    )
    returning *
    into local_member;

  else

    -- Keep the local record usable for Ragwan while preserving its identity.
    update public.members
    set name = target_dxn.member_name,
        active = true
    where id = local_member.id;

    select *
      into local_member
    from public.members
    where id = local_member.id
    limit 1;

  end if;

  insert into public.ragwan_training_enrollments(
    sponsor_user_id,
    sponsor_member_id,
    trainee_member_id,
    trainee_name,
    trainee_member_no
  )
  values(
    sponsor_row.user_id,
    sponsor_row.member_id,
    local_member.id,
    target_dxn.member_name,
    normalized_no
  )
  on conflict(sponsor_user_id, trainee_member_id)
  do update set
    trainee_name = excluded.trainee_name,
    trainee_member_no = excluded.trainee_member_no,
    last_activity_at = now(),
    archived_at = null
  returning *
    into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'display_name', enrollment_row.trainee_display_name,
    'member_no', enrollment_row.trainee_member_no,
    'depth_from_sponsor', found_depth,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );

end;
$$;

-- 4) New: set or clear the trainer's display name for one of THEIR active trainees.
--    Empty input clears it (the official name is shown again).
create or replace function public.update_ragwan_trainee_display_name(
  p_token uuid,
  p_enrollment_id uuid,
  p_display_name text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sponsor_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  if v_display_name is not null and char_length(v_display_name) not between 2 and 120 then
    raise exception 'اسم العرض يجب أن يكون بين 2 و120 حرفًا';
  end if;

  -- Ownership and "not archived" are part of the same UPDATE.
  update public.ragwan_training_enrollments
  set trainee_display_name = v_display_name
  where id = p_enrollment_id
    and sponsor_user_id = sponsor_row.user_id
    and archived_at is null
  returning * into enrollment_row;

  if enrollment_row.id is null then
    raise exception 'المتدرب غير موجود في خطة رجوان الخاصة بك';
  end if;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'display_name', enrollment_row.trainee_display_name,
    'member_no', enrollment_row.trainee_member_no
  );
end;
$function$;

-- 5) New: archive (soft delete) one of the trainer's own active trainees.
--    Only archived_at is set; nothing is deleted.
create or replace function public.archive_ragwan_trainee(
  p_token uuid,
  p_enrollment_id uuid
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sponsor_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
begin
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  -- Ownership and "not already archived" are part of the same UPDATE.
  update public.ragwan_training_enrollments
  set archived_at = now()
  where id = p_enrollment_id
    and sponsor_user_id = sponsor_row.user_id
    and archived_at is null
  returning * into enrollment_row;

  if enrollment_row.id is null then
    raise exception 'المتدرب غير موجود في خطة رجوان الخاصة بك';
  end if;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'archived_at', enrollment_row.archived_at
  );
end;
$function$;

-- Same access pattern as the other Ragwan RPCs: callable with a session token,
-- authorization is checked inside the function.
revoke all on function public.update_ragwan_trainee_display_name(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_ragwan_trainee_display_name(uuid, uuid, text)
  to anon, authenticated, service_role;

revoke all on function public.archive_ragwan_trainee(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.archive_ragwan_trainee(uuid, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
