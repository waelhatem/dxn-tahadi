/* Original basic bag: isolated from legacy training IDs, stars, and exam results.
 * Bank #4 is the original approved question set; #1-#3 require exact source texts.
 * Only member-initiated watch and exam calls; no background requests.
 */
(function(){
 'use strict';
 if(window.__DXN_BASIC_BAG__)return;
 window.__DXN_BASIC_BAG__=true;
 const lessons=[
  {no:1,title:'التعريف بشركة DXN العالمية',video:'78HTmcWYqN4'},
  {no:2,title:'منتجات DXN – فوائدها واستخداماتها',video:null},
  {no:3,title:'نظام DXN للبيع المباشر والتسويق متعدد المستويات',video:'7BBYsbPgX1M'},
  {no:4,title:'خطة DXN المالية وكيف تحقق دخلًا عاليًا بوقت مثالي',video:'ArJSiW2E4TM'}
 ];
 let loaded=false,backendReady=false,loading=false,progress=[],published=[],scores=[],movie=null,exam=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
 const currentLesson=n=>lessons.find(x=>x.no===Number(n));
 const statusOf=n=>progress.find(x=>x.training_no===n)||{watched:0,duration:0,completed:false};
 // Successful completion of the previous training means video + submitted exam.
 function lessonUnlock(no){if(no===1)return true;return !!statusOf(no-1).completed&&scores.some(x=>Number(x.training_no)===no-1);}
 // Preview in the draft branch only; not a graded attempt.
 const previewOnly=true;
 function safeToast(s){if(typeof window.toast==='function')window.toast(s);else console.info(s);}
 function authToken(){return String(localStorage.getItem('dxn_session')||'').trim();}
 async function rpc(fn,args={}){
  const tok=authToken();
  if(!tok)throw Error('سجل الدخول أولاً');
  const response=await fetch('/api/rpc',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fn,args:{p_token:tok,...args}})});
  const text=await response.text();let j;
  try{j=text?JSON.parse(text):{};}catch(_){j={};}
  if(!response.ok)throw Error(j.error||j.message||'خدمة حفظ التدريب غير متاحة');
  return j;
 }
 function refreshCards(){
  const host=document.getElementById('basicBagCards');
  if(!host)return;
  host.innerHTML=lessons.map(item=>{
   const p=statusOf(item.no);
   const pct=p.duration?Math.min(100,Math.round(100*p.watched/p.duration)):0;
   const unlocked=lessonUnlock(item.no);
   const quizOn=published.includes(item.no);
   const testLabel=quizOn?'🧠 اختبار التدريب': '🧠 اختبار التدريب — لم يُنشر بعد';
   const watchLabel=!unlocked?'🔒 التدريب مغلق':p.completed?'🔁 إعادة المشاهدة':p.watched>0?'▶ متابعة المشاهدة':'▶ بدء التدريب';
   const score=scores.find(s=>s.training_no===item.no);
   return '<article class="basic-bag-lesson"><div class="basic-bag-lesson-main">'+
    '<div class="basic-bag-number">التدريب الأساسي '+item.no+'</div><h3>'+esc(item.title)+'</h3>'+
    '<div class="basic-bag-description">المدرب: المهندس محمود المصري</div>'+
    '<div class="basic-bag-status">'+(!unlocked?'🔒 أكمل مشاهدة التدريب السابق واختباره أولًا':p.completed?'✅ تمت مشاهدة الفيديو كاملاً':p.watched?'⏳ مشاهدة غير مكتملة':'▶️ لم تبدأ المشاهدة')+'</div>'+
    '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+pct+'%</strong>'+
    '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><div style="width:'+pct+'%"></div></div></div>'+
    '<div class="basic-bag-description">نسبة المشاهدة: '+pct+'%'+(!backendReady?' — غير محفوظة في هذه المعاينة':'')+
    (score?' | آخر نتيجة: <strong>'+score.score+'/20</strong>':'')+'</div></div>'+
    '<div class="basic-bag-actions">'+
      (item.video?'<button type="button" class="name-list-btn name-list-primary" onclick="basicBagStartVideo('+item.no+')" '+(!unlocked?'disabled':'')+'>'+watchLabel+'</button>':
       '<button type="button" disabled class="name-list-btn">⏳ رابط الفيديو الثاني قيد الاسترجاع</button>')+
      '<button type="button" class="name-list-btn" onclick="basicBagStartQuiz('+item.no+')" '+
      (!unlocked||!backendReady||!p.completed||!quizOn?'disabled':'')+'>'+testLabel+'</button>'+
      (previewOnly&&item.no===1?'<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFirstQuiz()">👁 معاينة تصميم الاختبار الأول</button>':'')+
      '</div></article>';
  }).join('');
 }
 function courseHtml(){
  if(!loading&&!loaded){loading=true;setTimeout(loadOverview,0);}
  return '<section id="trainingBasicBagStart" class="card basic-bag-page"><div class="title">📘 التدريبات الأساسية — حقيبة المهندس محمود المصري</div>'+
   '<p class="muted">كل تدريب يُفتح بعد مشاهدة التدريب السابق كاملًا وإكمال اختباره. يمكنك الرجوع داخل الفيديو دون تخطي أجزاء لم تُشاهد.</p>'+
   '<p id="basicBagNotice" class="basic-bag-notice">لم يتغير سجل التدريبات القديمة أو اختبارات الأعضاء الحالية.</p>'+
   '<div id="basicBagCards" class="basic-bag-cards"></div></section>';
 }
 async function loadOverview(){
  try {
   const r=await rpc('basic_training_overview');
   if(!Array.isArray(r.progress)||!Array.isArray(r.published_quizzes)||!Array.isArray(r.scores))throw Error('تنسيق الاستجابة غير صحيح');
   progress=r.progress; published=r.published_quizzes;scores=r.scores;
   loaded=true;backendReady=true;
   const n=document.getElementById('basicBagNotice');
   if(n)n.textContent='يُحفظ تقدم المشاهدة ونتيجة الاختبار داخل حساب العضو فقط.';
  }catch(e){
   const n=document.getElementById('basicBagNotice');
   if(n)n.textContent='المعاينة متاحة؛ لكن حفظ التقدم والاختبارات يحتاج تفعيل ترحيل Supabase المراجع. '+(e.message||'');
   loaded=true;backendReady=false;
  }finally{loading=false;refreshCards();}
 }
 function maybeLoad(){if(loaded){setTimeout(refreshCards,0);}return courseHtml();}
 async function ytApi(){
  if(window.YT&&window.YT.Player)return;
  if(typeof window.loadYouTubeAPI==='function'){await window.loadYouTubeAPI();return;}
  if(!window.__basicYTPromise)window.__basicYTPromise=new Promise((resolve,reject)=>{
   const old=window.onYouTubeIframeAPIReady;
   window.onYouTubeIframeAPIReady=function(){if(typeof old==='function')old();resolve();};
   const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
   script.onerror=()=>reject(Error('تعذر تحميل مشغل الفيديو'));document.head.appendChild(script);
  });
  await window.__basicYTPromise;
 }
 function createModal(title){
  const cover=document.createElement('div');cover.className='basic-bag-overlay';
  cover.innerHTML='<div class="basic-bag-modal" role="dialog" aria-modal="true"><header>'+
     '<strong></strong><button type="button" class="name-list-btn" id="basicBagClose">✕ إغلاق</button></header>'+
     '<div id="basicBagModalBody"></div></div>';
  cover.querySelector('strong').textContent=title;
  document.body.appendChild(cover);
  cover.querySelector('#basicBagClose').onclick=close;
  return cover;
 }
 function close(){
  if(movie){
   if(movie.timer)clearInterval(movie.timer);
   try{movie.player?.destroy();}catch(_){}
   movie=null;
  }
  exam=null;
  document.querySelectorAll('.basic-bag-overlay').forEach(x=>x.remove());
  document.removeEventListener('keydown',escapeClose);
  setTimeout(refreshCards,10);
 }
 function escapeClose(e){if(e.key==='Escape')close();}
 function watchMessage(t){
  const x=document.getElementById('basicWatchInfo');if(x)x.textContent=t;
 }
 function watchPct(){
  const bar=document.getElementById('basicWatchProgress');
  if(!movie||!bar)return;
  const p=movie.duration?Math.min(100,Math.round(100*movie.max/movie.duration)):0;
  bar.querySelector('div').style.width=p+'%';
  const out=document.getElementById('basicWatchPct');if(out)out.textContent=p+'%';
 }
 async function heartbeat(force){
  const m=movie;if(!m||m.saving||!m.duration)return;
  if(!backendReady){watchMessage('معاينة فقط: يلزم تفعيل قاعدة البيانات لحفظ المشاهدة.');return;}
  if(!force&&Date.now()-m.lastSent<5000)return;
  m.lastSent=Date.now();m.saving=true;
  try{
   const r=await rpc('basic_training_watch_update',{
       p_training_no:m.no,p_current:Math.floor(m.max),p_duration:Math.floor(m.duration)});
   if(movie!==m)return;
   m.confirmed=Math.max(m.confirmed||0,fmt(r.watched));
   const previous=progress.find(x=>x.training_no===m.no);
   if(previous)Object.assign(previous,{watched:r.watched,duration:m.duration,completed:!!r.completed});
   else progress.push({training_no:m.no,watched:r.watched,duration:m.duration,completed:!!r.completed});
   if(!r.completed)watchMessage('نسبة المشاهدة المحفوظة: '+Math.round(100*m.confirmed/m.duration)+'%');
   else{
     watchMessage('✅ اكتملت مشاهدة التدريب. يمكنك الآن أداء اختباره.');
    }
  }catch(e){watchMessage('لم يتم حفظ التقدم: '+e.message);}
  finally{m.saving=false;}
 }
 function tick(){
  const m=movie;if(!m||!m.player||!m.ready)return;
  let current,duration,state;
  try{current=m.player.getCurrentTime();duration=m.player.getDuration();state=m.player.getPlayerState();}catch(_){return;}
  if(!Number.isFinite(current)||!Number.isFinite(duration)||duration<=0)return;
  m.duration=duration;
  // Enforce chronology; backward seeking is always allowed.
  if(current>m.max+2.4){m.player.seekTo(Math.max(0,m.max),true);watchMessage('التقديم اليدوي غير متاح؛ يمكنك الرجوع إلى الأجزاء السابقة.');return;}
  const now=performance.now(),elapsed=Math.max(0,Math.min((now-m.previousWall)/1000,2.0));
  const previousTime=m.previousTime; m.previousTime=current;m.previousWall=now;
  const moving=current>=previousTime-0.2&&current-previousTime<=elapsed+1.0;
  if(state===window.YT.PlayerState.PLAYING&&moving&&current>m.max){
    m.max=Math.min(duration,current);watchPct();heartbeat(false);
  }
  if(current>=duration-3.5 && m.max>=duration-4.5){heartbeat(true);}
 }
 window.basicBagStartVideo=async function(no){
  const item=currentLesson(no);if(!item||!item.video)return safeToast('رابط الفيديو غير متوفر');
  if(!lessonUnlock(Number(no)))return safeToast('التدريب مغلق: أكمل مشاهدة التدريب السابق واختباره');
  close();const c=createModal(item.title);document.addEventListener('keydown',escapeClose);
  const body=c.querySelector('#basicBagModalBody');
  body.innerHTML='<div class="basic-bag-player"><div id="basicBagYT"></div></div>'+
   '<div class="basic-bag-inline-progress"><div id="basicWatchProgress" class="basic-bag-progress"><div></div></div>'+
   '<strong id="basicWatchPct">0%</strong></div><p id="basicWatchInfo" class="basic-bag-notice">جارٍ تحميل المشغل…</p>'+
   '<p class="basic-bag-description">يسمح بإعادة المشاهدة والرجوع إلى الخلف؛ لا يسمح بالقفز إلى أجزاء لم تُشاهد.</p>';
  const saved=statusOf(item.no);movie={no:item.no,max:fmt(saved.watched),confirmed:fmt(saved.watched),duration:fmt(saved.duration),
    previousWall:performance.now(),previousTime:0,player:null,ready:false,timer:null,lastSent:0,saving:false};
  try{
   await ytApi();if(!movie||movie.no!==item.no)return;
   const m=movie;m.player=new window.YT.Player('basicBagYT',{
     videoId:item.video,playerVars:{rel:0,disablekb:1,playsinline:1,controls:1,cc_load_policy:1,cc_lang_pref:'ar'},
     events:{onReady:function(){
        if(movie!==m)return;m.ready=true;m.duration=m.player.getDuration();
        if(m.max>0)m.player.seekTo(Math.min(m.max,m.duration),true);
        m.previousTime=m.player.getCurrentTime();m.previousWall=performance.now();
        watchPct();watchMessage('مسموح بالمشاهدة حتى '+Math.round(m.max)+' ثانية من بداية الفيديو.');
        m.timer=setInterval(tick,600);
      },onStateChange:function(e){
        if(movie!==m)return;
        if(e.data===window.YT.PlayerState.ENDED){tick();heartbeat(true);}
      }}
   });
  }catch(e){watchMessage(e.message||'تعذر تحميل الفيديو');}
 };
 window.basicBagStartQuiz=async function(no){
  const item=currentLesson(no),p=statusOf(Number(no));
  if(!item)return;
  if(!lessonUnlock(Number(no)))return safeToast('التدريب مغلق: أكمل التدريب السابق أولًا');
  if(!backendReady)return safeToast('يجب تفعيل قاعدة البيانات قبل تقديم الاختبارات');
  if(!p.completed)return safeToast('أكمل مشاهدة الفيديو أولًا');
  close();const modal=createModal('اختبار '+item.title);
  document.addEventListener('keydown',escapeClose);
  const body=modal.querySelector('#basicBagModalBody');
  body.textContent='جارٍ تحميل الاختبار المعتمد…';
  try{
   const list=await rpc('basic_training_get_quiz',{p_training_no:item.no});
   if(!Array.isArray(list)||list.length!==20||list.some(q=>!Array.isArray(q.options)||q.options.length!==3))
     throw Error('الأسئلة المعتمدة غير مكتملة');
   exam={no:item.no,questions:list,answers:Array(20).fill(-1),busy:false};
   renderExam();
  }catch(e){body.textContent=e.message||'تعذر تحميل الأسئلة';}
 };
 function renderExam(){
  const e=exam;if(!e)return;
  const body=document.getElementById('basicBagModalBody');if(!body)return;
  body.replaceChildren();
  const f=document.createElement('form');f.className='basic-bag-exam';
  f.addEventListener('submit',async ev=>{
   ev.preventDefault();if(e.busy)return;
   if(e.answers.includes(-1)){safeToast('أجب عن جميع الأسئلة العشرين');return;}
   e.busy=true;const submit=f.querySelector('[type=submit]');submit.disabled=true;submit.textContent='جارٍ التصحيح الآلي…';
   try{
    const graded=await rpc('basic_training_submit_quiz',{p_training_no:e.no,p_answers:e.answers});
    body.replaceChildren();const result=document.createElement('div');result.className='basic-bag-result';
    const h=document.createElement('h2');h.textContent='نتيجتك: '+graded.score+' / '+graded.out_of;result.appendChild(h);
    const explain=document.createElement('p');explain.textContent='تم تصحيح الاختبار آليًا وحفظ النتيجة في حسابك.';result.appendChild(explain);
    if(Array.isArray(graded.details)){
      const wrong=graded.details.filter(d=>d.chosen!==d.correct);
      const p=document.createElement('p');p.textContent=wrong.length?'الأسئلة التي تحتاج مراجعة: '+wrong.map(x=>x.no).join('، '):'أجبت عن جميع الأسئلة بصورة صحيحة.';
      result.appendChild(p);
    }
    body.appendChild(result);await loadOverview();
   }catch(err){safeToast(err.message||'تعذر التصحيح');submit.disabled=false;submit.textContent='إنهاء الاختبار وتصحيح الإجابات';e.busy=false;}
  });
  e.questions.forEach((q,i)=>{
   const sec=document.createElement('fieldset');sec.className='basic-bag-question';
   const legend=document.createElement('legend');legend.textContent='السؤال '+(i+1)+' — '+q.question;sec.appendChild(legend);
   q.options.forEach((opt,k)=>{
    const lbl=document.createElement('label');const radio=document.createElement('input');
    radio.type='radio';radio.name='basic_q_'+i;radio.value=String(k);
    radio.checked=e.answers[i]===k;radio.addEventListener('change',()=>e.answers[i]=k);
    lbl.append(radio,document.createTextNode(['أ','ب','ج'][k]+'. '+opt));sec.appendChild(lbl);
   });f.appendChild(sec);
  });
  const submit=document.createElement('button');submit.type='submit';submit.className='name-list-btn name-list-primary';
  submit.textContent='إنهاء الاختبار وتصحيح الإجابات';f.appendChild(submit);body.appendChild(f);
 }

 window.basicBagPreviewFirstQuiz=function(){
   if(!previewOnly)return;
   close();
   const modal=createModal('معاينة تصميم الاختبار الأساسي الأول');
   document.addEventListener('keydown',escapeClose);
   const body=modal.querySelector('#basicBagModalBody');
   body.classList.add('basic-bag-preview');
   const info=document.createElement('p');info.className='basic-bag-notice';
   info.textContent='معاينة مؤقتة للشكل فقط: السؤال الثامن هو النص المعتمد المتاح، والأسئلة التسعة عشر الأخرى تنتظر ملفاتها الأصلية. لا يُحفظ أي جواب أو نتيجة.';
   body.appendChild(info);
   const navigator=document.createElement('div');navigator.className='basic-bag-preview-index';
   for(let n=1;n<=20;n++){
     const chip=document.createElement('span');chip.className='basic-bag-preview-index-chip'+(n===8?' is-confirmed':'');
     chip.textContent=String(n);chip.title=n===8?'السؤال المسترجع بالنص المعتمد':'بانتظار استرجاع النص الأصلي';
     navigator.appendChild(chip);
   }
   body.appendChild(navigator);
   const section=document.createElement('fieldset');section.className='basic-bag-question';
   const legend=document.createElement('legend');legend.textContent='السؤال 8 — أي العبارات التالية تصف انتشار شركة DXN العالمي بصورة صحيحة؟';
   section.appendChild(legend);
   const options=[
     'لديها أعضاء وموزعون في أكثر من 180 دولة، وتخضع تراخيص نشاطها للأنظمة المحلية في كل دولة.',
     'تمتلك ترخيصًا موحدًا يسمح لها بممارسة جميع أنشطتها في 180 دولة دون تراخيص محلية.',
     'لديها 180 فرعًا رسميًا، وجميع منتجاتها مرخصة تلقائيًا في كل دولة.'
   ];
   options.forEach((answer,i)=>{
     const line=document.createElement('label'),radio=document.createElement('input');
     radio.type='radio';radio.name='preview_basic_1_q8';radio.value=String(i);
     line.append(radio,document.createTextNode(['أ','ب','ج'][i]+'. '+answer));section.appendChild(line);
   });
   body.appendChild(section);
   const notice=document.createElement('p');notice.className='basic-bag-notice';
   notice.textContent='عند إدراج الأسئلة الأصلية كاملة، ستظهر عشرون فقرة متتابعة وزر إنهاء الاختبار، ثم النتيجة المصححة آليًا. هذه المعاينة لا تحتسب محاولة.';
   body.appendChild(notice);
   const disabled=document.createElement('button');disabled.type='button';
   disabled.className='name-list-btn name-list-primary';disabled.disabled=true;
   disabled.textContent='إنهاء الاختبار وتصحيح الإجابات — معطّل في المعاينة';
   body.appendChild(disabled);
 };

 window.basicTrainingCourseHtml=maybeLoad;
})();
