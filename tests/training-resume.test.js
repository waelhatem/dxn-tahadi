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
test('informational video bookmark helper isolates each member and every video',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','app/video-resume.js'),'utf8');
  assert.match(source,/dxn_login_no/);
  assert.match(source,/dxn_session/);
  assert.match(source,/storageKey\(user,kind,id\)/);
  assert.match(source,/loadedmetadata/);
  assert.match(source,/pagehide/);
  assert.match(source,/youtubeStart/);
  assert.match(source,/attachYouTube/);
});
