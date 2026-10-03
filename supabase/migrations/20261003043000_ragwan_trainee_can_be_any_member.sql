-- Ragwan trainee management: available to members and leaders.
-- The trainee does NOT need to be directly under the sponsor/member.
-- Any active DXN member can be enrolled and tracked, while progress remains
-- isolated per sponsor_user_id + trainee_member_id.
-- Self-enrollment remains disabled, matching the currently accepted behavior.

create or replace function public.ragwan_current_sponsor(p_token uuid)
returns table(user_id uuid, member_id uuid, team_id uuid, member_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    au.id,
    au.member_id,
    m.team_id,
    trim(coalesce(m.name, au.display_name, ''))
  from public.app_users au
  left join public.members m
    on m.id=au.member_id
   and m.active=true
  where au.id=public.app_current_user_id(p_token)
    and au.active=true
    and au.role in ('member','leader')
    and (au.role='leader' or m.id is not null)
  limit 1;
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
    raise exception 'هذه العملية متاحة للعضو أو القائد فقط';
  end if;

  return coalesce((
    select json_agg(x order by x.enrolled desc, x.name asc)
    from (
      select
        m.id,
        trim(coalesce(m.name,'')) as name,
        nullif(trim(coalesce(m.member_no::text,'')),'') as member_no,
        exists(
          select 1 from public.ragwan_training_enrollments e
          where e.sponsor_user_id=s.user_id and e.trainee_member_id=m.id
        ) as enrolled,
        coalesce((
          select count(*)::int from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id and p.trainee_member_id=m.id and p.status='completed'
        ),0) as completed_count,
        coalesce((
          select max(p.step)::int from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id and p.trainee_member_id=m.id and p.status='completed'
        ),0) as last_completed_step,
        (
          select max(e2.last_activity_at)
          from public.ragwan_training_enrollments e2
          where e2.sponsor_user_id=s.user_id and e2.trainee_member_id=m.id
        ) as last_activity_at
      from public.members m
      where m.active=true
        and m.id<>coalesce(s.member_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and (
          q=''
          or lower(coalesce(m.name,'')) like '%'||q||'%'
          or lower(coalesce(m.member_no::text,'')) like '%'||q||'%'
        )
      limit 50
    ) x
  ), '[]'::json);
end;
$$;

create or replace function public.list_ragwan_trainees(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then
    raise exception 'هذه العملية متاحة للعضو أو القائد فقط';
  end if;

  return coalesce((
    select json_agg(x order by x.last_activity_at desc nulls last, x.name asc)
    from (
      select
        e.id as enrollment_id,
        e.trainee_member_id as member_id,
        e.trainee_name as name,
        e.trainee_member_no as member_no,
        e.started_at,
        e.last_activity_at,
        e.completed_at,
        coalesce((
          select count(*)::int from public.ragwan_training_progress p
          where p.enrollment_id=e.id and p.status='completed'
        ),0) as completed_count,
        coalesce((
          select max(p.step)::int from public.ragwan_training_progress p
          where p.enrollment_id=e.id and p.status='completed'
        ),0) as last_completed_step
      from public.ragwan_training_enrollments e
      where e.sponsor_user_id=s.user_id
    ) x
  ), '[]'::json);
end;
$$;

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
  normalized_no text:=lower(trim(coalesce(p_trainee_member_no,'')));
begin
  if normalized_no='' then raise exception 'أدخل رقم عضوية المتدرب أولًا'; end if;

  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then
    raise exception 'هذه العملية متاحة للعضو أو القائد فقط';
  end if;

  select
    mm.id,
    trim(coalesce(mm.name,'')) as name,
    nullif(trim(coalesce(mm.member_no::text,'')),'') as member_no
  into m
  from public.members mm
  where mm.active=true
    and mm.id<>coalesce(s.member_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and lower(trim(coalesce(mm.member_no::text,'')))=normalized_no
  limit 1;

  if m.id is null then
    raise exception 'لم يتم العثور على عضو فعّال بهذا الرقم في أعضاء DXN';
  end if;
  if m.name is null or m.name='' then
    raise exception 'تم العثور على العضوية، لكن اسم العضو غير متوفر';
  end if;

  insert into public.ragwan_training_enrollments(
    sponsor_user_id,sponsor_member_id,trainee_member_id,trainee_name,trainee_member_no
  )
  values(s.user_id,s.member_id,m.id,m.name,m.member_no)
  on conflict(sponsor_user_id,trainee_member_id)
  do update set
    trainee_name=excluded.trainee_name,
    trainee_member_no=excluded.trainee_member_no,
    last_activity_at=now()
  returning * into e;

  return json_build_object(
    'ok',true,
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

create or replace function public.select_ragwan_trainee(
  p_token uuid,
  p_trainee_member_id uuid
)
returns json
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  m record;
  e public.ragwan_training_enrollments%rowtype;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then
    raise exception 'هذه العملية متاحة للعضو أو القائد فقط';
  end if;

  select id,trim(coalesce(name,'')) as name,trim(coalesce(member_no::text,'')) as member_no
  into m
  from public.members
  where id=p_trainee_member_id
    and active=true
    and id<>coalesce(s.member_id,'00000000-0000-0000-0000-000000000000'::uuid)
  limit 1;

  if m.id is null then raise exception 'العضو غير موجود في أعضاء DXN'; end if;

  insert into public.ragwan_training_enrollments(
    sponsor_user_id,sponsor_member_id,trainee_member_id,trainee_name,trainee_member_no
  )
  values(s.user_id,s.member_id,m.id,m.name,nullif(m.member_no,''))
  on conflict(sponsor_user_id,trainee_member_id)
  do update set
    trainee_name=excluded.trainee_name,
    trainee_member_no=excluded.trainee_member_no,
    last_activity_at=now()
  returning * into e;

  return json_build_object(
    'ok',true,
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

-- Existing progress/completion functions use ragwan_current_sponsor().
-- Recreate them with the broader member/leader gate while keeping the
-- enrollment scoped to the authenticated sponsor account.

create or replace function public.get_ragwan_training_progress(
  p_token uuid,
  p_trainee_member_id uuid
)
returns json
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة للعضو أو القائد فقط'; end if;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_trainee_member_id
  limit 1;
  if e.id is null then raise exception 'لم تبدأ خطة رجوان مع هذا العضو بعد'; end if;

  return json_build_object(
    'enrollment_id',e.id,'member_id',e.trainee_member_id,'name',e.trainee_name,
    'member_no',e.trainee_member_no,'started_at',e.started_at,
    'last_activity_at',e.last_activity_at,'completed_at',e.completed_at,
    'steps',coalesce((
      select json_agg(json_build_object(
        'step',n.step,'status',coalesce(p.status,'locked'),
        'started_at',p.started_at,'completed_at',p.completed_at,'updated_at',p.updated_at
      ) order by n.step)
      from generate_series(1,10) n(step)
      left join public.ragwan_training_progress p
        on p.enrollment_id=e.id and p.step=n.step
    ),'[]'::json)
  );
end;
$$;

create or replace function public.save_ragwan_training_step(
  p_token uuid,
  p_trainee_member_id uuid,
  p_step integer,
  p_status text
)
returns json
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  missing integer;
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if p_step is null or p_step<1 or p_step>10 then raise exception 'رقم الخطوة غير صالح'; end if;
  if v_status not in ('started','completed') then raise exception 'حالة الخطوة غير صالحة'; end if;

  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة للعضو أو القائد فقط'; end if;

  select * into e from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_trainee_member_id limit 1;
  if e.id is null then raise exception 'اختر المتدرب أولًا'; end if;

  if p_step>1 then
    select count(*) into missing
    from generate_series(1,p_step-1) n(step)
    where not exists(
      select 1 from public.ragwan_training_progress p
      where p.enrollment_id=e.id and p.step=n.step and p.status='completed'
    );
    if missing>0 then raise exception 'لا يمكنك متابعة هذه الخطوة قبل إكمال الخطوات السابقة بالترتيب'; end if;
  end if;

  insert into public.ragwan_training_progress(
    enrollment_id,sponsor_user_id,trainee_member_id,step,status,started_at,completed_at,updated_at
  )
  values(
    e.id,s.user_id,e.trainee_member_id,p_step,v_status,now(),
    case when v_status='completed' then now() else null end,now()
  )
  on conflict(enrollment_id,step) do update set
    status=case when public.ragwan_training_progress.status='completed' then 'completed' else excluded.status end,
    started_at=coalesce(public.ragwan_training_progress.started_at,excluded.started_at),
    completed_at=case
      when public.ragwan_training_progress.status='completed'
        then public.ragwan_training_progress.completed_at
      else excluded.completed_at end,
    updated_at=now();

  update public.ragwan_training_enrollments
  set last_activity_at=now(),
      completed_at=case when p_step=10 and v_status='completed' then coalesce(completed_at,now()) else completed_at end
  where id=e.id;

  return public.get_ragwan_training_progress(p_token,p_trainee_member_id);
end;
$$;

create or replace function public.record_ragwan_plan_completion_for_member(
  p_member_id uuid,
  p_token uuid
)
returns json
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  completed_count integer;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة للعضو أو القائد فقط'; end if;

  select * into e from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_member_id limit 1;
  if e.id is null then raise exception 'لا توجد خطة رجوان مسجلة لهذا المتدرب مع هذا المدرب'; end if;

  select count(*) into completed_count
  from public.ragwan_training_progress
  where enrollment_id=e.id and step between 1 and 10 and status='completed';

  if completed_count<10 then
    raise exception 'لا يمكن تسجيل إكمال الخطة قبل إكمال الأبواب العشرة (المكتمل حاليًا: % من 10)',completed_count;
  end if;

  update public.ragwan_training_enrollments
  set completed_at=coalesce(completed_at,now()),last_activity_at=now()
  where id=e.id
  returning * into e;

  return json_build_object(
    'success',true,'enrollment_id',e.id,'member_id',e.trainee_member_id,
    'name',e.trainee_name,'member_no',e.trainee_member_no,
    'completed_at',e.completed_at,'completed_count',completed_count
  );
end;
$$;

revoke all on function public.ragwan_current_sponsor(uuid) from public,anon,authenticated;
revoke all on function public.search_ragwan_trainees(uuid,text) from public,anon,authenticated;
revoke all on function public.list_ragwan_trainees(uuid) from public,anon,authenticated;
revoke all on function public.add_ragwan_trainee_by_member_no(uuid,text) from public,anon,authenticated;
revoke all on function public.select_ragwan_trainee(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_ragwan_training_progress(uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_ragwan_training_step(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.record_ragwan_plan_completion_for_member(uuid,uuid) from public,anon,authenticated;

grant execute on function public.ragwan_current_sponsor(uuid) to anon,authenticated;
grant execute on function public.search_ragwan_trainees(uuid,text) to anon,authenticated;
grant execute on function public.list_ragwan_trainees(uuid) to anon,authenticated;
grant execute on function public.add_ragwan_trainee_by_member_no(uuid,text) to anon,authenticated;
grant execute on function public.select_ragwan_trainee(uuid,uuid) to anon,authenticated;
grant execute on function public.get_ragwan_training_progress(uuid,uuid) to anon,authenticated;
grant execute on function public.save_ragwan_training_step(uuid,uuid,integer,text) to anon,authenticated;
grant execute on function public.record_ragwan_plan_completion_for_member(uuid,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
