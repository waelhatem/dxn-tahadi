'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const memberJs=fs.readFileSync(path.join(root,'basic-training-member-profile.js'),'utf8');
const leaderJs=fs.readFileSync(path.join(root,'basic-training-leader-profile.js'),'utf8');
const trainingJs=fs.readFileSync(path.join(root,'basic-training.js'),'utf8');

function memberView(scores){
 const rootNode={dataset:{},textContent:'',innerHTML:'',isConnected:true};
 const progress=scores.map((score,i)=>({
  training_no:i+1,best_score:score,passed:score>=16,
  watched:100,duration:100,completed:true
 }));
 const context={
  window:{},role:'member',me:{id:'test-member'},
  localStorage:{getItem:()=> 'unit-test-token'},
  document:{getElementById:id=>id==='basicTrainingMemberBody'?rootNode:null},
  fetch:async()=>({ok:true,json:async()=>({role:'member',progress})}),
  console
 };
 vm.runInNewContext(memberJs,context,{filename:'basic-training-member-profile.js'});
 return context.window.basicTrainingLoadMemberPage().then(()=>rootNode.innerHTML);
}

test('each taken test displays its score out of 100 (not 20)',async()=>{
 const html=await memberView([20,16,0]);
 for(const grade of ['100 / 100','80 / 100','0 / 100'])
  assert.ok(html.includes(grade),grade+' visible');
 assert.doesNotMatch(html,/20\s*\/\s*20/);
 assert.match(html,/درجة الاختبار/);
});
test('do not show any average before all eight trainings have been passed',async()=>{
 const html=await memberView([20,16,0]);
 assert.doesNotMatch(html,/basic-training-average-card/);
 assert.doesNotMatch(html,/معدل درجات الاختبارات الحالي/);
 assert.doesNotMatch(html,/الدرجة النهائية لمعدل الاختبارات/);
 assert.match(html,/3\/8/);
});
test('eight attempted tests including a failed one still hide the average',async()=>{
 const html=await memberView([20,19,18,17,16,16,16,15]);
 assert.doesNotMatch(html,/basic-training-average-card/);
 assert.match(html,/75 \/ 100/);
});
test('after passing all eight, show final prominent average only',async()=>{
 const html=await memberView([20,20,20,20,16,16,16,16]);
 assert.match(html,/🏆 الدرجة النهائية لمعدل الاختبارات/);
 assert.match(html,/90 \/ 100/);
 assert.match(html,/✅ اكتملت التدريبات الثمانية/);
 assert.match(html,/class="basic-training-average-card"/);
 assert.doesNotMatch(html,/معدل درجات الاختبارات الحالي/);
});
test('unattempted tests do not create a provisional average or a zero score',async()=>{
 const html=await memberView([]);
 assert.doesNotMatch(html,/basic-training-average-card/);
 assert.match(html,/0\/8/);
 assert.match(html,/لم يُختبر/);
});
test('leader member record follows same eight passed trainings rule and /100 grade',()=>{
 assert.match(leaderJs,/var allPassed=tested.length===8&&list.every/);
 assert.match(leaderJs,/item.passed===true&&item.watch_completed===true/);
 assert.match(leaderJs,/if\(allPassed\)/);
 assert.match(leaderJs,/Math.round\(Math.max\(0,Math.min\(20,Number\(item.best_score\)\)\)\*5\)/);
 assert.match(leaderJs,/80 \/ 100 درجة/);
});
test('actual and preview results convert to /100; 20 questions stay intact',()=>{
 assert.match(trainingJs,/graded\.score\|\|0/);
 assert.match(trainingJs,/Number\(graded\.out_of\)\|\|20/);
 assert.match(trainingJs,/Math.round\(score\*5\)/);
 assert.match(trainingJs,/درجة النجاح: 80 \/ 100/);
 assert.match(trainingJs,/أسئلة الاختبار: 20/);
});
