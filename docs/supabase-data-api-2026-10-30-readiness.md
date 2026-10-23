# Supabase Data API grant readiness — 30 October 2026

Status: **staged in an isolated GitHub branch; no production SQL executed**.

## Verified production facts (2026-10-21)

- Supabase project: DXN Tahadi, ref `ryqpstkzppaifpvhezzn`.
- 65 `public` tables have RLS enabled. No table-level RLS policies are present; the application mostly exposes narrowly scoped, session-token-based `SECURITY DEFINER` RPCs. This design must be reviewed function by function; it is **not** a reason to grant browser roles direct table access.
- Historical migration inventory: 128 SQL files in `supabase/migrations`, versus 17 migrations returned by Supabase migration history. Multiple historical filenames share a migration version (for example `20261003050000`). Do not rewrite or delete historical production objects or mark migrations applied without a schema comparison.
- Some direct backend fallback queries in `api/rpc.js` select from `app_users` and `members` with the server-side key. Their current full-table `service_role SELECT` privilege is absent. A least-privilege, column-specific proposal is staged at `supabase/pending-review/20261021_service_role_fallback_column_grants.sql`. **It is not automatically applied.**
- An owner-provided, schema-only production export verified 65/65 RLS-enabled tables, 195 public functions, five views, and no row data. It also confirmed missing service-role fallback column privileges and a historical `training_questions.assessment_id` versus production `lesson_no` incompatibility. The file is **not committed** because the GitHub repository is public. See `docs/supabase-migration-reconciliation-20261021.md` and the opt-in `npm run audit:schema -- --file /private/path/schema.sql` command.
- A separately reviewed column-level SELECT grant already exists for signed video playback in `20261019183000_fix_academy_video_playback_service_role.sql`; do not widen this to full-table access as part of the rollout.

## New-table contract

For every new `public` table created by a migration after 2026-10-21:

1. Explicitly enable RLS in the creating migration.
2. Choose **one** access pattern:
   - **Data API table**: add only the required table/column privileges to specific roles, using `GRANT`, then add matching RLS policies if the browser role needs row access.
   - **RPC-only private table**: use `-- data-api: private public.table_name` and an explicit `REVOKE ALL ON table public.table_name FROM PUBLIC, anon, authenticated;`. Do not grant browser CRUD merely to silence a permission error.
3. Never grant `ALL ON ALL TABLES IN SCHEMA public` to browser roles.
4. Keep service-role/secret keys server-side. A GRANT and an RLS policy are separate controls.

The regression tests in `tests/supabase-data-api-grants.test.js` enforce the new-table contract for timestamped migrations from 2026-10-21 onward. Historical migrations are excluded until the initial schema/migration ledger is reconciled; this is a deliberate limitation, **not a certification that historical replays work**.

## Before approving database changes

1. Establish a tested, recoverable production backup. Do not put the dump into GitHub or chat.
2. Reconcile the 128 migration files with the live schema and the recorded migration ledger. The export already proves that **25 current tables have no active historical `CREATE TABLE`**, so the existing migration set cannot be replayed from scratch. A vetted canonical baseline and ledger plan remain required.
3. Build a **disposable, isolated** database from the documented baseline and migrations, preserving the production database.
4. Test the complete role-specific path: visitor, member, leader; authentication; training watch/quiz/results; announcements; chat; secure video playback.
5. Review the pending column-grant SQL separately. If approved, apply it through an appropriately versioned migration and verify column privileges and the dependent API requests.
6. Re-run Supabase Security/Performance Advisors after any applied DDL.

## Separate security backlog

- Review anonymous-callable `SECURITY DEFINER` functions, especially registration and login, with an authorization matrix and rate limiting. Do not mass-revoke: custom member sessions depend on many of these endpoints.
- Consider stronger ownership verification during new member registration.
- Review 8 mutable `search_path` warnings, 21 unindexed foreign keys, and 29 unused-index notices individually. Do not automatically drop indexes.
- Confirm public Storage buckets (`community-chat` and `member-profiles`) match expected privacy and media-sharing behavior.

References:
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/api/securing-your-api
