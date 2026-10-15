'use strict';
// Acceptance tests of the unified training engine in the real page scripts (basic, advanced and
// professional tracks), against a fake server that follows the pending engine SQL rules.
const test=require('node:test');
const assert=require('node:assert/strict');
const {setup,answerQuiz,answersWith,KEY3,KEY4}=require('./helpers/training-harness');

// How each track's page is driven; everything else in the tests is shared.
const TRACKS={
  basic:{
    key:KEY3,len:n=>[503,439][n-1],
    async mount(env){env.host.innerHTML=env.ctx.basicTrainingCourseHtml();await env.flush();},
    async open(env,n){env.ctx.basicBagSelectLesson(n);await env.flush();},
    async start(env,n){await env.ctx.basicBagStartVideo(n);await env.flush();env.players.at(-1).opts.events.onReady();await env.flush();},
    quiz:env=>env.byId('basicBagViewerHead').querySelector('.unified-training__quiz-button'),
    quizOpen:env=>!env.byId('basicBagViewerHead').querySelector('.unified-training__quiz-button').disabled,
    pct:env=>env.byId('basicWatchPct').textContent,
    status:env=>env.byId('basicWatchInfo').textContent,
    lessonLocked:(env,n)=>env.byId('basicBagLessonList').querySelectorAll('button')[n-1].disabled,
    async takeQuiz(env,n,answers){await env.ctx.basicBagStartQuiz(n);await env.flush();
      await answerQuiz(env,env.byId('basicBagModalBody').querySelector('form'),answers);
      const text=env.byId('basicBagModalBody').querySelector('h2').textContent;env.byId('basicBagClose').click();await env.flush();return text;}
  },
  advanced:{
    key:KEY4,len:()=>600,
    async mount(env){env.host.innerHTML=env.ctx.advancedFinancialCoursePage();await env.flush();},
    async open(env,n){const b=env.document.querySelector('[data-select-lesson="'+n+'"]');b.click();await env.flush();},
    async start(env){env.players.at(-1).opts.events.onReady();await env.flush();},
    quiz:env=>env.document.querySelector('#advancedFinancialLessons [data-test]'),
    quizOpen:env=>{const b=env.document.querySelector('#advancedFinancialLessons [data-test]');return /ابدأ اختبار|أعد الاختبار|إعادة الاختبار/.test(b.textContent);},
    pct:env=>env.byId('advFinancialWatchPct').textContent,
    status:env=>env.byId('advFinancialWatchMessage').textContent,
    lessonLocked:(env,n)=>env.document.querySelector('[data-select-lesson="'+n+'"]').disabled,
    async takeQuiz(env,n,answers){
      env.document.querySelector('#advancedFinancialLessons [data-test="'+n+'"]').click();await env.flush();
      for(let i=0;i<20;i++){
        const body=env.byId('advFinancialBody');const input=body.querySelectorAll('input')[answers[i]];
        input.checked=true;input.onchange();
        const [,next,submit]=body.querySelector('.advanced-financial-footer').children.filter(c=>c.tagName);
        if(i<19)next.click();else submit.click();
        await env.flush();
      }
      const text=env.byId('advFinancialBody').querySelector('.basic-bag-result').textContent;
      env.byId('advFinancialClose').click();await env.flush();return text;}
  },
  professional:{
    key:KEY3,len:n=>[1164,157][n-1],
    async mount(env){env.host.innerHTML=env.ctx.professionalTrainingCoursePage();await env.flush();},
    async open(env,n){env.ctx.professionalCourseSelect(n);await env.flush();},
    async start(env,n){await env.ctx.professionalCourseWatch(n);await env.flush();env.players.at(-1).opts.events.onReady();await env.flush();},
    quiz:env=>env.byId('professionalViewerHead').querySelector('.unified-training__quiz-button'),
    quizOpen:env=>!env.byId('professionalViewerHead').querySelector('.unified-training__quiz-button').disabled,
    pct:env=>env.byId('professionalWatchPct').textContent,
    status:env=>env.byId('professionalWatchInfo').textContent,
    lessonLocked:(env,n)=>env.byId('professionalLessonList').querySelectorAll('button')[n-1].disabled,
    async takeQuiz(env,n,answers){await env.ctx.professionalCourseQuiz(n);await env.flush();
      await answerQuiz(env,env.byId('professionalQuizBody').querySelector('form'),answers);
      const text=env.byId('professionalQuizBody').querySelector('h2').textContent;env.byId('professionalQuizClose').click();await env.flush();return text;}
  }
};
const lastAttempt=(env,track)=>Object.values(env.server.attempts).filter(a=>a.track===track).at(-1);

