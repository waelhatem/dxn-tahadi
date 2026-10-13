const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file), 'utf8');
const page = read('app/index.html');
const script = read('training-name-list.js');
const css = read('training-name-list.css');
const sql = read('supabase/migrations/20261013010000_training_five_private_name_lists.sql');

test('name list script parses, is inert before button click and stays globally isolated', () => {
  const context = {window:{}};
  vm.runInNewContext(script, context);
  assert.equal(typeof context.window.nameListOpen, 'function');
  assert.equal(context.window.__DXN_TRAINING_NAME_LIST__, true);
  assert.equal(Object.keys(context.window).length, 2);
  assert.doesNotMatch(script, /localStorage\.setItem\s*\(/);
  assert.doesNotMatch(script, /sessionStorage\.setItem\s*\(/);
});

test('training number five exposes its own electronic form, never alters exam answers', () => {
  assert.equal((page.match(/training-name-list\.js\?v=1/g)||[]).length, 1);
  assert.equal((page.match(/training-name-list\.css\?v=1/g)||[]).length, 1);
  assert.match(page, /trainingSubtab==='professional'/);
  assert.match(page, /function professionalTrainingPage\(\)/);
});

test('top-level training screen keeps exactly two original cards', () => {
  const home = page.split('const subTabs=`')[1].split('const backChoice=`')[0];
  assert.equal((home.match(/<button type="button" class="training-feature-card/g) || []).length, 2);
  assert.match(home, /الشروحات والتدريبات/);
  assert.match(home, /الخطة الاحترافية/);
  assert.doesNotMatch(home, /training-feature-professional/);
});

test('inside lessons there are exactly two choices: basic and professional', () => {
  const typeChoice = page.split('const trainingTypeChoices=`')[1].split('if(trainingSubtab===\'home\')')[0];
  assert.equal((typeChoice.match(/<button type="button" class="training-feature-card/g) || []).length, 2);
  assert.match(typeChoice, /التدريبات الأساسية/);
  assert.match(typeChoice, /التدريبات الاحترافية/);
  assert.match(page, /if\(trainingSubtab==='lessons'\)\{\s*return backChoice\+trainingTypeChoices;/);
  assert.match(page, /if\(trainingSubtab==='professional'\)\{\s*return backToTrainingTypes\+professionalTrainingPage\(\);/);
  assert.match(page, /\['home','lessons','basic','professional','ragwan_success_plan'\]/);
  assert.doesNotMatch(page, /const nameListButton=n===5/);
});

test('three original form types are supported', () => {
  for (const name of ['قائمة الأسماء','نتائج الاستقطاب','متابعة المستهلكين']) assert.ok(script.includes(name));
  for (const action of ['save_contact','delete_contact','save_followup','delete_followup','save_consumption','delete_consumption'])
    assert.ok(script.includes(action), action);
  assert.ok(script.includes('training_name_list_read'));
  assert.ok(script.includes('training_name_list_write'));
  assert.match(script, /disabled = !enabled/);
});

test('RPC data are owner scoped and table access is not publicly exposed', () => {
  for (const table of ['training_name_list_contacts','training_name_list_followups','training_name_list_consumption']) {
    assert.ok(sql.includes('alter table public.' + table + ' enable row level security;'));
    assert.ok(sql.includes('revoke all on table public.' + table));
  }
  assert.match(sql, /uid := public\.app_current_user_id\(p_token\)/);
  assert.match(sql, /where c\.owner_user_id=uid/);
  assert.match(sql, /where f\.owner_user_id=uid/);
  assert.match(sql, /where p\.owner_user_id=uid/);
  assert.match(sql, /and owner_user_id=uid/);
  assert.match(sql, /not \(tags_value <@ array\[1,2,4,5,7,8\]/);
});

test('responsive CSS is isolated from other training tabs', () => {
  assert.match(css, /@media\(max-width:700px\)/);
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g,'').match(/(?:^|\})\s*([^@{}]+)\{/gm)||[];
  assert.ok(selectors.length>10);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:body|#app|\.card|\.tabs)\s*\{/);
});
