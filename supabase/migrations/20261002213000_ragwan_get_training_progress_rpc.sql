-- Ensure the Ragwan trainee progress read RPC exists in the deployed database.
-- The sponsor UI calls this exact signature when selecting/opening a trainee.

create or replace function public.get_ragwan_training_progress(
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
  limit 1;

  if enrollment_row.id is null then
    raise exception 'لم تبدأ خطة رجوان مع هذا العضو بعد';
  end if;

  return json_build_object(
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
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
$$;

revoke all on function public.get_ragwan_training_progress(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.get_ragwan_training_progress(uuid, uuid)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
