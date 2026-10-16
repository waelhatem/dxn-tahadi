'use strict';
// How the acceptance tests drive each track's real page; shared by the engine and quiz-opening tests.
const {answerQuiz,KEY3,KEY4}=require('./training-harness');

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
      const text=env.byId('basicBagModalBody').querySelector('.basic-bag-result').textContent;env.byId('basicBagClose').click();await env.flush();return text;}
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
      const text=env.byId('professionalQuizBody').querySelector('.basic-bag-result').textContent;env.byId('professionalQuizClose').click();await env.flush();return text;}
  }
};
module.exports={TRACKS};
