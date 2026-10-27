const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'app', 'followup-center.js');
const index = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261026_followup_center_draft.sql'), 'utf8');
const statusSql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261027_followup_prospect_status.sql'), 'utf8');
const leaderSql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261027_followup_leader_notifications.sql'), 'utf8');
const memberIdentitySql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261027_followup_new_member_identity.sql'), 'utf8');
const stageFlowSql = fs.readFileSync(path.join(root, 'supabase', 'pending-review', '20261027_followup_stage_flow.sql'), 'utf8');
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
  assert.equal(followup.stageCardsHtml({ kind: 'new_member', name: 'نور', stage: 0,
    opened_at: '2026-10-20T08:00:00Z', consent_confirmed: true,
    next_due_at: '2030-10-20T08:00:00Z' }).match(/followup-timeline-card /g).length, 6);
  assert.equal(followup.stageCardsHtml({ kind: 'prospect', name: 'محمد', stage: 0,
    opened_at: '2026-10-20T08:00:00Z', consent_confirmed: true,
    next_due_at: '2030-10-20T08:00:00Z' }).match(/followup-timeline-card /g).length, 4);
  assert.match(followup.template({ kind: 'prospect', name: 'علي', stage: 2 }), /علي/);
});

test('first prospect stage respects 10-minute minimum even when the server due time equals creation', () => {
  const openedAt = new Date(Date.now() - 5 * 60000).toISOString();
  const prospect = { kind: 'prospect', name: 'مهتم', stage: 0, status: 'active',
    consent_confirmed: true, opened_at: openedAt, next_due_at: openedAt };
  assert.equal(followup.stageReady(prospect, 0), false);
  const expected = new Date(openedAt).getTime() + 10 * 60000;
  assert.equal(followup.stageDueAt(prospect, 0).getTime(), expected);
});

test('app has one follow-up tab and keeps the full feature on an isolated branch', () => {
  assert.match(index, /switchTab\('followup'\)/);
  assert.match(index, /window\.followupCenter\?\.render\(\)/);
  assert.match(index, /followup-center\.js\?v=/);
  assert.match(index, /followupSession/);
});

test('tracked database schema is private, session-scoped, and not an automatic migration', () => {
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
  assert.match(script, /reaction === 'registered'\) state\.kind = 'new_member'/);
});

test('CRM foreign-key indexes support growing workloads without exposing data directly', () => {
  assert.match(sql, /create index if not exists followup_contacts_created_by_idx/);
  assert.match(sql, /create index if not exists followup_actions_actor_idx/);
  assert.match(sql, /alter table public\.followup_actions enable row level security/);
  assert.match(sql, /revoke all on public\.followup_actions from public, anon, authenticated/);
});

test('all nine prospect classifications have unambiguous labels', () => {
  assert.deepEqual(Object.values(followup.prospectStatuses), [
    'جديد','تم التواصل','لا يمتلك واتساب','عضو في DXN','سجّل عضوية',
    'فعّل نقاط','لا يرد نهائيًا','لا يرغب بالعمل','عمل لي حظرًا'
  ]);
  assert.equal(followup.prospectStatusLabel({ kind: 'prospect', prospect_status: 'blocked_me' }), 'عمل لي حظرًا');
});

test('status history is structured, searchable and access-scoped', () => {
  assert.match(statusSql, /add column if not exists prospect_status text not null default 'new'/);
  assert.match(statusSql, /create index if not exists followup_contacts_prospect_status_idx/);
  assert.match(statusSql, /status_before,status_after/);
  assert.match(statusSql, /where id=p_contact_id and kind='prospect'\s+and \(v_role='leader' or assigned_user_id=v_uid\)/);
  assert.match(statusSql, /'status_updated'/);
  assert.match(statusSql, /where \(v_role='leader' or f\.assigned_user_id=v_uid\)/);
  assert.match(statusSql, /false,null,'consent_pending'/);
  assert.match(script, /followup_complete_stage/);
  assert.match(script, /followupStatusFilter/);
  assert.match(script, /followupSearch/);
  assert.doesNotMatch(statusSql, /delete from public\.followup_contacts/i);
});

test('leader notifications reuse the private inbox, include action context and do not spam self', () => {
  assert.match(leaderSql, /create trigger followup_notify_leader_on_contact/);
  assert.match(leaderSql, /create trigger followup_notify_leader_on_action/);
  assert.match(leaderSql, /from public\.app_users u\s+where u\.role='leader' and u\.active=true/);
  assert.match(leaderSql, /u\.id<>new\.actor_user_id/);
  assert.match(leaderSql, /'followup_action_'\|\|new\.id::text/);
  assert.match(leaderSql, /'followup','فتح البطاقة'/);
  assert.match(leaderSql, /وقت التسجيل/);
  assert.match(leaderSql, /آخر إجراء/);
  assert.match(index, /type\.startsWith\('followup_action_'\)/);
  assert.match(index, /followupCenter\?\.openFromNotification\(sourceId\)/);
  assert.doesNotMatch(leaderSql, /grant select on public\.app_notifications/i);
});

test('new-member profiles retain real join dates and sponsor identity in leader cards and alerts', () => {
  assert.match(statusSql, /add column if not exists join_date date/);
  assert.match(statusSql, /coalesce\(f\.join_date,d\.join_date\) as join_date/);
  assert.match(statusSql, /as assigned_member_no/);
  assert.match(statusSql, /p_join_date date default null/);
  assert.match(memberIdentitySql, /create or replace function public\.followup_add_new_member/);
  assert.match(memberIdentitySql, /p_join_date is null or p_join_date > current_date/);
  assert.match(script, /البطاقة التعريفية للعضو الجديد/);
  assert.match(script, /رقم عضوية الراعي/);
  assert.match(script, /followupStageJoinDate/);
  assert.match(leaderSql, /تاريخ الانضمام/);
  assert.match(leaderSql, /رقم عضوية الراعي/);
  assert.match(leaderSql, /after insert or update of join_date/);
});

test('staged recommendations are generated, time-locked, and never manually selected by sponsor', () => {
  assert.match(script, /موعد التنفيذ بالتاريخ والوقت/);
  assert.match(script, /followupStageTimeline/);
  assert.match(script, /نسخ الرسالة/);
  assert.match(script, /followupReaction\$\{index\}/);
  assert.match(script, /followup_complete_stage/);
  assert.doesNotMatch(script, /followupPlanType|followup_set_next_step/);
  assert.match(stageFlowSql, /add column if not exists reaction_status text/);
  assert.match(stageFlowSql, /create or replace function public\.followup_complete_stage/);
  assert.match(stageFlowSql, /for update/);
  assert.match(stageFlowSql, /v_role='leader' or assigned_user_id=v_uid/);
  assert.match(stageFlowSql, /not v_contact\.consent_confirmed/);
  assert.match(stageFlowSql, /p_stage is distinct from v_contact\.stage/);
  assert.match(stageFlowSql, /v_now < v_due/);
  assert.match(stageFlowSql, /'stage_completed'/);
  assert.match(leaderSql, /الإجراء القادم/);
  assert.match(leaderSql, /الموعد القادم/);
  assert.doesNotMatch(stageFlowSql, /grant update on public\.followup_contacts/i);
});
