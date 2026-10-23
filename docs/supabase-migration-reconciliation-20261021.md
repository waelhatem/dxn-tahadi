# Migration-history reconciliation — verified blockers (2026-10-21)

**Status: schema-only baseline inspected; migration replay remains incomplete.**
**Not ready to merge or run on production.** This is a no-data / no-production-write
investigation. Only the isolated Free-tier Supabase project
`xmzbibwfetbepzuxeffs` was used for earlier replay attempts.

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

## Actual production schema-only export received and verified

The owner supplied `dxn_public_schema_20261021.sql` from `supabase db dump
--linked --schema public` (SHA-256:
`37d350543a4ce6655403960e270f1d817122922c21aa12ab58432c41fa6d90ba`).
It contains no table-row dump instructions. **The file is deliberately NOT in
this GitHub repository.** This repository is public; SQL function bodies and
access-control definitions must not be indiscriminately published.

Read-only inventory from the actual dump:

| Check | Verified result |
| --- | --- |
| `public` tables | 65 |
| Tables with RLS enabled | 65/65 |
| Table-level RLS policies | 0 (RPC-based access model; not blanket browser access) |
| `public` function definitions | 195 |
| `public` views | 5 |
| Tables present in production without any `CREATE TABLE` in active migration files | **25** |
| Historical table-creation names absent from the live snapshot | 4; may reflect superseded objects, requiring review |
| `training_questions` schema model | `lesson_no` in production, historical `assessment_id` in one migration; mismatch confirmed |

The 25 absent historical table definitions include all four required bootstrap
tables (`teams`, `members`, `app_users`, `sessions`) and several later training
and challenge tables. **Merely fixing migration filenames cannot reconstruct
these objects.**

Actual schema-level service-role privileges also confirm that the required
`SELECT` columns for backend fallbacks are missing: seven in `app_users` and
two in `members`. This matches the already-staged *column-only* pending SQL,
which must not be applied without separate approval. No browser-role grants
were added.

Reproduce this analysis without exposing the SQL in GitHub:

```bash
npm run audit:schema -- --file /secure/local/path/dxn_public_schema_20261021.sql
```

The command reads only the local file and prints structural counts, absent
table-creation names, and the role-grant gaps. It does not print SQL function
bodies, create a migration, or connect to production.

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

## Safe reconciliation strategy (after actual schema-only export)

1. **Completed:** extract a schema-only production dump, without real member
   rows, and keep it out of the public repository. The owner retains the local
   copy; this analysis uses the private attachment for inspection only.
2. **Partially completed:** compare table/column definitions, RLS and role
   grants against the live snapshot and historical migrations. A deeper
   function-by-function and object/extension dependency audit is still needed.
3. Construct a canonical baseline migration in a **separately reviewed draft
   branch** from that schema-only snapshot, without legacy demo seeds or
   secrets. Because this GitHub repository is public, **do not commit the raw
   dump**. A safe location/distribution strategy for the full production
   function definitions must be resolved before any canonical replay can be
   considered reproducible.
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
