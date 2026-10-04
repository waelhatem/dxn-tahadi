-- Expand the leader DXN sponsor search capacity.
-- Member searches keep their normal limit, while sponsor searches can return
-- the full direct-member set up to 500 rows.

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
  role_name text;
  mode_clean text := lower(trim(coalesce(p_mode, 'member_number')));
  query_clean text := trim(coalesce(p_query, ''));
  max_rows integer := greatest(1, least(coalesce(p_limit, 20), 500));
  rows_json jsonb;
begin
  role_name := lower(
    trim(coalesce(public.app_current_role(p_token), ''))
  );

  if role_name <> 'leader' then
    raise exception using
      errcode = 'P0001',
      message = 'هذه العملية متاحة للقائد فقط';
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
        when mode_clean = 'member_number'
          then 'أدخل رقم العضوية'
        when mode_clean = 'member_name'
          then 'أدخل اسم العضو أو جزءًا منه'
        when mode_clean = 'sponsor_number'
          then 'أدخل رقم عضوية الراعي'
        else
          'أدخل اسم الراعي أو جزءًا منه'
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

  select coalesce(
    jsonb_agg(
      to_jsonb(x)
      order by
        lower(coalesce(x.member_name, '')),
        x.member_no
    ),
    '[]'::jsonb
  )
  into rows_json
  from (
    select
      m.member_no,
      m.member_name,
      m.sponsor_member_no,
      m.sponsor_name,
      m.generation,
      m.rank,
      m.dxn_status,
      m.downline_status,
      m.join_date,
      m.personal_pv,
      m.personal_group_pv,
      m.total_group_pv,
      m.accumulated_group_pv,
      m.accumulated_promotion_pv,
      m.diamond_group_pv,
      m.accumulated_group_pv_masked,
      m.accumulated_promotion_pv_masked,
      m.diamond_group_pv_masked,
      m.source,
      m.source_updated_at,
      m.created_at,
      m.updated_at
    from public.dxn_team_members m
    where
      (
        mode_clean = 'member_number'
        and m.member_no = query_clean
      )

      or

      (
        mode_clean = 'sponsor_number'
        and m.sponsor_member_no = query_clean
      )

      or

      (
        mode_clean = 'member_name'
        and (
          position(
            lower(query_clean)
            in lower(coalesce(m.member_name, ''))
          ) > 0

          or

          not exists (
            select 1
            from regexp_split_to_table(
              query_clean,
              '[[:space:]]+'
            ) as qp(part)
            where trim(qp.part) <> ''
              and (
                public.dxn_name_search_key(trim(qp.part)) = ''
                or
                position(
                  public.dxn_name_search_key(trim(qp.part))
                  in
                  public.dxn_name_search_key(coalesce(m.member_name, ''))
                ) = 0
              )
          )
        )
      )

      or

      (
        mode_clean = 'sponsor_name'
        and (
          position(
            lower(query_clean)
            in lower(coalesce(m.sponsor_name, ''))
          ) > 0

          or

          not exists (
            select 1
            from regexp_split_to_table(
              query_clean,
              '[[:space:]]+'
            ) as qp(part)
            where trim(qp.part) <> ''
              and (
                public.dxn_name_search_key(trim(qp.part)) = ''
                or
                position(
                  public.dxn_name_search_key(trim(qp.part))
                  in
                  public.dxn_name_search_key(coalesce(m.sponsor_name, ''))
                ) = 0
              )
          )
        )
      )
    order by
      lower(coalesce(m.member_name, '')),
      m.member_no
    limit max_rows
  ) x;

  return jsonb_build_object(
    'ok', true,
    'mode', mode_clean,
    'query', query_clean,
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
