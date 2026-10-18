'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=read('api/rpc.js'),engine=read('training-engine.js');
const rendererSource=engine.slice(engine.indexOf(' function appendQuizMistakeReview('),engine.indexOf('\n window.DXNTrainingEngine=',engine.indexOf(' function appendQuizMistakeReview(')));
const reviewSource=api.slice(api.indexOf('const TRAINING_QUIZ_REVIEW_SOURCES='),api.indexOf('module.exports = async function handler'));
function bank(length){
 return Array.from({length:20},(_,i)=>({
   question_no:i+1,question:'سؤال '+(i+1),options:Array.from({length},(_,k)=>'خيار '+(i+1)+'-'+k),
   correct_index:i%length
 }));
}
function grader(source,options=3,key='server-private'){
 const requests=[];
 const mock=async(path,privateKey)=>{
   requests.push({path,key:privateKey});
   return {ok:true,data:source};
 };
 const fn=new Function('supabaseRestRequest','SUPABASE_SECRET_KEY','console',reviewSource+'\nreturn appendSubmittedQuizReview;')(mock,key,{error(){}});
 return {fn,requests};
}
function makeDom(){
 const mk=tag=>({
   tagName:tag,className:'',textContent:'',children:[],attrs:{},
   append(...nodes){this.children.push(...nodes)},
   setAttribute(k,v){this.attrs[k]=v}
 });
 return {document:{createElement:mk},root:mk('div')};
}
const fnFor=(dom)=>new Function('document',rendererSource+'\nreturn appendQuizMistakeReview;')(dom.document);
test('the database keys are loaded privately after successful, saved grading only',()=>{
 assert.match(api,/if\(response\.ok && TRAINING_QUIZ_REVIEW_SOURCES\[fn\]\)/);
 assert.match(api,/await appendSubmittedQuizReview\(fn,args,response\.data\)/);
 assert.match(api,/SUPABASE_SECRET_KEY/);
 assert.doesNotMatch(api.slice(api.indexOf('const TRAINING_QUIZ_REVIEW_SOURCES='),api.indexOf('module.exports = async function handler')),/return\s+.*correct_index/);
});
for(const [fn,table,opts] of [
 ['basic_training_submit_quiz','basic_training_questions',3],
 ['professional_training_submit_quiz','professional_training_questions',3],
 ['advanced_financial_submit_quiz','advanced_financial_questions',4]
]){
 test(fn+': report only wrong submitted answers and no answer-key indexes',async()=>{
   const b=bank(opts),answers=b.map(q=>q.correct_index);answers[0]=(answers[0]+1)%opts;
   answers[11]=(answers[11]+2)%opts;
   const o=grader(b);
   const args={p_answers:answers,p_lesson_no:2,p_training_no:2};
   const got=await o.fn(fn,args,{score:18,out_of:20,passed:true,required:16});
   assert.equal(got.review_available,true);
   assert.equal(got.incorrect_count,2);
   assert.deepEqual(got.wrong_answers.map(q=>q.no),[1,12]);
   assert.equal(got.wrong_answers[0].question,'سؤال 1');
   assert.equal(got.wrong_answers[0].correct_option,'خيار 1-0');
   assert.equal(got.wrong_answers[0].chosen_option,'خيار 1-'+answers[0]);
   assert.equal(Object.prototype.hasOwnProperty.call(got.wrong_answers[0],'correct_index'),false);
   assert.equal(Object.prototype.hasOwnProperty.call(got,'answers'),false);
   assert.equal(o.requests.length,1);
   assert.match(o.requests[0].path,new RegExp(table));
   assert.equal(o.requests[0].key,'server-private');
 });
}
test('100 / 100 returns an empty corrections list rather than a full answer key',async()=>{
 const b=bank(3),o=grader(b);
 const result=await o.fn('basic_training_submit_quiz',{p_training_no:1,p_answers:b.map(q=>q.correct_index)},
   {score:20,out_of:20,passed:true});
 assert.equal(result.review_available,true);
 assert.equal(result.incorrect_count,0);
 assert.deepEqual(result.wrong_answers,[]);
});
test('saved score stays intact if the bank changed before the private review',async()=>{
 const b=bank(3),o=grader(b);
 const result=await o.fn('basic_training_submit_quiz',{p_training_no:1,p_answers:b.map(q=>q.correct_index)},
   {score:18,out_of:20,passed:true});
 assert.equal(result.score,18);
 assert.equal(result.review_available,false);
 assert.equal(result.wrong_answers,undefined);
});
test('private key absent blocks bank lookup without affecting the saved grade',async()=>{
 const b=bank(3),o=grader(b,3,'');
 const result=await o.fn('basic_training_submit_quiz',{p_training_no:1,p_answers:b.map(q=>q.correct_index)},
   {score:20,out_of:20,passed:true});
 assert.equal(result.score,20);
 assert.equal(result.review_available,false);
 assert.equal(o.requests.length,0);
});
test('shared review DOM displays question, user choice and the correct choice as safe text',()=>{
 const dom=makeDom(),render=fnFor(dom);
 render(dom.root,{score:19,out_of:20,review_available:true,wrong_answers:[
  {no:2,question:'ما معنى <script>؟',chosen_option:'اختيار غير صحيح',correct_option:'الإجابة الصحيحة'}
 ]});
 const box=dom.root.children[0];
 assert.equal(box.attrs['aria-label'],'مراجعة الإجابات غير الصحيحة');
 assert.match(box.children[1].textContent,/1 من 20/);
 const row=box.children[2];
 assert.match(row.children[0].textContent,/<script>/);
 assert.match(row.children[1].textContent,/اختيار غير صحيح/);
 assert.match(row.children[2].textContent,/الإجابة الصحيحة/);
 assert.equal(row.children[0].children.length,0,'untrusted HTML never parsed');
});
test('shared review gives meaningful perfect-score or temporarily unavailable message',()=>{
 const dom=makeDom(),render=fnFor(dom);
 render(dom.root,{review_available:true,wrong_answers:[],out_of:20});
 assert.match(dom.root.children[0].children[1].textContent,/جميع إجاباتك صحيحة/);
 render(dom.root,{review_available:false,score:14});
 assert.match(dom.root.children[1].children[1].textContent,/تم حفظ درجة الاختبار/);
});
test('all three production tracks render corrections after successful grading',()=>{
 for(const path of ['basic-training.js','professional-training-course.js','advanced-financial-training.js']){
  const src=read(path);
  assert.match(src,/appendQuizMistakeReview\(/,path);
  assert.match(src,/درجة الاختبار:/,path);
 }
 const app=read('app/index.html');
 assert.match(app,/quiz-answer-review\.css\?v=/);
 const version=['training-engine.js','basic-training.js','professional-training-course.js','advanced-financial-training.js']
  .map(name=>{
   const m=app.match(new RegExp(name.replace('.','\\.')+'\\?v=(\\w[\\w-]*)'));
   assert.ok(m,name);return m[1];
  });
 assert.equal(new Set(version).size,1,'all training script cache versions move together');
});
