-- Fix Ragwan trainee lookup:
-- Resolve the trainee directly from the authoritative DXN members table.
-- team_id is intentionally NOT required for Ragwan enrollment.

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
  member_row record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
  normalized_no text := lower(trim(coalesce(p_trainee_member_no, '')));
begin
  if normalized_no = '' then
    raise exception 'أدخل رقم عضوية المتدرب أولًا';
  end if;

  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  select
    mm.id,
    trim(coalesce(mm.name, '')) as name,
    nullif(trim(coalesce(mm.member_no::text, '')), '') as member_no
    into member_row
  from public.members mm
  where mm.active = true
    and lower(trim(coalesce(mm.member_no::text, ''))) = normalized_no
    and mm.id <> sponsor_row.member_id
  limit 1;

  if member_row.id is null then
    raise exception 'لم يتم العثور على عضو فعّال بهذا الرقم في أعضاء DXN';
  end if;

  if member_row.name is null or member_row.name = '' then
    raise exception 'تم العثور على العضوية، لكن اسم العضو غير متوفر';
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
    member_row.id,
    member_row.name,
    member_row.member_no
  )
  on conflict(sponsor_user_id, trainee_member_id)
  do update set
    trainee_name = excluded.trainee_name,
    trainee_member_no = excluded.trainee_member_no,
    last_activity_at = now()
  returning * into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'member_no', enrollment_row.trainee_member_no,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );
end;
$$;

grant execute on function public.add_ragwan_trainee_by_member_no(uuid, text)
to service_role;

grant execute on function public.add_ragwan_trainee_by_member_no(uuid, text)
to anon, authenticated;

notify pgrst, 'reload schema';
