-- Fix "بحث في فريقي" member-number lookup.
-- The browser calls this RPC directly through Supabase. Therefore the
-- function itself must perform the DXN lookup and team-membership check.
-- Result for member_number is always exactly one member record, never the
-- member's downline.

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
  root_no text := trim(coalesce(p_root_member_no, ''));
  target_no text := trim(coalesce(p_member_no, ''));
  target_row jsonb;
  found_depth integer := null;
begin
  if p_token is null then
    raise exception using errcode='P0001', message='جلسة الدخول غير موجودة';
  end if;

  if root_no !~ '^[0-9]{9}$' or target_no !~ '^[0-9]{9}$' then
    raise exception using errcode='P0001', message='رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;

  select
    lower(trim(u.role)),
    trim(m.member_no)
  into role_name, session_member_no
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

  if role_name='member' and root_no<>coalesce(session_member_no,'') then
    raise exception using
      errcode='P0001',
      message='لا يمكن للعضو اختيار عضو آخر كجذر للفريق';
  end if;

  -- First check the requested number in the DXN registry.
  select to_jsonb(m)
  into target_row
  from public.dxn_team_members m
  where m.member_no=target_no
  limit 1;

  if target_row is null then
    return jsonb_build_object(
      'ok',true,
      'found',false,
      'in_team',false,
      'member',null,
      'depth_from_target',null
    );
  end if;

  -- The selected root must itself exist in the DXN registry.
  if not exists (
    select 1
    from public.dxn_team_members m
    where m.member_no=root_no
  ) then
    raise exception using
      errcode='P0001',
      message='العضو الأساسي غير موجود في سجل DXN';
  end if;

  -- The root itself is a valid member result.
  if target_no=root_no then
    return jsonb_build_object(
      'ok',true,
      'found',true,
      'in_team',true,
      'member',target_row || jsonb_build_object('depth_from_target',0),
      'depth_from_target',0
    );
  end if;

  -- "بحث في فريقي" searches the entire downline under the
  -- selected root, across all generations.
  with recursive team as (
    select m.member_no, 0 as depth
    from public.dxn_team_members m
    where m.member_no=root_no

    union all

    select d.member_no, t.depth+1
    from public.dxn_team_members d
    join team t
      on d.sponsor_member_no=t.member_no
    where t.depth<20
  )
  select t.depth
  into found_depth
  from team t
  where t.member_no=target_no
  order by t.depth
  limit 1;

  if found_depth is null then
    return jsonb_build_object(
      'ok',true,
      'found',true,
      'in_team',false,
      'member',null,
      'depth_from_target',null
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'found',true,
    'in_team',true,
    'member',target_row || jsonb_build_object('depth_from_target',found_depth),
    'depth_from_target',found_depth
  );
end;
$$;

revoke all on function public.team_member_search(uuid,text,text)
  from public;

grant execute on function public.team_member_search(uuid,text,text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
