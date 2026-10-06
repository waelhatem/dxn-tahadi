-- Define the team's DXN root explicitly for leader accounts.
-- The leader account is not itself a member login, so app_users.member_id
-- cannot be used as the team root. Keep the root separate from member identity.

alter table public.app_users
  add column if not exists team_root_member_no text;

-- Current leader account: Wael Hatem / DXN member 820469486.
update public.app_users
set team_root_member_no='820469486'
where login_no='LEADER'
  and role='leader';

create index if not exists idx_app_users_team_root_member_no
  on public.app_users(team_root_member_no)
  where team_root_member_no is not null;

create or replace function public.team_member_search(
  p_token uuid,
  p_root_member_no text,
  p_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text;
  session_member_no text;
  account_root_no text;
  root_no text := trim(coalesce(p_root_member_no, ''));
  target_no text := trim(coalesce(p_member_no, ''));
  target_row jsonb;
  found_depth integer := null;
begin
  if p_token is null then
    raise exception using errcode='P0001', message='جلسة الدخول غير موجودة';
  end if;

  if not target_no ~ '^[0-9]{9}$' then
    raise exception using errcode='P0001', message='رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;

  select
    lower(trim(u.role)),
    trim(m.member_no),
    trim(u.team_root_member_no)
  into role_name, session_member_no, account_root_no
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  left join public.members m on m.id=u.member_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if role_name is null then
    raise exception using errcode='P0001', message='جلسة الدخول غير صالحة أو منتهية';
  end if;

  if role_name not in ('leader','member') then
    raise exception using errcode='P0001', message='الدور غير مصرح له بهذه العملية';
  end if;

  -- Leader root comes from the explicit team mapping. Member root remains
  -- the authenticated member number and cannot be overridden by the UI.
  if role_name='leader' then
    if root_no='' then
      root_no:=coalesce(account_root_no,'');
    end if;
  else
    root_no:=coalesce(session_member_no,'');
  end if;

  if not root_no ~ '^[0-9]{9}$' then
    raise exception using errcode='P0001', message='تعذر تحديد جذر الفريق المرتبط بالحساب الحالي';
  end if;

  select to_jsonb(m)
  into target_row
  from public.dxn_team_members m
  where trim(m.member_no)=target_no
  limit 1;

  if target_row is null then
    return jsonb_build_object(
      'ok',true,'found',false,'in_team',false,
      'member',null,'depth_from_target',null
    );
  end if;

  if not exists (
    select 1 from public.dxn_team_members m
    where trim(m.member_no)=root_no
  ) then
    raise exception using
      errcode='P0001',
      message='جذر الفريق غير موجود في سجل DXN';
  end if;

  if target_no=root_no then
    return jsonb_build_object(
      'ok',true,'found',true,'in_team',true,
      'member',target_row || jsonb_build_object('depth_from_target',0),
      'depth_from_target',0
    );
  end if;

  with recursive team as (
    select
      trim(m.member_no) as member_no,
      0 as depth,
      array[trim(m.member_no)]::text[] as path
    from public.dxn_team_members m
    where trim(m.member_no)=root_no

    union all

    select
      trim(d.member_no),
      t.depth+1,
      t.path || trim(d.member_no)
    from public.dxn_team_members d
    join team t on trim(d.sponsor_member_no)=t.member_no
    where not trim(d.member_no)=any(t.path)
  )
  select t.depth
  into found_depth
  from team t
  where t.member_no=target_no
  order by t.depth
  limit 1;

  if found_depth is null then
    return jsonb_build_object(
      'ok',true,'found',true,'in_team',false,
      'member',null,'depth_from_target',null
    );
  end if;

  return jsonb_build_object(
    'ok',true,'found',true,'in_team',true,
    'member',target_row || jsonb_build_object('depth_from_target',found_depth),
    'depth_from_target',found_depth
  );
end;
$$;

revoke all on function public.team_member_search(uuid,text,text) from public;
grant execute on function public.team_member_search(uuid,text,text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
