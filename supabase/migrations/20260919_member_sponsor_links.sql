-- Team genealogy foundation: member -> direct sponsor
-- Stores the sponsor number entered by the authenticated member.
-- This is intentionally separate from DXN's own genealogy system.

create table if not exists public.member_sponsor_links (
  user_id uuid primary key,
  sponsor_member_no text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_sponsor_links_sponsor_idx
  on public.member_sponsor_links (sponsor_member_no);

alter table public.member_sponsor_links enable row level security;

-- The web app accesses this table through controlled RPCs.
revoke all on public.member_sponsor_links from anon, authenticated;

create or replace function public.get_member_sponsor_link(p_token uuid)
returns table (
  sponsor_member_no text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'جلسة الدخول غير صالحة';
  end if;

  return query
  select l.sponsor_member_no, l.updated_at
  from public.member_sponsor_links l
  where l.user_id = uid;
end;
$$;

create or replace function public.set_member_sponsor_link(
  p_token uuid,
  p_sponsor_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  sponsor_no text;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'جلسة الدخول غير صالحة';
  end if;

  sponsor_no := trim(coalesce(p_sponsor_member_no,''));

  if sponsor_no = '' then
    raise exception 'أدخل رقم عضوية الراعي';
  end if;

  if length(sponsor_no) > 80 then
    raise exception 'رقم العضوية غير صالح';
  end if;

  -- The sponsor must exist in the platform's member registry.
  if not exists (
    select 1
    from public.members m
    where trim(coalesce(m.member_no::text,'')) = sponsor_no
  ) then
    raise exception 'رقم الراعي غير موجود في سجل الأعضاء';
  end if;

  insert into public.member_sponsor_links(user_id,sponsor_member_no,updated_at)
  values(uid,sponsor_no,now())
  on conflict (user_id)
  do update set
    sponsor_member_no=excluded.sponsor_member_no,
    updated_at=now();

  return jsonb_build_object(
    'ok', true,
    'sponsor_member_no', sponsor_no
  );
end;
$$;

revoke all on function public.get_member_sponsor_link(uuid) from public, anon, authenticated;
revoke all on function public.set_member_sponsor_link(uuid,text) from public, anon, authenticated;

grant execute on function public.get_member_sponsor_link(uuid) to anon, authenticated;
grant execute on function public.set_member_sponsor_link(uuid,text) to anon, authenticated;
