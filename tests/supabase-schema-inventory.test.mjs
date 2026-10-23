import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicSchema, inspectMigrationCreateCoverage } from '../scripts/audit-supabase-schema.mjs';

const sample = `CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "login_no" "text" NOT NULL,
    "role" "text" NOT NULL,
    "display_name" "text",
    "member_id" "uuid",
    "active" boolean,
    "team_root_member_no" "text"
);
CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" NOT NULL,
    "member_no" "text" NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."training_questions" (
    "id" "uuid" NOT NULL,
    "lesson_no" integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" NOT NULL
);
ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."training_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
GRANT SELECT("id") ON TABLE "public"."app_users" TO "service_role";
GRANT SELECT("member_no") ON TABLE "public"."members" TO "service_role";
CREATE OR REPLACE FUNCTION "public"."my_rpc"() RETURNS void AS $$ BEGIN INSERT INTO public.members(id) VALUES (NULL); END $$ LANGUAGE plpgsql;
`;
const oldMigration = 'create table if not exists public.training_questions (id uuid, assessment_id uuid not null);';

test('reads pg_dump quoted public tables and RLS without copying row data', () => {
  const result = inspectPublicSchema(sample, oldMigration);
  assert.equal(result.publicTables, 5);
  assert.equal(result.tablesWithRls, 5);
  assert.deepEqual(result.missingRls, []);
  assert.equal(result.appearsSchemaOnly, true);
  assert.equal(result.requiredBootstrapTablesPresent, true);
  assert.equal(result.publicFunctions, 1);
});

test('detects the historical assessment_id versus live lesson_no conflict', () => {
  assert.equal(inspectPublicSchema(sample, oldMigration).historicalTrainingQuestionsModelConflict, true);
  assert.equal(inspectPublicSchema(sample, '').historicalTrainingQuestionsModelConflict, false);
});

test('tracks narrow column grants without treating other privileges as SELECT', () => {
  const result = inspectPublicSchema(sample);
  assert.ok(!result.missingServerSelect.app_users.includes('id'));
  assert.ok(result.missingServerSelect.app_users.includes('login_no'));
  assert.ok(result.missingServerSelect.members.includes('id'));
  assert.ok(!result.missingServerSelect.members.includes('member_no'));
});

test('recognizes table-wide service SELECT as covering required columns', () => {
  const result = inspectPublicSchema(sample + 'GRANT SELECT,REFERENCES ON TABLE "public"."app_users" TO "service_role";\n');
  assert.deepEqual(result.missingServerSelect.app_users, []);
});

test('fails coverage on RLS omissions or row-carrying SQL', () => {
  const result = inspectPublicSchema(sample.replace('ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;', '') + '\nCOPY public.members FROM stdin;\n');
  assert.deepEqual(result.missingRls, ['teams']);
  assert.equal(result.appearsSchemaOnly, false);
});

test('does not include SQL function bodies or table contents in its report', () => {
  const report = JSON.stringify(inspectPublicSchema(sample + "-- sensitive-example-marker\n"));
  assert.doesNotMatch(report, /sensitive-example-marker|INSERT INTO/);
});

test('identifies bootstrap objects missing from historical migration creation scripts', () => {
  const coverage = inspectMigrationCreateCoverage(sample, [
    'create table if not exists public.training_questions(id uuid);',
    '-- create table public.members(id uuid);\nCREATE TABLE public.app_users(id uuid);',
  ]);
  assert.equal(coverage.migrationCreatedTableCount, 2);
  assert.deepEqual(coverage.liveTablesWithoutHistoricalCreate, ['members', 'sessions', 'teams']);
});
