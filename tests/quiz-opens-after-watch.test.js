'use strict';
// Acceptance cases A–G of the quiz-opening fix, repeated on the basic, advanced and professional tracks:
// the server's 90% confirmation opens a published quiz at once, the video keeps playing untouched, the
// end of the video changes nothing, an unpublished bank is reported truthfully (and opens later without
// rewatching), a reload keeps the completion, and nothing leaks between accounts.
const test=require('node:test');
const assert=require('node:assert/strict');
const {setup,answersWith}=require('./helpers/training-harness');
const {TRACKS}=require('./helpers/training-tracks');

const OPEN_NOW=/اكتملت مشاهدة الدرس بنجاح — الاختبار متاح الآن/;
// Beside the bar once the server confirmed 90%: the condition is met — never "90%" or "91%".
const MET_OPEN='✅ اكتمل شرط المشاهدة بنجاح — 📝 الاختبار متاح الآن';
const MET_UNPUBLISHED='✅ اكتملت المشاهدة — الاختبار لم يُنشر بعد';
const SAVED_UNPUBLISHED=/اكتملت مشاهدة الدرس وحُفظ تقدمك\. اختبار هذا الدرس لم يُنشر بعد، ولن تحتاج إلى إعادة المشاهدة/;

// Records every call that would interrupt the member's video.
function spyOn(player){
  const seen={pauseVideo:0,stopVideo:0,seekTo:0,destroy:0};
  for(const k of Object.keys(seen)){const f=player[k];player[k]=(...a)=>{seen[k]++;return f?f(...a):undefined;};}
  return seen;
}
async function playUntilServerConfirms(env,track,p){
  for(let i=0;i<500&&!env.server.peek('member-a',track,1)?.completed;i++){env.advance(600);p.t+=0.6;env.activeTick().f();await env.flush();}
}

for(const [track,T] of Object.entries(TRACKS)){
  const D=T.len(1);

  test(`${track} A+B: 89% closed, 90% opens the quiz at once, the video plays on untouched to its natural end`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    const player=env.players.at(-1),players=env.players.length;
    await env.play(Math.floor(D*0.89));
    assert.equal(T.quizOpen(env),false,'closed at 89%');
    assert.match(T.pct(env),/^\d{1,2}%$/,'before 90% the server-confirmed share is shown as a number');
    assert.ok(parseInt(T.pct(env))<90);
    const seen=spyOn(player);
    await playUntilServerConfirms(env,track,player);
    assert.equal(T.quizOpen(env),true,'the published quiz opens as soon as the server confirms 90%');
    assert.match(T.status(env),OPEN_NOW);
    assert.equal(T.pct(env),MET_OPEN,'the condition is shown as met, not as 90% / 91%');
    assert.equal(T.bar(env),'100%','the condition bar is full');
    assert.equal(player.state,1,'still playing at the moment of confirmation');
    assert.ok(player.t<D,'the video is not at its end yet');
    await env.play(D);
    assert.deepEqual(seen,{pauseVideo:0,stopVideo:0,seekTo:0,destroy:0},'no pause, stop, seek or destroy because of 90%');
    assert.equal(env.players.length,players,'the YouTube player was never re-created');
    assert.equal(player.destroyed,false);
    assert.equal(player.t,D,'the video played on to its end');
    assert.equal(T.pct(env),MET_OPEN);
    assert.doesNotMatch(T.pct(env)+T.status(env),/9[01]%/,'no confusing 90% / 91% left on screen');
    const begins=env.rpcs('training_watch_begin').length;
    await env.end();                                   // YouTube ENDED: the replay icon is normal
    assert.equal(T.quizOpen(env),true,'the quiz stays open after the video ends');
    assert.equal(T.pct(env),MET_OPEN,'still shown as met after the end');
    assert.equal(env.rpcs('training_watch_begin').length,begins,'no new watch is asked for');
    const result=await T.takeQuiz(env,1,answersWith(T.key,16));
    assert.match(result,/80 \/ 100/);
    assert.match(result,/اجتزت الاختبار بنجاح — أصبح التدريب التالي متاحًا/);
    assert.equal(T.lessonLocked(env,2),false,'80/100 opens the next lesson');
  });

  test(`${track} D: after a reload the completed watch stays saved and the quiz stays open`,async()=>{
    const env=setup();await T.mount(env);await T.start(env,1);
    await env.play(Math.ceil(D*0.91));
    assert.equal(env.server.peek('member-a',track,1).completed,true);
    const reloaded=setup({reloadOf:env});              // full page reload: fresh scripts, same server
    await T.mount(reloaded);
    assert.equal(T.quizOpen(reloaded),true);
    assert.equal(T.pct(reloaded),MET_OPEN,'shown as completed after the reload');
    assert.equal(T.bar(reloaded),'100%');
    assert.equal(reloaded.rpcs('training_watch_begin').length,0,'no rewatch asked for');
  });

  test(`${track}: rewatching a completed lesson shows this session's share apart and loses nothing`,async()=>{
    const env=setup();Object.assign(env.server.row('member-a',track,1),{completed:true,passed:true,best:17});
    await T.mount(env);await T.open(env,1);
    assert.equal(T.pct(env),MET_OPEN,'saved completion shown before replaying');
    await T.start(env,1);await env.play(Math.floor(D*0.3));
    assert.match(T.pct(env),/^جلسة إعادة المشاهدة: \d+% — الإنجاز محفوظ$/,'the replay session is shown on its own');
    assert.equal(T.quizOpen(env),true,'the quiz stays open during the replay');
    const r=env.server.peek('member-a',track,1);
    assert.deepEqual({c:r.completed,p:r.passed,b:r.best},{c:true,p:true,b:17},'completion, pass and score kept');
    await env.play(Math.ceil(D*0.95));
    assert.equal(T.pct(env),MET_OPEN,'90% of the replay shows the condition met again');
  });

  test(`${track} E: 70/100 shows the fail message and keeps the next lesson closed`,async()=>{
    const env=setup();env.server.row('member-a',track,1).completed=true;await T.mount(env);
    const result=await T.takeQuiz(env,1,answersWith(T.key,14));
    assert.match(result,/70 \/ 100/);
    assert.match(result,/لم تحقق درجة النجاح المطلوبة\. يمكنك إعادة الاختبار وفق نظام المحاولات/);
    assert.equal(T.lessonLocked(env,2),true);
  });

  test(`${track} F: a late 90% confirmation of member A never reaches member B`,async()=>{
    let holding=false;
    const env=setup({hold:fn=>holding&&fn==='training_watch_report'});
    await T.mount(env);await T.start(env,1);
    await env.play(Math.floor(D*0.89));
    holding=true;
    await env.play(Math.ceil(D*0.95));                 // the confirming report is still on its way
    env.setSession('member-b');env.host.innerHTML='';await T.mount(env);
    while(env.held.length)env.held.shift()();await env.flush();
    assert.equal(T.quizOpen(env),false,'member B does not inherit member A\'s watch');
    assert.equal(T.pct(env),'0%');
    assert.ok(!env.server.peek('member-b',track,1)?.completed);
  });
}

