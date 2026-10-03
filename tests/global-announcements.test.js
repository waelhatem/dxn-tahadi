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

test('member UI shows the announcement centrally with acknowledge and close actions',()=>{
  assert.match(INDEX,/dxnGlobalAnnouncementModal/);
  assert.match(INDEX,/✓ فهمت/);
  assert.match(INDEX,/إغلاق/);
});
