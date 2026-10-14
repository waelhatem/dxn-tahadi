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
 let rootNode={dataset:{},textContent:'',innerHTML:'',isConnected:true};
 let progress=scores.map((score,i)=>({training_no:i+1,best_score:score,passed:score>=16,watched:100,duration:100,completed:true}));
 let context={
  window:{},role:'member',me:{id:'test-member'},
  localStorage:{getItem:()=> 'dummy-unit-test-token'},
  document:{getElementById:id=>id==='basicTrainingMemberBody'?rootNode:null},
  fetch:async()=>({ok:true,json:async()=>({role:'member',progress})}),
  console
 };
 vm.runInNewContext(memberJs,context,{filename:'basic-training-member-profile.js'});
 return context.window.basicTrainingLoadMemberPage().then(()=>rootNode.innerHTML);
}
test('each taken test displays a score out of 100, not out of 20',async()=>{
 const html=await memberView([20,16,0]);
 for(const grade of ['100 / 100','80 / 100','0 / 100'])
  assert.ok(html.includes(grade),grade+' visible');
 assert.doesNotMatch(html,/20\s*\/\s*20/);
 assert.match(html,/درجة الاختبار/);
});
test('only completed tests count in a provisional average; zero is a real score',async()=>{
 const html=await memberView([20,16,0]);
 assert.match(html,/76\.7 \/ 100/); // (100+80+0) / 3
 assert.match(html,/3 من 8 اختبارات/);
 assert.match(html,/معدل درجات الاختبارات الحالي/);
 assert.doesNotMatch(html,/🏆 الدرجة النهائية لمعدل الاختبارات/);
});
test('final prominent average appears once all eight tests have saved scores',async()=>{
 const html=await memberView([20,19,18,17,16,15,14,13]);
 assert.match(html,/🏆 الدرجة النهائية لمعدل الاختبارات/);
 assert.match(html,/82\.5 \/ 100/); // (100+95+90+85+80+75+70+65)/8
 assert.match(html,/✅ اكتمل احتساب معدل الاختبارات الثمانية/);
 assert.match(html,/class="basic-training-average-card"/);
});
test('unattempted tests are not entered as zero scores',async()=>{
 const html=await memberView([]);
 assert.match(html,/— \/ 100/);
 assert.match(html,/0 من 8 اختبارات/);
 assert.doesNotMatch(html,/🏆 الدرجة النهائية لمعدل الاختبارات/);
});
test('leader record uses same 100-point scoring and a highlighted average',()=>{
 assert.match(leaderJs,/basic-training-average-card/);
 assert.match(leaderJs,/best_score\)\)\*5/);
 assert.match(leaderJs,/testedCount===8/);
 assert.match(leaderJs,/80 \/ 100 درجة/);
});
test('actual and preview quiz displays /100 while original backend remains /20',()=>{
 assert.match(trainingJs,/graded\.score\|\|0/);
 assert.match(trainingJs,/Number\(graded\.out_of\)\|\|20/);
 assert.match(trainingJs,/Math\.round\(score\*5\)/);
 assert.match(trainingJs,/درجة النجاح: 80 \/ 100/);
 assert.match(trainingJs,/أسئلة الاختبار: 20/);
});