// Case C — a bank that is not published. Basic and professional: the watch is saved, the quiz stays
// closed with the real reason, and it opens later without watching again.
for(const track of ['basic','professional']){
  const T=TRACKS[track],D=T.len(1);
  test(`${track} C: 90% with an unpublished bank saves the watch, says why the quiz is closed, opens later without rewatching`,async()=>{
    const env=setup();env.server.tracks[track].lessons[1].published=false;
    await T.mount(env);
    assert.equal(T.quizOpen(env),false);
    assert.match(T.quiz(env).textContent,/اختبار هذا الدرس لم يُنشر بعد/);
    await T.start(env,1);
    const player=env.players.at(-1),seen=spyOn(player);
    await env.play(Math.ceil(D*0.92));
    assert.equal(env.server.peek('member-a',track,1).completed,true,'the server saved the watch');
    assert.equal(T.quizOpen(env),false,'a missing bank is never opened from the page');
    assert.match(T.status(env),SAVED_UNPUBLISHED);
    assert.equal(T.pct(env),MET_UNPUBLISHED,'the completion is shown, with the real reason the quiz is closed');
    assert.equal(T.bar(env),'100%');
    assert.doesNotMatch(T.status(env)+T.quiz(env).textContent,/الاختبار متاح الآن/);
    assert.deepEqual(seen,{pauseVideo:0,stopVideo:0,seekTo:0,destroy:0},'the video is not interrupted');
    // The bank is published later: the member's next visit opens the quiz straight away.
    env.server.tracks[track].lessons[1].published=true;
    const later=setup({reloadOf:env});
    await T.mount(later);
    assert.equal(T.quizOpen(later),true);
    assert.equal(later.rpcs('training_watch_begin').length,0,'no rewatch');
    const result=await T.takeQuiz(later,1,answersWith(T.key,16));
    assert.match(result,/80 \/ 100/);
  });
}

// Advanced: the server does not count watching before the lesson's bank is complete
// (training_engine_lesson_seconds), so the page plays it as an unsaved preview and never claims a quiz.
test('advanced C: an unpublished lesson plays as an unsaved preview and never claims an open quiz',async()=>{
  const T=TRACKS.advanced;
  const env=setup();env.server.tracks.advanced.lessons[1].published=false;
  await T.mount(env);await T.start(env,1);
  await env.play(590);
  assert.equal(env.rpcs('training_watch_begin').length,0,'no tracked attempt for an unpublished lesson');
  assert.equal(T.quizOpen(env),false);
  assert.doesNotMatch(T.status(env)+T.quiz(env).textContent,/الاختبار متاح الآن/);
  // A watch saved before the bank was withdrawn is shown as saved, with the real reason.
  const env2=setup();env2.server.tracks.advanced.lessons[1].published=false;env2.server.row('member-a','advanced',1).completed=true;
  await T.mount(env2);
  assert.match(T.quiz(env2).textContent,/اختبار هذا الدرس لم يُنشر بعد/);
  assert.equal(T.quizOpen(env2),false);
});

test('advanced: the quiz button is updated in place on confirmation and the click opens the quiz',async()=>{
  const T=TRACKS.advanced;
  const env=setup();await T.mount(env);await T.start(env,1);
  const before=T.quiz(env);
  await env.play(Math.ceil(600*0.92));
  assert.equal(T.quiz(env),before,'same button element: the lesson view was not rebuilt');
  assert.match(before.textContent,/ابدأ اختبار الدرس/);
  assert.equal(before.style.background,'#087b55');
  before.click();await env.flush();
  assert.equal(env.byId('advFinancialBody').querySelectorAll('input').length,4,'question 1 of the approved quiz is shown');
});
