// بيانات المدرب لحساب القائد (الاسم، رقم العضوية، الصفة): البطاقة في «إدارة القائد»، والتعديل للقائد مدير التدريب فقط،
// والشهادة تأخذ المدرب من الخادم مع بقاء القالب كما هو. يشغّل دوال الصفحة الحقيقية داخل vm ويفحص ملف SQL المعلّق.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r/g,'');
const HTML=read('app/index.html');
const CERT=read('app/ragwan-certificate.js');
const CONFIG=read('app/config.js');
const PROFILE_SQL=read('supabase/pending-review/20261011130000_leader_trainer_profile.sql');

function extractFunction(name){
  let start=HTML.indexOf(`async function ${name}(`);
  if(start<0)start=HTML.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} not found`);
  let depth=0,i=HTML.indexOf('{',start);
  for(;i<HTML.length;i++){if(HTML[i]==='{')depth++;else if(HTML[i]==='}'&&--depth===0)break;}
  return HTML.slice(start,i+1);
}
const ESC_LINE=HTML.match(/const esc=x=>String\(x\?\?''\)\.replace\([^\n]*?\[c\]\)\);/)[0];

function makePage(role,identity){
  const apiCalls=[],toasts=[];
  const elements={};
  const ctx={
    role,toast:m=>toasts.push(m),setTimeout:()=>0,
    ragwanPlanApi:async(action,args)=>{apiCalls.push({action,args});return {ok:true,trainer:{...identity,...{name:args&&args.display_name}}};},
    document:{getElementById:id=>elements[id]||null,createElement:()=>({}),body:{appendChild:()=>{}}},
    String,JSON
  };
  vm.createContext(ctx);
  vm.runInContext(ESC_LINE+'\nlet leaderTrainerIdentity=null,leaderTrainerIdentityLoading=false;\n'+
    ['leaderTrainerCardBody','leaderTrainerCardMarkup','saveLeaderTrainerProfile'].map(extractFunction).join('\n')+
    '\nthis.api={leaderTrainerCardBody,leaderTrainerCardMarkup,saveLeaderTrainerProfile,setIdentity:x=>{leaderTrainerIdentity=x}};',ctx);
  ctx.api.setIdentity(identity||null);
  return {api:ctx.api,apiCalls,toasts,elements};
}
const LEADER_ID={type:'leader',name:'وائل حاتم',member_no:'820469486',title:'مصمم مجتمع الصحة والثراء وقائده',can_edit:true};

test('LEADER account shows name, member number and title, with an edit button',()=>{
  const html=makePage('leader',LEADER_ID).api.leaderTrainerCardMarkup();
  for(const s of ['بيانات المدرب','وائل حاتم','820469486','مصمم مجتمع الصحة والثراء وقائده','openLeaderTrainerProfileEditor()'])assert.ok(html.includes(s),s);
  assert.match(extractFunction('leader'),/return `\$\{leaderTrainerCardMarkup\(\)\} <div class="card leaderbox"/);
});

test('read-only leader (LEADER1) gets no edit button; members get no card at all',()=>{
  const ro=makePage('leader',{type:'leader',name:'',member_no:'',title:'',can_edit:false}).api.leaderTrainerCardMarkup();
  assert.ok(!ro.includes('openLeaderTrainerProfileEditor'));
  assert.equal(makePage('member',{type:'member',name:'عضو',member_no:'820000001',can_edit:false}).api.leaderTrainerCardMarkup(),'');
});

test('trainer values are escaped in the card',()=>{
  const html=makePage('leader',LEADER_ID).api.leaderTrainerCardBody({...LEADER_ID,name:'<img src=x onerror=alert(1)>'});
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('saving validates locally and goes through the server action only',async()=>{
  const page=makePage('leader',LEADER_ID);
  const set=(id,value)=>{page.elements[id]={value};};
  set('leaderTrainerName','وائل حاتم');set('leaderTrainerNo','12345');set('leaderTrainerTitle','');
  page.elements.leaderTrainerStatus={textContent:''};
  await page.api.saveLeaderTrainerProfile();
  assert.equal(page.apiCalls.length,0,'bad number never reaches the server');
  assert.match(page.elements.leaderTrainerStatus.textContent,/9 أرقام/);
  set('leaderTrainerNo','820469486');
  await page.api.saveLeaderTrainerProfile();
  assert.deepEqual(JSON.parse(JSON.stringify(page.apiCalls)),[{action:'trainer_profile_save',args:{display_name:'وائل حاتم',member_no:'820469486',title:''}}]);
});

test('certificate: trainer from the server first; template, labels and positions unchanged',()=>{
  assert.match(CERT,/trainer=out\?\.trainer\|\|\{\};/);
  assert.match(CERT,/sponsorName:String\(trainer\.name\|\|completion\.sponsor_member_name\|\|completion\.sponsor_name\|\|sponsor\.name\|\|''\)/);
  assert.match(CERT,/drawCentered\(ctx,data\.sponsorName,805,915,190,24,16,'#1c2522',900\);/);
  assert.match(CERT,/male:\['\/assets\/certificates\/ragwan-professional-plan-certificate-male\.png'/);
  assert.match(CONFIG,/ragwan-certificate\.js\?v=1\.0\.17/);
});

test('profile SQL: separate review file, server-only, keyed by app_users.id, never touches accounts',()=>{
  assert.ok(!fs.existsSync(path.join(ROOT,'supabase','migrations','20261011130000_leader_trainer_profile.sql')));
  assert.match(PROFILE_SQL,/user_id uuid primary key references public\.app_users\(id\)/);
  assert.match(PROFILE_SQL,/enable row level security/);
  assert.match(PROFILE_SQL,/revoke all on table public\.leader_trainer_profiles from public, anon, authenticated;/);
  assert.doesNotMatch(PROFILE_SQL,/(update|alter table)\s+public\.(app_users|members)\b/i);
  assert.match(PROFILE_SQL,/trim\(coalesce\(au\.team_root_member_no,''\)\) = '820469486'\s+on conflict \(user_id\) do nothing;/);
  const save=PROFILE_SQL.slice(PROFILE_SQL.indexOf('function public.save_leader_trainer_profile('));
  assert.match(save,/not public\.ragwan_leader_can_manage_training\(p_token\)/);
  for(const sig of ['get_ragwan_trainer_identity\\(uuid\\)','save_leader_trainer_profile\\(uuid,text,text,text\\)']){
    assert.match(PROFILE_SQL,new RegExp('revoke all on function public\\.'+sig+' from public, anon, authenticated;'));
    assert.match(PROFILE_SQL,new RegExp('grant execute on function public\\.'+sig+' to service_role;'));
  }
});
