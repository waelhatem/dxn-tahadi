const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const migrationPath=path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261003040000_ragwan_trainee_team_tree_scope.sql'
);
const sql=fs.readFileSync(migrationPath,'utf8');

test('Ragwan trainee enrollment accepts indirect team members, not only direct sponsors',()=>{
  assert.match(sql,/mm\.team_id\s*=\s*sponsor_row\.team_id/);
  assert.doesNotMatch(sql,/mm\.sponsor|mm\.parent|sponsor_row\.member_id\s*=\s*mm\./i);
});

test('Ragwan trainee enrollment blocks members outside the sponsor team',()=>{
  assert.match(sql,/mm\.team_id\s*=\s*sponsor_row\.team_id/);
  assert.match(sql,/mm\.id\s*<>\s*sponsor_row\.member_id/);
});
