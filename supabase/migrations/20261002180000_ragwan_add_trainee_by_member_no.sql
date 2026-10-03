-- Add a safe, exact membership-number enrollment flow for Ragwan trainee tracking.
-- The sponsor enters only the trainee's membership number; the database resolves
-- and stores the trainee name and number from the authoritative members table.

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
  s record;
  m record;
  e public.ragwan_training_enrollments%rowtype;
  normalized_no text := lower(trim(coalesce(p_trainee_member_no,'')));
begin
  if normalized_no = '' then
    raise exception 'أدخل رقم عضوية المتدرب أولًا';
  end if;

  select * into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  select m.id,
         trim(coalesce(m.name,'')) as name,
         nullif(trim(coalesce(m.member_no::text,'')),'') as member_no
    into m
  from public.members m
  where m.active = true
    and m.team_id = s.team_id
    and lower(trim(coalesce(m.member_no::text,''))) = normalized_no
    and m.id <> s.member_id
  limit 1;

  if m.id is null then
    raise exception 'لم يتم العثور على عضو فعّال بهذا الرقم ضمن فريقك';
  end if;

  if m.name is null or m.name = '' then
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
    s.user_id,
    s.member_id,
    m.id,
    m.name,
    m.member_no
  )
  on conflict(sponsor_user_id, trainee_member_id)
  do update set
    trainee_name = excluded.trainee_name,
    trainee_member_no = excluded.trainee_member_no,
    last_activity_at = now()
  returning * into e;

  return json_build_object(
    'ok', true,
    'enrollment_id', e.id,
    'member_id', e.trainee_member_id,
    'name', e.trainee_name,
    'member_no', e.trainee_member_no,
    'started_at', e.started_at,
    'last_activity_at', e.last_activity_at,
    'completed_at', e.completed_at
  );
end;
$$;

revoke all on function public.add_ragwan_trainee_by_member_no(uuid,text)
from public, anon, authenticated;

grant execute on function public.add_ragwan_trainee_by_member_no(uuid,text)
to anon, authenticated;

notify pgrst, 'reload schema';
