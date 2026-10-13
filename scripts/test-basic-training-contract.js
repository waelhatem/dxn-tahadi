#!/usr/bin/env node
'use strict';
// Static + simulated-browser contract tests; does NOT connect to Supabase.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'basic-training.js'),'utf8');
const videos=['lxhnkUov9sE','K_N80xZlxXw','n7W9LoCMdPo','AMKtcQt8ltc',
 'Wa_Kp2U7x0E','G09ztpXOBBM','kYJjJu2JQFI','v4gYSL-KuHQ'];
for(let i=1;i<=8;i++){
 const bank=JSON.parse(fs.readFileSync(path.join(root,'basic-training-'+String(i).padStart(2,'0')+'-new-quiz.json'),'utf8'));
 assert.equal(bank.length,20,'bank '+i);
 for(const [index,q] of bank.entries()){
   assert.equal(typeof q.question,'string');
   assert.ok(q.question.length>=10,'training '+i+' q '+(index+1));
   assert.equal(q.options.length,3,'options '+i+' q '+(index+1));
   assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<3);
 }
 assert.ok(source.includes(videos[i-1]),'video '+i+' mapped');
}
const migrations=path.join(root,'supabase','migrations');
const ddl=fs.readFileSync(path.join(migrations,'20261013_basic_training_persistence_90_80.sql'),'utf8');
const seed=fs.readFileSync(path.join(migrations,'20261013_basic_training_approved_160_questions.sql'),'utf8');
assert.match(ddl,/min_watch_percent integer NOT NULL DEFAULT 90/);
assert.match(ddl,/pass_score integer NOT NULL DEFAULT 16/);
assert.match(ddl,/basic_training_attempts/);
assert.match(ddl,/app_current_user_id\(p_token\)/);
assert.match(ddl,/FOR UPDATE/);
assert.match(ddl,/basic_training_get_quiz/);
assert.match(ddl,/basic_training_submit_quiz/);
assert.match(ddl,/REVOKE ALL ON public.basic_training_lessons/);
for(let i=1;i<=8;i++){
 const bank=JSON.parse(fs.readFileSync(path.join(root,'basic-training-'+String(i).padStart(2,'0')+'-new-quiz.json'),'utf8'));
 for(const question of bank) assert.ok(seed.includes(JSON.stringify(question.question)),'question missing from seed '+i);
}
assert.match(source,/const isEighth=number===8/);
assert.match(source,/basicBagPreviewEighthQuiz/);
assert.match(source,/basic_training_overview/);
assert.match(source,/basic_training_watch_update/);

async function scenario(){
 const ui={innerHTML:''},notice={textContent:''},tasks=[];
 const mockResponse={
   role:'member',progress:videos.map((_,i)=>({
    training_no:i+1,watched:i===0?503:0,duration:[503,503,1353,706,842,838,1175,994][i],
    completed:i===0,passed:i===0,best_score:i===0?18:null
   })),
   scores:[{training_no:1,score:18,passed:true}],published_quizzes:videos.map((_,i)=>i+1)
 };
 const sandbox={
  console,window:{innerWidth:1200},
  document:{getElementById:id=>id==='basicBagCards'?ui:id==='basicBagNotice'?notice:null},
  localStorage:{getItem:key=>key==='dxn_session'?'11111111-1111-4111-8111-111111111111':null},
  fetch:async()=>({ok:true,text:async()=>JSON.stringify(mockResponse)}),
  setTimeout:cb=>{tasks.push(cb);return tasks.length;},
 };
 vm.runInNewContext(source,sandbox,{filename:'basic-training.js'});
 const html=sandbox.window.basicTrainingCourseHtml();
 assert.ok(html.includes('trainingBasicBagStart'));
 while(tasks.length) await tasks.shift()();
 assert.equal((ui.innerHTML.match(/class="basic-bag-number"/g)||[]).length,8);
 const lesson2=ui.innerHTML.split('التدريب الأساسي 2')[1].split('التدريب الأساسي 3')[0];
 const lesson3=ui.innerHTML.split('التدريب الأساسي 3')[1].split('التدريب الأساسي 4')[0];
 assert.ok(!lesson2.match(/onclick="basicBagStartVideo\(2\)" disabled/),'lesson 2 unlocked after lesson 1 passed');
 assert.ok(lesson3.match(/onclick="basicBagStartVideo\(3\)" disabled/),'lesson 3 locked until lesson 2 passed');
 assert.ok(lesson2.match(/onclick="basicBagStartQuiz\(2\)" disabled/),'lesson 2 quiz locked until 90% watch');
 assert.ok(!ui.innerHTML.includes('معاينة الاختبار (غير محفوظة)'),'preview hidden for members');
 assert.ok(notice.textContent.includes('90%'));
}
scenario().then(()=>console.log('OK: eight approved quizzes, isolated migration, member progression contract'))
 .catch(e=>{console.error(e);process.exitCode=1;});
