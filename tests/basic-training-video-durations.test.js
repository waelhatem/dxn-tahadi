'use strict';
// The server measures 90% watch against the stored video duration. A stored value longer than the real
// video means a full watch never reaches 90%; one off by more than 15% makes every watch update fail.
// Real durations below were read from YouTube on 2026-10-15.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');

const YOUTUBE_SECONDS={lxhnkUov9sE:503,K_N80xZlxXw:439,n7W9LoCMdPo:1363,AMKtcQt8ltc:707,
  Wa_Kp2U7x0E:851,G09ztpXOBBM:1474,kYJjJu2JQFI:450,'v4gYSL-KuHQ':993};

function seedLessons(){
  const src=read('scripts/prepare-private-basic-training-bank.js');
  return [...src.matchAll(/\['[^']+','([A-Za-z0-9_-]{11})',(\d+)\]/g)].map(m=>({video:m[1],seconds:Number(m[2])}));
}

test('every stored duration lets a full watch reach 90% and passes the server range check',()=>{
  const seed=seedLessons();
  assert.equal(seed.length,8);
  seed.forEach((l,i)=>{
    const real=YOUTUBE_SECONDS[l.video];
    assert.ok(real,'training '+(i+1)+' has a verified duration');
    assert.ok(real*100>=l.seconds*90+100,'training '+(i+1)+': a full watch ('+real+' s) must clear 90% of '+l.seconds+' s');
    assert.ok(real>=l.seconds*0.85&&real<=l.seconds*1.15,'training '+(i+1)+': real duration within the server tolerance');
  });
});

test('seed videos are the ones the member page plays, in the same order',()=>{
  const page=[...read('basic-training.js').matchAll(/\{no:(\d),title:'[^']+',video:'([A-Za-z0-9_-]{11})'\}/g)].map(m=>m[2]);
  assert.deepEqual(seedLessons().map(l=>l.video),page);
});

test('pending production fix uses the same values and only updates rows',()=>{
  const sql=read('supabase/pending-review/20261015120000_basic_training_fix_video_durations.sql');
  const seed=seedLessons();
  for(const [no,video,old,real] of [[2,'K_N80xZlxXw',503,439],[6,'G09ztpXOBBM',838,1474],[7,'kYJjJu2JQFI',1175,450]]){
    assert.match(sql,new RegExp("\\("+no+",'"+video+"',"+old+","+real+"\\)"));
    assert.equal(seed[no-1].seconds,real);
  }
  const code=sql.replace(/--.*$/gm,'');
  assert.doesNotMatch(code,/^\s*(DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION)\b/im);
  // Unified engine policy: correcting a duration never grants (or removes) a watch completion.
  assert.doesNotMatch(code,/watch_completed\s*=/i,'no completion granted from earlier watch time');
  assert.doesNotMatch(code,/SET[^;]*\b(passed|best_score|watch_seconds|watch_completed)\s*=/i,'scores, passes, completions and watch time are not modified');
});
