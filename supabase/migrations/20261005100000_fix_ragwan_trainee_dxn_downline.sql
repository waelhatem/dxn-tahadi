-- Fix Ragwan trainee enrollment to use the authoritative DXN registry.
-- A trainee may be in ANY generation of the current sponsor's DXN downline.
-- The trainee does not have to be a direct sponsor of the current member.
--
-- The DXN registry is the source of truth for:
--   1) existence
--   2) name
--   3) sponsor relationship / downline
--
-- The local public.members row is only the internal record required by
-- ragwan_training_enrollments foreign keys. It is created when the DXN
-- member exists in the sponsor's downline but has not yet been materialized
-- in public.members.

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
  sponsor_member_no text;
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
    into sponsor_member_no
  from public.members m
  where m.id = sponsor_row.member_id
  limit 1;

  if sponsor_member_no is null or sponsor_member_no = '' then
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
    where trim(m.member_no) = sponsor_member_no

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
    last_activity_at = now()
  returning *
    into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'member_no', enrollment_row.trainee_member_no,
    'depth_from_sponsor', found_depth,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );

end;
$$;

revoke all
on function public.add_ragwan_trainee_by_member_no(uuid,text)
from public, anon, authenticated;

grant execute
on function public.add_ragwan_trainee_by_member_no(uuid,text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
