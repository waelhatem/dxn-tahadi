#!/usr/bin/env node
/**
 * Read-only inventory of a locally supplied Supabase `public` schema-only dump.
 * Never upload the dump to a public repository or include function bodies in logs.
 *
 * Usage: node scripts/audit-supabase-schema.mjs --file /path/to/schema.sql
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED_SERVER_COLUMNS = {
  app_users: ['id', 'login_no', 'role', 'display_name', 'member_id', 'active', 'team_root_member_no'],
  members: ['id', 'member_no'],
};

function namesFor(sql, pattern) {
  return [...sql.matchAll(pattern)].map((match) => match[1]);
}

export function inspectPublicSchema(sql, historicalAssessmentSql = '') {
  const tableMatches = [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS "public"\."([^"]+)" \(\n([\s\S]*?)^\);/gm)];
  const columns = new Map(tableMatches.map((match) => [
    match[1],
    new Set(namesFor(match[2], /^\s{4}"([^"]+)"\s/gm)),
  ]));
  const tables = new Set(columns.keys());
  const rlsTables = new Set(namesFor(sql, /^ALTER TABLE "public"\."([^"]+)" ENABLE ROW LEVEL SECURITY;/gm));
  const missingRls = [...tables].filter((table) => !rlsTables.has(table)).sort();

  // pg_dump outputs table and column-level GRANT statements separately.
  const serverSelect = new Map();
  for (const match of sql.matchAll(/^GRANT ([^;\n]+) ON TABLE "public"\."([^"]+)" TO "service_role";$/gm)) {
    const [, privileges, table] = match;
    const state = serverSelect.get(table) ?? { all: false, columns: new Set() };
    if (/(?:^|,)(?:ALL|SELECT)(?:,|$)/.test(privileges)) state.all = true;
    for (const column of namesFor(privileges, /SELECT\("([^"]+)"\)/g)) state.columns.add(column);
    serverSelect.set(table, state);
  }
  const missingServerSelect = {};
  for (const [table, requested] of Object.entries(REQUIRED_SERVER_COLUMNS)) {
    const granted = serverSelect.get(table);
    missingServerSelect[table] = requested.filter((column) =>
      !tables.has(table) || !columns.get(table).has(column) || !(granted?.all || granted?.columns.has(column))
    );
  }

  const liveTrainingColumns = columns.get('training_questions') ?? new Set();
  const historicalAssessmentModel = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.training_questions\s*\([\s\S]*?\bassessment_id\b/i.test(historicalAssessmentSql);
  const trainingModelConflict = historicalAssessmentModel && !liveTrainingColumns.has('assessment_id') && liveTrainingColumns.has('lesson_no');

  const containsTableRows = /^(?:COPY\s+(?:"public"\.|public\.)|INSERT\s+INTO\s+(?:"public"\.|public\.))/gim.test(sql);

  return {
    schemaSha256: createHash('sha256').update(sql).digest('hex'),
    appearsSchemaOnly: !containsTableRows,
    publicTables: tables.size,
    tablesWithRls: rlsTables.size,
    missingRls,
    publicFunctions: namesFor(sql, /^CREATE OR REPLACE FUNCTION "public"\."([^"]+)"/gm).length,
    publicViews: namesFor(sql, /^CREATE (?:OR REPLACE )?VIEW "public"\."([^"]+)"/gm).length,
    policies: namesFor(sql, /^CREATE POLICY "([^"]+)"/gm).length,
    requiredBootstrapTablesPresent: ['teams', 'members', 'app_users', 'sessions'].every((table) => tables.has(table)),
    historicalTrainingQuestionsModelConflict: trainingModelConflict,
    missingServerSelect,
    // A schema dump is evidence, not a substitute for a migration-replay test.
    historicalReplayCertified: false,
  };
}

export function inspectMigrationCreateCoverage(schemaSql, migrationSqlFiles) {
  const live = new Set(namesFor(schemaSql, /^CREATE TABLE IF NOT EXISTS "public"\."([^"]+)"/gm));
  const created = new Set();
  for (const sql of migrationSqlFiles) {
    const withoutComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
    for (const match of withoutComments.matchAll(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?(?:"([^"]+)"|([a-z_]\w*))/gim)) {
      created.add((match[1] ?? match[2]).toLowerCase());
    }
  }
  const withoutCreate = [...live].filter((table) => !created.has(table)).sort();
  const notInSnapshot = [...created].filter((table) => !live.has(table)).sort();
  return {
    migrationCreatedTableCount: created.size,
    liveTablesWithoutHistoricalCreate: withoutCreate,
    historicalCreatesAbsentFromSnapshot: notInSnapshot,
  };
}

function main() {
  const fileIndex = process.argv.indexOf('--file');
  if (fileIndex === -1 || !process.argv[fileIndex + 1]) {
    process.stderr.write('Usage: npm run audit:schema -- --file /absolute/path/to/schema.sql\n');
    process.exitCode = 2;
    return;
  }

  const sql = readFileSync(resolve(process.argv[fileIndex + 1]), 'utf8');
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const historical = readFileSync(join(repoRoot, 'supabase/migrations/20260912_training_assessments.sql'), 'utf8');
  const report = inspectPublicSchema(sql, historical);
  const migrations = join(repoRoot, 'supabase/migrations');
  report.migrationCoverage = inspectMigrationCreateCoverage(
    sql,
    readdirSync(migrations).filter((file) => file.endsWith('.sql')).map((file) => readFileSync(join(migrations, file), 'utf8')),
  );
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.appearsSchemaOnly || report.missingRls.length || !report.requiredBootstrapTablesPresent) {
    process.stderr.write('Schema safety/coverage check failed. Do not publish or replay this dump.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
