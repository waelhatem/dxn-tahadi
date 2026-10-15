'use strict';
// V86.90 — Watch reports now go through the unified training engine (training-engine.js). The same
// guarantees as the old basic heartbeat, checked on the engine: one report per 5.2 s at most, none after
// the server confirmed completion, 1x playback only. Behaviour is exercised in training-engine.test.js.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
const engine=read('training-engine.js'),basic=read('basic-training.js');
const {setup}=require('./helpers/training-harness');

test('forced reports are throttled: server-safe interval despite frequent near-end ticks',async()=>{
  const env=setup();env.host.innerHTML=env.ctx.basicTrainingCourseHtml();await env.flush();
  await env.ctx.basicBagStartVideo(1);await env.flush();env.players.at(-1).opts.events.onReady();await env.flush();
  await env.play(40);
  const before=env.rpcs('training_watch_report').length;
  await env.end({seconds:60});
  const sent=env.rpcs('training_watch_report').length-before;
  assert.ok(sent<=12,'at most one network request every 5.2 seconds, not every 600 ms ('+sent+')');
});

test('never send watch reports after the server marks the attempt complete',()=>{
  assert.match(engine,/if\(!a\|\|a\.saving\|\|a\.completed\|\|w\.preview\|\|w\.stopped\)return;/);
  assert.match(engine,/a\.completed=!!r\.attempt_completed;/);
});

test('watch credits use normal playback, and the old cumulative heartbeat is gone',()=>{
  assert.match(engine,/getPlaybackRate/);
  assert.match(engine,/setPlaybackRate\(1\)/);
  assert.match(engine,/REPORT_INTERVAL_MS=5200/);
  assert.match(engine,/if\(a\.lastSent&&Date\.now\(\)-a\.lastSent<REPORT_INTERVAL_MS\)return;/);
  assert.match(basic,/onPlaybackRateChange:e=>\{if\(movie===m\)m\.session\.onRate\(e\.data\);\}/);
  assert.match(basic,/DXNTrainingEngine\.createWatch\(\{track:'basic'/);
  assert.doesNotMatch(basic,/basic_training_watch_update/,'no cumulative watch endpoint left in the page');
  assert.doesNotMatch(basic,/async function heartbeat\(/);
});
