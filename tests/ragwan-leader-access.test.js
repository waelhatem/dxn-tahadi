// خطة رجوان لحساب القائد: الأبواب العشرة وإدارة المتدربين تظهر للقائد، وسلوك العضو بلا تغيير.
// يشغّل دوال الصفحة الحقيقية من app/index.html داخل vm، ويفحص ملف الـmigration المعلّق للمراجعة.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8').replace(/\r/g,'');
const MIGRATION=fs.readFileSync(path.join(ROOT,'supabase','pending-review','20261011120000_ragwan_leader_trainer_access.sql'),'utf8').replace(/\r/g,'');

function extractFunction(name){
  let start=HTML.indexOf(`async function ${name}(`);
  if(start<0)start=HTML.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} not found`);
  let depth=0,i=HTML.indexOf('{',start);
  for(;i<HTML.length;i++){if(HTML[i]==='{')depth++;else if(HTML[i]==='}'&&--depth===0)break;}
  return HTML.slice(start,i+1);
}

const FUNCTIONS=['ragwanCanTrain','ragwanJourneyVisible','ragwanTraineeLabel','ragwanSelectedKey','ragwanProgressLoad',
  'ragwanSelectedTraineeSummary','ragwanTraineePanelMarkup','ragwanStartStep','ragwanCompleteStep','ragwanCanCompleteStep'];

function makePage({role,me,selected}){
  const apiCalls=[];const toasts=[];
  const ctx={
    role,me,
    RAGWAN_SELECTED_TRAINEE_KEY:'dxn_ragwan_selected_trainee',
    ragwanSelectedTrainee:selected||null,
    ragwanSelectedTraineeId:selected?selected.member_id:'',
    ragwanSelectedProgress:{completed:[],started:[]},
    ragwanCurrentStep:1,
    esc:v=>String(v??''),
    toast:m=>toasts.push(m),
    ragwanPlanApi:async(action,args)=>{apiCalls.push({action,args});return {progress:{steps:[]}};},
    ragwanNormalizeDbProgress:()=>({completed:[],started:[]}),
    ragwanProgressSave:()=>{},ragwanRenderProgress:()=>{},ragwanOpenDoor:()=>{},ragwanRenderPlanCompletionInline:()=>{},
    ragwanStepWord:n=>String(n),setTimeout:()=>0,
    Set,Math,Number,String,JSON
  };
  vm.createContext(ctx);
  vm.runInContext(FUNCTIONS.map(extractFunction).join('\n')+
    '\nthis.api={'+FUNCTIONS.join(',')+'};',ctx);
  return {ctx,api:ctx.api,apiCalls,toasts};
}
const LEADER={role:'leader',me:null};
const MEMBER={role:'member',me:{member_no:'820000001',name:'عضو'}};
const TRAINEE={member_id:'t-1',name:'متدرب',member_no:'820000003'};

test('1. leader sees the ten doors without selecting a trainee; member still needs a trainee',()=>{
  assert.equal(makePage(LEADER).api.ragwanJourneyVisible(),true);
  assert.equal(makePage(MEMBER).api.ragwanJourneyVisible(),false);
  assert.equal(makePage({...MEMBER,selected:TRAINEE}).api.ragwanJourneyVisible(),true);
  assert.match(extractFunction('ragwanDoorJourneyMarkup'),/ragwanJourneyContent" '\+\(ragwanJourneyVisible\(\)/);
  assert.match(extractFunction('ragwanRenderTraineePanel'),/ragwanJourneyVisible\(\)\?'block':'none'/);
});

test('2. leader sees the add-by-member-number field and the trainees table button',()=>{
  const html=makePage(LEADER).api.ragwanTraineePanelMarkup();
  assert.match(html,/id="ragwanTraineeMemberNoInput"/);
  assert.match(html,/ragwanAddTraineeByMemberNo\(\)/);
  assert.match(html,/ragwanOpenTraineesTable\(\)/);
});

test('member panel is unchanged; visitors and members without profile see nothing',()=>{
  assert.match(makePage(MEMBER).api.ragwanTraineePanelMarkup(),/ragwanTraineeMemberNoInput/);
  assert.equal(makePage({role:'member',me:null}).api.ragwanTraineePanelMarkup(),'');
  assert.equal(makePage({role:null,me:null}).api.ragwanTraineePanelMarkup(),'');
  assert.equal(makePage({role:'visitor',me:null}).api.ragwanTraineePanelMarkup(),'');
});

test('selected trainee summary is shown for the leader too',()=>{
  assert.match(makePage({...LEADER,selected:TRAINEE}).api.ragwanTraineePanelMarkup(),/المتدرب الحالي/);
});

test('leader has its own saved-trainee key; member key is unchanged',()=>{
  assert.equal(makePage(LEADER).api.ragwanSelectedKey(),'dxn_ragwan_selected_trainee_leader');
  assert.equal(makePage(MEMBER).api.ragwanSelectedKey(),'dxn_ragwan_selected_trainee_820000001');
});

test('browsing without a trainee never records progress (leader and member)',async()=>{
  for(const who of [LEADER,MEMBER]){
    const page=makePage(who);
    await page.api.ragwanStartStep();
    await page.api.ragwanCompleteStep();
    assert.equal(page.apiCalls.length,0,who.role);
    assert.ok(page.toasts.every(t=>/اختر المتدرب/.test(t)),who.role);
  }
});

test('3/4. with a selected trainee the leader records progress for that trainee only',async()=>{
  const page=makePage({...LEADER,selected:TRAINEE});
  await page.api.ragwanStartStep();
  assert.deepEqual(page.apiCalls.map(c=>[c.action,c.args.trainee_member_id,c.args.status]),[['save_training_step','t-1','started']]);
});

test('6. plan init no longer depends on the removed ragwanPlanVideo element',()=>{
  const intro=extractFunction('ragwanSuccessIntro');
  assert.doesNotMatch(intro,/getElementById\('ragwanPlanVideo'\)/);
  assert.match(intro,/getElementById\('ragwanPlanShell'\)[^;]*initRagwanFiles\(\)/);
  assert.match(extractFunction('ragwanDoorJourneyMarkup'),/id="ragwanPlanShell"/);
  assert.match(extractFunction('ragwanRestoreSelectedTrainee'),/if\(!ragwanCanTrain\(\)\)return;/);
});

test('stray "v>" text before the plan files box is gone',()=>{
  assert.doesNotMatch(HTML,/\nv>\n\s*<div class="ragwan-files-box"/);
});

test('completion and certificate box is available to the leader with a selected trainee',()=>{
  assert.match(extractFunction('ragwanRenderPlanCompletionInline'),/!ragwanCanTrain\(\)\|\|!ragwanSelectedTrainee/);
});

test('migration: review-only file, keeps the member branch, adds leader, never deletes data',()=>{
  assert.match(MIGRATION,/للمراجعة فقط/);
  assert.match(MIGRATION,/\(au\.role='member' and m\.id is not null and m\.active=true\)\s*or au\.role='leader'/);
  assert.match(MIGRATION,/v_sponsor_member_no := public\.ragwan_current_trainer_root_no\(p_token\)/);
  assert.match(MIGRATION,/team_root_member_no/);
  assert.doesNotMatch(MIGRATION,/\b(drop table|truncate|delete from|alter table)\b/i);
  // كل دوال رجوان الأخرى تربط الملكية بـ sponsor_user_id، والبحث للقائد محصور في سجلاته.
  assert.match(MIGRATION,/where e\.sponsor_user_id=s\.user_id\s+and e\.archived_at is null/);
  assert.ok(!fs.existsSync(path.join(ROOT,'supabase','migrations','20261011120000_ragwan_leader_trainer_access.sql')),'must not be in supabase/migrations');
});

test('migration: explicit grants keep search and the sponsor helper server-only',()=>{
  for(const sig of ['ragwan_current_sponsor\\(uuid\\)','search_ragwan_trainees\\(uuid,text\\)','ragwan_current_trainer_root_no\\(uuid\\)']){
    assert.match(MIGRATION,new RegExp('revoke all on function public\\.'+sig+' from public, anon, authenticated;'),sig);
    assert.match(MIGRATION,new RegExp('grant execute on function public\\.'+sig+' to service_role;'),sig);
  }
});

test('migration: adding a trainee never reactivates or renames an existing member',()=>{
  const start=MIGRATION.indexOf('create or replace function public.add_ragwan_trainee_by_member_no(');
  const body=MIGRATION.slice(start,MIGRATION.indexOf('$$;',start));
  assert.doesNotMatch(body,/active\s*=\s*true\s*(,|\n|where)/i,'must not set active = true on members');
  assert.match(body,/if local_member\.active is distinct from true then\s*raise exception/);
  assert.match(body,/if trim\(coalesce\(local_member\.name,''\)\) = '' then\s*update public\.members\s*set name = target_dxn\.member_name/);
  assert.ok(fs.existsSync(path.join(ROOT,'supabase','pending-review','20261011120000_ragwan_leader_trainer_access.ROLLBACK.md')),'rollback plan must ship with the file');
});