for(const [track,T] of Object.entries(TRACKS)){
  const D=T.len(1);
  test(`${track}: partial watch of 20%, leave, come back a day later — starts again at 0%`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    assert.equal(T.pct(env),'0%');
    await env.play(Math.floor(D*0.2));
    const first=lastAttempt(env,track);
    assert.ok(first.watched>0&&first.watched<=Math.ceil(D*0.2),'server credited the partial watch in that attempt');
    env.host.innerHTML='';env.advance(86_400_000);await T.mount(env);
    assert.equal(T.pct(env),'0%','nothing partial is shown as saved');
    assert.equal(T.quizOpen(env),false);
    await T.start(env,1);await env.play(30);
    const second=lastAttempt(env,track);
    assert.notEqual(second.id,first.id,'a new attempt');
    assert.ok(env.players.at(-1).t<=30&&second.watched<=36,'the new attempt counts from 0 s, not from 20%');
    assert.equal(env.server.peek('member-a',track,1)?.completed||false,false);
  });

  test(`${track}: short pause inside the same session continues from where it stopped`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    await env.play(Math.floor(D*0.3));
    const a=lastAttempt(env,track),before=a.watched;
    await env.pause(60_000);
    await env.play(Math.floor(D*0.3)+30);
    assert.equal(lastAttempt(env,track).id,a.id,'same attempt after a short pause');
    assert.ok(lastAttempt(env,track).watched>before,'continues from 30%');
  });

  test(`${track}: 89% keeps the quiz closed; 90% confirmed by the server opens it at once`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    await env.play(Math.floor(D*0.89));
    assert.equal(T.quizOpen(env),false,'closed at 89%');
    const overviews=env.calls.filter(c=>/overview$/.test(c.fn)).length;
    for(let i=0;i<400&&!env.server.peek('member-a',track,1)?.completed;i++){const p=env.players.at(-1);env.advance(600);p.t+=0.6;env.activeTick().f();await env.flush();}
    assert.equal(env.server.peek('member-a',track,1).completed,true);
    assert.equal(T.quizOpen(env),true,'opened as soon as the server confirmed 90%');
    assert.equal(env.calls.filter(c=>/overview$/.test(c.fn)).length,overviews,'no page reload needed');
  });

  test(`${track}: completed earlier but no quiz yet — back another day, the quiz opens without watching`,async()=>{
    const env=setup();env.server.row('member-a',track,1).completed=true;
    await T.mount(env);
    assert.equal(T.quizOpen(env),true);
    assert.equal(env.rpcs('training_watch_begin').length,0);
  });

  test(`${track}: 70/100 keeps the next lesson closed; 80/100 opens it`,async()=>{
    const env=setup();env.server.row('member-a',track,1).completed=true;
    await T.mount(env);
    const fail=await T.takeQuiz(env,1,answersWith(T.key,14));
    assert.match(fail,/70 \/ 100/);
    assert.equal(T.lessonLocked(env,2),true,'next lesson stays closed after a fail');
    assert.match(T.status(env)+T.quiz(env).textContent,/أعد الاختبار/);
    const pass=await T.takeQuiz(env,1,answersWith(T.key,16));
    assert.match(pass,/80 \/ 100/);
    assert.equal(T.lessonLocked(env,2),false,'next lesson open after 80/100');
  });

  test(`${track}: member A's watch never shows up for member B`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    await env.play(Math.ceil(D*0.91));
    assert.equal(env.server.peek('member-a',track,1).completed,true);
    env.setSession('member-b');env.host.innerHTML='';await T.mount(env);
    assert.equal(T.quizOpen(env),false,'member B has not watched');
    assert.equal(T.pct(env),'0%');
    assert.ok(!env.server.peek('member-b',track,1)?.completed);
    assert.equal(env.rpcs('training_watch_report').filter(c=>c.args.p_token==='member-b').length,0);
  });

  test(`${track}: a later lesson cannot be opened before the earlier ones are passed`,async()=>{
    const env=setup();await T.mount(env);
    assert.equal(T.lessonLocked(env,2),true);
    const forced=await env.ctx.DXNTrainingEngine.rpc('training_watch_begin',{p_track:track,p_lesson_no:3}).catch(e=>e.message);
    assert.match(String(forced),/الدرس مغلق/,'the server refuses as well');
  });

  test(`${track}: rewatching a passed lesson starts at 0 and keeps the pass and score`,async()=>{
    const env=setup();Object.assign(env.server.row('member-a',track,1),{completed:true,passed:true,best:18});
    await T.mount(env);await T.open(env,1); // the page opens on the next lesson to pass
    assert.equal(T.quizOpen(env),true);
    await T.start(env,1);await env.play(20);
    assert.ok(lastAttempt(env,track).watched<=26,'fresh attempt from 0');
    const r=env.server.peek('member-a',track,1);
    assert.deepEqual({c:r.completed,p:r.passed,b:r.best},{c:true,p:true,b:18});
    assert.equal(T.quizOpen(env),true);
  });
}

