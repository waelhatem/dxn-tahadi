/* Original basic bag: isolated from legacy training IDs, stars, and exam results.
 * Bank #4 is the original approved question set; #1-#3 require exact source texts.
 * Only member-initiated watch and exam calls; no background requests.
 */
(function(){
 'use strict';
 if(window.__DXN_BASIC_BAG__)return;
 window.__DXN_BASIC_BAG__=true;
 const lessons=[
  {no:1,title:'التعريف بمشروع DXN ومنتجاتها ونظامها التسويقي',video:'lxhnkUov9sE'},
  {no:2,title:'التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح',video:'K_N80xZlxXw'},
  {no:3,title:'منتجات DXN وأصنافها وطرق تسويقها',video:'n7W9LoCMdPo'},
  {no:4,title:'نظام البيع المباشر في DXN',video:'AMKtcQt8ltc'},
  {no:5,title:'خطة الأرباح والحوافز لشركة DXN',video:'Wa_Kp2U7x0E'},
  {no:6,title:'التطبيق العملي لخطة الأرباح خلال ستة أشهر',video:'G09ztpXOBBM'},
  {no:7,title:'تفعيل العضوية وتسجيل أعضاء الفريق',video:'kYJjJu2JQFI'}
 ];
 let loaded=false,backendReady=false,loading=false,progress=[],published=[],scores=[],movie=null,exam=null;
 let previewWatchedPercent=0;
 let previewWatchedPercent2=0;
 let previewWatchedPercent3=0;
 let previewWatchedPercent4=0;
 let previewWatchedPercent5=0;
 let previewWatchedPercent6=0;
 let previewWatchedPercent7=0;
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
 const host=document.getElementById('basicBagCards');if(!host)return;
 const pct=movie&&movie.duration?Math.min(100,Math.floor(100*movie.max/movie.duration)):Math.min(100,Math.floor(previewWatchedPercent));
 const later=[];
 host.innerHTML='<article class="basic-bag-lesson basic-one-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 1</div><h3>التعريف بمشروع DXN ومنتجاتها ونظامها التسويقي</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">▶️ الفيديو متاح والاختبار معروض للمعاينة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+pct+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة المشاهدة التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><div style="width:'+pct+'%"></div></div></div>'+
 '<p class="basic-bag-description">نسبة مشاهدة تجريبية أثناء هذه الجلسة — غير محفوظة.</p></div>'+
 '<div class="basic-bag-actions">'+
 '<button type="button" class="name-list-btn name-list-primary" onclick="basicBagStartVideo(1)">▶ بدء التدريب / إعادة المشاهدة</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFirstQuiz()">🧠 اختبار التدريب الأول الجديد — 20 سؤالًا</button>'+
 '</div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 2</div><h3>التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 المشاهدة النظامية مغلقة حتى إكمال التدريب الأول واختباره</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent2+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب الثاني" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div style="width:0%"></div></div></div>'+
 '<p class="basic-bag-description">الفيديو والاختبار الثاني الجديدان معتمدان للمراجعة؛ التقدم والدرجات تجريبية وغير محفوظة.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال الأول</button>'+ 
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSecondVideo()">👁 معاينة الفيديو الثاني</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSecondQuiz()">🧠 الاختبار الثاني الجديد — 20 سؤالًا</button></div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 3</div><h3>منتجات DXN وأصنافها وطرق تسويقها</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 يبقى التسلسل مقفلًا حتى إكمال التدريبين السابقين — المعاينة مستقلة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent3+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب الثالث التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+previewWatchedPercent3+'"><div style="width:'+previewWatchedPercent3+'%"></div></div></div>'+
 '<p class="basic-bag-description">معاينة الفيديو والاختبار المعتمدين؛ دون حفظ تقدم أو درجات.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال الثاني</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewThirdVideo()">👁 معاينة الفيديو الثالث</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewThirdQuiz()">🧠 اختبار التدريب الثالث — 20 سؤالًا</button></div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 4</div><h3>نظام البيع المباشر في DXN</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 التدريب التسلسلي مغلق حتى إكمال السابق — المعاينة متاحة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent4+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب الرابع التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+previewWatchedPercent4+'"><div style="width:'+previewWatchedPercent4+'%"></div></div></div>'+
 '<p class="basic-bag-description">الفيديو والاختبار الرابع معتمدان؛ لا تُحفظ النتائج أو المشاهدة في المعاينة.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال الثالث</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFourthVideo()">👁 معاينة الفيديو الرابع</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFourthQuiz()">🧠 الاختبار الرابع — 20 سؤالًا</button></div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 5</div><h3>خطة الأرباح والحوافز لشركة DXN</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 التدريب التسلسلي مغلق حتى إكمال الرابع — المعاينة متاحة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent5+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب الخامس التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+previewWatchedPercent5+'"><div style="width:'+previewWatchedPercent5+'%"></div></div></div>'+
 '<p class="basic-bag-description">المحاضرة الخامسة واختبارها المعتمد — معاينة دون حفظ تقدم أو درجات.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال الرابع</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFifthVideo()">👁 معاينة الفيديو الخامس</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFifthQuiz()">🧠 الاختبار الخامس — 20 سؤالًا</button></div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 6</div><h3>التطبيق العملي لخطة الأرباح خلال ستة أشهر</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 التدريب التسلسلي مغلق حتى إكمال الخامس — المعاينة متاحة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent6+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب السادس التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+previewWatchedPercent6+'"><div style="width:'+previewWatchedPercent6+'%"></div></div></div>'+
 '<p class="basic-bag-description">الفيديو والاختبار السادس المعتمدان؛ لا يتم حفظ التقدم أو الدرجات في المعاينة.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال الخامس</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSixthVideo()">👁 معاينة الفيديو السادس</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSixthQuiz()">🧠 الاختبار السادس — 20 سؤالًا</button></div></article>'+
 '<article class="basic-bag-lesson basic-two-stage"><div class="basic-bag-lesson-main">'+
 '<div class="basic-bag-number">التدريب الأساسي 7</div><h3>تفعيل العضوية وتسجيل أعضاء الفريق</h3>'+
 '<p class="basic-bag-description">المدرب: المهندس محمود المصري</p>'+
 '<div class="basic-bag-status">🔒 التدريب التسلسلي مغلق حتى إكمال السادس — المعاينة متاحة</div>'+
 '<div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+previewWatchedPercent7+'%</strong>'+
 '<div class="basic-bag-progress" role="progressbar" aria-label="نسبة مشاهدة التدريب السابع التجريبية" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+previewWatchedPercent7+'"><div style="width:'+previewWatchedPercent7+'%"></div></div></div>'+
 '<p class="basic-bag-description">الفيديو والاختبار السابع المعتمدان؛ لا يتم حفظ التقدم أو الدرجات في المعاينة.</p></div>'+
 '<div class="basic-bag-actions"><button type="button" class="name-list-btn" disabled>🔒 بدء التدريب بعد إكمال السادس</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSeventhVideo()">👁 معاينة الفيديو السابع</button>'+
 '<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewSeventhQuiz()">🧠 الاختبار السابع — 20 سؤالًا</button></div></article>'+
 later.map((name,i)=>'<article class="basic-bag-lesson basic-one-locked" aria-label="التدريب '+(i+4)+' مغلق"><div class="basic-bag-lesson-main"><div class="basic-bag-number">التدريب الأساسي '+(i+4)+'</div><h3>🔒 '+name+'</h3><p class="basic-bag-description">سنعمل عليه بعد الانتهاء من التدريب السابق واعتماده.</p></div><div class="basic-bag-actions"><button class="name-list-btn" type="button" disabled>🔒 التدريب مغلق</button></div></article>').join('');
}
 function courseHtml(){
  setTimeout(refreshCards,0);
  return '<section id="trainingBasicBagStart" class="card basic-bag-page"><div class="title">📘 التدريبات الأساسية — حقيبة المهندس محمود المصري</div>'+
   '<p class="muted">التدريبات الأساسية السبعة لها اختبارات معتمدة ومتاحة للمعاينة فقط؛ التسلسل الفعلي لا يزال مقفلًا.</p>'+
   '<p id="basicBagNotice" class="basic-bag-notice">معاينة المحتوى والتصميم فقط. لا يوجد حفظ للدرجات أو المشاهدة ولا ربط جديد بقاعدة البيانات.</p>'+
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
    m.max=Math.min(duration,current);if(m.no===7)previewWatchedPercent7=Math.floor(100*m.max/duration);else if(m.no===6)previewWatchedPercent6=Math.floor(100*m.max/duration);else if(m.no===5)previewWatchedPercent5=Math.floor(100*m.max/duration);else if(m.no===4)previewWatchedPercent4=Math.floor(100*m.max/duration);else if(m.no===3)previewWatchedPercent3=Math.floor(100*m.max/duration);else if(m.no===2)previewWatchedPercent2=Math.floor(100*m.max/duration);else previewWatchedPercent=Math.floor(100*m.max/duration);watchPct();
  }
  if(current>=duration-3.5 && m.max>=duration-4.5){heartbeat(true);}
 }
 window.basicBagStartVideo=async function(no){
  const item=currentLesson(no);if(!item||!item.video)return safeToast('رابط الفيديو غير متوفر');
  if(!lessonUnlock(Number(no))&&!((no===2&&window.__basicVideoTwoPreview)||(no===3&&window.__basicVideoThreePreview)||(no===4&&window.__basicVideoFourPreview)||(no===5&&window.__basicVideoFivePreview)||(no===6&&window.__basicVideoSixPreview)||(no===7&&window.__basicVideoSevenPreview)))return safeToast('التدريب مغلق: أكمل مشاهدة التدريب السابق واختباره');
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

 window.basicBagPreviewFirstQuiz=async function(number=1){
   if(number!==1&&number!==2&&number!==3&&number!==4&&number!==5&&number!==6&&number!==7)return;
   const isSecond=number===2;
   const isThird=number===3;
   const isFourth=number===4;
   const isFifth=number===5;
   const isSixth=number===6;
   const isSeventh=number===7;
   close();
   const modal=createModal('اختبار التدريب الأساسي '+(isSeventh?'السابع':isSixth?'السادس':isFifth?'الخامس':isFourth?'الرابع':isThird?'الثالث':isSecond?'الثاني':'الأول')+' — الأسئلة العشرون');
   document.addEventListener('keydown',escapeClose);
   const body=modal.querySelector('#basicBagModalBody');
   body.innerHTML='<p class="basic-bag-notice">'+(isSeventh?'الأسئلة العشرون المعتمدة للتدريب السابع مع التصحيح التجريبي، ولا تُحفظ النتائج. استعمل بريدًا دائمًا للعضوية الفعلية وراجع شروط التسجيل السارية.':isSixth?'الأسئلة العشرون المعتمدة للتدريب السادس. خطة الأشهر الستة مثال افتراضي وليست ضمانًا للدخل، ولا تُحفظ النتائج.':isFifth?'اختبار المحاضرة الخامسة: 20 سؤالًا معتمدًا وتصحيح تجريبي. الأرقام والعمولات وفق شرح المحاضر وقت التسجيل، دون ضمان عوائد مالية أو حفظ نتائج.':isFourth?'الأسئلة العشرون المعتمدة للمحاضرة الرابعة مع التصحيح التجريبي. الإحصاءات التاريخية والأقوال المنسوبة تعرض كما وردت في المحاضرة؛ لا حفظ للنتائج.':isThird?'الأسئلة العشرون المعتمدة للمحاضرة الثالثة مع تصحيح تجريبي. لا تُحفظ الإجابات أو النتائج. التوصيفات الصحية هي مما ذكره المحاضر ولا تثبت فعالية علاجية.':isSecond?'الأسئلة العشرون الجديدة المعتمدة للتدريب الثاني، وتصحيح آلي تجريبي وفق مفتاح الإجابات المعتمد. الأرقام والحوافز من وقت تسجيل المحاضرة ولا تضمن دخلًا. لا تُحفظ النتائج.':'اختبار المحاضرة الجديدة المعتمد: 20 سؤالًا، والتصحيح تجريبي داخل المتصفح فقط. الأرقام والمزايا تعكس كلام المحاضر وقت التسجيل ولا تمثل تحققًا مستقلًا أو ضمانًا للنتائج.')+'</p><p id="basicQuizLoad">جارٍ تحميل الأسئلة الأصلية…</p>';
   try{
      const response=await fetch(isSeventh?'../basic-training-07-new-quiz.json':isSixth?'../basic-training-06-new-quiz.json':isFifth?'../basic-training-05-new-quiz.json':isFourth?'../basic-training-04-new-quiz.json':isThird?'../basic-training-03-new-quiz.json':isSecond?'../basic-training-02-new-quiz.json':'../basic-training-01-new-quiz.json',{cache:'no-store'});
      if(!response.ok)throw Error('ملف الأسئلة غير متاح');
      const qs=await response.json();
      if(!Array.isArray(qs)||qs.length!==20||qs.some(q=>!q.question||!Array.isArray(q.options)||q.options.length<2||(q.answer!==null&&(!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length))))throw Error('الأسئلة العشرون غير مكتملة');
      if(!modal||!modal.isConnected)return;
      const loading=body.querySelector('#basicQuizLoad');if(loading)loading.remove();
      const form=document.createElement('form');form.className='basic-bag-exam';
      const counter=document.createElement('p');counter.className='basic-bag-status';counter.textContent='الإجابات: 0 / 20';form.append(counter);
      const answers=Array(20).fill(null);
      qs.forEach((q,i)=>{
         const section=document.createElement('fieldset');section.className='basic-bag-question';
         const legend=document.createElement('legend');legend.textContent=(i+1)+'. '+q.question;section.append(legend);
         q.options.forEach((opt,j)=>{
           const label=document.createElement('label'),radio=document.createElement('input');
           radio.type='radio';radio.name='basic_'+number+'_'+i;radio.value=String(j);
           radio.addEventListener('change',()=>{answers[i]=j;counter.textContent='الإجابات: '+answers.filter(v=>v!==null).length+' / 20';});
           label.append(radio,document.createTextNode(' '+(q.options.length===2&&q.options[0]==='صح'?'':(['أ','ب','ج','د'][j]||String(j+1))+'. ')+opt));
           section.append(label);
         });
         form.append(section);
      });
      const submit=document.createElement('button');submit.type='submit';submit.className='name-list-btn name-list-primary';submit.textContent='إنهاء الاختبار والتصحيح التجريبي';form.append(submit);
      form.addEventListener('submit',e=>{
        e.preventDefault();
        if(answers.includes(null)){alert('أجب عن جميع الأسئلة العشرين أولًا');return;}
        
        const approved=qs.filter(q=>Number.isInteger(q.answer));
        const score=qs.reduce((total,q,i)=>total+(Number.isInteger(q.answer)&&answers[i]===q.answer?1:0),0);
        const result=document.createElement('div');result.className='basic-bag-result';
        const h=document.createElement('h2');h.textContent='نتيجتك التجريبية: '+score+' / '+approved.length;result.append(h);
        const hint=document.createElement('p');hint.textContent=isSeventh?'هذه نتيجة اختبار التدريب السابع التجريبية من 20 درجة، ولا تُحفظ الإجابات أو النتيجة.':isSixth?'هذه نتيجة اختبار التدريب السادس التجريبية من 20 درجة، ولا تُحفظ الإجابات أو النتيجة.':isFifth?'هذه نتيجة اختبار التدريب الخامس التجريبية من 20 درجة، ولا تُحفظ الإجابات أو النتيجة.':isFourth?'هذه نتيجة اختبار التدريب الرابع التجريبية من 20 درجة، ولا تُحفظ الإجابات أو النتيجة.':isThird?'هذه نتيجة اختبار التدريب الثالث التجريبية من 20 درجة. لم تُحفظ الإجابات أو النتيجة ولم تفتح التدريب الرابع.':isSecond?'هذه نتيجة اختبار التدريب الثاني التجريبية من 20 درجة. لم تُحفظ الإجابات أو النتيجة ولم تفتح التدريب الثالث.':'هذه نتيجة للمراجعة فقط، لم تُحفظ ولم تؤثر على فتح التدريب التالي. جميع الأسئلة العشرين معتمدة ضمن هذا الاختبار الجديد.';result.append(hint);
        const wrong=qs.map((q,i)=>Number.isInteger(q.answer)&&answers[i]!==q.answer?{i,answer:q.options[q.answer]}:null).filter(Boolean);
        const text=document.createElement('p');text.textContent=wrong.length?'أسئلة تحتاج مراجعة: '+wrong.map(v=>v.i+1).join('، '):'جميع الإجابات صحيحة';result.append(text);
        wrong.forEach(v=>{const row=document.createElement('p');row.textContent='س'+(v.i+1)+' — الإجابة الصحيحة وفق المفتاح المعتمد: '+v.answer;result.append(row);});
        form.replaceWith(result);
      });
      body.append(form);
   }catch(e){const loading=body.querySelector('#basicQuizLoad');if(loading)loading.textContent='تعذر تحميل الأسئلة: '+(e.message||e);}
 };

 window.basicBagPreviewSecondQuiz=()=>window.basicBagPreviewFirstQuiz(2);
 window.basicBagPreviewSecondVideo=async()=>{window.__basicVideoTwoPreview=true;try{await window.basicBagStartVideo(2);}finally{window.__basicVideoTwoPreview=false;}};
 window.basicBagPreviewThirdQuiz=()=>window.basicBagPreviewFirstQuiz(3);
 window.basicBagPreviewThirdVideo=async()=>{window.__basicVideoThreePreview=true;try{await window.basicBagStartVideo(3);}finally{window.__basicVideoThreePreview=false;}};
 window.basicBagPreviewFourthQuiz=()=>window.basicBagPreviewFirstQuiz(4);
 window.basicBagPreviewFourthVideo=async()=>{window.__basicVideoFourPreview=true;try{await window.basicBagStartVideo(4);}finally{window.__basicVideoFourPreview=false;}};
 window.basicBagPreviewFifthQuiz=()=>window.basicBagPreviewFirstQuiz(5);
 window.basicBagPreviewFifthVideo=async()=>{window.__basicVideoFivePreview=true;try{await window.basicBagStartVideo(5);}finally{window.__basicVideoFivePreview=false;}};
 window.basicBagPreviewSixthQuiz=()=>window.basicBagPreviewFirstQuiz(6);
 window.basicBagPreviewSixthVideo=async()=>{window.__basicVideoSixPreview=true;try{await window.basicBagStartVideo(6);}finally{window.__basicVideoSixPreview=false;}};
 window.basicBagPreviewSeventhQuiz=()=>window.basicBagPreviewFirstQuiz(7);
 window.basicBagPreviewSeventhVideo=async()=>{window.__basicVideoSevenPreview=true;try{await window.basicBagStartVideo(7);}finally{window.__basicVideoSevenPreview=false;}};
 window.basicTrainingCourseHtml=courseHtml;
})();
