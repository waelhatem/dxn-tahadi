# Migration-history reconciliation — verified blockers (2026-10-21)

**Status: incomplete, safely blocked; not ready to merge or run on production.**
This is a no-data / no-production-write investigation. Only the isolated Free-tier
Supabase project `xmzbibwfetbepzuxeffs` was used for replay attempts.

## Observed inventory

- GitHub: **128** SQL files under `supabase/migrations/`.
- **21** filenames do not have the required 14-digit timestamp prefix.
- **7** timestamp/version groups are reused, representing **20 additional files**
  sharing a version. The independent diagnostic is `npm run audit:migrations`
  (expected exit code 1 until fixed).
- Live production ref `ryqpstkzppaifpvhezzn`: **17** recorded migration versions
  (2026-10-13 through 2026-10-20), none providing the repository's initial
  September bootstrap history.
- The initial schema exists only as root `schema.sql`, **outside the managed
  migrations directory**. It is an old V30 snapshot, not a vetted baseline;
  it contains seed data including a fixed demonstration leader credential.
  **Never execute the entire file as a new migration.**

## Verified failure sequence on a separate database

1. Directly applying the first repository migration
   `20260910000000_fix_bootstrap_current_role.sql` to the otherwise empty test
   database failed with SQLSTATE `42P01`, missing `public.sessions`.
2. A *test-only*, data-free initial set of V30 tables extracted from root
   `schema.sql` allowed that first migration and the next two September 10
   migrations to apply successfully. It did **not** constitute a faithful dump
   or a production-equivalent clean rebuild.
3. Applying `20260912_training_assessments.sql` created
   `training_questions.assessment_id`. The later repository patch
   `20260912_training_assessment_questions_v2.sql` then failed with SQLSTATE
   `42703`: column `training_questions.lesson_no` does not exist.
   Live production instead has `training_questions.lesson_no` and no
   `assessment_id`. This is a real **schema-model conflict**, not merely
   sorting or duplicate filenames.
4. Several additional September 12 files are order-dependent; the first
   lexically sorted grading fix fails because a grading function is not yet
   defined.

These failures are sufficient to conclude that bulk renaming, blindly
replaying the 128 files, or invoking `supabase migration repair --status applied`
**does not repair the schema**.

## Safe reconciliation strategy (pending actual schema-only export)

1. Produce a **schema-only** dump of the current production schema using
   Supabase CLI `db dump` / PostgreSQL `pg_dump --schema-only` with
   the owner's already-authorized database connection, locally and securely.
   Never dump real rows, credentials, or database connection secrets into
   GitHub or chat. Review any function definitions for embedded sensitive
   literals before sharing a schema snapshot.
2. Compare the dump with the 65 live `public` tables, views, triggers,
   functions, extensions, constraints, indexes, RLS and role grants. Pay
   special attention to the token-based RPC authorization model.
3. Construct a canonical baseline migration in a **new draft branch** from
   that schema-only snapshot, without legacy demo seeds or secrets.
   Archive historical, already-incorporated migration scripts as immutable
   reference material **outside** the active migration directory; do not
   delete them or rewrite their meaning.
4. Account for the **17 remote-only migration versions** in the new
   canonical ledger (for example reviewed, harmless history-marker
   migrations), then add the new baseline after the historical versions.
   This requires exact Supabase CLI testing and a separately approved ledger
   reconciliation for production.
5. Rebuild the **entire** application schema from the canonical migrations
   in the isolated Free project, starting with no application tables.
   Check object-level schema equality, least-privilege `GRANT`/RLS, RPC
   endpoints and appropriate API paths. Never promote the test database.
6. Only after those tests pass: request a separate explicit approval for
   any `main` merge, production migration-history change, or production
   GRANT. Backups and a rollback plan are prerequisites.

### Guardrails

- The test project is Free (quoted `$0/month`), contains only synthetic
  fixtures and schema experiments, and is not a production clone.
- No production DDL, migration repair, merge or deploy was performed.
- The independent audit command is intentionally *opt-in*. It must not
  break the site's normal Vercel build before historical reconciliation is
  finished.
- The proposed `service_role` column permissions remain in
  `supabase/pending-review/` and are **not** applied to production.

Official documentation:
- https://supabase.com/docs/reference/cli/supabase-migration-repair
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/guides/api/securing-your-api
