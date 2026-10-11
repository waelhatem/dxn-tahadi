// وضع المطالعة لخطة رجوان في الخادم: حساب قائد بلا جذر فريق (LEADER1) يُرفض له كل ما يكتب أو يقرأ
// سجلات خاصة، حتى عند استدعاء /api/ragwan-files مباشرة. القائد مدير التدريب والعضو بلا تغيير.
// الشبكة مستبدلة بالكامل؛ لا اتصال بـ Supabase.
process.env.SUPABASE_SECRET_KEY='test-secret';
const test=require('node:test');
const assert=require('node:assert/strict');
const https=require('node:https');
const {EventEmitter}=require('node:events');

const TOKENS={leader:'11111111-1111-1111-1111-111111111111',readOnly:'22222222-2222-2222-2222-222222222222',member:'33333333-3333-3333-3333-333333333333',noCheck:'44444444-4444-4444-4444-444444444444'};
const calls=[];
function fakeReply(path,body){
  const rpc=(path.match(/^\/rest\/v1\/rpc\/([a-z_]+)/)||[])[1];
  if(rpc==='bootstrap'){
    if(body.p_token===TOKENS.member)return [200,{role:'member',member_no:'820000001'}];
    return [200,{role:'leader',member_no:null}];
  }
  if(rpc==='ragwan_leader_can_manage_training'){
    if(body.p_token===TOKENS.noCheck)return [404,{code:'PGRST202',message:'Could not find the function'}];
    return [200,body.p_token===TOKENS.leader];
  }
  if(rpc)return [200,rpc==='search_ragwan_trainees'||rpc==='list_ragwan_trainees'?[]:{ok:true}];
  return [200,path.includes('/object/list/')?[]:{token:'t',signedURL:'/x'}];
}
https.request=(options,onResponse)=>{
  const req=new EventEmitter();let raw='';
  req.write=c=>{raw+=c;};req.destroy=()=>{};
  req.end=()=>{
    let body={};try{body=JSON.parse(raw||'{}')}catch(_){}
    calls.push({path:options.path,body});
    const [status,data]=fakeReply(options.path,body);
    const res=new EventEmitter();res.statusCode=status;res.setEncoding=()=>{};
    onResponse(res);
    setImmediate(()=>{res.emit('data',JSON.stringify(data));res.emit('end');});
  };
  return req;
};
const handler=require('../api/ragwan-files');

async function callApi(token,action,extra){
  calls.length=0;
  let status=0,payload=null;
  const res={setHeader(){},status(c){status=c;return this;},json(v){payload=v;return this;},end(){return this;}};
  await handler({method:'POST',body:{args:{p_token:token,action,...(extra||{})}}},res);
  return {status,payload,rpcs:calls.map(c=>c.path)};
}

const MANAGEMENT_ACTIONS=[
  ['search_trainees',{query:''}],['list_trainees'],['select_trainee',{trainee_member_id:'x'}],
  ['add_trainee_by_member_no',{member_no:'820000003'}],['get_training_progress',{trainee_member_id:'x'}],
  ['save_training_step',{trainee_member_id:'x',step:1,status:'started'}],['record_plan_completion_for_member',{member_id:'x'}],
  ['certificate_trainee_data',{member_id:'x'}],['update_trainee_display_name',{enrollment_id:'x',display_name:'اسم'}],
  ['archive_trainee',{enrollment_id:'x'}],
  ['sign_upload',{name:'a.pdf',size:10}],['delete',{path:'ragwan/a.pdf'}],
  ['sign_step_resource_upload',{step:1,name:'a.pdf',size:10}],['delete_step_resource',{path:'step-resources/step-1/a.pdf'}],
  ['evidence_review',{member_key:'820000001',step:1,status:'approved'}],['evidence_records'],['evidence_list']
];

test('read-only leader is refused for every management or private-record action, before any data call',async()=>{
  for(const [action,extra] of MANAGEMENT_ACTIONS){
    const r=await callApi(TOKENS.readOnly,action,extra);
    assert.equal(r.status,400,action);
    assert.match(r.payload.error,/وضع المطالعة/,action);
    // فقط التحقق من الجلسة ومن الصلاحية؛ لا استدعاء لدوال المتدربين ولا للتخزين.
    assert.deepEqual(r.rpcs,['/rest/v1/rpc/bootstrap','/rest/v1/rpc/ragwan_leader_can_manage_training'],action);
  }
});

test('read-only leader can still read plan content (files and step resources)',async()=>{
  for(const action of [['list'],['step_resource_list',{step:3}]]){
    const r=await callApi(TOKENS.readOnly,action[0],action[1]);
    assert.equal(r.status,200,action[0]);
    assert.equal(r.payload.ok,true,action[0]);
  }
});

test('capabilities: training manager vs read-only vs member',async()=>{
  assert.deepEqual((await callApi(TOKENS.leader,'capabilities')).payload,{ok:true,role:'leader',can_train:true,read_only:false});
  assert.deepEqual((await callApi(TOKENS.readOnly,'capabilities')).payload,{ok:true,role:'leader',can_train:false,read_only:true});
  const m=await callApi(TOKENS.member,'capabilities');
  assert.deepEqual(m.payload,{ok:true,role:'member',can_train:true,read_only:false});
  assert.ok(!m.rpcs.includes('/rest/v1/rpc/ragwan_leader_can_manage_training'),'members are not re-checked');
});

test('training-manager leader reaches the database functions for trainee actions',async()=>{
  const r=await callApi(TOKENS.leader,'add_trainee_by_member_no',{member_no:'820000003'});
  assert.equal(r.status,200);
  assert.ok(r.rpcs.includes('/rest/v1/rpc/add_ragwan_trainee_by_member_no'));
  const u=await callApi(TOKENS.leader,'sign_upload',{name:'a.pdf',size:10});
  assert.equal(u.status,200);
});

test('member rights unchanged: trainee actions reach the database, leader-only actions stay refused',async()=>{
  const r=await callApi(TOKENS.member,'save_training_step',{trainee_member_id:'x',step:1,status:'started'});
  assert.equal(r.status,200);
  assert.ok(r.rpcs.includes('/rest/v1/rpc/save_ragwan_training_step'));
  const u=await callApi(TOKENS.member,'sign_upload',{name:'a.pdf',size:10});
  assert.equal(u.status,400);
  assert.match(u.payload.error,/للقائد فقط/);
});

test('if the capability check fails (e.g. migration not applied) the leader is treated as read-only',async()=>{
  const r=await callApi(TOKENS.noCheck,'add_trainee_by_member_no',{member_no:'820000003'});
  assert.equal(r.status,400);
  assert.match(r.payload.error,/وضع المطالعة/);
  assert.ok(!r.rpcs.includes('/rest/v1/rpc/add_ragwan_trainee_by_member_no'));
});
