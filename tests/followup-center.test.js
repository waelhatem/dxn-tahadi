const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'app', 'followup-center.js');
const index = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261026_followup_center_draft.sql'), 'utf8');
const followup = require(modulePath);
const script = fs.readFileSync(modulePath, 'utf8');

test('Arabic lead cards provide a structured name, country, phone and source', () => {
  const card = 'الاسم: علي أحمد\nالجنس: ذكر\nالدولة: العراق\nرقم الهاتف: +964 770 123 4567\nالإعلان: حملة أكتوبر';
  assert.deepEqual(followup.parseLeadCard(card), {
    name: 'علي أحمد', gender: 'ذكر', country: 'العراق',
    phone: '+964 770 123 4567', source: 'حملة أكتوبر'
  });
});

test('safe display escapes untrusted text and never places it as raw markup', () => {
  assert.equal(followup.escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
});

test('two simple follow-up paths have exact stages and distinct guidance', () => {
  assert.equal(followup.prospectStages.length, 4);
  assert.equal(followup.memberStages.length, 6);
  assert.match(followup.stageLabel({ kind: 'prospect', status: 'new', consent_confirmed: true, stage: 3 }), /الإغلاق/);
  assert.match(followup.stageLabel({ kind: 'new_member', status: 'new', consent_confirmed: true, stage: 5 }), /30/);
  assert.match(followup.stageLabel({ kind: 'prospect', status: 'blocked', consent_confirmed: true, stage: 1 }), /إيقاف/);
  assert.match(followup.template({ kind: 'new_member', name: 'نور', stage: 0 }), /نور/);
});

test('app has one follow-up tab and keeps the full feature on an isolated branch', () => {
  assert.match(index, /switchTab\('followup'\)/);
  assert.match(index, /window\.followupCenter\?\.render\(\)/);
  assert.match(index, /followup-center\.js\?v=/);
  assert.match(index, /followupSession/);
});

test('database draft is private, session-scoped, and not a live migration', () => {
  assert.match(sql, /alter table public\.followup_contacts enable row level security/);
  assert.match(sql, /revoke all on public\.followup_contacts from public, anon, authenticated/);
  assert.match(sql, /public\.app_current_user_id\(p_token\)/);
  assert.match(sql, /assigned_user_id=v_uid/);
  assert.match(sql, /for update;/);
  assert.doesNotMatch(sql, /auth\.uid\(\)/);
  assert.match(sql, /p_reminder_minutes integer default 30/);
});

test('an assignee must be explicitly selected and each case belongs to that member', () => {
  assert.match(script, /العضو الذي أُحيل إليه المهتم/);
  assert.match(script, /العضو الذي سُجّل معه العضو الجديد/);
  assert.match(script, /ابحث بالاسم أو رقم العضوية/);
  assert.match(script, /اختر العضو المسؤول عن هذه الحالة قبل الحفظ/);
  assert.match(script, /المسؤول: \$\{escapeHtml\(contact\.assigned_name/);
  assert.match(sql, /if v_role='leader' and p_assignee_user_id is null then/);
  assert.match(sql, /where \(v_role='leader' or f\.assigned_user_id=v_uid\)/);
});

test('prospect registration atomically creates one linked member case without carrying old consent', () => {
  assert.match(sql, /origin_contact_id uuid unique references public\.followup_contacts\(id\)/);
  assert.match(sql, /create unique index if not exists followup_new_member_number_unique_idx/);
  assert.match(sql, /if v_contact\.kind <> 'prospect' then/);
  assert.match(sql, /where kind='new_member' and member_no=v_member_no/);
  assert.match(sql, /v_contact\.assigned_user_id,v_uid,'new_member'/);
  assert.match(sql, /v_contact\.source_label,v_contact\.timezone_name,v_contact\.contact_channel,\s*false,null,'consent_pending'/);
  assert.match(sql, /v_contact\.id,\s*v_contact\.source_label/);
  assert.match(sql, /new_member_contact_id',v_new_member_id/);
  assert.match(sql, /p_registered_member_no text default null/);
  assert.match(script, /result === 'registered'\) state\.kind = 'new_member'/);
});
