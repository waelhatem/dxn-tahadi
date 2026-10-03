-- Allow a sponsor to select an already-enrolled Ragwan trainee.
-- The trainee is authorized by the enrollment owned by the current sponsor;
-- no DXN team_id restriction is required.

create or replace function public.select_ragwan_trainee(
  p_token uuid,
  p_trainee_member_id uuid
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
    and m.active = true
  limit 1;

  if member_row.id is null then
    raise exception 'المتدرب غير موجود في خطة رجوان الخاصة بك';
  end if;

  select * into enrollment_row
  from public.ragwan_training_enrollments
  where sponsor_user_id = sponsor_row.user_id
    and trainee_member_id = p_trainee_member_id
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
    'member_no', enrollment_row.trainee_member_no,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );
end;
$$;

revoke all on function public.select_ragwan_trainee(uuid,uuid)
from public, anon, authenticated;

grant execute on function public.select_ragwan_trainee(uuid,uuid)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
