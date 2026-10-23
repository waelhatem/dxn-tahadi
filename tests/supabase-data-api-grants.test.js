'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CUTOFF = '20261021';
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

function auditSql(sql) {
  const statements = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const errors = [];
  const tableMatches = [...statements.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]\w*)\b/gi)];
  for (const match of tableMatches) {
    const table = match[1];
    const name = 'public\\.' + table;
    const rls = new RegExp('\\balter\\s+table\\s+(?:if\\s+exists\\s+)?' + name + '\\s+enable\\s+row\\s+level\\s+security\\b', 'i');
    const grant = new RegExp('\\bgrant\\s+(?:select|insert|update|delete|all)(?:\\s*\\([^;]*?\\))?[^;]*?\\bon\\s+(?:table\\s+)?' + name + '\\s+to\\s+(?:anon|authenticated|service_role)\\b', 'i');
    const privateMarker = new RegExp('--\\s*data-api:\\s*private\\s+public\\.' + table + '\\b', 'i');
    const explicitRevoke = new RegExp('\\brevoke\\s+all\\s+on\\s+(?:table\\s+)?' + name + '\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\b', 'i');

    if (!rls.test(statements)) errors.push(table + ': missing explicit ENABLE ROW LEVEL SECURITY');
    if (!grant.test(statements) && !(privateMarker.test(sql) && explicitRevoke.test(statements))) {
      errors.push(table + ': specify minimal GRANT, or mark as private and explicitly REVOKE public/anon/authenticated');
    }
  }
  if (/\bgrant\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\b/i.test(statements)) {
    errors.push('bulk GRANT ALL on public tables is forbidden');
  }
  if (/\bgrant\s+all\s+on\s+(?:table\s+)?public\.[a-z_]\w*\s+to\s+(?:anon|authenticated)\b/i.test(statements)) {
    errors.push('GRANT ALL to a browser role is forbidden');
  }
  return errors;
}

test('post-cutoff migrations have unique 14-digit versions and an explicit Data API access decision', () => {
  const sqlFiles = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'));
  const versions = new Set();
  for (const file of sqlFiles) {
    const match = /^(\d{14})_.+\.sql$/.exec(file);
    if (!match || match[1].slice(0, 8) < CUTOFF) continue;
    assert.ok(!versions.has(match[1]), 'Duplicate new migration version: ' + match[1]);
    versions.add(match[1]);
    const content = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    assert.deepEqual(auditSql(content), [], file + ': incomplete grants/RLS policy');
  }
});

test('fails closed for a public table without a grant', () => {
  const sql = 'create table public.example(id bigint);\nalter table public.example enable row level security;';
  assert.match(auditSql(sql).join(' '), /missing.*GRANT|specify minimal GRANT/i);
});

test('accepts a restricted Data API table with a precise server-side grant', () => {
  const sql = 'create table public.example(id bigint);\nalter table public.example enable row level security;\ngrant select (id) on table public.example to service_role;';
  assert.deepEqual(auditSql(sql), []);
});

test('accepts an intentionally RPC-only table with explicit revocations', () => {
  const sql = '-- data-api: private public.example\ncreate table public.example(id bigint);\nalter table public.example enable row level security;\nrevoke all on table public.example from public, anon, authenticated;';
  assert.deepEqual(auditSql(sql), []);
});

test('rejects broad public-schema grants', () => {
  assert.match(auditSql('grant all on all tables in schema public to anon;').join(' '), /bulk GRANT ALL/);
});

test('an unrelated table grant cannot authorize a new table', () => {
  const sql = 'create table public.example(id bigint);\nalter table public.example enable row level security;\ngrant select on table public.other_table to service_role;';
  assert.match(auditSql(sql).join(' '), /specify minimal GRANT/i);
});
