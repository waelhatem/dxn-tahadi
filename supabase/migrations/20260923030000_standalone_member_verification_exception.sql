-- Allow the approved standalone community membership exception to pass
-- DXN team verification without inserting the member into dxn_team_members.
-- This preserves the DXN team registry and keeps the member outside the team tree.

create or replace function public.verify_team_member(
  p_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  no text := trim(coalesce(p_member_no,''));
  dxn_row public.dxn_team_members;
  u public.app_users;
  m public.members;
  standalone_exception boolean := false;
begin
  if no = '' then
    return jsonb_build_object('allowed', false, 'message', 'رقم العضوية مطلوب');
  end if;

  if no !~ '^[0-9]{9}$' then
    return jsonb_build_object('allowed', false, 'message', 'رقم العضوية يجب أن يكون 9 أرقام بالضبط.');
  end if;

  -- Approved standalone community member. Do NOT add this member to the
  -- synchronized DXN team registry or assign a sponsor/team relationship.
  standalone_exception := no = '141158227';

  if standalone_exception then
    select *
      into m
    from public.members
    where member_no = no
      and active = true
    limit 1;

    if m.id is null then
      return jsonb_build_object(
        'allowed', false,
        'account_exists', false,
        'message', 'العضوية الاستثنائية معتمدة، لكن سجل العضو الأساسي غير موجود.'
      );
    end if;

    select *
      into u
    from public.app_users
    where login_no = no
      and role = 'member'
      and active = true
    limit 1;

    return jsonb_build_object(
      'allowed', true,
      'account_exists', (u.id is not null),
      'member_id', coalesce(u.member_id, m.id),
      'member_no', m.member_no,
      'name', coalesce(m.name, 'RAJWAN NAJAH ABED'),
      'sponsor_member_no', null,
      'generation', null,
      'rank', null,
      'standalone_exception', true
    );
  end if;

  select *
    into dxn_row
  from public.dxn_team_members
  where member_no = no
  limit 1;

  if dxn_row.member_no is null then
    return jsonb_build_object(
      'allowed', false,
      'account_exists', false,
      'message', 'رقم العضوية غير موجود في سجل DXN المتزامن.'
    );
  end if;

  select *
    into u
  from public.app_users
  where login_no = no
    and role = 'member'
    and active = true
  limit 1;

  return jsonb_build_object(
    'allowed', true,
    'account_exists', (u.id is not null),
    'member_id', u.member_id,
    'member_no', dxn_row.member_no,
    'name', coalesce(dxn_row.member_name,''),
    'sponsor_member_no', dxn_row.sponsor_member_no,
    'generation', dxn_row.generation,
    'rank', dxn_row.rank
  );
end;
$$;

revoke all on function public.verify_team_member(text)
  from public;

grant execute on function public.verify_team_member(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
