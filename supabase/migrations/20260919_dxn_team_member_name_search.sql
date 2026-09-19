-- Search DXN team members by Arabic/English name or part of a name.
-- The search uses a shared phonetic key so Arabic queries can match
-- English names stored in the DXN report (and vice versa).

create or replace function public.dxn_name_search_key(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  s text := lower(trim(coalesce(p_name, '')));
begin
  -- Normalize Arabic letter variants and common punctuation/spaces.
  s := translate(s, 'أإآٱىةؤ', 'اااايتو');
  s := regexp_replace(s, '[ًٌٍَُِّْـ]', '', 'g');
  s := regexp_replace(s, '[^a-z0-9ء-ي]+', ' ', 'g');
  s := regexp_replace(s, '[[:space:]]+', ' ', 'g');

  -- Common Arabic digraphs first.
  s := replace(s, 'ش', 'sh');
  s := replace(s, 'خ', 'kh');
  s := replace(s, 'غ', 'gh');
  s := replace(s, 'ث', 'th');
  s := replace(s, 'ذ', 'dh');

  -- Basic Arabic transliteration. The result is intentionally phonetic,
  -- not a formal transliteration, so it can match common English spellings.
  s := replace(s, 'ذ', 'dh');
  s := translate(
    s,
    'ابتجحدرزسصضطظعفقكلمنهوي',
    'abtjhdrzssdtzafqklmnhwy'
  );

  -- Remove vowels to tolerate Ahlam/Ahlem, Mohamed/Mohammad, etc.
  s := regexp_replace(s, '[aeiouy]+', '', 'g');
  s := replace(s, ' ', '');

  return s;
end;
$$;

revoke all on function public.dxn_name_search_key(text) from public, anon, authenticated;

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
  q_key text := public.dxn_name_search_key(p_query);
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

  if q = '' or q_key = '' then
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
      public.dxn_name_search_key(m.member_name) as name_key
    from public.dxn_team_members m
    join tree t on t.member_no = m.member_no
  ),
  query_parts as (
    select public.dxn_name_search_key(part) as part
    from regexp_split_to_table(q, '[[:space:]]+') as part
    where trim(part) <> ''
  ),
  matches as (
    select
      n.*,
      (
        select count(*)
        from query_parts qp
        where qp.part <> ''
          and (
            n.name_key like '%' || qp.part || '%'
            or qp.part like '%' || n.name_key || '%'
          )
      ) as matched_parts,
      (select count(*) from query_parts where part <> '') as total_parts
    from normalized n
  )
  select jsonb_build_object(
    'query', q,
    'search_key', q_key,
    'count', (
      select count(*)
      from matches m
      where m.matched_parts = m.total_parts
    ),
    'members', coalesce((
      select jsonb_agg(to_jsonb(x) - 'name_key' - 'matched_parts' - 'total_parts')
      from (
        select *
        from matches
        where matched_parts = total_parts
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
