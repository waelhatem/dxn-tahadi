-- PENDING REVIEW ONLY — never run on production without separate approval.
-- Purpose: server-only column reads used by api/rpc.js fallback paths.
-- This file is deliberately outside supabase/migrations and is NOT deployed by
-- Supabase migrations, Vercel, or any automatic workflow.
--
-- Verified columns on 2026-10-21 against production information_schema.
-- No anon/authenticated privileges are added; existing RLS stays enabled.
-- Do not grant pin_hash or other credential columns.

begin;

grant select (
  id, login_no, role, display_name, member_id, active, team_root_member_no
) on table public.app_users to service_role;

grant select (id, member_no)
  on table public.members to service_role;

commit;

-- Read-only verification AFTER a separately authorized application:
-- select has_column_privilege('service_role', 'public.app_users', 'team_root_member_no', 'SELECT') as team_root_read,
--        has_column_privilege('service_role', 'public.app_users', 'login_no', 'SELECT') as login_no_read,
--        has_column_privilege('service_role', 'public.members', 'member_no', 'SELECT') as member_no_read,
--        has_column_privilege('anon', 'public.app_users', 'pin_hash', 'SELECT') as anon_can_read_pin_hash;
-- Expected: true, true, true, false.
