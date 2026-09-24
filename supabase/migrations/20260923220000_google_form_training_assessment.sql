-- Google Forms external training assessment storage
-- Adds only a new table; existing training tables are untouched.

create table if not exists public.external_training_assessment_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id text not null,
  sponsor_email text not null,
  member_name text not null,
  membership_number text not null,
  submitted_at timestamptz not null default now(),
  answers jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_training_assessment_membership
  on public.external_training_assessment_submissions (membership_number);

create index if not exists idx_external_training_assessment_sponsor
  on public.external_training_assessment_submissions (sponsor_email);

create index if not exists idx_external_training_assessment_form
  on public.external_training_assessment_submissions (form_id);

alter table public.external_training_assessment_submissions enable row level security;

revoke all on public.external_training_assessment_submissions from anon, authenticated;
grant all on public.external_training_assessment_submissions to service_role;

notify pgrst, 'reload schema';