test('basic durations: training 2 (439 s) completes at 90% of 439 s; 6 and 7 use their real lengths',async()=>{
  const env=setup();Object.assign(env.server.row('member-a','basic',1),{completed:true,passed:true,best:18});
  const T=TRACKS.basic;await T.mount(env);await T.open(env,2);await T.start(env,2);
  await env.play(410); // a member keeps playing past 90%; the last save may lag up to 5 s
  assert.equal(env.server.peek('member-a','basic',2).completed,true,'396 s of 439 s is 90%');
  assert.equal(T.quizOpen(env),true);
  assert.equal(env.server.tracks.basic.lessons[6].duration,1474);
  assert.equal(env.server.tracks.basic.lessons[7].duration,450);
});

test('a player length different from the stored duration is announced to the member',async()=>{
  const env=setup({realSeconds:{lxhnkUov9sE:440}});
  const T=TRACKS.basic;await T.mount(env);await T.start(env,1);
  env.players.at(-1).state=1;env.activeTick().f();await env.flush();
  assert.match(T.status(env),/تختلف عن المدة المعتمدة/);
});

test('professional lesson whose bank is not imported keeps its quiz closed and says so',async()=>{
  const env=setup();
  Object.assign(env.server.row('member-a','professional',1),{completed:true,passed:true,best:17});
  Object.assign(env.server.row('member-a','professional',2),{completed:true,passed:true,best:17});
  env.server.row('member-a','professional',3).completed=true;
  const T=TRACKS.professional;await T.mount(env);await T.open(env,3);
  assert.equal(T.quizOpen(env),false);
  assert.match(T.quiz(env).textContent,/قيد الاعتماد/);
});

test('professional page falls back to the current unsaved preview until the server side is installed',async()=>{
  const env=setup();
  env.ctx.professionalTrainingPreviewHtml=()=>'<p>PREVIEW_BODY</p>';
  const handle=env.server.handle;env.server.handle=(fn,a)=>fn==='professional_training_overview'?{ok:false,body:{error:'function does not exist'}}:handle(fn,a);
  env.host.innerHTML=env.ctx.professionalTrainingCoursePage();await env.flush();
  assert.match(env.byId('professionalCourseBody').textContent,/PREVIEW_BODY/);
});

// ---- engine behaviour --------------------------------------------------------------------

for(const [track,T] of Object.entries(TRACKS)){
  test(`${track}: replaying the same YouTube player starts a fresh watch attempt from 0%`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    await env.play(25);
    const original=lastAttempt(env,track);
    assert.ok(original.watched>0);
    const player=env.players.at(-1);
    player.state=0;player.opts.events.onStateChange({data:0});await env.flush();
    player.t=0;player.state=1;player.opts.events.onStateChange({data:1});await env.flush();
    assert.equal(T.pct(env),'0%','the new playback has its own progress');
    env.advance(600);env.activeTick().f();await env.flush();
    const replay=lastAttempt(env,track);
    assert.notEqual(replay.id,original.id,'a distinct authenticated server attempt');
    assert.equal(replay.watched,0,'no carry-over from the earlier video play');
  });
}

