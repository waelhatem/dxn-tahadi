'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'training-mentor-roster.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/pending-review/20261117_training_mentor_roster.sql'),'utf8');
const switcher=fs.readFileSync(path.join(root,'training-results-switcher.js'),'utf8');
const index=fs.readFileSync(path.join(root,'app/index.html'),'utf8');

test('mentor interface is mounted only inside the existing member training profile',()=>{
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'training-mentor-roster.js'}));
 assert.match(index,/training-mentor-roster\.js\?v=20261117-mentors1/);
 assert.match(index,/training-mentor-roster\.css\?v=20261117-mentors1/);
 assert.match(index,/التدريب والمتابعة/);
 assert.match(switcher,/trainingMentorRosterHtml\?\.\(\)/);
 assert.match(switcher,/return \(window\.trainingMentorRosterHtml/);
});

test('membership number resolves name asynchronously, then enables add',async()=>{
 const nodes={
  trainingMentorRoster:{isConnected:true},
  trainingMentorNumber:{value:'830530967'},
  trainingMentorName:{value:''},
  trainingMentorAddButton:{disabled:true},
  trainingMentorMessage:{textContent:'',style:{}}
 };
 let scheduled,fn='',args;
 const ctx={window:{},document:{getElementById:id=>nodes[id]||null},console,
  localStorage:{getItem:()=> 'member-session'},
  setTimeout:cb=>{scheduled=cb;return 1;},clearTimeout:()=>{},
  fetch:async(url,opts)=>{
   const payload=JSON.parse(opts.body);fn=payload.fn;args=payload.args;
   return {ok:true,json:async()=>({member_no:args.p_member_no,name:'متدرب تجريبي'})};
  }};
 vm.runInNewContext(js,ctx,{filename:'training-mentor-roster.js'});
 const html=ctx.window.trainingMentorRosterHtml();
 assert.match(html,/اسم المتدرب — يُملأ تلقائيًا/);
 assert.match(html,/trainingMentorAdd/);
 assert.match(html,/trainingMentorRequests/);
 ctx.window.trainingMentorInput();
 await scheduled();
 assert.equal(fn,'training_mentor_lookup');
 assert.equal(args.p_member_no,'830530967');
 assert.equal(args.p_token,'member-session');
 assert.equal(nodes.trainingMentorName.value,'متدرب تجريبي');
 assert.equal(nodes.trainingMentorAddButton.disabled,false);
 nodes.trainingMentorNumber.value='123';
 ctx.window.trainingMentorInput();
 assert.equal(nodes.trainingMentorName.value,'');
 assert.equal(nodes.trainingMentorAddButton.disabled,true);
});

test('mentor permission is server-side and restricted to own roster, with trainee opt-in/revocation',()=>{
 assert.match(sql,/app_current_user_id\(p_token\)/);
 assert.match(sql,/role='member'/);
 assert.match(sql,/r\.trainer_user_id=v_trainer AND r\.trainee_member_no=v_no AND r\.status='approved'/);
 assert.match(sql,/WITH RECURSIVE descendants/);
 assert.match(sql,/p_approve boolean/);
 assert.match(sql,/status='declined'/);
 assert.match(sql,/trainee_member_no=v_member_no/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.training_mentor_trainees FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.training_mentor_lookup/);
});

test('mentor reads existing basic, professional and advanced progress; never mutates them',()=>{
 for(const table of ['basic_training_progress','professional_training_progress','advanced_financial_progress']){
  assert.match(sql,new RegExp('public[.]'+table));
 }
 for(const table of ['basic_training_progress','professional_training_progress','advanced_financial_progress',
  'basic_training_attempts','professional_training_attempts','advanced_financial_attempts']){
  assert.doesNotMatch(sql,new RegExp('(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+public\\.'+table,'i'));
 }
 assert.match(sql,/FROM public\.training_watch_attempts a/);
 assert.match(sql,/'best_score',p\.best_score/);
 assert.match(sql,/'watch_percent'/);
 assert.match(sql,/WHEN coalesce\(l\.expected_duration_seconds,0\)=0 THEN 0/g);
 assert.match(js,/training_mentor_details/);
 assert.doesNotMatch(js,/training_watch_report|training_watch_begin|submit_quiz|watch_update/);
});
