-- Community meetings: persistent scheduling and organizer records
create table if not exists public.community_meetings (
  id uuid primary key default gen_random_uuid(),
  organizer_member_no text not null,
  organizer_name text not null default '',
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 720),
  description text not null default '',
  meeting_url text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_meetings_scheduled_at_idx
  on public.community_meetings(scheduled_at);

create index if not exists community_meetings_organizer_idx
  on public.community_meetings(organizer_member_no);

alter table public.community_meetings enable row level security;

-- The website accesses this table through /api/rpc after validating the member session.
-- No direct browser policy is granted here.
