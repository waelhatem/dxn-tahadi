-- Ragwan trainee-scoped progress and sponsor dashboard.
-- Each sponsor can train multiple members concurrently; every trainee has an independent 10-step record.

create table if not exists public.ragwan_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  sponsor_user_id uuid not null references public.app_users(id) on delete cascade,
  sponsor_member_id uuid references public.members(id) on delete set null,
  trainee_member_id uuid not null references public.members(id) on delete cascade,
  trainee_name text not null,
  trainee_member_no text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ragwan_training_enrollment_unique unique(sponsor_user_id, trainee_member_id),
  constraint ragwan_training_enrollment_name_nonempty check (char_length(trim(trainee_name)) > 0)
);

create index if not exists ragwan_training_enrollments_sponsor_idx
  on public.ragwan_training_enrollments(sponsor_user_id, last_activity_at desc);

create index if not exists ragwan_training_enrollments_trainee_idx
  on public.ragwan_training_enrollments(trainee_member_id, last_activity_at desc);

create table if not exists public.ragwan_training_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.ragwan_training_enrollments(id) on delete cascade,
  sponsor_user_id uuid not null references public.app_users(id) on delete cascade,
  trainee_member_id uuid not null references public.members(id) on delete cascade,
  step smallint not null check (step between 1 and 10),
  status text not null default 'started' check (status in ('started','completed')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ragwan_training_progress_unique unique(enrollment_id, step)
);

create index if not exists ragwan_training_progress_lookup_idx
  on public.ragwan_training_progress(sponsor_user_id, trainee_member_id, step);

alter table public.ragwan_training_enrollments enable row level security;
alter table public.ragwan_training_progress enable row level security;
revoke all on public.ragwan_training_enrollments from public, anon, authenticated;
revoke all on public.ragwan_training_progress from public, anon, authenticated;

