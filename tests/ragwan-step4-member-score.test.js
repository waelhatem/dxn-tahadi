const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
const script=section('function ragwanStep4ResultSeen(){','function ragwanBuildStep4AssessmentAction(){')
  +'\n'+section('async function ragwanConfirmStep4Result(){','function ragwanOpenStep4Answers(){');

function section(begin,end){
  const i=html.indexOf(begin),j=html.indexOf(end,i+1);
  assert.ok(i>=0&&j>i, 'missing Ragwan member-result handler');
  return html.slice(i,j);
}
function mockNode(){
  return {value:'',disabled:false,style:{display:'none'},textContent:'',innerHTML:'',
    title:'',classList:{add(){},remove(){}}};
}
function setup(rows,opts={}){
  const store=new Map([['test_form_id','form-A'],['test_sponsor_email','coach@example.com']]);
  const nodes={
    ragwanStep4Status:mockNode(),
    ragwanStep4ScorePanel:mockNode(),
    ragwanStep4ShowResultBtn:mockNode(),
    ragwanStep4SponsorEmail:Object.assign(mockNode(),{value:opts.email||'coach@example.com'}),
    ragwanStep4AnswerBtn:Object.assign(mockNode(),{disabled:true})
  };
  const calls=[];
  const ctx={
    role:opts.role||'member',
    token:'session-uuid',
    me:{member_no:'123456789'},
    document:{getElementById:(id)=>nodes[id]||null},
    localStorage:{getItem:(key)=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),
      removeItem:(key)=>store.delete(key)},
    ragwanStep4StorageKey:(suffix)=>'test_'+suffix,
    ragwanStep4Email:()=>store.get('test_sponsor_email'),
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(opts.rpcError)throw new Error('Unable to load');
      return rows;
    },
    toast:()=>{}
  };
  vm.createContext(ctx);
  vm.runInContext(script,ctx);
  return {ctx,store,nodes,calls};
}
function record(overrides={}){
  return Object.assign({id:'sub-01',form_id:'form-A',sponsor_email:'coach@example.com',
    membership_number:'123456789',report:{totalScore:85,overallStatus:'approved'}},overrides);
}

test('a member sees the actual saved score and the answer review unlocks only after verifying',async()=>{
  const x=setup([record()]);
  assert.equal(x.ctx.ragwanStep4ResultSeen(),false);
  await x.ctx.ragwanConfirmStep4Result();
  assert.match(x.nodes.ragwanStep4ScorePanel.innerHTML,/85 \/ 100/);
  assert.match(x.nodes.ragwanStep4ScorePanel.innerHTML,/اجتزت الاختبار/);
  assert.equal(x.nodes.ragwanStep4AnswerBtn.disabled,false);
  assert.equal(x.ctx.ragwanStep4ResultSeen(),true);
  assert.equal(x.calls[0].name,'get_external_training_assessment_submissions');
  assert.equal(x.calls[0].args.p_membership_number,'123456789');
  assert.equal(x.calls[0].args.p_token,'session-uuid');
});
test('does not show a result from a different sponsor, form or member',async()=>{
  const x=setup([record({form_id:'form-other'}),record({sponsor_email:'other@example.com'}),
    record({membership_number:'999999999'})]);
  await x.ctx.ragwanConfirmStep4Result();
  assert.equal(x.nodes.ragwanStep4AnswerBtn.disabled,true);
  assert.match(x.nodes.ragwanStep4ScorePanel.textContent,/لم تصل نتيجة/);
  assert.equal(x.ctx.ragwanStep4ResultSeen(),false);
});
test('does not show stale score for a changed sponsor email',async()=>{
  const x=setup([record()],{email:'different@example.com'});
  await x.ctx.ragwanConfirmStep4Result();
  assert.equal(x.calls.length,0);
  assert.equal(x.nodes.ragwanStep4AnswerBtn.disabled,true);
});
test('leader cannot retrieve another user result via the trainee control',async()=>{
  const x=setup([record()],{role:'leader'});
  await x.ctx.ragwanConfirmStep4Result();
  assert.equal(x.calls.length,0);
  assert.equal(x.nodes.ragwanStep4AnswerBtn.disabled,true);
});
test('backend errors and results not yet saved do not generate success messages',async()=>{
  const x=setup([],{rpcError:true});
  await x.ctx.ragwanConfirmStep4Result();
  assert.equal(x.nodes.ragwanStep4AnswerBtn.disabled,true);
  assert.equal(x.ctx.ragwanStep4ResultSeen(),false);
  assert.match(x.nodes.ragwanStep4ScorePanel.textContent,/تعذر استرجاع النتيجة/);
});
test('old manual result checkbox has been replaced and no score is fabricated',()=>{
  assert.match(html,/id="ragwanStep4ShowResultBtn"/);
  assert.doesNotMatch(html,/✅ ظهرت النتيجة في الفورم/);
  assert.doesNotMatch(html,/ragwanStep4StorageKey\('result_seen'\)/);
});
const formCode=fs.readFileSync(require('node:path').join(__dirname,'../google-form/Code.gs'),'utf8');
test('Google Form keeps sponsor report and adds instructions for existing forms',()=>{
  assert.match(formCode,/sendSponsorReportEmail\(/);
  assert.match(formCode,/updateSponsorTrainingFormConfirmations\(\)/);
  assert.match(formCode,/عرض نتيجة اختباري/);
});
