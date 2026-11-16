-- DXN branch GPS directory and versioned PDF price-list catalog.
-- Server APIs verify the platform's own session token. No direct client table access.
create table if not exists public.dxn_branch_locations (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 2 and 140),
  country text not null check (char_length(country) between 2 and 90),
  city text not null check (char_length(city) between 2 and 90),
  street_address text not null check (char_length(street_address) between 4 and 500),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists dxn_branch_locations_country_city_idx
  on public.dxn_branch_locations(country, city, name);

create table if not exists public.dxn_price_lists (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 2 and 160),
  country text not null check (char_length(country) between 2 and 90),
  branch_id bigint references public.dxn_branch_locations(id) on delete set null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 5 and 250),
  effective_on date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists dxn_price_lists_country_updated_idx
  on public.dxn_price_lists(country, updated_at desc);

alter table public.dxn_branch_locations enable row level security;
alter table public.dxn_price_lists enable row level security;
revoke all on table public.dxn_branch_locations from anon, authenticated;
revoke all on table public.dxn_price_lists from anon, authenticated;
grant all on table public.dxn_branch_locations to service_role;
grant all on table public.dxn_price_lists to service_role;
grant usage, select on sequence public.dxn_branch_locations_id_seq to service_role;
grant usage, select on sequence public.dxn_price_lists_id_seq to service_role;

-- The PDF files remain private. Signed URLs are issued to logged-in members only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dxn-price-lists','dxn-price-lists',false,15728640,array['application/pdf'])
on conflict (id) do nothing;
