const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261026131500_ragwan_allow_sponsor_self_training.sql'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'api', 'ragwan-files.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');

test('self-enrollment uses the authenticated sponsor membership, without rewriting the profile', () => {
  assert.match(migration, /if found_depth = 0 then[\s\S]*?m\.id = sponsor_row\.member_id[\s\S]*?trim\(m\.member_no\) = normalized_no/);
  assert.match(migration, /m\.active = true/);
  assert.match(migration, /raise exception 'تعذر مطابقة رقم عضويتك مع حسابك الحالي'/);
  assert.doesNotMatch(migration, /لا يمكن إضافة حسابك كمتدرب في خطتك/);
  const selfBranch = migration.split('if found_depth = 0 then')[1].split('  else\n    -- All other trainee enrollments')[0];
  assert.doesNotMatch(selfBranch, /update public\.members|insert into public\.members/i);
});

test('existing membership validation, downline scope, and duplicate/archived enrollment protection remain', () => {
  assert.match(migration, /normalized_no !~ '\^\[0-9\]\{9\}\$'/);
  assert.match(migration, /ragwan_current_sponsor\(p_token\)/);
  assert.match(migration, /with recursive downline as/);
  assert.match(migration, /if found_depth is null then/);
  assert.match(migration, /on conflict\(sponsor_user_id, trainee_member_id\)/);
  assert.match(migration, /where public\.ragwan_training_enrollments\.archived_at is not null/);
  assert.match(migration, /هذا المتدرب مضاف مسبقًا/);
});

test('current Ragwan UI still adds any entered nine-digit membership through the same authorized API', () => {
  assert.match(ui, /function ragwanAddTraineeByMemberNo\(\)/);
  assert.match(ui, /\/\^\\d\{9\}\$\//);
  assert.match(ui, /ragwanPlanApi\('add_trainee_by_member_no',\{member_no:memberNo\}\)/);
  assert.match(api, /add_trainee_by_member_no:'add_ragwan_trainee_by_member_no'/);
});