test('engine: reports are throttled to one per 5.2 s even with ticks every 600 ms near the end',async()=>{
  const env=setup();await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(100);
  const reports=env.rpcs('training_watch_report').length;
  assert.ok(reports<=Math.ceil(100/5.2)+2&&reports>=10,'about one report per 5.2 s ('+reports+')');
  const before=env.rpcs('training_watch_report').length;
  await env.end({seconds:30});
  assert.ok(env.rpcs('training_watch_report').length-before<=7,'no request loop at the end');
});

test('engine: nothing is reported once the server confirmed the attempt complete',async()=>{
  const env=setup();await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(460);
  assert.equal(lastAttempt(env,'basic').completed,true);
  const n=env.rpcs('training_watch_report').length;
  await env.play(500);await env.end();
  assert.equal(env.rpcs('training_watch_report').length,n);
});

test('engine: playback is kept at 1x and skipping ahead is undone',async()=>{
  const env=setup();await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(30);
  const p=env.players.at(-1);
  p.rate=2;env.activeTick().f();await env.flush();
  assert.equal(p.rate,1);
  p.t=300;env.advance(600);env.activeTick().f();await env.flush();
  assert.ok(p.t<=33,'jumped back to the watched point');
  assert.ok(lastAttempt(env,'basic').watched<=36,'the skip earned nothing');
});

test('engine: a late answer for a replaced attempt is ignored',async()=>{
  const env=setup({hold:fn=>fn==='training_watch_report'});
  await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(12);
  assert.ok(env.held.length>=1,'a report is in flight');
  await TRACKS.basic.start(env,1);
  env.players.at(-1).state=1;env.activeTick().f();await env.flush();
  while(env.held.length){env.held.shift()();await env.flush();}
  assert.equal(TRACKS.basic.pct(env),'0%','the stale answer did not move the new attempt');
  assert.equal(TRACKS.basic.quizOpen(env),false);
});

test('engine: a pause longer than the idle limit ends the attempt; playing again starts from 0',async()=>{
  const env=setup();await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(60);
  const a=lastAttempt(env,'basic');
  await env.pause(601_000);
  assert.match(TRACKS.basic.status(env),/الخمول/);
  assert.equal(env.players.at(-1).t,0,'rewound to the start');
  await env.play(20);
  assert.notEqual(lastAttempt(env,'basic').id,a.id,'a new attempt');
});

test('engine: switching account mid-video stops the watch without sending under the new account',async()=>{
  const env=setup();await TRACKS.basic.mount(env);await TRACKS.basic.start(env,1);
  await env.play(20);
  env.setSession('member-b');
  const n=env.rpcs('training_watch_report').length;
  const p=env.players.at(-1);
  for(let i=0;i<20;i++){env.advance(600);p.t+=0.6;env.intervals.forEach(x=>x.active&&x.f());await env.flush();}
  assert.equal(env.rpcs('training_watch_report').length,n);
  assert.ok(env.rpcs('training_watch_report').every(c=>c.args.p_token==='member-a'));
});

test('the six unified states are the same strings in every track',()=>{
  const env=setup();
  const E=env.ctx.DXNTrainingEngine;
  assert.deepEqual(Object.values(E.STATE_TEXT),['الدرس مغلق — أكمل الدرس السابق أولًا','ابدأ المشاهدة','المشاهدة قيد التنفيذ',
    'المشاهدة مكتملة — ابدأ الاختبار','لم تجتز الاختبار — أعد الاختبار','تم اجتياز الاختبار — الدرس التالي متاح']);
  assert.equal(E.lessonState({unlocked:false}),'locked');
  assert.equal(E.lessonState({unlocked:true}),'start');
  assert.equal(E.lessonState({unlocked:true,watching:true}),'watching');
  assert.equal(E.lessonState({unlocked:true,watchCompleted:true}),'ready');
  assert.equal(E.lessonState({unlocked:true,watchCompleted:true,attempted:true}),'failed');
  assert.equal(E.lessonState({unlocked:true,watchCompleted:true,attempted:true,passed:true}),'passed');
});
