/* V86.92 — Professional trainings on the unified training engine: server lessons and lock status, one
 * watch attempt per viewing, server quiz and grading (80 / 100 opens the next lesson). Same layout as the
 * basic and advanced tracks. Until the server side is installed, the current unsaved preview is shown. */
(function(){
 'use strict';
 if(window.__DXN_PROFESSIONAL_COURSE__)return;
 window.__DXN_PROFESSIONAL_COURSE__=true;
 const E=()=>window.DXNTrainingEngine;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>String(localStorage.getItem('dxn_session')||'').trim();
 const LABELS=['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر'];
 let lessons=[],loaded=false,loading=false,backendReady=false,session=token(),selected=1,selectedAuto=true,movie=null,exam=null;

 function resetIfAccountChanged(){
  if(token()===session)return;
  session=token();stopMovie();lessons=[];loaded=false;loading=false;backendReady=false;selected=1;selectedAuto=true;exam=null;
 }
 const lesson=n=>lessons.find(l=>l.lesson_no===n);
 const unlocked=n=>!!lesson(n)&&!!lesson(n).active&&(n===1||!!(lesson(n-1)&&lesson(n-1).completed&&lesson(n-1).passed));
 function view(l){
  const attempted=l.best_score!==null&&l.best_score!==undefined;
  const state=E().lessonState({unlocked:unlocked(l.lesson_no),watchCompleted:!!l.completed,passed:!!l.passed,attempted,
   watching:!!(movie&&movie.no===l.lesson_no&&movie.watching)});
  const quizReady=!!l.published;
  const quizEnabled=state!=='locked'&&!!l.completed&&quizReady;
  return {state,attempted,quizEnabled,
   quizLabel:'📝 '+(!quizReady?E().MESSAGES.quizUnpublished:state==='passed'?'إعادة الاختبار':state==='failed'?'أعد الاختبار':quizEnabled?'ابدأ اختبار الدرس':'الاختبار مغلق حتى تأكيد 90%'),
   status:!l.active?'⏳ هذا التدريب بانتظار النشر':!quizReady?(l.completed?E().MESSAGES.completedQuizUnpublished:'⏳ اختبار هذا الدرس لم يُنشر بعد؛ اكتمال المشاهدة يُحفظ، ويُفتح الاختبار عند نشره دون إعادة المشاهدة.') :({passed:'✅ ',failed:'❌ ',ready:'✅ ',locked:'🔒 ',watching:'▶ ',start:'▶ '})[state]+E().STATE_TEXT[state],
   score:'أفضل درجة اختبار: '+(attempted?Math.round(Number(l.best_score)*5)+' / 100':'لم يُختبر بعد')};
 }
 function defaultLesson(){
  const open=lessons.filter(l=>unlocked(l.lesson_no));
  const next=open.find(l=>!l.passed)||open[open.length-1];
  return next?next.lesson_no:1;
 }
 function listHtml(){
  return lessons.map(l=>{
   const v=view(l),can=v.state!=='locked';
   return '<button type="button" class="advanced-profit-lesson" onclick="professionalCourseSelect('+l.lesson_no+')" aria-pressed="'+(l.lesson_no===selected)+'" '+(can?'':'disabled')+'>'+
    '<span class="advanced-profit-index">'+l.lesson_no+'</span><span>التدريب الاحترافي '+(LABELS[l.lesson_no-1]||l.lesson_no)+': '+esc(l.title)+'</span>'+
    '<span aria-hidden="true">'+(l.passed?'✅':can?'▶':'🔒')+'</span></button>';
  }).join('');
 }
 function headHtml(l,v){
  return '<strong id="professionalVideoTitle">التدريب الاحترافي '+(LABELS[l.lesson_no-1]||l.lesson_no)+' — '+esc(l.title)+'</strong>'+
   '<div class="unified-training__actions"><span class="muted">'+esc(l.instructor)+'</span>'+
    '</div>';
 }
 function infoHtml(v){return '<p class="muted">'+esc(v.score)+'</p><p class="basic-bag-description">'+esc(E().POLICY_NOTE)+'</p>';}
 function quizCtaHtml(l,v){
  return '<button type="button" class="name-list-btn unified-training__quiz-button" onclick="professionalCourseQuiz('+l.lesson_no+')" '+(v.quizEnabled?'':'disabled')+'>'+v.quizLabel+'</button>';
 }
 function viewerHtml(l,v){
  const can=v.state!=='locked';
  return '<div id="professionalViewerHead">'+headHtml(l,v)+'</div>'+
   '<div class="training-professional-video unified-training__video" id="professionalInlineBox" data-no="'+l.lesson_no+'">'+
   '<button type="button" class="unified-training__play" '+(can?'onclick="professionalCourseWatch('+l.lesson_no+')"':'disabled')+'>'+
   (can?(l.completed?'▶ إعادة المشاهدة من البداية':'▶ ابدأ المشاهدة'):'🔒 '+esc(E().STATE_TEXT.locked))+'</button></div>'+
   '<div class="basic-bag-inline-progress unified-training__progress"><div id="professionalWatchProgress" class="basic-bag-progress" role="progressbar" aria-label="مشاهدة الجلسة الحالية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(l.completed?100:0)+'"><div style="width:'+(l.completed?100:0)+'%"></div></div>'+
   '<strong id="professionalWatchPct">'+esc(l.completed?E().completionLabel(!!l.published):'0%')+'</strong></div>'+
   '<p id="professionalWatchInfo" class="basic-bag-status">'+esc(v.status)+'</p>'+
    '<div id="professionalViewerQuizAction" class="unified-training__quiz-location">'+quizCtaHtml(l,v)+'</div>'+
   '<div id="professionalViewerInfo">'+infoHtml(v)+'</div>';
 }
 function stopMovie(){if(!movie)return;movie.session&&movie.session.stop();try{movie.player&&movie.player.destroy();}catch(_){}movie=null;}
 function render(){
  const host=document.getElementById('professionalCourseBody');if(!host)return;
  if(!backendReady){
   // Server side not installed yet: keep the current preview (videos and unsaved quiz preview).
   if(typeof window.professionalTrainingPreviewHtml==='function')host.innerHTML=window.professionalTrainingPreviewHtml();
   return;
  }
  if(movie&&!(movie.box&&movie.box.isConnected))stopMovie();
  if(selectedAuto||!unlocked(selected))selected=defaultLesson();
  const l=lesson(selected)||lessons[0];if(!l){host.innerHTML='<p class="muted">لا توجد تدريبات منشورة.</p>';return;}
  const v=view(l);
  if(movie&&movie.no===l.lesson_no){
   const list=document.getElementById('professionalLessonList');if(list)list.innerHTML=listHtml();
   const head=document.getElementById('professionalViewerHead');if(head)head.innerHTML=headHtml(l,v);
   const action=document.getElementById('professionalViewerQuizAction');if(action)action.innerHTML=quizCtaHtml(l,v);
   const info=document.getElementById('professionalViewerInfo');if(info)info.innerHTML=infoHtml(v);
   return;
  }
  stopMovie();
  host.innerHTML='<div class="advanced-profit-grid unified-training__layout">'+
   '<div id="professionalLessonList" class="advanced-profit-list" aria-label="التدريبات الاحترافية">'+listHtml()+'</div>'+
   '<div id="professionalViewer" class="advanced-profit-viewer unified-training__viewer">'+viewerHtml(l,v)+'</div></div>';
 }
 async function load(){
  const requested=session;
  try{
   const r=await E().rpc('professional_training_overview',{});
   if(requested!==session||token()!==session)return;
   if(!Array.isArray(r.lessons))throw Error('استجابة غير صحيحة');
   lessons=r.lessons;backendReady=true;
  }catch(_){if(requested!==session)return;backendReady=false;}
  finally{if(requested===session){loaded=true;loading=false;render();}}
 }
 window.professionalTrainingCoursePage=function(){
  resetIfAccountChanged();
  if(!loaded&&!loading&&token()){loading=true;setTimeout(load,0);}else setTimeout(render,0);
  return '<section id="trainingProfessionalStart" class="card training-professional-page">'+
   '<div class="title">🎓 التدريبات الاحترافية</div>'+
   '<p class="muted">مسار احترافي مستقل عن التدريبات الأساسية وخطة رجوان للنجاح.</p>'+
   '<details class="advanced-profit-course academy-camps-course unified-training"><summary><span class="advanced-profit-course-emoji">🎓</span>'+
   '<span class="advanced-profit-course-copy"><strong>التدريبات الاحترافية</strong><small>تدريبات متتابعة — فيديو واختبار من 20 سؤالًا لكل تدريب</small></span>'+
   '<span class="academy-camps-open-hint"><span class="academy-camps-hint-closed">▶ اضغط لعرض التدريبات</span><span class="academy-camps-hint-open">▲ إغلاق قائمة التدريبات</span></span></summary>'+
   '<div class="advanced-profit-content"><p class="muted">اختر التدريب من القائمة. يُفتح التدريب التالي بعد اجتياز اختبار السابق بدرجة 80 / 100.</p>'+
   '<div id="professionalCourseBody">'+(token()?'جارٍ تحميل التدريبات...':'سجّل الدخول لعرض التدريبات.')+'</div></div></details></section>';
 };
 window.professionalCourseSelect=function(n){
  n=Number(n);if(!backendReady||!lesson(n)||!unlocked(n))return;
  selectedAuto=false;if(n===selected)return;
  stopMovie();selected=n;render();
 };
 function message(t){const x=document.getElementById('professionalWatchInfo');if(x)x.textContent=t;}
 function showProgress(m,p){
  if(movie!==m)return;
  const bar=document.getElementById('professionalWatchProgress');
  if(bar){bar.querySelector('div').style.width=p.percent+'%';bar.setAttribute('aria-valuenow',String(p.percent));}
  const out=document.getElementById('professionalWatchPct');if(out)out.textContent=p.label||p.percent+'%';
 }
 async function youtube(){
  if(window.YT&&window.YT.Player)return;
  if(!window.__professionalYTPromise)window.__professionalYTPromise=new Promise((resolve,reject)=>{
   const old=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{if(typeof old==='function')old();resolve();};
   const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>reject(Error('تعذر تحميل مشغل الفيديو'));document.head.appendChild(s);
  });
  await window.__professionalYTPromise;
 }
 window.professionalCourseWatch=async function(n){
  resetIfAccountChanged();
  const l=lesson(Number(n));if(!backendReady||!l||!unlocked(l.lesson_no))return;
  const box=document.getElementById('professionalInlineBox');
  if(!box||Number(box.dataset.no)!==l.lesson_no)return;
  stopMovie();selected=l.lesson_no;selectedAuto=false;
  box.innerHTML='<div id="professionalYT"></div>';
  const m={no:l.lesson_no,box,player:null,session:null,watching:false};movie=m;
  m.session=E().createWatch({track:'professional',lessonNo:l.lesson_no,watchCompleted:!!l.completed,quizReady:()=>!!l.published,
   onMessage:t=>{if(movie===m)message(t);},
   onProgress:p=>{showProgress(m,p);if(p.attempt&&!m.watching&&movie===m){m.watching=true;render();}},
   onCompleted:()=>{l.completed=true;if(movie===m)render();}});
  showProgress(m,{percent:0});message('جارٍ تحميل المشغل…');
  try{
   await youtube();if(movie!==m)return;
   m.player=new window.YT.Player('professionalYT',{videoId:l.video_id,playerVars:{rel:0,disablekb:1,playsinline:1,controls:1,start:0},
    events:{onReady:()=>{if(movie!==m)return;m.session.attach(m.player);try{m.player.playVideo();}catch(_){}},
     onStateChange:e=>{if(movie===m)m.session.onState(e.data);},
     onPlaybackRateChange:e=>{if(movie===m)m.session.onRate(e.data);}}});
  }catch(e){message(e.message||'تعذر تحميل الفيديو');}
 };
 function closeQuiz(){exam=null;document.querySelectorAll('.professional-course-overlay').forEach(x=>x.remove());}
 window.professionalCourseQuiz=async function(n){
  resetIfAccountChanged();
  const l=lesson(Number(n));if(!backendReady||!l)return;
  if(!unlocked(l.lesson_no)||!l.completed||!l.published)return;
  stopMovie();closeQuiz();
  const cover=document.createElement('div');cover.className='basic-bag-overlay professional-course-overlay';
  cover.innerHTML='<div class="basic-bag-modal" role="dialog" aria-modal="true"><header><strong></strong>'+
   '<button type="button" class="name-list-btn" id="professionalQuizClose">✕ إغلاق</button></header><div id="professionalQuizBody"></div></div>';
  cover.querySelector('strong').textContent='اختبار التدريب الاحترافي '+(LABELS[l.lesson_no-1]||l.lesson_no)+' — '+l.title;
  document.body.appendChild(cover);
  cover.querySelector('#professionalQuizClose').onclick=()=>{closeQuiz();render();};
  const body=cover.querySelector('#professionalQuizBody');body.textContent='جارٍ تحميل الاختبار المعتمد…';
  try{
   const r=await E().rpc('professional_training_get_quiz',{p_lesson_no:l.lesson_no});
   if(!Array.isArray(r.questions)||r.questions.length!==20)throw Error('الأسئلة المعتمدة غير مكتملة');
   exam={no:l.lesson_no,revision:r.revision,answers:Array(20).fill(-1),busy:false};
   const e=exam;body.replaceChildren();
   const form=document.createElement('form');form.className='basic-bag-exam';let pager=null;
   const sections=r.questions.map((q,i)=>{
    const sec=document.createElement('fieldset');sec.className='basic-bag-question';
    const legend=document.createElement('legend');legend.textContent='السؤال '+(i+1)+' — '+q.question;sec.appendChild(legend);
    q.options.forEach((opt,k)=>{
     const label=document.createElement('label'),radio=document.createElement('input');
     radio.type='radio';radio.name='professional_q_'+i;radio.value=String(k);
     radio.addEventListener('change',()=>{e.answers[i]=k;pager.update();});
     label.append(radio,document.createTextNode(['أ','ب','ج','د'][k]+'. '+opt));sec.appendChild(label);
    });
    form.appendChild(sec);return sec;
   });
   pager=E().pageQuestions(form,sections,{finishLabel:'إنهاء الاختبار وتصحيحه',isAnswered:i=>e.answers[i]!==-1,onFinish:async()=>{
    if(e.busy||e.answers.includes(-1))return;e.busy=true;pager.finish.disabled=true;pager.finish.textContent='جارٍ التصحيح…';
    try{
     const g=await E().rpc('professional_training_submit_quiz',{p_lesson_no:e.no,p_answers:e.answers,p_revision:e.revision});
     body.replaceChildren();const box=document.createElement('div');box.className='basic-bag-result';
     const h=document.createElement('h2');h.textContent='درجة الاختبار: '+Math.round(100*Number(g.score||0)/(Number(g.out_of)||20))+' / 100';box.appendChild(h);
     const p=document.createElement('p');p.textContent=g.passed?E().MESSAGES.passed:E().MESSAGES.failed;box.appendChild(p);
     E().appendQuizMistakeReview(box,g);
     body.appendChild(box);await load();
    }catch(err){const note=document.createElement('p');note.className='basic-bag-notice';note.textContent='تعذر التصحيح: '+err.message;body.prepend(note);e.busy=false;pager.finish.disabled=false;pager.finish.textContent='إنهاء الاختبار وتصحيحه';}
   }});
   body.appendChild(form);
  }catch(err){body.textContent=err.message||'تعذر تحميل الاختبار';}
 };
})();
