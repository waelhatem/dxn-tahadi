-- Fix leader "فريقي" member-number search.
-- Search against the DXN registry, then enforce the authenticated leader's
-- recursive downline as the visibility boundary.
-- The queried number is never treated as a root/team identifier.

create or replace function public.leader_dxn_member_search(
  p_token uuid,
  p_mode text default 'member_number',
  p_query text default '',
  p_limit integer default 20
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
  mode_clean text := lower(trim(coalesce(p_mode, 'member_number')));
  query_clean text := trim(coalesce(p_query, ''));
  max_rows integer := greatest(1, least(coalesce(p_limit, 20), 500));
  rows_json jsonb;
  found_in_dxn boolean := false;
  found_in_team boolean := false;
begin
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception using
      errcode = 'P0001',
      message = 'انتهت الجلسة';
  end if;

  select
    lower(trim(au.role)),
    trim(m.member_no)
  into
    role_name,
    root_no
  from public.app_users au
  join public.members m on m.id = au.member_id
  where au.id = uid
    and au.active = true
  limit 1;

  if role_name <> 'leader' then
    raise exception using
      errcode = 'P0001',
      message = 'هذه العملية متاحة للقائد فقط';
  end if;

  if root_no is null or root_no = '' then
    raise exception using
      errcode = 'P0001',
      message = 'لا يمكن تحديد رقم عضوية القائد';
  end if;

  if not exists (
    select 1
    from public.dxn_team_members m
    where m.member_no = root_no
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'بيانات القائد غير موجودة في سجل DXN';
  end if;

  if mode_clean not in (
    'member_number',
    'member_name',
    'sponsor_number',
    'sponsor_name'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'طريقة البحث غير صالحة';
  end if;

  if query_clean = '' then
    raise exception using
      errcode = 'P0001',
      message = case
        when mode_clean = 'member_name'
          then 'أدخل اسم العضو أو جزءًا منه'
        when mode_clean = 'sponsor_number'
          then 'أدخل رقم عضوية الراعي'
        when mode_clean = 'sponsor_name'
          then 'أدخل اسم الراعي أو جزءًا منه'
        else
          'أدخل رقم العضوية'
      end;
  end if;

  if mode_clean in ('member_number', 'sponsor_number')
     and query_clean !~ '^[0-9]{9}$' then
    raise exception using
      errcode = 'P0001',
      message = case
        when mode_clean = 'sponsor_number'
          then 'رقم عضوية الراعي يجب أن يتكوّن من 9 أرقام'
        else
          'رقم العضوية يجب أن يتكوّن من 9 أرقام'
      end;
  end if;

  -- For an exact member-number search, distinguish:
  -- 1) the number exists in the DXN registry;
  -- 2) that member is actually inside the logged-in leader's team.
  if mode_clean = 'member_number' then
    select exists (
      select 1
      from public.dxn_team_members m
      where m.member_no = query_clean
    )
    into found_in_dxn;

    select exists (
      with recursive team as (
        select m.member_no, 0 as depth
        from public.dxn_team_members m
        where m.member_no = root_no

        union all

        select d.member_no, t.depth + 1
        from public.dxn_team_members d
        join team t on d.sponsor_member_no = t.member_no
        where t.depth < 20
      )
      select 1
      from team
      where team.member_no = query_clean
    )
    into found_in_team;

    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.member_no),
      '[]'::jsonb
    )
    into rows_json
    from (
      select m.*
      from public.dxn_team_members m
      where m.member_no = query_clean
        and exists (
          with recursive team as (
            select tm.member_no, 0 as depth
            from public.dxn_team_members tm
            where tm.member_no = root_no

            union all

            select d.member_no, t.depth + 1
            from public.dxn_team_members d
            join team t on d.sponsor_member_no = t.member_no
            where t.depth < 20
          )
          select 1
          from team
          where team.member_no = m.member_no
        )
      limit max_rows
    ) x;

  else
    -- Name/sponsor modes also remain restricted to the same recursive team.
    select coalesce(
      jsonb_agg(
        to_jsonb(x)
        order by lower(coalesce(x.member_name, '')), x.member_no
      ),
      '[]'::jsonb
    )
    into rows_json
    from (
      with recursive team as (
        select m.member_no, 0 as depth
        from public.dxn_team_members m
        where m.member_no = root_no

        union all

        select d.member_no, t.depth + 1
        from public.dxn_team_members d
        join team t on d.sponsor_member_no = t.member_no
        where t.depth < 20
      )
      select m.*
      from public.dxn_team_members m
      join team t on t.member_no = m.member_no
      where
        (
          mode_clean = 'member_name'
          and (
            position(
              lower(query_clean)
              in lower(coalesce(m.member_name, ''))
            ) > 0
            or not exists (
              select 1
              from regexp_split_to_table(query_clean, '[[:space:]]+') as qp(part)
              where trim(qp.part) <> ''
                and (
                  public.dxn_name_search_key(trim(qp.part)) = ''
                  or position(
                    public.dxn_name_search_key(trim(qp.part))
                    in public.dxn_name_search_key(coalesce(m.member_name, ''))
                  ) = 0
                )
            )
          )
        )
        or
        (
          mode_clean = 'sponsor_number'
          and m.sponsor_member_no = query_clean
        )
        or
        (
          mode_clean = 'sponsor_name'
          and (
            position(
              lower(query_clean)
              in lower(coalesce(m.sponsor_name, ''))
            ) > 0
            or not exists (
              select 1
              from regexp_split_to_table(query_clean, '[[:space:]]+') as qp(part)
              where trim(qp.part) <> ''
                and (
                  public.dxn_name_search_key(trim(qp.part)) = ''
                  or position(
                    public.dxn_name_search_key(trim(qp.part))
                    in public.dxn_name_search_key(coalesce(m.sponsor_name, ''))
                  ) = 0
                )
            )
          )
        )
      order by lower(coalesce(m.member_name, '')), m.member_no
      limit max_rows
    ) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', mode_clean,
    'query', query_clean,
    'team_root_member_no', root_no,
    'found_in_dxn', case
      when mode_clean = 'member_number' then found_in_dxn
      else jsonb_array_length(rows_json) > 0
    end,
    'found_in_team', case
      when mode_clean = 'member_number' then found_in_team
      else jsonb_array_length(rows_json) > 0
    end,
    'count', jsonb_array_length(rows_json),
    'rows', rows_json
  );
end;
$$;

revoke all on function public.leader_dxn_member_search(uuid,text,text,integer)
  from public, anon, authenticated;

grant execute on function public.leader_dxn_member_search(uuid,text,text,integer)
  to service_role;

notify pgrst, 'reload schema';
