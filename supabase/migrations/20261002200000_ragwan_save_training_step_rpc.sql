-- Ensure the Ragwan trainee progress save RPC exists in the deployed database.
-- The UI calls this exact signature when starting/completing a door.

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
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if p_step is null or p_step < 1 or p_step > 10 then
    raise exception 'رقم الخطوة غير صالح';
  end if;

  if v_status not in ('started', 'completed') then
    raise exception 'حالة الخطوة غير صالحة';
  end if;

  select *
    into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  select *
    into e
  from public.ragwan_training_enrollments
  where sponsor_user_id = s.user_id
    and trainee_member_id = p_trainee_member_id
  limit 1;

  if e.id is null then
    raise exception 'اختر المتدرب أولًا';
  end if;

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
  on conflict(enrollment_id, step)
  do update set
    status = case
      when public.ragwan_training_progress.status = 'completed' then 'completed'
      else excluded.status
    end,
    started_at = coalesce(public.ragwan_training_progress.started_at, excluded.started_at),
    completed_at = case
      when public.ragwan_training_progress.status = 'completed'
        then public.ragwan_training_progress.completed_at
      else excluded.completed_at
    end,
    updated_at = now();

  update public.ragwan_training_enrollments
  set last_activity_at = now(),
      completed_at = case
        when p_step = 10 and v_status = 'completed'
          then coalesce(completed_at, now())
        else completed_at
      end
  where id = e.id;

  return public.get_ragwan_training_progress(
    p_token,
    p_trainee_member_id
  );
end;
$$;

revoke all on function public.save_ragwan_training_step(uuid, uuid, integer, text)
from public, anon, authenticated;

grant execute on function public.save_ragwan_training_step(uuid, uuid, integer, text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
