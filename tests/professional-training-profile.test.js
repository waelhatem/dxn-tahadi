'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'professional-training-profile.js'),'utf8');
const page=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261016110000_professional_training_leader_profile.sql'),'utf8');

function sample(scores){
 return Array.from({length:5},(_,i)=>({
  lesson_no:i+1,title:'التدريب رقم '+(i+1),completed:scores[i]!=null,
  best_score:scores[i]??null,passed:scores[i]!=null&&scores[i]>=16,
  passed_at:scores[i]!=null&&scores[i]>=16?'2026-10-16T00:00:00Z':null,
  attempt_count:scores[i]!=null?1:0
 }));
}
async function memberHtml(scores){
 const root={dataset:{},innerHTML:'',textContent:'',isConnected:true};
 let currentToken='member-a';
 const context={window:{},role:'member',me:{},setTimeout:()=>{},
  localStorage:{getItem:()=>currentToken},
  document:{getElementById:id=>id==='professionalTrainingMemberBody'?root:null},
  fetch:async(url,opts)=>({ok:true,json:async()=>({role:'member',lessons:sample(scores).reverse()})}),
  console};
 vm.runInNewContext(source,context);
 await context.window.professionalTrainingMemberRefresh();
 return root.innerHTML;
}
test('member professional grades are shown as /100 in correct lesson order, including 0/100',async()=>{
 const html=await memberHtml([20,16,0]);
 assert.match(html,/100 \/ 100/);assert.match(html,/80 \/ 100/);assert.match(html,/0 \/ 100/);
 for(let i=1;i<5;i++)assert.ok(html.indexOf('التدريب الاحترافي '+i)<html.indexOf('التدريب الاحترافي '+(i+1)));
 assert.match(html,/التدريبات الاحترافية/).toString();
});
test('final professional average is hidden until all five videos and tests are passed',async()=>{
 const pending=await memberHtml([20,20,20,20,null]);
 assert.doesNotMatch(pending,/basic-training-average-card/);
 const failed=await memberHtml([20,20,20,20,15]);
 assert.doesNotMatch(failed,/basic-training-average-card/);
 const done=await memberHtml([20,20,20,20,16]);
 assert.match(done,/basic-training-average-card/);
 assert.match(done,/96 \/ 100/);
});
test('record never displays a provisional zero for an unattempted quiz',async()=>{
 const html=await memberHtml([]);
 assert.match(html,/لم يؤدِّ الاختبار/);
 assert.match(html,/0 \/ 5/);
 assert.doesNotMatch(html,/basic-training-average-card/);
});
test('profile integration keeps track order and loads professional script exactly once',()=>{
 assert.equal((page.match(/professional-training-profile\.js\?v=20261016-profile1/g)||[]).length,1);
 assert.match(page,/basicTrainingMemberPage\?\.\(\).*professionalTrainingMemberProfile\?\.\(\).*advancedFinancialMemberProfile\?\.\(\)/);
 const basic=page.indexOf('window.loadBasicTrainingLeaderMemberProfile(id)');
 const pro=page.indexOf('window.professionalTrainingLeaderProfile(id)');
 const advanced=page.indexOf('window.advancedFinancialLeaderProfile(id)');
 assert.ok(basic>=0&&basic<pro&&pro<advanced);
});
test('leader professional RPC checks account role, joins the correct member and never exposes answer keys',()=>{
 assert.match(migration,/app_current_user_id\(p_token\)/);
 assert.match(migration,/role='leader'/);
 assert.match(migration,/member_id=p_member_id/);
 assert.match(migration,/login_no=v_member_no/);
 assert.match(migration,/professional_training_progress/);
 assert.match(migration,/professional_training_attempts/);
 assert.doesNotMatch(migration,/'correct_index'|'answers'/);
 assert.match(migration,/REVOKE ALL/);
});
test('professional profile source compiles independently without touching course/watch code',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/professional_training_overview/);
 assert.match(source,/professional_training_leader_member_profile/);
 assert.doesNotMatch(source,/update .*professional_training_progress|insert into/i);
});
