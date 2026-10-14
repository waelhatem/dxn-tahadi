#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','basic-training-leader-profile.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',
 '20261013_basic_training_leader_member_profile.sql'),'utf8');
assert.ok(html.includes('src="../basic-training-leader-profile.js?v=1"'));
assert.ok(html.includes('window.loadBasicTrainingLeaderMemberProfile(id)'));
assert.ok(sql.includes("u.role='leader'"));
assert.ok(sql.includes('public.basic_training_progress'));
assert.ok(sql.includes('public.basic_training_attempts'));
const member='c2af719c-8dd5-480f-ab06-6ab0f7387abc';
function instance(role){
 let root,requestCount=0;
 const parent={insertBefore(el){root=el;},appendChild(el){root=el;}};
 const modal={querySelector:query=>query==='.command-actions'?{parentNode:parent}:
   query==='.evidence-modal'?parent:null};
 const response={member_id:member,account_linked:true,passed:1,average_watch_percent:47,
   lessons:Array.from({length:8},(_,i)=>({training_no:i+1,title:'التدريب '+(i+1),
    watch_percent:i===0?93:0,grade:i===0?95:null,passed:i===0,
    watch_completed:i===0,attempt_count:i===0?2:0}))};
 const sandbox={
   role,window:{},console,localStorage:{getItem:()=> 'test-session'},
   document:{getElementById:id=>id==='memberProfileModal'?modal:null,
    createElement:()=>({style:{},innerHTML:'',isConnected:true})},
   fetch:async(_url,options)=>{requestCount++;
    assert.equal(JSON.parse(options.body).args.p_member_id,member);
    return {ok:true,json:async()=>response};}
 };
 vm.runInNewContext(source,sandbox,{filename:'basic-training-leader-profile.js'});
 return {sandbox,root:()=>root,calls:()=>requestCount};
}
async function main(){
 const leader=instance('leader');
 await leader.sandbox.window.loadBasicTrainingLeaderMemberProfile(member);
 assert.equal(leader.calls(),1);
 assert.equal((leader.root().innerHTML.match(/🎬 نسبة المشاهدة/g)||[]).length,8);
 assert.match(leader.root().innerHTML,/95 من 100/);
 assert.match(leader.root().innerHTML,/93%/);
 assert.match(leader.root().innerHTML,/✅ مجتاز/);
 const memberSession=instance('member');
 await memberSession.sandbox.window.loadBasicTrainingLeaderMemberProfile(member);
 assert.equal(memberSession.calls(),0);
 console.log('OK: leader-only member profile, 8 lessons, watch and grade from DB-shaped RPC');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
