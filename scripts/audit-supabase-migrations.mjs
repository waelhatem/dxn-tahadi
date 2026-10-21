#!/usr/bin/env node
/**
 * Read-only audit of the repository's historical Supabase migrations.
 * It deliberately does NOT invoke migration repair, connect to Supabase,
 * delete files, or change the production database.
 *
 * Run: npm run audit:migrations
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(repoRoot, 'supabase', 'migrations');
const migrationFiles = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
const byVersion = new Map();
const invalidFilenames = [];
const tableCreations = new Set();

for (const name of migrationFiles) {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(name);
  if (!match) invalidFilenames.push(name);
  const version = name.split('_', 1)[0];
  const list = byVersion.get(version) ?? [];
  list.push(name);
  byVersion.set(version, list);

  const sql = readFileSync(join(dir, name), 'utf8');
  for (const found of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    tableCreations.add(found[1].toLowerCase());
  }
}

const repeatedVersions = [...byVersion.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([version, files]) => ({ version, files }));
const missingBootstrapTables = ['teams', 'members', 'app_users', 'sessions']
  .filter((name) => !tableCreations.has(name));
const legacySchema = join(repoRoot, 'schema.sql');
const legacySchemaIsNotMigration = existsSync(legacySchema) && missingBootstrapTables.length > 0;
const findings = {
  migrationFiles: migrationFiles.length,
  invalidFilenames,
  repeatedVersions,
  duplicateVersionExcess: repeatedVersions.reduce((sum, entry) => sum + entry.files.length - 1, 0),
  missingBootstrapTables,
  legacySchemaIsNotMigration,
  replayReady: invalidFilenames.length === 0 && repeatedVersions.length === 0 && missingBootstrapTables.length === 0,
};
process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
if (!findings.replayReady) {
  process.stderr.write(
    '\nNOT REPLAY-READY: Do not run db reset / db push or mark migrations applied. ' +
    'Prepare a no-data schema-only baseline, review role grants, and verify on an isolated database first.\n'
  );
  process.exitCode = 1;
}
