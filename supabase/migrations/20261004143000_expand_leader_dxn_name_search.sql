-- Expand DXN member name search to work across Arabic and English spellings.
-- Examples:
--   وائل  <-> WAEL
--   حاتم  <-> HATEM
--   سعيد  <-> SAEED
-- The matching uses a normalized consonant/phonetic key and token-by-token
-- matching, while preserving direct text matching as the first path.

create or replace function public.dxn_name_search_key(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  s text := lower(trim(coalesce(p_name, '')));
begin
  -- Normalize Arabic letter variants and common Persian/Kurdish variants.
  s := translate(
    s,
    'أإآٱىةؤئءپچگڤ',
    'اااايتوائءپچگڤ'
  );

  -- Remove Arabic diacritics and tatweel.
  s := regexp_replace(s, '[ًٌٍَُِّْـ]', '', 'g');

  -- Keep Latin/Arabic letters and digits, normalize separators to spaces.
  s := regexp_replace(s, '[^a-z0-9ء-يپچگڤ]+', ' ', 'g');
  s := regexp_replace(s, '[[:space:]]+', ' ', 'g');
  s := trim(s);

  -- Arabic digraphs first.
  s := replace(s, 'ش', 'sh');
  s := replace(s, 'خ', 'kh');
  s := replace(s, 'غ', 'gh');
  s := replace(s, 'ث', 'th');
  s := replace(s, 'ذ', 'dh');
  s := replace(s, 'چ', 'ch');

  -- Map Arabic/Persian letters to a phonetic Latin skeleton.
  s := translate(
    s,
    'ابتجحدرزسصضطظعفقكلمنهويپگڤ',
    'abtjh drzssdtzafqklmnhwypgv'::text
  );

  -- Normalize accidental spacing introduced by translation.
  s := regexp_replace(s, '[^a-z0-9]+', '', 'g');

  -- Remove vowels so common spelling variants match:
  -- wael/waeil/وائل -> wl, saeed/سعيد -> sd, mohammad/محمد -> mhmd.
  s := regexp_replace(s, '[aeiouy]+', '', 'g');

  return s;
end;
$$;

revoke all on function public.dxn_name_search_key(text)
  from public, anon, authenticated;

create or replace function public.leader_dxn_member_search(
  p_token uuid,
  p_mode text default 'number',
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
  mode_clean text := lower(trim(coalesce(p_mode, 'number')));
  query_clean text := trim(coalesce(p_query, ''));
  max_rows integer := greatest(1, least(coalesce(p_limit, 20), 50));
  rows_json jsonb;
begin
  role_name := lower(trim(coalesce(public.app_current_role(p_token), '')));

  if role_name <> 'leader' then
    raise exception using
      errcode = 'P0001',
      message = 'هذه العملية متاحة للقائد فقط';
  end if;

  if query_clean = '' then
    raise exception using
      errcode = 'P0001',
      message = case
        when mode_clean = 'name'
          then 'أدخل اسم العضو أو جزءًا منه'
        else 'أدخل رقم العضوية'
      end;
  end if;

  if mode_clean not in ('number', 'name') then
    raise exception using
      errcode = 'P0001',
      message = 'طريقة البحث غير صالحة';
  end if;

  if mode_clean = 'number' and query_clean !~ '^[0-9]{9}$' then
    raise exception using
      errcode = 'P0001',
      message = 'رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;

  if mode_clean = 'number' then
    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.member_no),
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
      where m.member_no = query_clean
      limit max_rows
    ) x;
  else
    select coalesce(
      jsonb_agg(
        to_jsonb(x)
        order by lower(coalesce(x.member_name, '')), x.member_no
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
        -- Direct search first: preserves normal substring matching.
        position(lower(query_clean) in lower(coalesce(m.member_name, ''))) > 0

        or

        -- Cross-language search: every query token must be represented in
        -- the normalized member-name key. This allows Arabic queries to
        -- match English report names and English queries to match Arabic.
        not exists (
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
      limit max_rows
    ) x;
  end if;

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
