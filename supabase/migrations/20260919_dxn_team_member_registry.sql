-- DXN master member registry.
-- Member number is the immutable primary key.
-- Sponsor member number is the relationship key used to build the downline.
-- Values such as '***' must remain distinguishable from numeric zero.

create table if not exists public.dxn_team_members (
  member_no text primary key,
  member_name text,
  sponsor_member_no text,
  sponsor_name text,
  generation integer,
  rank text,
  dxn_status text,
  downline_status text,
  join_date date,
  personal_pv numeric,
  personal_group_pv numeric,
  total_group_pv numeric,
  accumulated_group_pv numeric,
  accumulated_promotion_pv numeric,
  diamond_group_pv numeric,

  -- Preserve DXN report masking exactly; never coerce '***' to zero.
  accumulated_group_pv_masked boolean not null default false,
  accumulated_promotion_pv_masked boolean not null default false,
  diamond_group_pv_masked boolean not null default false,

  source text not null default 'dxn_report',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dxn_team_members_member_no_nonempty
    check (length(trim(member_no)) > 0),

  constraint dxn_team_members_generation_nonnegative
    check (generation is null or generation >= 0)
);

create index if not exists dxn_team_members_sponsor_idx
  on public.dxn_team_members (sponsor_member_no);

create index if not exists dxn_team_members_generation_idx
  on public.dxn_team_members (generation);

alter table public.dxn_team_members enable row level security;

-- The registry is accessed through controlled RPCs, not direct table access.
revoke all on public.dxn_team_members from anon, authenticated;

-- Upsert one DXN member. Existing member_no is updated, never duplicated.
create or replace function public.upsert_dxn_team_member(
  p_member_no text,
  p_member_name text default null,
  p_sponsor_member_no text default null,
  p_sponsor_name text default null,
  p_generation integer default null,
  p_rank text default null,
  p_dxn_status text default null,
  p_downline_status text default null,
  p_join_date date default null,
  p_personal_pv numeric default null,
  p_personal_group_pv numeric default null,
  p_total_group_pv numeric default null,
  p_accumulated_group_pv numeric default null,
  p_accumulated_promotion_pv numeric default null,
  p_diamond_group_pv numeric default null,
  p_accumulated_group_pv_masked boolean default false,
  p_accumulated_promotion_pv_masked boolean default false,
  p_diamond_group_pv_masked boolean default false,
  p_source text default 'dxn_report',
  p_source_updated_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_no_clean text;
begin
  member_no_clean := trim(coalesce(p_member_no, ''));

  if member_no_clean = '' then
    raise exception 'رقم العضوية مطلوب';
  end if;

  insert into public.dxn_team_members (
    member_no, member_name, sponsor_member_no, sponsor_name,
    generation, rank, dxn_status, downline_status, join_date,
    personal_pv, personal_group_pv, total_group_pv,
    accumulated_group_pv, accumulated_promotion_pv, diamond_group_pv,
    accumulated_group_pv_masked, accumulated_promotion_pv_masked,
    diamond_group_pv_masked, source, source_updated_at, updated_at
  )
  values (
    member_no_clean, nullif(trim(coalesce(p_member_name,'')), ''),
    nullif(trim(coalesce(p_sponsor_member_no,'')), ''),
    nullif(trim(coalesce(p_sponsor_name,'')), ''),
    p_generation, p_rank, p_dxn_status, p_downline_status, p_join_date,
    p_personal_pv, p_personal_group_pv, p_total_group_pv,
    p_accumulated_group_pv, p_accumulated_promotion_pv, p_diamond_group_pv,
    coalesce(p_accumulated_group_pv_masked,false),
    coalesce(p_accumulated_promotion_pv_masked,false),
    coalesce(p_diamond_group_pv_masked,false),
    coalesce(nullif(trim(p_source),''),'dxn_report'),
    p_source_updated_at, now()
  )
  on conflict (member_no) do update set
    member_name = excluded.member_name,
    sponsor_member_no = excluded.sponsor_member_no,
    sponsor_name = excluded.sponsor_name,
    generation = excluded.generation,
    rank = excluded.rank,
    dxn_status = excluded.dxn_status,
    downline_status = excluded.downline_status,
    join_date = excluded.join_date,
    personal_pv = excluded.personal_pv,
    personal_group_pv = excluded.personal_group_pv,
    total_group_pv = excluded.total_group_pv,
    accumulated_group_pv = excluded.accumulated_group_pv,
    accumulated_promotion_pv = excluded.accumulated_promotion_pv,
    diamond_group_pv = excluded.diamond_group_pv,
    accumulated_group_pv_masked = excluded.accumulated_group_pv_masked,
    accumulated_promotion_pv_masked = excluded.accumulated_promotion_pv_masked,
    diamond_group_pv_masked = excluded.diamond_group_pv_masked,
    source = excluded.source,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'member_no', member_no_clean
  );
end;
$$;

revoke all on function public.upsert_dxn_team_member(
  text,text,text,text,integer,text,text,text,date,numeric,numeric,numeric,numeric,numeric,numeric,boolean,boolean,boolean,text,timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_dxn_team_member(
  text,text,text,text,integer,text,text,text,date,numeric,numeric,numeric,numeric,numeric,numeric,boolean,boolean,boolean,text,timestamptz
) to service_role;

-- Return one member with its immediate downline.
create or replace function public.get_dxn_member_with_downline(
  p_member_no text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'member', (
      select to_jsonb(m)
      from public.dxn_team_members m
      where m.member_no = trim(p_member_no)
    ),
    'downline', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.generation nulls last, d.member_name nulls last)
      from public.dxn_team_members d
      where d.sponsor_member_no = trim(p_member_no)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_dxn_member_with_downline(text) from public, anon, authenticated;
grant execute on function public.get_dxn_member_with_downline(text) to service_role;
