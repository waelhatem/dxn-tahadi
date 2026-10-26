-- Permit a sponsor to enroll their own DXN membership in Ragwan training.
-- Keep downline checks, duplicate prevention, archived progress restoration,
-- member identity, and all existing progress records unchanged.
-- This supersedes the found_depth=0 rejection from 20261017140000.

-- Existing active trainee + same sponsor: reject re-addition without touching progress.
-- Existing archived trainee: restore the same enrollment and preserved progress.
-- Unique(sponsor_user_id, trainee_member_id) remains the concurrency guard.
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

  -- Depth 0 is the authenticated sponsor's own DXN membership.
  -- Permit self-training while preserving the complete-downline rule for others.

  /*
    The training tables use public.members as their internal FK.
    If the DXN member is not yet materialized locally, create the minimum
    local member record. No app_user/login is created here.
  */
  if found_depth = 0 then
    -- Use the sponsor's OWN authenticated membership record. Do not create a
    -- second member or modify the sponsor's profile/name while self-enrolling.
    select *
      into local_member
    from public.members m
    where m.id = sponsor_row.member_id
      and trim(m.member_no) = normalized_no
      and m.active = true
    limit 1;

    if local_member.id is null then
      raise exception 'تعذر مطابقة رقم عضويتك مع حسابك الحالي';
    end if;
  else
    -- All other trainee enrollments retain the existing DXN downline rules.
    select *
      into local_member
    from public.members m
    where trim(m.member_no) = normalized_no
    limit 1;

    if local_member.id is null then
      insert into public.members(member_no, name, team_id, active)
      values(normalized_no, target_dxn.member_name, sponsor_row.team_id, true)
      returning * into local_member;
    else
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
  -- Prevent duplicate active enrollments, including concurrent requests.
  -- Only reactivation of a previously archived trainee is permitted.
  where public.ragwan_training_enrollments.archived_at is not null
  returning *
    into enrollment_row;

  if enrollment_row.id is null then
    raise exception 'هذا المتدرب مضاف مسبقًا إلى خطة رجوان. اختره من قائمة المتدربين بدل إضافته مرة أخرى.';
  end if;

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

notify pgrst, 'reload schema';
