'use strict';
// Unified training layout (as the advanced training) on the unified training engine: lesson list on the
// right, the selected lesson's player on the left, quiz button above it and progress below, for the
// basic, professional and advanced tracks. Behaviour of watching itself is in training-engine.test.js.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {setup,read}=require('./helpers/training-harness');

const byId=(env,id)=>env.document.getElementById(id);
const listButtons=env=>byId(env,'basicBagLessonList').querySelectorAll('button');
const quizButton=env=>byId(env,'basicBagViewerHead').querySelector('.unified-training__quiz-button');
const mountBasic=async env=>{env.host.innerHTML=env.ctx.basicTrainingCourseHtml();await env.flush();};
const passLesson1=env=>Object.assign(env.server.row('member-a','basic',1),{completed:true,passed:true,best:18});

test('basic page uses the advanced layout: list, viewer, quiz button above the video, progress below',async()=>{
  const env=setup();passLesson1(env);
  await mountBasic(env);
  const details=env.host.querySelector('details');
  assert.ok(details&&details.className.includes('advanced-profit-course')&&details.className.includes('unified-training'));
  assert.match(details.querySelector('summary').textContent,/اضغط لعرض التدريبات الثمانية/);
  const grid=env.host.querySelector('.advanced-profit-grid');
  const [list,viewer]=grid.children.filter(c=>c.tagName);
  assert.equal(list.id,'basicBagLessonList','list comes first, so it sits on the right in RTL');
  assert.ok(viewer.className.includes('advanced-profit-viewer'));
  const parts=viewer.children.filter(c=>c.tagName);
  assert.deepEqual(parts.map(c=>c.id),['basicBagViewerHead','basicBagInlineBox','','basicWatchInfo','basicBagViewerInfo'],'title+quiz, video, progress, status, score');
  assert.ok(parts[2].className.includes('basic-bag-inline-progress'));
  assert.deepEqual(listButtons(env).map(b=>b.disabled),[false,false,true,true,true,true,true,true],'lock rule unchanged');
  assert.deepEqual(listButtons(env).map(b=>b.attrs['aria-pressed']),['false','true','false','false','false','false','false','false'],'opens on the first training still to pass');
  assert.match(byId(env,'basicBagVideoTitle').textContent,/^التدريب الأساسي 2 من 8 — /);
  assert.equal(quizButton(env).disabled,true,'quiz stays closed until the server confirms 90%');
  assert.equal(byId(env,'basicWatchPct').textContent,'0%','no partial watching shown as saved');
  assert.equal(byId(env,'basicWatchInfo').textContent,'▶ ابدأ المشاهدة');
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').attrs.onclick,'basicBagStartVideo(2)','start is the member\'s own click');
  env.ctx.basicBagSelectLesson(1);
  assert.equal(quizButton(env).disabled,false);
  assert.equal(quizButton(env).textContent,'📝 إعادة الاختبار');
  assert.equal(byId(env,'basicWatchInfo').textContent,'✅ تم اجتياز الاختبار — الدرس التالي متاح');
  assert.match(byId(env,'basicBagViewerInfo').textContent,/أفضل درجة اختبار: 90 \/ 100/);
});

test('choosing another lesson stops the current video, as closing the old window did',async()=>{
  const env=setup();passLesson1(env);
  await mountBasic(env);
  await env.ctx.basicBagStartVideo(2);await env.flush();
  env.players[0].opts.events.onReady();await env.flush();
  env.ctx.basicBagSelectLesson(1);
  assert.equal(env.players[0].destroyed,true);
  assert.equal(env.intervals.filter(i=>i.active).length,0);
  assert.match(byId(env,'basicBagVideoTitle').textContent,/التدريب الأساسي 1 من 8/);
});

test('preview mode keeps the original preview buttons and texts for each training',async()=>{
  const env=setup();
  const handle=env.server.handle;env.server.handle=(fn,a)=>fn==='basic_training_overview'?{ok:false,body:{error:'خطأ تجريبي'}}:handle(fn,a);
  await mountBasic(env);
  assert.deepEqual(listButtons(env).map(b=>b.disabled),Array(8).fill(false));
  env.ctx.basicBagSelectLesson(3);
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').attrs.onclick,'basicBagPreviewThirdVideo()');
  assert.equal(quizButton(env).attrs.onclick,'basicBagPreviewThirdQuiz()');
  assert.equal(byId(env,'basicWatchInfo').textContent,'🔒 يبقى التسلسل مقفلًا حتى إكمال التدريبين السابقين — المعاينة مستقلة');
  env.ctx.basicBagSelectLesson(1);
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').attrs.onclick,'basicBagStartVideo(1)');
  assert.equal(quizButton(env).attrs.onclick,'basicBagPreviewFirstQuiz()');
});

test('leader on desktop can still reach the unsaved quiz preview of every training',async()=>{
  const env=setup();passLesson1(env);env.ctx.innerWidth=1400;
  const handle=env.server.handle;env.server.handle=(fn,a)=>{const r=handle(fn,a);if(fn==='basic_training_overview')r.body.role='leader';return r;};
  await mountBasic(env);
  assert.deepEqual(listButtons(env).map(b=>b.disabled),Array(8).fill(false));
  env.ctx.basicBagSelectLesson(6);
  const preview=byId(env,'basicBagViewerHead').querySelector('.basic-bag-preview-btn');
  assert.equal(preview.attrs.onclick,'basicBagPreviewFirstQuiz(6)');
  assert.equal(quizButton(env).disabled,true,'the member quiz itself stays locked');
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').disabled,true,'locked video stays closed');
});

