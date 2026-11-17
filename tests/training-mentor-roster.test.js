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
 assert.match(index,/training-mentor-roster\.js\?v=20261117-mentors5/);
 assert.match(index,/training-mentor-roster\.css\?v=20261117-mentors5/);
 assert.match(index,/التدريب والمتابعة/);
 assert.match(js,/الأعضاء الذين أتابعهم — تقدم التدريبات/);
 assert.doesNotMatch(js,/متدربوني/);
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
 assert.match(sql,/status<>'declined'/);
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

test('an occupied trainee is named but cannot be added by another trainer',async()=>{
 const nodes={
  trainingMentorRoster:{isConnected:true},
  trainingMentorNumber:{value:'823456789'},
  trainingMentorName:{value:''},
  trainingMentorAddButton:{disabled:true},
  trainingMentorMessage:{textContent:'',style:{}}
 };
 let scheduled;
 const ctx={window:{},document:{getElementById:id=>nodes[id]||null},console,
  localStorage:{getItem:()=> 'trainer-session'},
  setTimeout:cb=>{scheduled=cb;return 1;},clearTimeout:()=>{},
  fetch:async()=>({ok:true,json:async()=>({
   member_no:'823456789',name:'عضو قيد التدريب',assignment_status:'occupied'
  })})};
 vm.runInNewContext(js,ctx,{filename:'training-mentor-roster.js'});
 ctx.window.trainingMentorInput();
 await scheduled();
 assert.equal(nodes.trainingMentorName.value,'عضو قيد التدريب');
 assert.equal(nodes.trainingMentorAddButton.disabled,true);
 assert.match(nodes.trainingMentorMessage.textContent,/المتدرب تحت التدريب لدى مدرب آخر/);
});

test('the same trainer does not add an existing trainee twice',async()=>{
 const nodes={
  trainingMentorRoster:{isConnected:true},
  trainingMentorNumber:{value:'823456789'},
  trainingMentorName:{value:''},
  trainingMentorAddButton:{disabled:true},
  trainingMentorMessage:{textContent:'',style:{}}
 };
 let scheduled;
 const ctx={window:{},document:{getElementById:id=>nodes[id]||null},console,
  localStorage:{getItem:()=> 'trainer-session'},
  setTimeout:cb=>{scheduled=cb;return 1;},clearTimeout:()=>{},
  fetch:async()=>({ok:true,json:async()=>({
   member_no:'823456789',name:'عضو مضاف مسبقًا',assignment_status:'mine',own_status:'approved'
  })})};
 vm.runInNewContext(js,ctx,{filename:'training-mentor-roster.js'});
 ctx.window.trainingMentorInput();
 await scheduled();
 assert.equal(nodes.trainingMentorName.value,'عضو مضاف مسبقًا');
 assert.equal(nodes.trainingMentorAddButton.disabled,true);
 assert.match(nodes.trainingMentorMessage.textContent,/مضاف بالفعل/);
});

test('one trainer per trainee is guaranteed at database level including concurrent requests and approvals',()=>{
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261117194500_training_mentor_one_active_trainer.sql'),'utf8');
 assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS training_mentor_one_active_trainer_idx/);
  assert.ok(migration.includes('ON public.training_mentor_trainees (trainee_member_no)'));
  assert.ok(migration.includes("WHERE status IN ('pending','approved')"));
 assert.match(migration,/IF v_assignment='occupied' THEN/);
 assert.match(migration,/EXCEPTION WHEN unique_violation THEN/g);
 assert.match(migration,/المتدرب تحت التدريب لدى مدرب آخر/);
 assert.match(migration,/assignment_status/);
 assert.match(migration,/v_assignment='mine'/);
 for(const table of ['basic_training_progress','professional_training_progress','advanced_financial_progress',
  'basic_training_attempts','professional_training_attempts','advanced_financial_attempts']){
   assert.ok(!migration.includes('INSERT INTO public.'+table) && !migration.includes('UPDATE public.'+table) && !migration.includes('DELETE FROM public.'+table));
 }
});

test('member cannot add own membership number even before server lookup',async()=>{
 const nodes={
  trainingMentorRoster:{isConnected:true},
  trainingMentorNumber:{value:'823456789'},
  trainingMentorName:{value:''},
  trainingMentorAddButton:{disabled:true},
  trainingMentorMessage:{textContent:'',style:{}}
 };
 let requests=0,scheduled=0;
 const ctx={window:{},me:{member_no:'823456789'},console,
  document:{getElementById:id=>nodes[id]||null},
  localStorage:{getItem:name=>name==='dxn_session'?'session':'823456789'},
  setTimeout:()=>{scheduled++;return 1;},clearTimeout:()=>{},
  fetch:async()=>{requests++;throw Error('self addition must not call the server');}};
 vm.runInNewContext(js,ctx,{filename:'training-mentor-roster.js'});
 ctx.window.trainingMentorInput();
 assert.equal(scheduled,0);
 assert.equal(requests,0);
 assert.equal(nodes.trainingMentorName.value,'');
 assert.equal(nodes.trainingMentorAddButton.disabled,true);
 assert.match(nodes.trainingMentorMessage.textContent,/لا يمكن إضافة رقم عضويتك/);
 assert.match(nodes.trainingMentorMessage.textContent,/سجلي التدريبي الشخصي/);
 await ctx.window.trainingMentorAdd({preventDefault(){}});
 assert.equal(requests,0);
 assert.equal(nodes.trainingMentorAddButton.disabled,true);
});

test('member can view own training results independently of mentoring list',()=>{
 const attrs={'aria-selected':'false'};
 let scrolled=false,selected=[],reloaded=0;
 const results={querySelector:()=>({getAttribute:name=>attrs[name]}),scrollIntoView:()=>{scrolled=true;}};
 const ctx={window:{
   trainingResultsChoose:(scope,track)=>selected.push([scope,track]),
   basicTrainingLoadMemberPage:()=>reloaded++
  },console,document:{getElementById:id=>id==='memberTrainingResultsSwitcher'?results:null},
  localStorage:{getItem:()=>null},setTimeout:()=>0};
 vm.runInNewContext(js,ctx,{filename:'training-mentor-roster.js'});
 const html=ctx.window.trainingMentorRosterHtml();
 assert.match(html,/عرض سجلي التدريبي الشخصي/);
 assert.match(html,/trainingMentorShowMyResults/);
 ctx.window.trainingMentorShowMyResults();
 assert.equal(scrolled,true);
 assert.equal(reloaded,1);
 assert.deepEqual(JSON.parse(JSON.stringify(selected)),[['member','basic']]);
 assert.match(switcher,/shell\('member'/);
});

test('database denies self-enrollment in live-bound mentor lookup and add',()=>{
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261117194500_training_mentor_one_active_trainer.sql'),'utf8');
 assert.ok(migration.includes("IF v_no=v_own_no THEN RAISE EXCEPTION 'لا يمكنك إضافة عضويتك"));
 assert.ok(migration.includes("public.training_mentor_lookup(p_token,p_member_no)"));
 assert.ok(js.includes('isOwnMemberNo(no)'));
});
