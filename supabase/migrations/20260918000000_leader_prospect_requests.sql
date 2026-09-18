-- Leader-only access to public prospect contact requests.
create or replace function public.leader_prospect_requests(p_token uuid)
returns setof public.prospects
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1
    from public.sessions s
    join public.app_users u on u.id=s.user_id
    where s.token=p_token
      and s.expires_at>now()
      and u.role='leader'
      and u.active=true
  ) then
    raise exception 'غير مصرح';
  end if;

  return query
  select *
  from public.prospects
  order by created_at desc;
end;
$$;

revoke all on function public.leader_prospect_requests(uuid) from public;
grant execute on function public.leader_prospect_requests(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
