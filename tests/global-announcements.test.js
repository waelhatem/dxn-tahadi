const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const INDEX=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
const MIG=fs.readFileSync(path.join(ROOT,'supabase','migrations','20261003050000_global_announcements.sql'),'utf8');

test('global announcements have their own storage and acknowledgement records',()=>{
  assert.match(MIG,/create table if not exists public\.global_announcements/);
  assert.match(MIG,/create table if not exists public\.global_announcement_reads/);
  assert.doesNotMatch(MIG,/app_notifications/);
});

test('only leaders can create announcements and only members can acknowledge them',()=>{
  assert.match(MIG,/role_name <> 'leader'/);
  assert.match(MIG,/create or replace function public\.acknowledge_global_announcement/);
  assert.match(MIG,/role_name <> 'member'/);
});

test('leader UI provides title, body, type, preview and send controls',()=>{
  assert.match(INDEX,/إرسال إعلان عام للأعضاء/);
  assert.match(INDEX,/gaTitle/);
  assert.match(INDEX,/gaBody/);
  assert.match(INDEX,/gaType/);
  assert.match(INDEX,/معاينة قبل الإرسال/);
  assert.match(INDEX,/إرسال للجميع/);
});

test('announcement preview and member popup use a large bold Arabic font',()=>{
  const style=INDEX.match(/<style id="dxn-global-announcements-v1">([\s\S]*?)<\/style>/);
  assert.ok(style,'announcement styles must be present');
  const bodyRule=style[1].match(/\.dxn-global-announcement-panel \.ga-body\{([^}]+)\}/);
  assert.ok(bodyRule,'both preview and member popup share the announcement body style');
  assert.match(bodyRule[1],/font-family:'DXN Cairo'/);
  assert.match(bodyRule[1],/font-size:22px/);
  assert.match(bodyRule[1],/font-weight:800/);
  assert.ok(fs.existsSync(path.join(ROOT,'app','fonts','Cairo-variable.ttf')));
  assert.match(INDEX,/displayAnnouncementText\(b\)/);
  assert.match(INDEX,/displayAnnouncementText\(item\.body\)/);
});

test('member UI shows the announcement centrally with acknowledge and close actions',()=>{
  assert.match(INDEX,/dxnGlobalAnnouncementModal/);
  assert.match(INDEX,/✓ فهمت/);
  assert.match(INDEX,/إغلاق/);
});

test('daily and ordinary manual announcements expire on their Baghdad publication day; important and video alerts stay distinct',()=>{
  const fs=require('node:fs');
  const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261118213000_announcement_day_scope_and_dismissal.sql'),'utf8');
  assert.match(sql,/a\.source='daily_ai'/);
  assert.match(sql,/a\.publish_date=\(now\(\) at time zone 'Asia\/Baghdad'\)::date/i);
  assert.match(sql,/a\.expires_at>now\(\)/);
  assert.match(sql,/a\.source='manual'/);
  assert.match(sql,/a\.announcement_type in \('important','warning'\)/);
  assert.match(sql,/a\.created_at at time zone 'Asia\/Baghdad'/i);
  assert.match(sql,/a\.source='video'/);
  assert.match(sql,/academy_leader_videos/);
  assert.match(INDEX,/function isCurrentAnnouncement\(item\)/);
  assert.match(INDEX,/function rememberDismissal\(id,persist\)/);
  assert.match(INDEX,/function wasDismissed\(id\)/);
  assert.match(INDEX,/rows\.find\(function\(row\)\{return isCurrentAnnouncement\(row\)&&!wasDismissed\(row\.id\)\}/);
  assert.doesNotMatch(INDEX,/closeMemberModal\(\);loadMemberAnnouncements\(\)/);
});
