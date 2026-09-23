-- Team Intelligence authenticated RPC.
-- This migration adds the token-based signature expected by the web app.
-- It resolves the root member from the authenticated session and never trusts
-- a caller-supplied root member number.

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
set search_path = public
as $$
declare
  root_no text;
  mode_name text := lower(trim(coalesce(p_mode, 'summary')));
  target_no text := nullif(trim(coalesce(p_member_no, '')), '');
  max_rows integer := greatest(1, least(coalesce(p_limit, 50), 200));
  result jsonb;
begin
  /* Resolve the logged-in user from the application's real schema.
     Leaders may inspect the member number requested by the UI.
     Members are restricted to their own member number. */
  select
    case
      when u.role='leader' then target_no
      else m.member_no
    end
    into root_no
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  left join public.members m on m.id=u.member_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if root_no is null or trim(root_no)='' then
    raise exception 'جلسة الدخول غير صالحة أو رقم العضوية المطلوب غير موجود';
  end if;

  if not exists (
    select 1 from public.dxn_team_members m where m.member_no=root_no
  ) then
    raise exception 'العضو المطلوب غير موجود في سجل DXN';
  end if;

  if exists (
    select 1
    from public.sessions s
    join public.app_users u on u.id=s.user_id
    where s.token=p_token and u.role='member'
  ) and target_no is not null then
    if not exists (
      select 1
      from public.app_users u
      join public.members m on m.id=u.member_id
      where u.active=true and m.member_no=root_no
    ) then
      raise exception 'لا يمكن للعضو اختيار عضو آخر كجذر للفريق';
    end if;
  end if;

  if mode_name not in ('summary','member','downline','generation','line_summary') then
    raise exception 'وضع تحليل الفريق غير صالح';
  end if;

  if target_no is not null and target_no <> root_no then
    if not exists (
      with recursive tree as (
        select m.member_no, 0 as depth
        from public.dxn_team_members m
        where m.member_no=root_no
        union all
        select d.member_no, t.depth+1
        from public.dxn_team_members d
        join tree t on d.sponsor_member_no=t.member_no
        where t.depth<20
      )
      select 1 from tree where member_no=target_no
    ) then
      raise exception 'لا يمكن تحليل عضو خارج فريقك المباشر أو التابع';
    end if;
  else
    target_no=root_no;
  end if;

  if mode_name='summary' then
    with recursive tree as (
      select m.member_no,m.generation,m.rank,m.personal_pv,m.personal_group_pv,m.total_group_pv,0 depth
      from public.dxn_team_members m where m.member_no=root_no
      union all
      select d.member_no,d.generation,d.rank,d.personal_pv,d.personal_group_pv,d.total_group_pv,t.depth+1
      from public.dxn_team_members d join tree t on d.sponsor_member_no=t.member_no
      where t.depth<20
    ),
    by_generation as (
      select generation,count(*) members from tree group by generation order by generation
    ),
    by_rank as (
      select coalesce(nullif(trim(rank),''),'غير محدد') rank,count(*) members
      from tree group by coalesce(nullif(trim(rank),''),'غير محدد')
      order by members desc,rank
    )
    select jsonb_build_object(
      'mode','summary',
      'root_member_no',root_no,
      'total_members',(select count(*) from tree),
      'direct_downline_count',(select count(*) from public.dxn_team_members where sponsor_member_no=root_no),
      'personal_pv_total',(select coalesce(sum(personal_pv),0) from tree),
      'personal_pv_members',(select count(*) from tree where personal_pv is not null),
      'total_group_pv_sum',(select coalesce(sum(total_group_pv),0) from tree),
      'generation_counts',coalesce((select jsonb_agg(to_jsonb(g)) from by_generation g),'[]'::jsonb),
      'rank_counts',coalesce((select jsonb_agg(to_jsonb(r)) from by_rank r),'[]'::jsonb)
    ) into result;

  elsif mode_name='member' then
    select jsonb_build_object(
      'mode','member',
      'member',(select to_jsonb(m) from public.dxn_team_members m where m.member_no=target_no),
      'immediate_downline',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.generation nulls last,x.member_name nulls last)
        from (
          select d.* from public.dxn_team_members d
          where d.sponsor_member_no=target_no
          order by d.generation nulls last,d.member_name nulls last
          limit max_rows
        ) x
      ),'[]'::jsonb)
    ) into result;

  elsif mode_name='downline' then
    with recursive tree as (
      select d.member_no,d.member_name,d.sponsor_member_no,d.sponsor_name,d.generation,d.rank,
             d.dxn_status,d.downline_status,d.join_date,d.personal_pv,d.personal_group_pv,d.total_group_pv,
             1 depth_from_target
      from public.dxn_team_members d where d.sponsor_member_no=target_no
      union all
      select d.member_no,d.member_name,d.sponsor_member_no,d.sponsor_name,d.generation,d.rank,
             d.dxn_status,d.downline_status,d.join_date,d.personal_pv,d.personal_group_pv,d.total_group_pv,
             t.depth_from_target+1
      from public.dxn_team_members d join tree t on d.sponsor_member_no=t.member_no
      where t.depth_from_target<20
    )
    select jsonb_build_object(
      'mode','downline',
      'root_member_no',target_no,
      'count',(select count(*) from tree),
      'members',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.depth_from_target,x.generation nulls last,x.member_name nulls last)
        from (
          select * from tree
          order by depth_from_target,generation nulls last,member_name nulls last
          limit max_rows
        ) x
      ),'[]'::jsonb)
    ) into result;

  elsif mode_name='generation' then
    if p_generation is null or p_generation<0 then raise exception 'حدد رقم الجيل المطلوب'; end if;
    with recursive tree as (
      select m.member_no,m.generation,0 depth from public.dxn_team_members m where m.member_no=target_no
      union all
      select d.member_no,d.generation,t.depth+1
      from public.dxn_team_members d join tree t on d.sponsor_member_no=t.member_no
      where t.depth<20
    )
    select jsonb_build_object(
      'mode','generation',
      'root_member_no',target_no,
      'generation',p_generation,
      'count',(select count(*) from tree where generation=p_generation),
      'members',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.member_name nulls last,x.member_no)
        from (
          select d.* from public.dxn_team_members d join tree t on t.member_no=d.member_no
          where d.generation=p_generation
          order by d.member_name nulls last,d.member_no
          limit max_rows
        ) x
      ),'[]'::jsonb)
    ) into result;

  else
    with recursive lines as (
      select d.member_no,d.member_name,d.generation,d.rank,d.personal_pv,d.total_group_pv
      from public.dxn_team_members d where d.sponsor_member_no=root_no
    ),
    line_tree as (
      select l.member_no line_root,l.member_no,l.personal_pv,l.total_group_pv,0 depth from lines l
      union all
      select lt.line_root,d.member_no,d.personal_pv,d.total_group_pv,lt.depth+1
      from line_tree lt join public.dxn_team_members d on d.sponsor_member_no=lt.member_no
      where lt.depth<20
    ),
    stats as (
      select line_root,count(*) members,coalesce(sum(personal_pv),0) personal_pv_total,
             coalesce(sum(total_group_pv),0) total_group_pv_sum
      from line_tree group by line_root
    )
    select jsonb_build_object(
      'mode','line_summary',
      'root_member_no',root_no,
      'lines',coalesce((
        select jsonb_agg(jsonb_build_object(
          'line_member_no',l.member_no,'line_member_name',l.member_name,
          'line_generation',l.generation,'line_rank',l.rank,
          'members',s.members,'personal_pv_total',s.personal_pv_total,
          'total_group_pv_sum',s.total_group_pv_sum
        ) order by s.members desc,s.personal_pv_total desc,l.member_name nulls last)
        from lines l join stats s on s.line_root=l.member_no
      ),'[]'::jsonb)
    ) into result;
  end if;

  return coalesce(result,'{}'::jsonb);
end;
$$;

revoke all on function public.get_dxn_team_intelligence(uuid,text,text,integer,integer) from public;
grant execute on function public.get_dxn_team_intelligence(uuid,text,text,integer,integer) to anon,authenticated,service_role;

notify pgrst,'reload schema';
