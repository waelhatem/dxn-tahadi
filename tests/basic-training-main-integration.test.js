'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('all inline scripts in the actual app HTML parse successfully',()=>{
 const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
   .filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
 assert.ok(scripts.length>=5);
 scripts.forEach((code,i)=>assert.doesNotThrow(()=>new vm.Script(code,{filename:'app-inline-'+i+'.js'})));
});
test('main-targeted basic training scripts are loaded once',()=>{
 const deps=['../basic-training.css?v=1','../basic-training.js?v=1',
  '../basic-training-member-profile.js?v=1','../basic-training-leader-profile.js?v=1',
  '../basic-training-admin.js?v=1'];
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
 assert.match(page,/src="\.\.\/training-assessment\.js"/);
 assert.doesNotMatch(page,/training-name-list\.js/);
 assert.match(page,/function professionalTrainingPage\(\)/);
 const mainMenu=page.split('const subTabs=').at(-1).split('const backChoice=')[0];
 assert.equal((mainMenu.match(/onclick="switchTrainingSubtab/g)||[]).length,2,
    'Only tutorials and Ragwan are top-level choices');
 assert.doesNotMatch(mainMenu,/switchTrainingSubtab\('basic'\)/);
 const typeChooser=page.split('const trainingTypeChoices=').at(-1).split("if(trainingSubtab==='home')")[0];
 assert.equal((typeChooser.match(/onclick="switchTrainingSubtab/g)||[]).length,2,
    'Exactly basic and professional training under tutorials');
 assert.match(typeChooser,/switchTrainingSubtab\('basic'\)/);
 assert.match(typeChooser,/switchTrainingSubtab\('professional'\)/);
 assert.match(page,/if\(trainingSubtab==='lessons'\)\s*\{\s*return backChoice\+trainingTypeChoices/);
 assert.match(page,/if\(trainingSubtab==='basic'\)\s*\{\s*return backToTrainingTypes\+basicTrainingPage\(\)/);
 assert.match(page,/if\(trainingSubtab==='professional'\)\s*\{\s*return backToTrainingTypes\+professionalTrainingPage\(\)/);
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
   source+'\nreturn trainings();');
 const history={lessons:[{id:123,lesson_no:1,title:'LEGACY_MARKER_DO_NOT_RENDER',reward_stars:10}],my_progress:[]};
 const exec=state=>evaluate(history,state,'member',()=>'<h1>BASIC_TRACK</h1>',()=>'<h1>PROF_TRACK</h1>',()=>'<h1>RAGWAN_TRACK</h1>',()=>true,x=>x);
 const root=exec('home');
 assert.match(root,/switchTrainingSubtab\('lessons'\)/);
 assert.match(root,/switchTrainingSubtab\('ragwan_success_plan'\)/);
 assert.doesNotMatch(root,/switchTrainingSubtab\('basic'\)/);
 const menu=exec('lessons');
 assert.match(menu,/switchTrainingSubtab\('basic'\)/);
 assert.match(menu,/switchTrainingSubtab\('professional'\)/);
 assert.match(exec('basic'),/BASIC_TRACK/);
 assert.match(exec('professional'),/PROF_TRACK/);
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