create or replace function public.ragwan_current_sponsor(p_token uuid)
returns table(user_id uuid, member_id uuid, team_id uuid, member_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select au.id, au.member_id, m.team_id, trim(coalesce(m.name,''))
  from public.app_users au
  join public.members m on m.id=au.member_id
  where au.id=public.app_current_user_id(p_token)
    and au.active=true
    and au.role='member'
    and m.active=true
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
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

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
        and m.team_id=s.team_id
        and m.id<>s.member_id
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
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

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
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

  select id, trim(coalesce(name,'')) as name, trim(coalesce(member_no::text,'')) as member_no
    into m
  from public.members
  where id=p_trainee_member_id and active=true and team_id=s.team_id and id<>s.member_id
  limit 1;

  if m.id is null then raise exception 'العضو غير موجود ضمن فريقك'; end if;

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
  s record;
  e public.ragwan_training_enrollments%rowtype;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_trainee_member_id
  limit 1;

  if e.id is null then
    raise exception 'لم تبدأ خطة رجوان مع هذا العضو بعد';
  end if;

  return json_build_object(
    'enrollment_id',e.id,
    'member_id',e.trainee_member_id,
    'name',e.trainee_name,
    'member_no',e.trainee_member_no,
    'started_at',e.started_at,
    'last_activity_at',e.last_activity_at,
    'completed_at',e.completed_at,
    'steps',coalesce((
      select json_agg(
        json_build_object(
          'step',n.step,
          'status',coalesce(p.status,'locked'),
          'started_at',p.started_at,
          'completed_at',p.completed_at,
          'updated_at',p.updated_at
        ) order by n.step
      )
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
set search_path = public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  previous_missing integer;
  v_status text := lower(trim(coalesce(p_status,'')));
begin
  if p_step is null or p_step<1 or p_step>10 then raise exception 'رقم الخطوة غير صالح'; end if;
  if v_status not in ('started','completed') then raise exception 'حالة الخطوة غير صالحة'; end if;

  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_trainee_member_id
  limit 1;

  if e.id is null then raise exception 'اختر المتدرب أولًا'; end if;

  if p_step>1 then
    select count(*) into previous_missing
    from generate_series(1,p_step-1) n(step)
    where not exists(
      select 1 from public.ragwan_training_progress p
      where p.enrollment_id=e.id and p.step=n.step and p.status='completed'
    );
    if previous_missing>0 then
      raise exception 'لا يمكنك متابعة هذه الخطوة قبل إكمال الخطوات السابقة بالترتيب';
    end if;
  end if;

  insert into public.ragwan_training_progress(
    enrollment_id,sponsor_user_id,trainee_member_id,step,status,started_at,completed_at,updated_at
  )
  values(
    e.id,s.user_id,e.trainee_member_id,p_step,v_status,now(),
    case when v_status='completed' then now() else null end,now()
  )
  on conflict(enrollment_id,step) do update set
    status=case when ragwan_training_progress.status='completed' then 'completed' else excluded.status end,
    started_at=coalesce(ragwan_training_progress.started_at,excluded.started_at),
    completed_at=case when ragwan_training_progress.status='completed' then ragwan_training_progress.completed_at else excluded.completed_at end,
    updated_at=now();

  update public.ragwan_training_enrollments
  set last_activity_at=now(),
      completed_at=case when p_step=10 and v_status='completed' then coalesce(completed_at,now()) else completed_at end
  where id=e.id;

  return public.get_ragwan_training_progress(p_token,p_trainee_member_id);
end;
$$;

create or replace function public.record_ragwan_plan_completion_for_member(
  p_token uuid,
  p_member_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  e public.ragwan_training_enrollments%rowtype;
  target_name text;
  completion_id uuid;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

  select * into e
  from public.ragwan_training_enrollments
  where sponsor_user_id=s.user_id and trainee_member_id=p_member_id
  limit 1;
  if e.id is null then raise exception 'اختر المتدرب أولًا'; end if;

  if exists(
    select 1 from generate_series(1,10) n(step)
    where not exists(
      select 1 from public.ragwan_training_progress p
      where p.enrollment_id=e.id and p.step=n.step and p.status='completed'
    )
  ) then
    raise exception 'لا يمكن تسجيل إكمال الخطة قبل إكمال الأبواب العشرة بالترتيب';
  end if;

  target_name:=e.trainee_name;

  select id into completion_id
  from public.ragwan_plan_completions
  where sponsor_user_id=s.user_id and member_id=p_member_id
  order by completed_at desc
  limit 1;

  if completion_id is null then
    insert into public.ragwan_plan_completions(
      member_id,sponsor_user_id,sponsor_member_id,member_name,sponsor_member_name
    )
    values(
      e.trainee_member_id,s.user_id,s.member_id,target_name,s.member_name
    )
    returning id into completion_id;

    insert into public.app_notifications(
      recipient_user_id,recipient_member_id,event_type,source_id,icon,title,body,action_tab,action_label
    )
    select
      au.id,au.member_id,'ragwan_plan_completed',completion_id,'🏆',
      'إكمال خطة رجوان جديدة',
      format('%s أكمل الخطة مع العضو %s.',s.member_name,target_name),
      'teams','فتح ملف العضو'
    from public.app_users au
    where au.role='leader' and au.active=true
    on conflict(recipient_user_id,event_type,source_id) do nothing;
  end if;

  update public.ragwan_training_enrollments
  set completed_at=coalesce(completed_at,now()),last_activity_at=now()
  where id=e.id;

  return json_build_object(
    'ok',true,
    'completion_id',completion_id,
    'member_id',e.trainee_member_id,
    'member_name',target_name,
    'sponsor_member_name',s.member_name,
    'completed_at',coalesce(e.completed_at,now())
  );
end;
$$;

revoke all on function public.ragwan_current_sponsor(uuid) from public,anon,authenticated;
revoke all on function public.search_ragwan_trainees(uuid,text) from public,anon,authenticated;
revoke all on function public.list_ragwan_trainees(uuid) from public,anon,authenticated;
revoke all on function public.select_ragwan_trainee(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_ragwan_training_progress(uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_ragwan_training_step(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.record_ragwan_plan_completion_for_member(uuid,uuid) from public,anon,authenticated;

grant execute on function public.ragwan_current_sponsor(uuid) to anon,authenticated;
grant execute on function public.search_ragwan_trainees(uuid,text) to anon,authenticated;
grant execute on function public.list_ragwan_trainees(uuid) to anon,authenticated;
grant execute on function public.select_ragwan_trainee(uuid,uuid) to anon,authenticated;
grant execute on function public.get_ragwan_training_progress(uuid,uuid) to anon,authenticated;
grant execute on function public.save_ragwan_training_step(uuid,uuid,integer,text) to anon,authenticated;
grant execute on function public.record_ragwan_plan_completion_for_member(uuid,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
