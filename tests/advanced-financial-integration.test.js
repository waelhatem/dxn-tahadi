'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const bank=JSON.parse(fs.readFileSync('data/advanced-financial-training.staging.json','utf8'));
const html=fs.readFileSync('app/index.html','utf8');
const js=fs.readFileSync('advanced-financial-training.js','utf8');
const sql=fs.readFileSync('supabase/migrations/202610150001_advanced_financial_training.sql','utf8');
test('Advanced financial course catalog has exactly 10 unique videos',()=>{
 assert.equal(bank.lessons.length,10);
 assert.deepEqual(bank.lessons.map(x=>x.number),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(new Set(bank.lessons.map(x=>x.youtube_id)).size,10);
});
test('Approved lesson 3-10 banks contain 20 questions and four choices',()=>{
 for(const lesson of bank.lessons.slice(2)){
  assert.equal(lesson.questions.length,20,'lesson '+lesson.number);
  for(const q of lesson.questions){
   assert.ok(q.question&&q.question.length>10);
   assert.equal(q.options.length,4);
   assert.ok(q.options.every(o=>typeof o==='string'&&o.length>0));
   assert.ok(Number.isInteger(q.correct_index)&&q.correct_index>=0&&q.correct_index<=3);
  }
 }
});
test('Lesson 1 approved question bank contains 20 questions and lesson 2 still awaits restoration',()=>{
 const first=bank.lessons[0];
 assert.equal(first.questions.length,20);
 for(const q of first.questions){
  assert.ok(q.question.length>10);
  assert.equal(q.options.length,4);
  assert.ok(Number.isInteger(q.correct_index)&&q.correct_index>=0&&q.correct_index<=3);
 }
 assert.equal(bank.lessons[1].questions,null);
 assert.equal(bank.status,'staging-incomplete');
});
test('Frontend scripts parse and connect member and leader pages',()=>{
 new vm.Script(js);
 assert.match(html,/advanced-financial-training\.js/);
 assert.match(html,/advancedFinancialMemberProfile/);
 assert.match(html,/advancedFinancialLeaderProfile/);
 assert.match(html,/advancedFinancialCoursePage/);
 // V86.90 — watching goes through the unified training engine (training_watch_begin/report).
 assert.match(js,/DXNTrainingEngine\.createWatch\(\{track:'advanced'/);
 assert.doesNotMatch(js,/advanced_financial_watch_update/,'no cumulative watch endpoint left in the page');
 assert.match(js,/advanced_financial_submit_quiz/);
 assert.match(js,/watchPct|watchUi/);
 assert.match(html,/training-engine\.js\?v=/);
});
test('Database schema isolates history and grades all four choices on server',()=>{
 assert.match(sql,/create table if not exists public\.advanced_financial_progress/);
 assert.match(sql,/advanced_financial_attempts/);
 assert.match(sql,/advanced_financial_get_quiz/);
 assert.match(sql,/advanced_financial_submit_quiz/);
 assert.match(sql,/jsonb_array_length\(options\)=4/);
 assert.match(sql,/v_score>=16/);
 assert.match(sql,/v_new\*100>=v_l\.expected_duration_seconds\*90/);
 assert.match(sql,/app_current_user_id/);
 assert.match(sql,/advanced_financial_leader_member_profile/);
});

test('Inline course player is the tracked player; quiz unlocks after confirmed completion',()=>{
 assert.match(js,/function mountInline\(x\)/);
 assert.match(js,/mountInline\(chosen\)/);
 assert.match(js,/new window\.YT\.Player\(target/);
 assert.match(js,/w\.engine=window\.DXNTrainingEngine\.createWatch/);
 assert.match(js,/onCompleted:\(\)=>\{/,'quiz button opens when the server confirms completion');
 assert.match(js,/preview:!tracked/,'unpublished lessons play as untracked preview');
 assert.match(js,/data-test/);
 assert.doesNotMatch(js,/advancedProfitVideoFrame/);
 assert.doesNotMatch(js,/async function startWatch\(/);
});

test('YouTube onReady survives replacement of placeholder with iframe',()=>{
 assert.match(js,/onReady:\(\)=>\{if\(watch===w&&document\.getElementById\('advancedFinancialInlineBox'\)/);
 assert.doesNotMatch(js,/onReady:\(\)=>\{\s*if\(!target\.isConnected/);
 assert.match(js,/w\.engine\.attach\(w\.player\)/);
});
