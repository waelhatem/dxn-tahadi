-- Manual leader addition to the DXN master registry.
-- Keeps Excel sync unchanged and derives sponsor name/generation from the existing registry.

create or replace function public.leader_add_dxn_team_member_manual(
  p_token uuid,
  p_member_no text,
  p_member_name text,
  p_join_date date,
  p_sponsor_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_name text;
  member_no_clean text := trim(coalesce(p_member_no,''));
  member_name_clean text := trim(coalesce(p_member_name,''));
  sponsor_no_clean text := trim(coalesce(p_sponsor_member_no,''));
  sponsor_row public.dxn_team_members%rowtype;
  generation_value integer;
begin
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception using errcode='P0001', message='انتهت الجلسة';
  end if;

  select lower(trim(au.role))
    into role_name
  from public.app_users au
  where au.id = uid and au.active = true
  limit 1;

  if role_name <> 'leader' then
    raise exception using errcode='P0001', message='هذه العملية متاحة للقائد فقط';
  end if;

  if member_no_clean !~ '^[0-9]{9}$' then
    raise exception using errcode='P0001', message='رقم العضوية يجب أن يكون 9 أرقام';
  end if;

  if member_name_clean = '' then
    raise exception using errcode='P0001', message='اسم العضو مطلوب';
  end if;

  if p_join_date is null then
    raise exception using errcode='P0001', message='تاريخ الانضمام مطلوب';
  end if;

  if sponsor_no_clean !~ '^[0-9]{9}$' then
    raise exception using errcode='P0001', message='رقم الراعي يجب أن يكون 9 أرقام';
  end if;

  if member_no_clean = sponsor_no_clean then
    raise exception using errcode='P0001', message='لا يمكن أن يكون العضو راعيًا لنفسه';
  end if;

  if exists (
    select 1 from public.dxn_team_members
    where member_no = member_no_clean
  ) then
    raise exception using errcode='23505', message='رقم العضوية موجود مسبقًا في سجل DXN';
  end if;

  select *
    into sponsor_row
  from public.dxn_team_members
  where member_no = sponsor_no_clean
  limit 1;

  if sponsor_row.member_no is null then
    raise exception using errcode='P0001', message='رقم الراعي غير موجود في سجل DXN؛ لا يمكن جلب اسم الراعي والجيل';
  end if;

  generation_value := case
    when sponsor_row.generation is null then null
    else sponsor_row.generation + 1
  end;

  insert into public.dxn_team_members (
    member_no,
    member_name,
    sponsor_member_no,
    sponsor_name,
    generation,
    rank,
    dxn_status,
    downline_status,
    join_date,
    personal_pv,
    personal_group_pv,
    total_group_pv,
    accumulated_group_pv,
    accumulated_promotion_pv,
    diamond_group_pv,
    accumulated_group_pv_masked,
    accumulated_promotion_pv_masked,
    diamond_group_pv_masked,
    source,
    source_updated_at,
    updated_at
  )
  values (
    member_no_clean,
    member_name_clean,
    sponsor_no_clean,
    sponsor_row.member_name,
    generation_value,
    'MEM',
    null,
    null,
    p_join_date,
    0,
    0,
    0,
    0,
    0,
    0,
    false,
    false,
    false,
    'manual',
    now(),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'member_no', member_no_clean,
    'member_name', member_name_clean,
    'sponsor_member_no', sponsor_no_clean,
    'sponsor_name', sponsor_row.member_name,
    'generation', generation_value,
    'rank', 'MEM',
    'join_date', p_join_date
  );
end;
$$;

revoke all on function public.leader_add_dxn_team_member_manual(uuid,text,text,date,text)
  from public, anon, authenticated;

grant execute on function public.leader_add_dxn_team_member_manual(uuid,text,text,date,text)
  to service_role;

notify pgrst, 'reload schema';


create or replace function public.lookup_dxn_team_sponsor(
  p_token uuid,
  p_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_name text;
  no_clean text := trim(coalesce(p_member_no,''));
  sponsor_row public.dxn_team_members%rowtype;
begin
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception using errcode='P0001', message='انتهت الجلسة';
  end if;

  select lower(trim(au.role))
    into role_name
  from public.app_users au
  where au.id = uid and au.active = true
  limit 1;

  if role_name <> 'leader' then
    raise exception using errcode='P0001', message='هذه العملية متاحة للقائد فقط';
  end if;

  if no_clean !~ '^[0-9]{9}$' then
    return jsonb_build_object('found',false,'message','رقم الراعي يجب أن يكون 9 أرقام');
  end if;

  select *
    into sponsor_row
  from public.dxn_team_members
  where member_no = no_clean
  limit 1;

  if sponsor_row.member_no is null then
    return jsonb_build_object('found',false,'message','الراعي غير موجود في سجل DXN');
  end if;

  return jsonb_build_object(
    'found',true,
    'sponsor_member_no',sponsor_row.member_no,
    'sponsor_name',sponsor_row.member_name,
    'next_generation',case when sponsor_row.generation is null then null else sponsor_row.generation + 1 end
  );
end;
$$;

revoke all on function public.lookup_dxn_team_sponsor(uuid,text)
  from public, anon, authenticated;

grant execute on function public.lookup_dxn_team_sponsor(uuid,text)
  to service_role;

notify pgrst, 'reload schema';
