'use strict';
// Acceptance tests for the opt-in video-resume endpoint. Legacy scenarios remain
// covered by training-engine.test.js with the old backend behaviour.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {setup}=require('./helpers/training-harness');
const {TRACKS}=require('./helpers/training-tracks');

for(const [track,T] of Object.entries(TRACKS)){
  test(track+': resume a partial watch after leaving the course',async()=>{
    const env=setup({resumeEnabled:true});
    await T.mount(env);await T.start(env,1);
    await env.play(65);
    const first=Object.values(env.server.attempts).filter(a=>a.track===track).at(-1);
    assert.ok(first.watched>45,'server confirms a substantial partial watch');
    assert.equal(T.quizOpen(env),false);
    env.host.innerHTML='';
    env.advance(24*3600*1000);
    await T.mount(env);await T.start(env,1);
    await env.play(first.watched+12);
    const second=Object.values(env.server.attempts).filter(a=>a.track===track).at(-1);
    assert.notEqual(first.id,second.id);
    assert.ok(second.watched>first.watched,'the new attempt continues from the verified second');
    assert.ok(env.players.at(-1).t>=first.watched,'the YouTube player seeks to the saved second');
    assert.equal(T.quizOpen(env),false,'watching 90% is still required to take the quiz');
  });
  test(track+': another member cannot inherit the saved position',async()=>{
    const env=setup({resumeEnabled:true});
    await T.mount(env);await T.start(env,1);await env.play(40);
    env.setSession('member-b');
    env.host.innerHTML='';await T.mount(env);await T.start(env,1);
    await env.play(8);
    const newest=Object.values(env.server.attempts).filter(a=>a.track===track).at(-1);
    assert.equal(newest.tok,'member-b');
    assert.ok(newest.watched<15,'no watched seconds were imported from member A');
    assert.equal(T.quizOpen(env),false);
  });
}

for(const [track,T] of Object.entries(TRACKS)){
 test(track+': completed 90% can resume the final minute without losing the quiz',async()=>{
  const env=setup({resumeEnabled:true});
  env.server.row('member-a',track,1).completed=true;
  await T.mount(env);await T.start(env,1);await env.play(20);
  const p=env.players.at(-1);
  const late=Math.floor(T.len(1)*0.93);
  p.t=late;env.advance(6000);env.activeTick().f();await env.flush();
  const bookmark=Object.values(env.server.bookmarks).at(-1);
  assert.ok(bookmark&&bookmark.position>=late-1,'late playback saved independently of quiz credit');
  env.host.innerHTML='';env.advance(86400000);
  await T.mount(env);await T.start(env,1);
  const resumed=env.players.at(-1);
  resumed.state=1;env.activeTick().f();await env.flush();
  assert.ok(resumed.t>=late-1,'player returns to the final minutes rather than the beginning');
  assert.equal(T.quizOpen(env),true,'saved exam access stays unchanged');
  resumed.state=0;
  resumed.opts.events.onStateChange({data:0});
  await env.flush();
  assert.equal(Object.values(env.server.bookmarks).at(-1).finished,true,'ending a video resets the bookmark for an intentional replay');
 });
}

test('partial lesson: returning at the exact paused second preserves quiz restrictions',async()=>{
 const env=setup({resumeEnabled:true});
 const T=TRACKS.basic;
 await T.mount(env);await T.start(env,1);await env.play(47);
 const p=env.players.at(-1);
 const pausedAt=Math.floor(p.t);
 p.state=2;p.opts.events.onStateChange({data:2});await env.flush();
 const first=Object.values(env.server.attempts).at(-1);
 assert.ok(first.watched>30 && first.watched<=pausedAt);
 const before=Object.values(env.server.bookmarks).at(-1);
 assert.equal(before.position,pausedAt);
 env.host.innerHTML='';env.advance(24*3600*1000);
 await T.mount(env);await T.start(env,1);
 const newPlayer=env.players.at(-1);
 newPlayer.state=1;env.activeTick().f();await env.flush();
 assert.equal(newPlayer.t,pausedAt,'returns to the paused second, including seconds beyond the last report');
 assert.equal(T.quizOpen(env),false,'bookmark does not bypass 90% condition');
});

test('database migration preserves authenticated track gating and only matches the same video',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase/pending-review/20261117_training_watch_resume.sql'),'utf8');
  assert.match(sql,/public.training_watch_begin\(p_token,p_track,p_lesson_no\)/);
  assert.match(sql,/public.app_current_user_id\(p_token\)/);
  assert.match(sql,/user_id=v_user[\s\S]+track=p_track[\s\S]+lesson_no=p_lesson_no/);
  assert.match(sql,/expected_seconds=v_duration/);
  assert.match(sql,/source_video_id=v_video/);
  assert.match(sql,/watched_seconds\*100 < expected_seconds\*90/);
  assert.doesNotMatch(sql,/UPDATE public\.(?:basic_training_progress|advanced_financial_progress|professional_training_progress)/);
});

test('closing a playing video sends both bookmarks and verified progress with keepalive',async()=>{
 const env=setup({resumeEnabled:true,scripts:['training-engine.js']});
 const watcher=env.ctx.DXNTrainingEngine.createWatch({track:'basic',lessonNo:1,watchCompleted:false});
 const p=new env.ctx.YT.Player('checkpoint-player',{videoId:'lxhnkUov9sE',events:{}});
 const fetch=env.ctx.fetch;
 const keepalive=[];
 env.ctx.fetch=(url,options)=>{
  if(options.keepalive)keepalive.push(JSON.parse(options.body));
  return fetch(url,options);
 };
 watcher.attach(p);
 await env.play(38,{player:p});
 assert.ok(env.server.attempts[Object.keys(env.server.attempts).at(-1)].watched>20);
 p.state=2;p.t+=0.5;
 watcher.onState(2);
 watcher.stop();
 await env.flush();
 assert.ok(keepalive.some(x=>x.fn==='training_video_bookmark'),'final bookmark survives route change');
 assert.ok(keepalive.some(x=>x.fn==='training_watch_report'),'final verified position survives route change');
 const last=Object.values(env.server.bookmarks).at(-1);
 assert.ok(last.position>=38,'saves latest playback second before releasing the player');
});
test('training interface does not promise fresh 0-based session after activating resume',()=>{
 for(const file of ['basic-training.js','professional-training-course.js','advanced-financial-training.js']){
  const text=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(text,/إعادة المشاهدة من البداية|المشاهدة غير المكتملة لا تُحفظ بين الجلسات|في جلسة واحدة أولًا/);
 }
 const engine=fs.readFileSync(path.join(__dirname,'..','training-engine.js'),'utf8');
 assert.match(engine,/pagehideBookmark\(\); \/\/ final keepalive checkpoint/);
 assert.match(engine,/استعادة موضع الفيديو غير مفعّلة/);
});
