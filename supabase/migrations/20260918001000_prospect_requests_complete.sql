-- Complete prospect contact request flow: storage, public submission, leader read access.
-- Safe to run repeatedly.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  email text,
  country text not null default '',
  referrer_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_prospects_created_at
  on public.prospects(created_at desc);

create index if not exists idx_prospects_mobile
  on public.prospects(mobile);

alter table public.prospects enable row level security;

-- Public registration: no session is required.
create or replace function public.register_prospect(
  p_name text,
  p_mobile text,
  p_email text default null,
  p_country text default '',
  p_referrer_name text default ''
)
returns public.prospects
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.prospects;
begin
  if trim(coalesce(p_name,''))='' then
    raise exception 'الاسم مطلوب';
  end if;
  if trim(coalesce(p_mobile,''))='' then
    raise exception 'رقم الواتساب مطلوب';
  end if;
  if trim(coalesce(p_country,''))='' then
    raise exception 'بلد الإقامة مطلوب';
  end if;
  if trim(coalesce(p_referrer_name,''))='' then
    raise exception 'اسم الشخص الذي شارك الفكرة مطلوب';
  end if;

  insert into public.prospects(name,mobile,email,country,referrer_name)
  values(
    trim(p_name),
    trim(p_mobile),
    nullif(trim(coalesce(p_email,'')),''),
    trim(p_country),
    trim(p_referrer_name)
  )
  returning * into r;

  return r;
end;
$$;

-- Leader-only read access.
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

revoke all on table public.prospects from anon, authenticated;
revoke all on function public.register_prospect(text,text,text,text,text) from public;
revoke all on function public.leader_prospect_requests(uuid) from public;

grant execute on function public.register_prospect(text,text,text,text,text) to anon, authenticated;
grant execute on function public.leader_prospect_requests(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
