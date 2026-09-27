begin;

create or replace function public.community_private_user_search(
  p_token uuid,
  p_query text default '',
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_q text := lower(trim(coalesce(p_query,'')));
  v_limit integer := greatest(1, least(coalesce(p_limit,30),50));
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', q.id,
        'name', q.name,
        'role', q.role,
        'member_no', q.member_no
      )
      order by q.name
    )
    from (
      select
        u.id,
        coalesce(nullif(btrim(u.display_name),''), nullif(btrim(m.name),''), u.login_no) as name,
        u.role,
        coalesce(m.member_no,'') as member_no
      from public.app_users u
      join public.members m on m.id = u.member_id
      where u.active
        and u.member_id is not null
        and u.id <> v_user_id
        and (
          v_q = ''
          or lower(coalesce(u.display_name,'')) like '%' || v_q || '%'
          or lower(coalesce(m.name,'')) like '%' || v_q || '%'
          or lower(coalesce(u.login_no,'')) like '%' || v_q || '%'
          or coalesce(m.member_no,'') like '%' || v_q || '%'
        )
      order by coalesce(nullif(btrim(u.display_name),''), nullif(btrim(m.name),''), u.login_no)
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

notify pgrst, 'reload schema';

commit;