test('professional course page: same layout, server locks, quiz above the video, progress below',async()=>{
  const env=setup();
  env.host.innerHTML=env.ctx.professionalTrainingCoursePage();await env.flush();
  assert.ok(env.host.querySelector('details').className.includes('unified-training'));
  const [list,viewer]=env.host.querySelector('.advanced-profit-grid').children.filter(c=>c.tagName);
  assert.equal(list.id,'professionalLessonList');
  assert.deepEqual(viewer.children.filter(c=>c.tagName).map(c=>c.id),['professionalViewerHead','professionalInlineBox','','professionalWatchInfo','professionalViewerInfo']);
  assert.deepEqual(list.querySelectorAll('button').map(b=>b.disabled),[false,true,true],'only lesson 1 open');
  assert.equal(byId(env,'professionalViewerHead').querySelector('.unified-training__quiz-button').disabled,true);
  assert.match(byId(env,'professionalViewerHead').textContent,/م\. محمود المصري/);
});

test('professional preview data: five independent trainings, old cards as fallback',()=>{
  const ctx={document:{getElementById:()=>null}};ctx.window=ctx;vm.createContext(ctx);
  const expected=[['zO3U8yj0Sig','المدرب: '],['tVim2H5Elck','المدرب: '],['HOtDbw8-P3w','المدرب: '],['nzezoIaIRVg','المدرب: '],['HxID9tMHoVw','المحاضر: ']];
  for(let n=1;n<=5;n++){
    vm.runInContext(read('professional-training-0'+n+'.js'),ctx);
    const info=ctx['professionalTraining0'+n+'Info']();
    assert.equal(info.videoId,expected[n-1][0]);
    assert.ok(info.instructor.startsWith(expected[n-1][1]));
    assert.equal(info.questionCount,20);
    assert.deepEqual(Object.keys(info).sort(),['instructor','label','questionCount','title','videoId'],'no questions exposed through it');
  }
  const page=read('app/index.html');
  const start=page.indexOf('let professionalSelected=0;'),end=page.indexOf('/* Advanced training is a catalogue');
  assert.ok(start>0&&end>start);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const make=win=>new Function('window','esc','document',page.slice(start,end)+'\nreturn professionalTrainingPage();')(win,esc,{getElementById:()=>null});
  const html=make(ctx);
  assert.match(html,/class="advanced-profit-course academy-camps-course unified-training"/);
  assert.equal((html.match(/class="advanced-profit-lesson"/g)||[]).length,5);
  assert.match(html,/youtube-nocookie\.com\/embed\/zO3U8yj0Sig\?rel=0/);
  assert.match(make({...ctx,professionalTrainingCoursePage:()=>'<section>ENGINE_PAGE</section>'}),/ENGINE_PAGE/,'the engine page takes over when loaded');
  assert.match(make({professionalTraining01Page:()=>'<article>OLD_CARD</article>'}),/OLD_CARD/);
});

test('advanced page keeps its layout: list, viewer, quiz button above the video, progress below',async()=>{
  const env=setup();
  env.host.innerHTML=env.ctx.advancedFinancialCoursePage();await env.flush();
  const grid=env.host.querySelector('.advanced-profit-grid');
  const [list,viewer]=grid.children.filter(c=>c.tagName);
  assert.equal(list.id,'advancedProfitLessonList');
  assert.ok(viewer.querySelector('.advanced-financial-test-cta'));
  assert.ok(viewer.querySelector('#advancedFinancialInlineBox'));
  assert.ok(viewer.querySelector('.basic-bag-inline-progress'));
  assert.equal(byId(env,'advFinancialWatchPct').textContent,'0%');
  // Back to the page after it was rebuilt: the lessons show again (was stuck on "loading").
  env.host.innerHTML=env.ctx.advancedFinancialCoursePage();await env.flush();
  assert.ok(env.host.querySelector('.advanced-profit-grid'),'lessons rendered again from the loaded data');
});

test('shared stylesheet only targets the unified trainings and non-advanced quiz windows',()=>{
  const css=read('unified-training-ui.css').replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[...css.matchAll(/([^{}]+)\{/g)].map(m=>m[1].trim()).filter(s=>s&&!s.startsWith('@'))
    .flatMap(s=>s.split(',').map(x=>x.trim()));
  assert.ok(selectors.length>10);
  for(const s of selectors)assert.match(s,/^(\.unified-training|\.basic-bag-overlay:not\(\.advanced-financial-overlay\))/,s);
  const page=read('app/index.html');
  for(const f of ['training-engine.js','advanced-financial-training.js','basic-training.js','professional-training-course.js']){
    const version=['training-engine.js','professional-training-course.js'].includes(f)?'20261016-quizready':'20261015-engine';
    assert.ok(page.includes('<script src="../'+f+'?v='+version+'"></script>'),f+' loaded with the correct cache version');
  }
  assert.ok(page.indexOf('training-engine.js')<page.indexOf('basic-training.js?v='),'engine loads before the tracks');
});
