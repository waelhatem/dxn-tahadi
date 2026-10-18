'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Normalize line endings so the structural checks also pass on Windows checkouts (core.autocrlf=true).
const page=fs.readFileSync(path.join(root,'app/index.html'),'utf8').replace(/\r\n/g,'\n');
const read=x=>fs.readFileSync(path.join(root,x),'utf8').replace(/\r\n/g,'\n');
test('all inline scripts in the actual app HTML parse successfully',()=>{
 const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
   .filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
 assert.ok(scripts.length>=5);
 scripts.forEach((code,i)=>assert.doesNotThrow(()=>new vm.Script(code,{filename:'app-inline-'+i+'.js'})));
});
test('main-targeted basic training scripts are loaded once',()=>{
 // basic-training.js follows the engine's cache version (checked in unified-training-layout.test.js).
 assert.equal((page.match(/<script src="\.\.\/basic-training\.js\?v=[\w-]+"><\/script>/g)||[]).length,1,'basic-training.js loaded once');
 const deps=['../basic-training.css?v=20261014-onequestion','../unified-training-ui.css?v=20261015-unified',
  '../basic-training-member-profile.js?v=20261015-engine','../basic-training-leader-profile.js?v=20261015-engine',
  '../basic-training-admin.js?v=20261014-uistate'];
 deps.forEach(src=>assert.equal(page.split(src).length-1,1,src));
 assert.doesNotMatch(page,/<script[^>]+src=["'][^"']*training-name-list\.js/);
});
test('member and leader navigation do not overlap or expose editor to member',()=>{
 assert.match(page,/role==='member'&&me\?[^;]{0,260}basic_training_profile/);
 assert.match(page,/role==='leader'\?[^;]{0,260}basic_training_admin/);
 assert.match(page,/next==='basic_training_profile'&&\(role!=='member'\|\|!me\)/);
 assert.match(page,/next==='basic_training_admin'&&role!=='leader'/);
 assert.match(page,/tab==='basic_training_profile'&&role==='member'&&me/);
 assert.match(page,/tab==='basic_training_admin'&&role==='leader'/);
});
test('basic training is independent of existing Ragwan and old lessons',()=>{
 assert.match(page,/function basicTrainingPage\(\)/);
 assert.match(page,/trainingSubtab==='basic'/);
 assert.match(page,/switchTrainingSubtab\('basic'\)/);
 assert.match(page,/trainingSubtab==='ragwan_success_plan'/);
 assert.match(page,/loadMemberRagwanCompletions\(id\)/);
 assert.match(page,/window\.loadBasicTrainingLeaderMemberProfile\(id\)/);
 assert.match(page,/src="\.\.\/training-assessment\.js\?v=20261014-chooser-guard"/);
 assert.doesNotMatch(page,/training-name-list\.js/);
 assert.match(page,/function professionalTrainingPage\(\)/);
 const mainMenu=page.split('const subTabs=').at(-1).split('const backChoice=')[0];
 assert.equal((mainMenu.match(/onclick="switchTrainingSubtab/g)||[]).length,2,
    'Only tutorials and Ragwan are top-level choices');
 assert.doesNotMatch(mainMenu,/switchTrainingSubtab\('basic'\)/);
 const typeChooser=page.split('const trainingTypeChoices=').at(-1).split("if(trainingSubtab==='home')")[0];
 assert.equal((typeChooser.match(/onclick="switchTrainingSubtab/g)||[]).length,4,
    'Exactly basic, professional, advanced, and camps training under tutorials');
 assert.match(typeChooser,/switchTrainingSubtab\('basic'\)/);
 assert.match(typeChooser,/switchTrainingSubtab\('professional'\)/);
 assert.match(typeChooser,/switchTrainingSubtab\('advanced_training'\)/);
 assert.match(typeChooser,/switchTrainingSubtab\('training_camps'\)/);
 assert.match(page,/if\(trainingSubtab==='lessons'\)\s*\{\s*return backChoice\+trainingTypeChoices/);
 assert.match(page,/if\(trainingSubtab==='basic'\)\s*\{\s*return backToTrainingTypes\+basicTrainingPage\(\)/);
 assert.match(page,/if\(trainingSubtab==='professional'\)\s*\{\s*if\(!trainingTrackUnlocked\('professional'\)\)return backToTrainingTypes\+trainingTypeChoices;\s*return backToTrainingTypes\+professionalTrainingPage\(\)/);
});

test('training lock preview is exclusive to primary leader, scoped to training chooser and view-only',()=>{
 const start=page.indexOf('let trainingLockPreviewMode=false');
 const end=page.indexOf('\nfunction canAccessTraining(){',start);
 assert.ok(start>0&&end>start,'training lock preview functions exist');
 const src=page.slice(start,end);
 const ownerId='5cf50c5d-d23e-499e-96b3-f71b10c4d854';
 const make=(role,userId,subtab='lessons')=>{
   const context={role,data:{user_id:userId},tab:'training',trainingSubtab:subtab,
    trainingTrackUnlocked:()=>true,trainingTrackLockReason:()=>'',render:()=>{}};
   vm.createContext(context);
   vm.runInContext(src+';this.previewTest={eligible:trainingLockPreviewEligible,active:trainingLockPreviewActive,toggle:toggleTrainingLockPreview,setStage:setTrainingLockPreviewStage,controls:trainingLockPreviewControls,unlocked:trainingTrackDisplayUnlocked};',context);
   return context.previewTest;
 };
 const leader=make('leader',ownerId);
 assert.equal(leader.eligible(),true);
 assert.match(leader.controls(),/معاينة قيود العضو/);
 assert.equal(leader.unlocked('professional'),true);
 leader.toggle();
 assert.equal(leader.active(),true);
 assert.equal(leader.unlocked('professional'),false,'new member professional locked');
 assert.equal(leader.unlocked('advanced_training'),false,'new member advanced locked');
 leader.setStage('basic_done');
 assert.equal(leader.unlocked('professional'),true);
 assert.equal(leader.unlocked('advanced_training'),false);
 leader.setStage('professional_done');
 assert.equal(leader.unlocked('advanced_training'),true);
 leader.toggle();
 assert.equal(leader.active(),false);
 assert.equal(leader.unlocked('advanced_training'),true);
 for(const denied of [make('leader','different-user'),make('member',ownerId),make('leader',ownerId,'home')]){
   assert.equal(denied.active(),false);
   denied.toggle();
   assert.equal(denied.active(),false);
 }
 assert.equal(make('leader','different-user').controls(),'');
 assert.equal(make('member',ownerId).controls(),'');
 const topTabs=page.slice(page.indexOf('function render(){'),page.indexOf('const DXN_LEVELS='));
 assert.doesNotMatch(topTabs,/toggleTrainingLockPreview/,'global navigation contains no preview button');
 assert.match(page,/if\(trainingLockPreviewActive\(\)&&\['basic','professional','advanced_training'\]\.includes\(next\)\)/);
});

test('no previous direct public answer-key resources appear in clean branch',()=>{
 assert.equal(fs.existsSync(path.join(root,'basic-training-quiz1.js')),false);
 assert.equal(fs.existsSync(path.join(root,'basic-training-01-quiz.json')),false);
 assert.equal(fs.existsSync(path.join(root,'basic-training-02-quiz.json')),false);
 assert.match(read('.gitignore'),/\*\.dump/);
 assert.match(read('.gitignore'),/backups\//);
});

test('training navigation never falls through to the legacy lesson cards',()=>{
 const start=page.indexOf('function trainings(){');
 const end=page.indexOf('\n}\n\nfunction youtubeEmbed',start);
 assert.ok(start>=0&&end>start,'training section not found');
 const source=page.slice(start,end+2);
 const evaluate=new Function('trainingData','trainingSubtab','role','basicTrainingPage','professionalTrainingPage','ragwanSuccessIntro','canAccessTraining','esc',
   'trainingTrackUnlocked','trainingTrackLockReason','memberTrainingAccess','memberTrainingExempt','token','setTimeout',
   'trainingTrackDisplayUnlocked','trainingTrackDisplayReason','trainingLockPreviewControls',
   source+'\nreturn trainings();');
 const history={lessons:[{id:123,lesson_no:1,title:'LEGACY_MARKER_DO_NOT_RENDER',reward_stars:10}],my_progress:[]};
 const exec=(state,{pro=true,adv=true}={})=>evaluate(history,state,'member',
   ()=>'<h1>BASIC_TRACK</h1>',()=>'<h1>PROF_TRACK</h1>',()=>'<h1>RAGWAN_TRACK</h1>',()=>true,x=>x,
   track=>track==='professional'?pro:track==='advanced_training'?adv:true,
   track=>'🔒 أكمل التدريب السابق أولًا', {session:'test-session'},()=>false,'test-session',()=>{},
   track=>track==='professional'?pro:track==='advanced_training'?adv:true,
   track=>'🔒 أكمل التدريب السابق أولًا',()=> '');

 const root=exec('home');
 assert.match(root,/switchTrainingSubtab\('lessons'\)/);
 assert.match(root,/switchTrainingSubtab\('ragwan_success_plan'\)/);
 assert.doesNotMatch(root,/switchTrainingSubtab\('basic'\)/);
 const menu=exec('lessons');
 assert.match(menu,/switchTrainingSubtab\('basic'\)/);
 assert.match(menu,/switchTrainingSubtab\('professional'\)/);
 assert.match(exec('basic'),/BASIC_TRACK/);
 assert.match(exec('professional'),/PROF_TRACK/);
 assert.doesNotMatch(exec('professional',{pro:false}),/PROF_TRACK/,'locked professional track is never rendered');
 assert.match(exec('lessons',{pro:false,adv:false}),/disabled aria-disabled="true"/);
 assert.doesNotMatch(exec('advanced_training',{pro:true,adv:false}),/advancedFinancialCoursePage/);
 assert.match(exec('ragwan_success_plan'),/RAGWAN_TRACK/);
 for(const state of ['home','lessons','basic','professional','old','legacy','unexpected']){
  const result=exec(state);
  assert.doesNotMatch(result,/LEGACY_MARKER_DO_NOT_RENDER/,state);
  if(['old','legacy','unexpected'].includes(state)){
   assert.match(result,/switchTrainingSubtab\('basic'\)/);
   assert.match(result,/switchTrainingSubtab\('professional'\)/);
  }
 }
});


test('old 80-question assessment must never inject into the approved training chooser',()=>{
 const legacy=read('training-assessment.js');
 const start=legacy.indexOf('  function lessonsHost(){');
 const end=legacy.indexOf('  function anchorForMember(host){',start);
 assert.ok(start>=0&&end>start,'legacy host resolution found');
 const source=legacy.slice(start,end);
 const getHost=new Function('tab','trainingSubtab','document',source+'\nreturn lessonsHost();');
 const chooser={
   querySelector(selector){
      if(selector==='#trainingKindChoices')return {};
      if(selector==='#trainingLessonsStart')return null;
      return null;
   }
 };
 const oldCards={querySelector(selector){
   if(selector==='#trainingKindChoices')return null;
   if(selector==='#trainingLessonsStart')return {};
   return null;
 }};
 const doc=host=>({getElementById(id){return id==='section-training'?host:null;}});
 assert.equal(getHost('training','lessons',doc(chooser)),null,'new chooser must remain free of old 80-question assessment');
 assert.equal(getHost('training','basic',doc(oldCards)),null,'official basic exams only');
 assert.equal(getHost('training','professional',doc(oldCards)),null,'professional exams only');
 assert.equal(getHost('training','lessons',doc({querySelector:()=>null})),null,'no fallback when old cards absent');
 assert.equal(getHost('home','lessons',doc(oldCards)),null,'not outside training');
 assert.equal(getHost('training','lessons',doc(oldCards)),oldCards,'legacy cards remain supported when explicitly present');
 assert.match(page,/training-assessment\.js\?v=20261014-chooser-guard/,'force a fresh guarded script');
});
