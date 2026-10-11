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

const FUNCTIONS=['ragwanCanTrain','ragwanIsReadOnlyLeader','ragwanCanManageContent','ragwanJourneyVisible','ragwanTraineeLabel','ragwanSelectedKey','ragwanProgressLoad',
  'ragwanSelectedTraineeSummary','ragwanTraineePanelMarkup','ragwanStartStep','ragwanCompleteStep','ragwanCanCompleteStep'];

function makePage({role,me,selected,canManage}){
  const apiCalls=[];const toasts=[];
  const ctx={
    role,me,
    ragwanLeaderCanManage:canManage===undefined?(role==='leader'?true:null):canManage,
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
  // فرع العضو كما كان؛ شرط القائد المشدد (جذر فريق صالح) له اختبار مستقل.
  assert.match(MIGRATION,/\(au\.role='member' and m\.id is not null and m\.active=true\)/);
  assert.match(MIGRATION,/v_sponsor_member_no := public\.ragwan_current_trainer_root_no\(p_token\)/);
  assert.match(MIGRATION,/team_root_member_no/);
  assert.doesNotMatch(MIGRATION,/\b(drop table|truncate|delete from|alter table)\b/i);
  // كل دوال رجوان الأخرى تربط الملكية بـ sponsor_user_id، والبحث للقائد محصور في سجلاته.
  assert.match(MIGRATION,/where e\.sponsor_user_id=s\.user_id\s+and e\.archived_at is null/);
  assert.ok(!fs.existsSync(path.join(ROOT,'supabase','migrations','20261011120000_ragwan_leader_trainer_access.sql')),'must not be in supabase/migrations');
});

test('read-only leader (no team root): doors visible, read-only notice, no trainee or content management',()=>{
  const ro=makePage({role:'leader',me:null,canManage:false});
  assert.equal(ro.api.ragwanJourneyVisible(),true);
  assert.equal(ro.api.ragwanCanTrain(),false);
  assert.equal(ro.api.ragwanCanManageContent(),false);
  const html=ro.api.ragwanTraineePanelMarkup();
  assert.match(html,/وضع المطالعة/);
  assert.doesNotMatch(html,/ragwanTraineeMemberNoInput|ragwanOpenTraineesTable/);
});

test('leader capability unknown yet: no management until the server confirms it',()=>{
  const pending=makePage({role:'leader',me:null,canManage:null});
  assert.equal(pending.api.ragwanCanTrain(),false);
  assert.equal(pending.api.ragwanCanManageContent(),false);
  assert.equal(pending.api.ragwanTraineePanelMarkup(),'');
});

test('UI gates content management and evidence on the server capability, not on role alone',()=>{
  assert.match(HTML,/const leaderUpload=ragwanCanManageContent\(\)/);
  assert.match(HTML,/ragwanCanManageContent\(\)\?`<button type="button" onclick="ragwanDeleteFile\(/);
  assert.match(extractFunction('ragwanLoadEvidence'),/ragwanIsReadOnlyLeader\(\)/);
  assert.match(extractFunction('initRagwanFiles'),/await ragwanLoadCapabilities\(\);/);
});

test('migration: leader is a training manager only with a valid team root, with no substitute number',()=>{
  assert.match(MIGRATION,/or \(au\.role='leader' and coalesce\(trim\(au\.team_root_member_no\),''\) ~ '\^\[0-9\]\{9\}\$'\)/);
  const root=MIGRATION.slice(MIGRATION.indexOf('function public.ragwan_current_trainer_root_no('),MIGRATION.indexOf('$$;',MIGRATION.indexOf('function public.ragwan_current_trainer_root_no(')));
  assert.doesNotMatch(root,/coalesce\(nullif\(v_root,''\),v_member_no\)/,'no fallback to a linked member number');
  assert.match(MIGRATION,/create or replace function public\.ragwan_leader_can_manage_training\(p_token uuid\)/);
});

test('migration: built on the Production state and refuses to run on any other',()=>{
  // Production has no completions/content functions; the file must not create them and must stop if they appear.
  assert.doesNotMatch(MIGRATION,/create or replace function public\.(get_ragwan_plan_completions|save_ragwan_success_plan_content)\(/);
  assert.doesNotMatch(MIGRATION,/_base\b/,'no wrapper of a function that does not exist');
  const pre=MIGRATION.slice(MIGRATION.indexOf('do $preconditions$'),MIGRATION.indexOf('$preconditions$;'));
  assert.ok(MIGRATION.indexOf('do $preconditions$')<MIGRATION.indexOf('create or replace function'),'preconditions run before any change');
  assert.match(pre,/p\.proname in \('get_ragwan_plan_completions','save_ragwan_success_plan_content'\)/);
  for(const fn of ['add_ragwan_trainee_by_member_no','archive_ragwan_trainee','get_ragwan_training_progress','list_ragwan_trainees','record_ragwan_plan_completion_for_member','save_ragwan_training_step','select_ragwan_trainee','update_ragwan_trainee_display_name'])
    assert.ok(pre.includes(`'${fn}'`),fn);
});

test('migration: the 8 trainee functions become server-only without touching their bodies',()=>{
  const sec=MIGRATION.slice(MIGRATION.indexOf('do $trainee_grants$'),MIGRATION.indexOf('$trainee_grants$;'));
  assert.match(sec,/revoke all on function %s from public, anon, authenticated/);
  assert.match(sec,/grant execute on function %s to service_role/);
  for(const fn of ['archive_ragwan_trainee','get_ragwan_training_progress','list_ragwan_trainees','record_ragwan_plan_completion_for_member','save_ragwan_training_step','select_ragwan_trainee','update_ragwan_trainee_display_name'])
    assert.doesNotMatch(MIGRATION,new RegExp('create or replace function public\\.'+fn+'\\('),fn);
  // The browser never calls them directly; only api/ragwan-files.js does, with the secret key.
  for(const fn of ['add_ragwan_trainee_by_member_no','list_ragwan_trainees','select_ragwan_trainee','save_ragwan_training_step','get_ragwan_training_progress'])
    assert.doesNotMatch(HTML,new RegExp("rpc\\(['\"]"+fn),fn);
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
  assert.doesNotMatch(body,/update public.members/i,'must not update any existing member row');
  assert.ok(fs.existsSync(path.join(ROOT,'supabase','pending-review','20261011120000_ragwan_leader_trainer_access.ROLLBACK.md')),'rollback plan must ship with the file');
  // A new trainee's team comes only from the trainee's own DXN chain (leader) or the sponsor (member); never guessed.
  assert.match(body,/select d\.depth, d\.path\s+into found_depth, found_path/);
  assert.match(body,/if v_sponsor_role = 'member' then\s+v_team_id := sponsor_row\.team_id;/);
  assert.match(body,/from unnest\(found_path\) with ordinality as chain\(member_no, ord\)/);
  assert.match(body,/values\(normalized_no, target_dxn\.member_name, v_team_id, true\)/);
  assert.match(MIGRATION,/ic\.column_name='team_id' and ic\.is_nullable='NO'/,'stop if team_id is mandatory');
  assert.match(MIGRATION,/to_regprocedure\('public\.app_current_user_id\(uuid\)'\) is null/,'app_current_user_id is a precondition');
});
