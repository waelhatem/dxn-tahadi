-- Allow a DXN member to train themselves in Ragwan's professional plan.
-- A sponsor/member may be both sponsor and trainee; the enrollment remains
-- isolated by (sponsor_user_id, trainee_member_id), so progress is still independent.

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

create or replace function public.search_ragwan_trainees(
  p_token uuid,
  p_query text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  q text := lower(trim(coalesce(p_query,'')));
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  return coalesce((
    select json_agg(x order by x.enrolled desc, x.name asc)
    from (
      select
        m.id,
        trim(coalesce(m.name,'')) as name,
        nullif(trim(coalesce(m.member_no::text,'')),'') as member_no,
        exists(
          select 1
          from public.ragwan_training_enrollments e
          where e.sponsor_user_id=s.user_id
            and e.trainee_member_id=m.id
        ) as enrolled,
        coalesce((
          select count(*)::int
          from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id
            and p.trainee_member_id=m.id
            and p.status='completed'
        ),0) as completed_count,
        coalesce((
          select max(p.step)::int
          from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id
            and p.trainee_member_id=m.id
            and p.status='completed'
        ),0) as last_completed_step,
        (
          select max(e2.last_activity_at)
          from public.ragwan_training_enrollments e2
          where e2.sponsor_user_id=s.user_id
            and e2.trainee_member_id=m.id
        ) as last_activity_at
      from public.members m
      where m.active=true
        and m.team_id=s.team_id
        and (
          q=''
          or lower(coalesce(m.name,'')) like '%'||q||'%'
          or lower(coalesce(m.member_no::text,'')) like '%'||q||'%'
        )
      limit 30
    ) x
  ), '[]'::json);
end;
$$;

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
  s record;
  m record;
  e public.ragwan_training_enrollments%rowtype;
begin
  select * into s
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if s.user_id is null then
    raise exception 'هذه العملية متاحة لحساب السبونسر فقط';
  end if;

  select
    id,
    trim(coalesce(name,'')) as name,
    trim(coalesce(member_no::text,'')) as member_no
    into m
  from public.members
  where id=p_trainee_member_id
    and active=true
  limit 1;

  if m.id is null then
    raise exception 'العضو غير موجود في أعضاء DXN';
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
    nullif(m.member_no,'')
  )
  on conflict(sponsor_user_id,trainee_member_id)
  do update set
    trainee_name=excluded.trainee_name,
    trainee_member_no=excluded.trainee_member_no,
    last_activity_at=now()
  returning * into e;

  return json_build_object(
    'enrollment_id',e.id,
    'member_id',e.trainee_member_id,
    'name',e.trainee_name,
    'member_no',e.trainee_member_no,
    'started_at',e.started_at,
    'last_activity_at',e.last_activity_at,
    'completed_at',e.completed_at
  );
end;
$$;

grant execute on function public.add_ragwan_trainee_by_member_no(uuid,text) to anon, authenticated;
grant execute on function public.search_ragwan_trainees(uuid,text) to anon, authenticated;
grant execute on function public.select_ragwan_trainee(uuid,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
