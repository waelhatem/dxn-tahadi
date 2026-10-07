-- Design Studio (Phase 2 storage) — FOR REVIEW. Not applied in Phase 1.
-- Phase 1 keeps projects on the user's device (IndexedDB). This migration prepares
-- server-side projects/assets/jobs for when external engines and cloud storage are enabled.
--
-- Access model follows the project's existing pattern: tables are locked (RLS on, no grants
-- to anon/authenticated) and are reached only through server code (api/design-studio.js with
-- the secret key) or SECURITY DEFINER RPCs that validate the session token and ownership.
-- Nothing here deletes or alters existing tables. Re-runnable.
--
-- Storage (created server-side, like the ragwan-plan bucket): private bucket "design-studio",
-- object paths: {app_user_id}/{project_id}/{source|generated|exports|thumbnails}/{file}

create table if not exists public.design_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  project_type text not null check (project_type in ('image','product','video','short','audio','translation','social')),
  status text not null default 'draft' check (status in ('draft','processing','completed','failed')),
  thumbnail_path text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_projects_user_idx on public.design_projects(user_id, updated_at desc);

create table if not exists public.design_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.design_projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('source','generated','export','thumbnail','subtitle')),
  storage_path text not null check (storage_path !~ '\.\.' and storage_path !~ '^/'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists design_assets_project_idx on public.design_assets(project_id);

create table if not exists public.design_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.design_projects(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  job_type text not null,
  provider text not null default 'local',
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_jobs_user_idx on public.design_jobs(user_id, created_at desc);
create index if not exists design_jobs_active_idx on public.design_jobs(status) where status in ('queued','processing');

alter table public.design_projects enable row level security;
alter table public.design_assets enable row level security;
alter table public.design_jobs enable row level security;
revoke all on public.design_projects from public, anon, authenticated;
revoke all on public.design_assets from public, anon, authenticated;
revoke all on public.design_jobs from public, anon, authenticated;