-- Search DXN team members by full name or part of the name.
-- Scope is enforced at the database boundary: only the authenticated member
-- and their recursive Downline are searchable.

create or replace function public.search_dxn_team_members(
  p_token uuid,
  p_query text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  root_no text;
  q text := trim(coalesce(p_query, ''));
  max_rows integer := greatest(1, least(coalesce(p_limit, 20), 50));
  result jsonb;
begin
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception using errcode='P0001', message='انتهت الجلسة';
  end if;

  select trim(m.member_no)
    into root_no
  from public.app_users au
  join public.members m on m.id = au.member_id
  where au.id = uid
    and au.active = true
  limit 1;

  if root_no is null or root_no = '' then
    raise exception using errcode='P0001', message='لا يمكن تحديد عضوية الحساب الحالي';
  end if;

  if q = '' then
    raise exception using errcode='P0001', message='اكتب اسم العضو أو جزءًا من الاسم';
  end if;

  with recursive tree as (
    select m.member_no, 0 as depth
    from public.dxn_team_members m
    where m.member_no = root_no

    union all

    select d.member_no, t.depth + 1
    from public.dxn_team_members d
    join tree t on d.sponsor_member_no = t.member_no
    where t.depth < 20
  ),
  normalized as (
    select
      m.*,
      regexp_replace(
        lower(translate(coalesce(m.member_name, ''), 'أإآ', 'ااا')),
        '[[:space:]]+',
        ' ',
        'g'
      ) as normalized_name
    from public.dxn_team_members m
    join tree t on t.member_no = m.member_no
  ),
  query_parts as (
    select regexp_split_to_table(
      regexp_replace(
        lower(translate(q, 'أإآ', 'ااا')),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      '[[:space:]]+'
    ) as part
  ),
  matches as (
    select
      n.*,
      (
        select count(*)
        from query_parts qp
        where qp.part <> ''
          and n.normalized_name ilike '%' || qp.part || '%'
      ) as matched_parts
    from normalized n
  )
  select jsonb_build_object(
    'query', q,
    'count', (select count(*) from matches m where m.matched_parts = (select count(*) from query_parts where part <> '')),
    'members', coalesce((
      select jsonb_agg(to_jsonb(x) - 'normalized_name' - 'matched_parts')
      from (
        select *
        from matches
        where matched_parts = (select count(*) from query_parts where part <> '')
        order by
          case when lower(coalesce(member_name,'')) = lower(q) then 0 else 1 end,
          member_name nulls last,
          member_no
        limit max_rows
      ) x
    ), '[]'::jsonb)
  ) into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.search_dxn_team_members(uuid,text,integer)
  from public, anon, authenticated;

grant execute on function public.search_dxn_team_members(uuid,text,integer)
  to service_role;

notify pgrst, 'reload schema';
