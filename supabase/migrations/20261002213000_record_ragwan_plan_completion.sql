create or replace function public.record_ragwan_plan_completion_for_member(
  p_member_id uuid,
  p_token uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.record_ragwan_plan_completion_for_member(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.record_ragwan_plan_completion_for_member(uuid, uuid)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';