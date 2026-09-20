-- Use the synchronized DXN master registry as the source of truth for member verification.
-- The manual leader team registry remains untouched and is NOT deleted.

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
begin
  if no = '' then
    return jsonb_build_object(
      'allowed', false,
      'message', 'رقم العضوية مطلوب'
    );
  end if;

  if no !~ '^[0-9]{9}$' then
    return jsonb_build_object(
      'allowed', false,
      'message', 'رقم العضوية يجب أن يكون 9 أرقام بالضبط.'
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
