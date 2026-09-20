-- Add cumulative points to every member returned by the team generation view.
-- "cumulative_points" is sourced from total_group_pv and is shown next to personal PV.

create or replace function public.get_dxn_team_intelligence(
  p_token uuid,
  p_mode text default 'summary',
  p_member_no text default null,
  p_generation integer default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_name text;
  root_no text;
  mode_name text := lower(trim(coalesce(p_mode, 'summary')));
  target_no text := nullif(trim(coalesce(p_member_no, '')), '');
  max_rows integer := greatest(1, least(coalesce(p_limit, 5000), 5000));
  result jsonb;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception using errcode='P0001', message='انتهت الجلسة';
  end if;

  select lower(trim(au.role)), trim(m.member_no)
    into role_name, root_no
  from public.app_users au
  join public.members m on m.id = au.member_id
  where au.id = uid
    and au.active = true
  limit 1;

  if role_name is null or root_no is null or root_no = '' then
    raise exception using errcode='P0001', message='لا يمكن تحديد عضوية الحساب الحالي';
  end if;

  if mode_name not in ('summary','member','downline','generation','line_summary') then
    raise exception using errcode='P0001', message='وضع تحليل الفريق غير صالح';
  end if;

  if not exists (
    select 1
    from public.dxn_team_members m
    where m.member_no = root_no
  ) then
    raise exception using errcode='P0001', message='بيانات العضو الحالي غير موجودة في سجل DXN';
  end if;

  if target_no is not null and target_no <> root_no then
    if not exists (
      with recursive tree as (
        select m.member_no, 0 as depth
        from public.dxn_team_members m
        where m.member_no = root_no

        union all

        select d.member_no, t.depth + 1
        from public.dxn_team_members d
        join tree t on d.sponsor_member_no = t.member_no
        where t.depth < 20
      )
      select 1
      from tree
      where member_no = target_no
    ) then
      raise exception using errcode='P0001', message='لا يمكن الوصول إلى عضو خارج الـDownline الخاص بك';
    end if;
  else
    target_no := root_no;
  end if;

  if mode_name='summary' then
    with recursive tree as (
      select m.member_no,0 as depth,m.generation,m.rank,m.personal_pv,m.personal_group_pv,m.total_group_pv
      from public.dxn_team_members m
      where m.member_no=target_no

      union all

      select d.member_no,t.depth+1,d.generation,d.rank,d.personal_pv,d.personal_group_pv,d.total_group_pv
      from public.dxn_team_members d
      join tree t on d.sponsor_member_no=t.member_no
      where t.depth<20
    )
    select jsonb_build_object(
      'mode','summary',
      'root_member_no',target_no,
      'total_members',(select count(*)-1 from tree),
      'direct_downline_count',(select count(*) from public.dxn_team_members where sponsor_member_no=target_no),
      'personal_pv_total',(select coalesce(sum(personal_pv),0) from tree where depth>0),
      'personal_pv_members',(select count(*) from tree where depth>0 and personal_pv is not null),
      'total_group_pv_sum',(select coalesce(sum(total_group_pv),0) from tree where depth>0)
    ) into result;

  elsif mode_name='downline' then
    with recursive tree as (
      select
        d.member_no,d.member_name,d.sponsor_member_no,d.sponsor_name,d.generation,
        d.rank,d.dxn_status,d.downline_status,d.join_date,d.personal_pv,
        d.personal_group_pv,d.total_group_pv,1 as depth_from_target
      from public.dxn_team_members d
      where d.sponsor_member_no=target_no

      union all

      select
        d.member_no,d.member_name,d.sponsor_member_no,d.sponsor_name,d.generation,
        d.rank,d.dxn_status,d.downline_status,d.join_date,d.personal_pv,
        d.personal_group_pv,d.total_group_pv,t.depth_from_target+1
      from public.dxn_team_members d
      join tree t on d.sponsor_member_no=t.member_no
      where t.depth_from_target<20
    )
    select jsonb_build_object(
      'mode','downline',
      'root_member_no',target_no,
      'count',(select count(*) from tree),
      'members',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(x)
            order by x.depth_from_target,x.member_name nulls last,x.member_no
          )
          from (select * from tree limit max_rows) x
        ),
        '[]'::jsonb
      )
    ) into result;

  elsif mode_name='member' then
    select jsonb_build_object(
      'mode','member',
      'member',(select to_jsonb(m) from public.dxn_team_members m where m.member_no=target_no),
      'immediate_downline',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select d.*
            from public.dxn_team_members d
            where d.sponsor_member_no=target_no
            order by d.member_name nulls last
            limit max_rows
          ) x
        ),
        '[]'::jsonb
      )
    ) into result;

  elsif mode_name='generation' then
    if p_generation is null or p_generation<1 then
      raise exception 'حدد رقم الجيل المطلوب';
    end if;

    with recursive tree as (
      select
        d.member_no,
        d.member_name,
        d.sponsor_member_no,
        d.generation,
        d.rank,
        d.personal_pv,
        d.personal_group_pv,
        d.total_group_pv as cumulative_points,
        1 as depth_from_target
      from public.dxn_team_members d
      where d.sponsor_member_no=target_no

      union all

      select
        d.member_no,
        d.member_name,
        d.sponsor_member_no,
        d.generation,
        d.rank,
        d.personal_pv,
        d.personal_group_pv,
        d.total_group_pv as cumulative_points,
        t.depth_from_target+1
      from public.dxn_team_members d
      join tree t on d.sponsor_member_no=t.member_no
      where t.depth_from_target<20
    )
    select jsonb_build_object(
      'mode','generation',
      'root_member_no',target_no,
      'generation',p_generation,
      'count',(select count(*) from tree where depth_from_target=p_generation),
      'members',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select *
            from tree
            where depth_from_target=p_generation
            order by member_name nulls last,member_no
            limit max_rows
          ) x
        ),
        '[]'::jsonb
      )
    ) into result;

  else
    select jsonb_build_object(
      'mode','line_summary',
      'root_member_no',target_no,
      'lines',
      coalesce(
        (
          select jsonb_agg(to_jsonb(d))
          from public.dxn_team_members d
          where d.sponsor_member_no=target_no
        ),
        '[]'::jsonb
      )
    ) into result;
  end if;

  return coalesce(result,'{}'::jsonb);
end;
$$;

revoke all on function public.get_dxn_team_intelligence(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_dxn_team_intelligence(uuid,text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
