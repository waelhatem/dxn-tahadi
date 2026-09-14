-- Prevent a verified Team Bidayat Amal member from opening a second
-- Community of Health & Wealth account.
-- The existing members.member_no and app_users.login_no unique constraints remain
-- the final database-level protection against duplicate accounts.

create or replace function public.check_member_account_status(p_member_no text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  no text := trim(coalesce(p_member_no,''));
  m public.members;
  u public.app_users;
begin
  if no = '' then
    raise exception using errcode='P0001', message='رقم العضوية مطلوب';
  end if;

  select * into m
  from public.members
  where member_no=no
  limit 1;

  select * into u
  from public.app_users
  where login_no=no
    and role='member'
    and active=true
  limit 1;

  if m.id is not null or u.id is not null then
    return jsonb_build_object(
      'registered', true,
      'member_id', coalesce(m.id,u.member_id),
      'name', coalesce(m.name,'')
    );
  end if;

  return jsonb_build_object('registered', false);
end;
$$;

revoke execute on function public.check_member_account_status(text) from public;
grant execute on function public.check_member_account_status(text) to anon, authenticated;

notify pgrst, 'reload schema';
