const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const bank=require('../data/ragwan-step4-mcq.json');
const appsScript=fs.readFileSync(path.join(__dirname,'../google-form/Code.gs'),'utf8');
const helper=fs.readFileSync(path.join(__dirname,'../google-form/RagwanQuiz.gs'),'utf8');
const backend=fs.readFileSync(path.join(__dirname,'../api/google-form-submit.js'),'utf8');

test('12 four-choice questions have precisely one correct option, totaling 100 points',()=>{
  assert.equal(bank.length,12);
  for(const q of bank){
    assert.equal(q.options.length,4);
    assert.equal(new Set(q.options).size,4);
    assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<=3);
    assert.ok(q.options.every(v=>typeof v==='string'&&v.length>10));
  }
  assert.equal(bank.reduce((sum,_,i)=>sum+(i<4?9:8),0),100);
});
test('Apps Script copies the exact server-side question bank and includes all legacy headings',()=>{
  const m=helper.match(/const RAGWAN_STEP4_MCQ_BANK = (\[[\s\S]*?\]);\s*function ragwanQuizTitle/);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]),bank);
  assert.equal((appsScript.match(/number: \d+,/g)||[]).length,12);
  assert.ok(appsScript.includes('addRagwanMultipleChoiceItems(form)'));
  assert.ok(appsScript.includes('form.setIsQuiz(true)'));
  assert.ok(appsScript.includes('assessmentMode: isRagwanMultipleChoiceQuiz(form)'));
  assert.ok(appsScript.includes('sendSponsorReportEmail('));
  assert.ok(appsScript.includes('SPONSOR_'));
});
test('Existing form migration backs up past responses and keeps form links intact',()=>{
  assert.match(helper,/RAGWAN_MCQ_RESPONSE_ARCHIVE_/);
  assert.match(helper,/DriveApp\.createFile/);
  assert.match(helper,/form\.setAcceptingResponses\(false\)/);
  assert.match(helper,/form\.moveItem\(/);
  assert.match(helper,/form\.deleteItem\(/);
  assert.match(helper,/RAGWAN_MCQ_READY_/);
  assert.doesNotMatch(helper,/FormApp\.create/);
});
test('Code.gs and the Quiz helper are syntactically valid JavaScript',()=>{
  assert.doesNotThrow(()=>new vm.Script(appsScript));
  assert.doesNotThrow(()=>new vm.Script(helper));
});
test('Correct MCQ answers receive same 100 points in report as in Google Forms',async(t)=>{
  const saved={
    fetch:global.fetch,secret:process.env.GOOGLE_FORM_WEBHOOK_SECRET,
    sb:process.env.SUPABASE_SECRET_KEY,openai:process.env.OPENAI_API_KEY
  };
  t.after(()=>{
    global.fetch=saved.fetch;
    if(saved.secret===undefined)delete process.env.GOOGLE_FORM_WEBHOOK_SECRET;
    else process.env.GOOGLE_FORM_WEBHOOK_SECRET=saved.secret;
    if(saved.sb===undefined)delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY=saved.sb;
    if(saved.openai===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=saved.openai;
  });
  process.env.GOOGLE_FORM_WEBHOOK_SECRET='test-secret';
  process.env.SUPABASE_SECRET_KEY='test-sb-secret';
  delete process.env.OPENAI_API_KEY; // immediate Forms grading cannot depend on OpenAI availability
  delete require.cache[require.resolve('../api/google-form-submit.js')];
  const handler=require('../api/google-form-submit.js');
  let lastReport=null;
  global.fetch=async(url,options)=>{
    assert.match(String(url),/external_training_assessment_submissions/);
    const data=JSON.parse(options.body);
    lastReport=data.report;
    return {ok:true,text:async()=>JSON.stringify([{
      id:'entry-01',form_id:data.form_id,sponsor_email:data.sponsor_email,
      membership_number:data.membership_number
    }])};
  };
  async function submit(answers){
    const req={method:'POST',headers:{'x-google-form-secret':'test-secret'},body:{
      assessmentMode:'ragwan_mcq_v1',formId:'existing-form-01',
      sponsorEmail:'coach@example.com',memberName:'Test member',
      membershipNumber:'123456789',answers:answers.map((answer,i)=>({question:String(i+1),answer}))
    }};
    const res={statusCode:200,status(v){this.statusCode=v;return this;},
      setHeader(){return this;},json(v){this.body=v;return v;}};
    await handler(req,res);
    return res;
  }
  const correct=bank.map(q=>q.options[q.correct]);
  const success=await submit(correct);
  assert.equal(success.statusCode,200);
  assert.equal(success.body.ok,true);
  assert.equal(lastReport.totalScore,100);
  assert.equal(lastReport.approvedCount,12);
  assert.equal(lastReport.overallStatus,'approved');
  assert.equal(lastReport.identity.assessmentMode,'ragwan_mcq_v1');

  const oneWrong=correct.slice();
  oneWrong[0]=bank[0].options[(bank[0].correct+1)%4];
  const partial=await submit(oneWrong);
  assert.equal(partial.statusCode,200);
  assert.equal(lastReport.totalScore,91); // first question = 9 points
  assert.equal(lastReport.approvedCount,11);
  assert.equal(lastReport.overallStatus,'retry'); // existing all-questions-approved rule unchanged

  const invalid=correct.slice();
  invalid[4]='an option not on this form';
  const rejected=await submit(invalid);
  assert.equal(rejected.statusCode,400);
  assert.match(rejected.body.error,/خيار غير صالح/);
});
