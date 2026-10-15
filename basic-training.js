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
  {no:7,title:'تفعيل العضوية وتسجيل أعضاء الفريق',video:'kYJjJu2JQFI'},
  {no:8,title:'أساسيات النجاح التسعة مع DXN',video:'v4gYSL-KuHQ'}
 ];
 let loaded=false,backendReady=false,loading=false,progress=[],published=[],scores=[],movie=null,exam=null,viewerRole='';
 let overviewError='';
 let previewWatchedPercent=0;
 let previewWatchedPercent2=0;
 let previewWatchedPercent3=0;
 let previewWatchedPercent4=0;
 let previewWatchedPercent5=0;
 let previewWatchedPercent6=0;
 let previewWatchedPercent7=0;
 let previewWatchedPercent8=0;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
 const currentLesson=n=>lessons.find(x=>x.no===Number(n));
 const statusOf=n=>progress.find(x=>x.training_no===n)||{watched:0,duration:0,completed:false};
 // Successful completion of the previous training means video + submitted exam.
 function lessonUnlock(no){if(no===1)return true;return !!statusOf(no-1).completed&&scores.some(x=>Number(x.training_no)===no-1&&x.passed===true);}
 // Approved tests can still be previewed without saving; live attempts require RPC.
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
 /* V86.80 — Unified visual layout, as in the advanced training: lesson list on the right and the
  * selected lesson's player on the left. Only the rendering layer changed: the same buttons call
  * the same functions, and watch/quiz/save calls and lock rules are untouched. */
 let selectedNo=0,selectedAuto=true;
 const PREVIEW_VIDEO={2:'basicBagPreviewSecondVideo',3:'basicBagPreviewThirdVideo',4:'basicBagPreviewFourthVideo',5:'basicBagPreviewFifthVideo',6:'basicBagPreviewSixthVideo',7:'basicBagPreviewSeventhVideo',8:'basicBagPreviewEighthVideo'};
 const PREVIEW_QUIZ={1:'basicBagPreviewFirstQuiz',2:'basicBagPreviewSecondQuiz',3:'basicBagPreviewThirdQuiz',4:'basicBagPreviewFourthQuiz',5:'basicBagPreviewFifthQuiz',6:'basicBagPreviewSixthQuiz',7:'basicBagPreviewSeventhQuiz',8:'basicBagPreviewEighthQuiz'};
 const PREVIEW_STATUS={1:'▶️ الفيديو متاح والاختبار معروض للمعاينة',2:'🔒 المشاهدة النظامية مغلقة حتى إكمال التدريب الأول واختباره',
  3:'🔒 يبقى التسلسل مقفلًا حتى إكمال التدريبين السابقين — المعاينة مستقلة',4:'🔒 التدريب التسلسلي مغلق حتى إكمال السابق — المعاينة متاحة',
  5:'🔒 التدريب التسلسلي مغلق حتى إكمال الرابع — المعاينة متاحة',6:'🔒 التدريب التسلسلي مغلق حتى إكمال الخامس — المعاينة متاحة',
  7:'🔒 التدريب التسلسلي مغلق حتى إكمال السادس — المعاينة متاحة',8:'🔒 التدريب التسلسلي مغلق حتى إكمال السابع — المعاينة متاحة'};
 const PREVIEW_NOTE={1:'نسبة مشاهدة تجريبية أثناء هذه الجلسة — غير محفوظة.',2:'الفيديو والاختبار الثاني الجديدان معتمدان للمراجعة؛ التقدم والدرجات تجريبية وغير محفوظة.',
  3:'معاينة الفيديو والاختبار المعتمدين؛ دون حفظ تقدم أو درجات.',4:'الفيديو والاختبار الرابع معتمدان؛ لا تُحفظ النتائج أو المشاهدة في المعاينة.',
  5:'المحاضرة الخامسة واختبارها المعتمد — معاينة دون حفظ تقدم أو درجات.',6:'الفيديو والاختبار السادس المعتمدان؛ لا يتم حفظ التقدم أو الدرجات في المعاينة.',
  7:'الفيديو والاختبار السابع المعتمدان؛ لا يتم حفظ التقدم أو الدرجات في المعاينة.',8:'الفيديو والاختبار الثامن المعتمدان؛ لا يتم حفظ التقدم أو الدرجات في المعاينة.'};
 const canPreviewQuiz=()=>viewerRole==='leader'&&window.innerWidth>=900;
 // Locked lessons stay unselectable for members, as in the reference; the leader can still open
 // them to reach the unsaved quiz preview that the old cards offered on every training.
 const canSelect=no=>!backendReady||lessonUnlock(no)||canPreviewQuiz();
 function previewPct(no){
  if(no===1)return movie&&movie.duration?Math.min(100,Math.floor(100*movie.max/movie.duration)):Math.min(100,Math.floor(previewWatchedPercent));
  return [0,0,previewWatchedPercent2,previewWatchedPercent3,previewWatchedPercent4,previewWatchedPercent5,previewWatchedPercent6,previewWatchedPercent7,previewWatchedPercent8][no]||0;
 }
 // Everything the page shows for one lesson; the calls are the ones the old cards used.
 function lessonView(no){
  if(!backendReady){
   return {icon:'▶',pct:previewPct(no),pctLabel:'نسبة المشاهدة التجريبية',
    play:no===1?'basicBagStartVideo(1)':PREVIEW_VIDEO[no]+'()',playLabel:no===1?'▶ بدء التدريب / إعادة المشاهدة':'👁 معاينة الفيديو',
    quiz:PREVIEW_QUIZ[no]+'()',quizEnabled:true,quizLabel:'📝 ابدأ اختبار الدرس (معاينة)',preview:'',
    status:PREVIEW_STATUS[no],score:'',note:PREVIEW_NOTE[no]};
  }
  const p=statusOf(no),unlocked=lessonUnlock(no),passed=!!p.passed,watchReady=!!p.completed;
  const quizEnabled=unlocked&&watchReady;
  return {icon:passed?'✅':unlocked?'▶':'🔒',
   pct:Math.min(100,Math.max(0,Math.round(100*fmt(p.watched)/(fmt(p.duration)||1)))),pctLabel:'المشاهدة المحفوظة',
   play:unlocked?'basicBagStartVideo('+no+')':'',playLabel:unlocked?'▶ '+(watchReady?'إعادة المشاهدة':'بدء / متابعة المشاهدة'):'🔒 أكمل التدريب السابق واجتز اختباره أولًا',
   quiz:'basicBagStartQuiz('+no+')',quizEnabled,quizLabel:'📝 '+(passed?'إعادة اختبار الدرس':quizEnabled?'ابدأ اختبار الدرس':'اختبار الدرس — غير متاح'),
   preview:canPreviewQuiz()?'<button type="button" class="name-list-btn basic-bag-preview-btn" onclick="basicBagPreviewFirstQuiz('+no+')">👁 معاينة الاختبار (غير محفوظة)</button>':'',
   status:passed?'✅ اجتاز التدريب':watchReady?'✅ اكتملت المشاهدة — الاختبار متاح':unlocked?'▶ متابعة المشاهدة حتى 90%':'🔒 أكمل التدريب السابق واجتز اختباره أولًا',
   score:'أفضل درجة اختبار: '+((p.best_score===null||p.best_score===undefined)?'لم يُختبر بعد':Math.round(Number(p.best_score)*5)+' / 100'),
   note:'شرط اجتياز التدريب: مشاهدة 90% والحصول على 80 / 100 على الأقل. يمكن إعادة الاختبار عند الرسوب.'};
 }
 // The member lands on the first training still to pass, until they pick one themselves.
 function defaultLesson(){
  if(!backendReady)return 1;
  const open=lessons.filter(l=>lessonUnlock(l.no));
  const next=open.find(l=>!statusOf(l.no).passed)||open[open.length-1];
  return next?next.no:1;
 }
 function listHtml(){
  return lessons.map(item=>{
   const v=lessonView(item.no),active=item.no===selectedNo;
   return '<button type="button" class="advanced-profit-lesson" onclick="basicBagSelectLesson('+item.no+')" aria-pressed="'+active+'" '+(canSelect(item.no)?'':'disabled')+'>'+
    '<span class="advanced-profit-index">'+item.no+'</span><span>التدريب '+item.no+': '+esc(item.title)+'</span><span aria-hidden="true">'+v.icon+'</span></button>';
  }).join('');
 }
 function headHtml(item,v){
  return '<strong id="basicBagVideoTitle">التدريب الأساسي '+item.no+' من 8 — '+esc(item.title)+'</strong>'+
   '<div class="unified-training__actions"><span class="muted">المدرب: المهندس محمود المصري</span>'+v.preview+
   '<button type="button" class="name-list-btn unified-training__quiz-button" onclick="'+v.quiz+'" '+(v.quizEnabled?'':'disabled')+'>'+v.quizLabel+'</button></div>';
 }
 function infoHtml(v){
  return (v.score?'<p class="muted">'+esc(v.score)+'</p>':'')+'<p class="basic-bag-description">'+esc(v.note)+'</p>';
 }
 function viewerHtml(item,v){
  const poster='<button type="button" class="unified-training__play" '+(v.play?'onclick="'+v.play+'"':'disabled')+'>'+esc(v.playLabel)+'</button>';
  return '<div id="basicBagViewerHead">'+headHtml(item,v)+'</div>'+
   '<div class="training-professional-video unified-training__video" id="basicBagInlineBox" data-no="'+item.no+'">'+poster+'</div>'+
   '<div class="basic-bag-inline-progress unified-training__progress"><div id="basicWatchProgress" class="basic-bag-progress" role="progressbar" aria-label="'+v.pctLabel+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+v.pct+'"><div style="width:'+v.pct+'%"></div></div>'+
   '<strong id="basicWatchPct">'+v.pct+'%</strong></div>'+
   '<p id="basicWatchInfo" class="basic-bag-status">'+esc(v.status)+'</p>'+
   '<div id="basicBagViewerInfo">'+infoHtml(v)+'</div>';
 }
 function stopMovie(){
  if(!movie)return;
  if(movie.timer)clearInterval(movie.timer);
  try{movie.player?.destroy();}catch(_){}
  movie=null;
 }
 function refreshCards(){
 const host=document.getElementById('basicBagCards');if(!host)return;
 // The page was rebuilt (tab switch, re-render): an inline player left behind is gone with it.
 if(movie&&movie.inline&&!(movie.box&&movie.box.isConnected))stopMovie();
 if(selectedAuto||!canSelect(selectedNo))selectedNo=defaultLesson();
 const item=currentLesson(selectedNo)||lessons[0],v=lessonView(item.no);
 // A playing inline video must not be rebuilt: refresh the texts around it only.
 if(movie&&movie.inline&&movie.no===item.no){
  const list=document.getElementById('basicBagLessonList');if(list)list.innerHTML=listHtml();
  const head=document.getElementById('basicBagViewerHead');if(head)head.innerHTML=headHtml(item,v);
  const info=document.getElementById('basicBagViewerInfo');if(info)info.innerHTML=infoHtml(v);
  return;
 }
 if(movie&&movie.inline)stopMovie();
 host.innerHTML='<div class="advanced-profit-grid unified-training__layout">'+
  '<div id="basicBagLessonList" class="advanced-profit-list" aria-label="دروس التدريبات الأساسية">'+listHtml()+'</div>'+
  '<div class="advanced-profit-viewer unified-training__viewer">'+viewerHtml(item,v)+'</div></div>';
}
 window.basicBagSelectLesson=function(no){
  no=Number(no);if(!currentLesson(no)||!canSelect(no))return;
  selectedAuto=false;
  if(no===selectedNo)return;
  if(movie&&movie.inline)stopMovie();
  selectedNo=no;refreshCards();
 };
 // The notice is rebuilt on every render, so it must follow the saved-progress
 // state instead of a one-time text set after the first load.
 function noticeText(){
  if(!loaded)return authToken()?'جارٍ التحقق من حفظ التقدم والنتائج…':'سجّل الدخول لحفظ التقدم والنتائج.';
  if(backendReady)return '✅ حفظ التقدم والنتائج مفعل. شرط الاجتياز: مشاهدة 90% ودرجة اختبار 80 / 100. الاختبار يتكون من 20 سؤالًا.';
  return 'المعاينة متاحة؛ لكن حفظ التقدم والاختبارات يحتاج تفعيل ترحيل Supabase المراجع. '+overviewError;
 }
 function courseHtml(){
  setTimeout(refreshCards,0);
  return '<section id="trainingBasicBagStart" class="card basic-bag-page"><div class="title">📘 التدريبات الأساسية — حقيبة المهندس محمود المصري</div>'+
   '<p class="muted">ثمانية تدريبات بالترتيب؛ لكل تدريب فيديو واختبار معتمد من 20 سؤالًا، ولا يُفتح التدريب التالي قبل اجتياز السابق.</p>'+
   '<p id="basicBagNotice" class="basic-bag-notice">'+esc(noticeText())+'</p>'+
   '<details class="advanced-profit-course academy-camps-course unified-training"><summary><span class="advanced-profit-course-emoji">📘</span>'+
   '<span class="advanced-profit-course-copy"><strong>التدريبات الأساسية: حقيبة المهندس محمود المصري</strong>'+
   '<small>8 تدريبات متتابعة — فيديو واختبار من 20 سؤالًا لكل تدريب</small></span>'+
   '<span class="academy-camps-open-hint"><span class="academy-camps-hint-closed">▶ اضغط لعرض التدريبات الثمانية</span>'+
   '<span class="academy-camps-hint-open">▲ إغلاق قائمة التدريبات</span></span></summary><div class="advanced-profit-content">'+
   '<p class="muted">اختر التدريب من القائمة. يُفتح التدريب التالي بعد اجتياز اختبار السابق.</p>'+
   '<div id="basicBagCards" class="basic-bag-cards"></div></div></details></section>';
 }
 async function loadOverview(){
  try {
   const r=await rpc('basic_training_overview');
   if(!Array.isArray(r.progress)||!Array.isArray(r.published_quizzes)||!Array.isArray(r.scores))throw Error('تنسيق الاستجابة غير صحيح');
   progress=r.progress; published=r.published_quizzes;scores=r.scores;viewerRole=String(r.role||'');
   loaded=true;backendReady=true;
  }catch(e){
   overviewError=String(e.message||'');
   loaded=true;backendReady=false;
  }finally{
   loading=false;
   const n=document.getElementById('basicBagNotice');
   if(n)n.textContent=noticeText();
   refreshCards();
  }
 }
 function maybeLoad(){if(!loaded&&!loading&&authToken()){loading=true;setTimeout(loadOverview,0);}return courseHtml();}
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
  stopMovie();
  exam=null;
  document.querySelectorAll('.basic-bag-overlay').forEach(x=>x.remove());
  document.removeEventListener('keydown',escapeClose);
  setTimeout(refreshCards,10);
 }
 function escapeClose(e){if(e.key==='Escape')close();}
 function watchMessage(t){
  const x=document.getElementById('basicWatchInfo');if(x)x.textContent=t;
  // Inline player: once the server confirms 90%, the quiz button above the video opens at once.
  if(movie&&movie.inline&&!!statusOf(movie.no).completed!==movie.shownCompleted){movie.shownCompleted=!!statusOf(movie.no).completed;refreshCards();}
 }
 function watchPct(){
  const bar=document.getElementById('basicWatchProgress');
  if(!movie||!bar)return;
  const p=movie.duration?Math.min(100,Math.round(100*movie.max/movie.duration)):0;
  bar.querySelector('div').style.width=p+'%';
  const out=document.getElementById('basicWatchPct');if(out)out.textContent=p+'%';
 }
 // Server counts only reporting gaps >= 3 seconds. Every send, including
 // "force" and YouTube ended, must obey a longer interval.
 const HEARTBEAT_INTERVAL_MS=5200;
 async function heartbeat(force){
  const m=movie;if(!m||m.saving||!m.duration||m.completed)return;
  if(!backendReady){watchMessage('تعذر حفظ المشاهدة حاليًا؛ حاول بعد تسجيل الدخول مجددًا.');return;}
  // Avoid repeated reports when YouTube pauses at its end or after the
  // server already caught up with the locally watched point.
  if(m.lastSent && Date.now()-m.lastSent<HEARTBEAT_INTERVAL_MS)return;
  if(m.lastSent && Math.floor(m.max)<=m.confirmed)return;
  m.lastSent=Date.now();m.saving=true;
  try{
   const r=await rpc('basic_training_watch_update',{
       p_training_no:m.no,p_current:Math.floor(m.max),p_duration:Math.floor(m.duration)});
   if(movie!==m)return;
   m.confirmed=Math.max(m.confirmed||0,fmt(r.watched));
   m.completed=!!r.completed;
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
  // The server credits normal-time viewing only. If YouTube provides a
  // playback-rate API, keep playback at 1x to avoid false completion.
  try{
   if(typeof m.player.getPlaybackRate==='function'&&
      m.player.getPlaybackRate()>1.01){
    m.player.setPlaybackRate(1);
    watchMessage('سرعة المشاهدة المعتمدة هي 1x حتى تُحتسب مدة الفيديو.');
   }
  }catch(_){}
  if(current>m.max+2.4){m.player.seekTo(Math.max(0,m.max),true);watchMessage('التقديم اليدوي غير متاح؛ يمكنك الرجوع إلى الأجزاء السابقة.');return;}
  const now=performance.now(),elapsed=Math.max(0,Math.min((now-m.previousWall)/1000,2.0));
  const previousTime=m.previousTime; m.previousTime=current;m.previousWall=now;
  const moving=current>=previousTime-0.2&&current-previousTime<=elapsed+1.0;
  if(state===window.YT.PlayerState.PLAYING&&moving&&current>m.max){
    m.max=Math.min(duration,current);if(m.no===8)previewWatchedPercent8=Math.floor(100*m.max/duration);else if(m.no===7)previewWatchedPercent7=Math.floor(100*m.max/duration);else if(m.no===6)previewWatchedPercent6=Math.floor(100*m.max/duration);else if(m.no===5)previewWatchedPercent5=Math.floor(100*m.max/duration);else if(m.no===4)previewWatchedPercent4=Math.floor(100*m.max/duration);else if(m.no===3)previewWatchedPercent3=Math.floor(100*m.max/duration);else if(m.no===2)previewWatchedPercent2=Math.floor(100*m.max/duration);else previewWatchedPercent=Math.floor(100*m.max/duration);watchPct();
  }
  if(state===window.YT.PlayerState.PLAYING&&backendReady&&m.max>m.confirmed)heartbeat(false);
  // Near the end the YouTube player can stay paused/ENDED. Retrying is
  // allowed but only at the shared server-safe interval, never each tick.
  if(!m.completed&&current>=duration-3.5&&m.max>=duration-4.5
      &&Math.floor(m.max)>m.confirmed){heartbeat(true);}
 }
 window.basicBagStartVideo=async function(no){
  const item=currentLesson(no);if(!item||!item.video)return safeToast('رابط الفيديو غير متوفر');
  if(!lessonUnlock(Number(no))&&!((no===2&&window.__basicVideoTwoPreview)||(no===3&&window.__basicVideoThreePreview)||(no===4&&window.__basicVideoFourPreview)||(no===5&&window.__basicVideoFivePreview)||(no===6&&window.__basicVideoSixPreview)||(no===7&&window.__basicVideoSevenPreview)||(no===8&&window.__basicVideoEightPreview)))return safeToast('التدريب مغلق: أكمل مشاهدة التدريب السابق واختباره');
  close();
  // V86.80 — Same player and settings; it now plays inside the page when this training's
  // viewer is on screen, and in the original window otherwise.
  const box=document.getElementById('basicBagInlineBox');
  const inline=box&&Number(box.dataset.no)===item.no?box:null;
  if(inline){
   selectedNo=item.no;selectedAuto=false;
   inline.innerHTML='<div id="basicBagYT"></div>';
   watchMessage('جارٍ تحميل المشغل…');
  }else{
   const c=createModal(item.title);document.addEventListener('keydown',escapeClose);
   const body=c.querySelector('#basicBagModalBody');
   body.innerHTML='<div class="basic-bag-player"><div id="basicBagYT"></div></div>'+
    '<div class="basic-bag-inline-progress"><div id="basicWatchProgress" class="basic-bag-progress"><div></div></div>'+
    '<strong id="basicWatchPct">0%</strong></div><p id="basicWatchInfo" class="basic-bag-notice">جارٍ تحميل المشغل…</p>'+
    '<p class="basic-bag-description">يسمح بإعادة المشاهدة والرجوع إلى الخلف؛ لا يسمح بالقفز إلى أجزاء لم تُشاهد.</p>';
  }
  const saved=statusOf(item.no);movie={no:item.no,max:fmt(saved.watched),confirmed:fmt(saved.watched),duration:fmt(saved.duration),
    completed:!!saved.completed,previousWall:performance.now(),previousTime:0,
    player:null,ready:false,timer:null,lastSent:0,saving:false,
    inline:!!inline,box:inline,shownCompleted:!!saved.completed};
  try{
   await ytApi();if(!movie||movie.no!==item.no)return;
   const m=movie;m.player=new window.YT.Player('basicBagYT',{
     videoId:item.video,playerVars:{rel:0,disablekb:1,playsinline:1,controls:1,cc_load_policy:1,cc_lang_pref:'ar'},
     events:{onReady:function(){
        if(movie!==m)return;m.ready=true;m.duration=m.player.getDuration();
        if(m.max>0)m.player.seekTo(Math.min(m.max,m.duration),true);
        try{m.player.setPlaybackRate(1);}catch(_){}
        m.previousTime=m.player.getCurrentTime();m.previousWall=performance.now();
        watchPct();watchMessage('مسموح بالمشاهدة حتى '+Math.round(m.max)+' ثانية من بداية الفيديو.');
        m.timer=setInterval(tick,600);
      },onStateChange:function(e){
        if(movie!==m)return;
        if(e.data===window.YT.PlayerState.ENDED){tick();heartbeat(true);}
      },onPlaybackRateChange:function(e){
        if(movie!==m)return;
        if(Number(e.data)>1.01)try{
         m.player.setPlaybackRate(1);
         watchMessage('يجب تشغيل الفيديو بسرعة 1x لاحتساب المشاهدة.');
        }catch(_){}
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
   const payload=await rpc('basic_training_get_quiz',{p_training_no:item.no});
   const list=payload&&payload.questions;
   const revision=Number(payload&&payload.revision);
   if(!Number.isInteger(revision)||revision<1||!Array.isArray(list)||list.length!==20||
      list.some(q=>!Array.isArray(q.options)||q.options.length!==3))
     throw Error('الأسئلة المعتمدة غير مكتملة');
   exam={no:item.no,revision,questions:list,answers:Array(20).fill(-1),busy:false};
   renderExam();
  }catch(e){body.textContent=e.message||'تعذر تحميل الأسئلة';}
 };
 // One question at a time, as in the professional quizzes: all twenty fieldsets stay in the
 // form so chosen answers survive navigation; only the current one is shown. Nothing is sent
 // until the finish button on the last question, and grading stays with the caller.
 function pageQuestions(form,sections,opts){
  let current=0;
  const total=sections.length;
  const warning=document.createElement('div');warning.className='basic-bag-unanswered';warning.hidden=true;
  const footer=document.createElement('div');footer.className='basic-bag-pager';
  const status=document.createElement('strong');status.className='basic-bag-pager-status';status.setAttribute('aria-live','polite');
  const back=document.createElement('button');back.type='button';back.className='name-list-btn';back.textContent='→ السابق';
  const next=document.createElement('button');next.type='button';next.className='name-list-btn name-list-primary';next.textContent='التالي ←';
  const finish=document.createElement('button');finish.type='button';finish.className='name-list-btn name-list-primary basic-bag-finish';finish.textContent=opts.finishLabel;
  footer.append(status,back,next,finish);
  form.append(warning,footer);
  sections.forEach(s=>{const legend=s.querySelector('legend');if(legend)legend.tabIndex=-1;});
  function update(){
   sections.forEach((s,i)=>{s.hidden=i!==current;});
   const answered=sections.filter((_,i)=>opts.isAnswered(i)).length;
   status.textContent='السؤال '+(current+1)+' من '+total+' — تمت الإجابة عن '+answered+' من '+total;
   back.disabled=current===0;
   next.hidden=current===total-1;
   finish.hidden=current!==total-1;
  }
  function goTo(i){
   current=Math.max(0,Math.min(total-1,i));
   warning.hidden=true;update();
   try{sections[current].scrollIntoView({block:'nearest'});sections[current].querySelector('legend')?.focus({preventScroll:true});}catch(_){}
  }
  back.addEventListener('click',()=>goTo(current-1));
  next.addEventListener('click',()=>goTo(current+1));
  finish.addEventListener('click',()=>{
   const missing=sections.map((_,i)=>i).filter(i=>!opts.isAnswered(i));
   if(!missing.length){warning.hidden=true;opts.onFinish();return;}
   // The server grades complete answer sheets only, so the member is sent back to finish them.
   const text=document.createElement('p');
   text.textContent='لم تُجب عن '+missing.length+' من الأسئلة (رقم '+missing.map(i=>i+1).join('، ')+'). يجب الإجابة عن الأسئلة العشرين قبل إرسال الاختبار.';
   const goBack=document.createElement('button');goBack.type='button';goBack.className='name-list-btn name-list-primary';
   goBack.textContent='الرجوع إلى السؤال '+(missing[0]+1);goBack.addEventListener('click',()=>goTo(missing[0]));
   const stay=document.createElement('button');stay.type='button';stay.className='name-list-btn';
   stay.textContent='البقاء في هذا السؤال';stay.addEventListener('click',()=>{warning.hidden=true;});
   warning.replaceChildren(text,goBack,stay);warning.hidden=false;
  });
  form.addEventListener('submit',ev=>ev.preventDefault());
  update();
  return {update,finish,back,next};
 }
 const BASIC_FINISH_LABEL='إنهاء الاختبار وتصحيحه';
 function renderExam(){
  const e=exam;if(!e)return;
  const body=document.getElementById('basicBagModalBody');if(!body)return;
  body.replaceChildren();
  const f=document.createElement('form');f.className='basic-bag-exam';
  let pager=null;
  async function submitExam(){
   if(e.busy||e.answers.includes(-1))return;
   e.busy=true;const submit=pager.finish;submit.disabled=true;pager.back.disabled=true;submit.textContent='جارٍ التصحيح الآلي…';
   try{
    const graded=await rpc('basic_training_submit_quiz',{p_training_no:e.no,p_answers:e.answers,p_revision:e.revision});
    body.replaceChildren();const result=document.createElement('div');result.className='basic-bag-result';
    const h=document.createElement('h2');
    h.textContent='درجة الاختبار: '+Math.round(100*Number(graded.score||0)/(Number(graded.out_of)||20))+' / 100';
    result.appendChild(h);
    const breakdown=document.createElement('p');
    breakdown.textContent='النتيجة: '+(graded.passed?'ناجح ✅':'لم يجتز الاختبار')+' | درجة النجاح: 80 / 100';
    result.appendChild(breakdown);
    const explain=document.createElement('p');explain.textContent=graded.passed?
      '✅ اجتزت الاختبار! حفظنا درجتك ويمكنك الانتقال إلى التدريب التالي.':
      'لم تجتز الاختبار بعد. تحتاج إلى 80 / 100 على الأقل؛ يمكنك مراجعة المحاضرة وإعادة المحاولة.';
    result.appendChild(explain);
    // The server returns only the score; correct answers are intentionally private.
    if(!graded.passed){
      const note=document.createElement('p');
      note.textContent='راجع محتوى التدريب، ثم أعد المحاولة لاحقًا. لا تُعرض مفاتيح الإجابات النظامية.';
      result.appendChild(note);
    }
    body.appendChild(result);await loadOverview();
   }catch(err){safeToast(err.message||'تعذر التصحيح');submit.disabled=false;submit.textContent=BASIC_FINISH_LABEL;pager.update();e.busy=false;}
  }
  const sections=e.questions.map((q,i)=>{
   const sec=document.createElement('fieldset');sec.className='basic-bag-question';
   const legend=document.createElement('legend');legend.textContent='السؤال '+(i+1)+' — '+q.question;sec.appendChild(legend);
   q.options.forEach((opt,k)=>{
    const lbl=document.createElement('label');const radio=document.createElement('input');
    radio.type='radio';radio.name='basic_q_'+i;radio.value=String(k);
    radio.checked=e.answers[i]===k;radio.addEventListener('change',()=>{e.answers[i]=k;pager.update();});
    lbl.append(radio,document.createTextNode(['أ','ب','ج'][k]+'. '+opt));sec.appendChild(lbl);
   });f.appendChild(sec);
   return sec;
  });
  pager=pageQuestions(f,sections,{finishLabel:BASIC_FINISH_LABEL,isAnswered:i=>e.answers[i]!==-1,onFinish:submitExam});
  body.appendChild(f);
 }

 window.basicBagPreviewFirstQuiz=async function(number=1){
   if(number!==1&&number!==2&&number!==3&&number!==4&&number!==5&&number!==6&&number!==7&&number!==8)return;
   if(!backendReady||viewerRole!=='leader'||window.innerWidth<900)return safeToast('معاينة الإجابات متاحة للقائد على الحاسوب بعد تفعيل خدمة قاعدة البيانات الآمنة فقط');
   const isSecond=number===2;
   const isThird=number===3;
   const isFourth=number===4;
   const isFifth=number===5;
   const isSixth=number===6;
   const isSeventh=number===7;
   const isEighth=number===8;
   close();
   const modal=createModal('اختبار التدريب الأساسي '+(isEighth?'الثامن':isSeventh?'السابع':isSixth?'السادس':isFifth?'الخامس':isFourth?'الرابع':isThird?'الثالث':isSecond?'الثاني':'الأول')+' — الأسئلة العشرون');
   document.addEventListener('keydown',escapeClose);
   const body=modal.querySelector('#basicBagModalBody');
   body.innerHTML='<p class="basic-bag-notice">'+(isEighth?'الأسئلة العشرون المعتمدة للتدريب الثامن حول أساسيات النجاح التسعة مع التصحيح التجريبي، ولا تُحفظ النتائج.':isSeventh?'الأسئلة العشرون المعتمدة للتدريب السابع مع التصحيح التجريبي، ولا تُحفظ النتائج. استعمل بريدًا دائمًا للعضوية الفعلية وراجع شروط التسجيل السارية.':isSixth?'الأسئلة العشرون المعتمدة للتدريب السادس. خطة الأشهر الستة مثال افتراضي وليست ضمانًا للدخل، ولا تُحفظ النتائج.':isFifth?'اختبار المحاضرة الخامسة: 20 سؤالًا معتمدًا وتصحيح تجريبي. الأرقام والعمولات وفق شرح المحاضر وقت التسجيل، دون ضمان عوائد مالية أو حفظ نتائج.':isFourth?'الأسئلة العشرون المعتمدة للمحاضرة الرابعة مع التصحيح التجريبي. الإحصاءات التاريخية والأقوال المنسوبة تعرض كما وردت في المحاضرة؛ لا حفظ للنتائج.':isThird?'الأسئلة العشرون المعتمدة للمحاضرة الثالثة مع تصحيح تجريبي. لا تُحفظ الإجابات أو النتائج. التوصيفات الصحية هي مما ذكره المحاضر ولا تثبت فعالية علاجية.':isSecond?'الأسئلة العشرون الجديدة المعتمدة للتدريب الثاني، وتصحيح آلي تجريبي وفق مفتاح الإجابات المعتمد. الأرقام والحوافز من وقت تسجيل المحاضرة ولا تضمن دخلًا. لا تُحفظ النتائج.':'اختبار المحاضرة الجديدة المعتمد: 20 سؤالًا، والتصحيح تجريبي داخل المتصفح فقط. الأرقام والمزايا تعكس كلام المحاضر وقت التسجيل ولا تمثل تحققًا مستقلًا أو ضمانًا للنتائج.')+'</p><p id="basicQuizLoad">جارٍ تحميل الأسئلة الأصلية…</p>';
   try{
      const secured=await rpc('basic_training_admin_revision',{p_training_no:number,p_action:'get',p_payload:null});
      const qs=Array.isArray(secured.questions)?secured.questions.map(q=>({
        question:q.question,options:q.options,answer:q.correct_index
      })):[];
      if(qs.length!==20||qs.some(q=>!q.question||!Array.isArray(q.options)||q.options.length!==3||!Number.isInteger(q.answer)||q.answer<0||q.answer>2))throw Error('أسئلة المعاينة غير متاحة');
      if(!modal||!modal.isConnected)return;
      const loading=body.querySelector('#basicQuizLoad');if(loading)loading.remove();
      // The editor returns the newest unpublished draft first; members still get the published revision.
      if(secured.status==='draft'){
        const draftNote=document.createElement('p');draftNote.className='basic-bag-notice';
        draftNote.textContent='⚠️ هذه مسودة غير منشورة (الإصدار '+Number(secured.revision)+'). الأعضاء يختبرون حاليًا بالإصدار المنشور '+Number(secured.active_revision)+'.';
        body.append(draftNote);
      }
      const form=document.createElement('form');form.className='basic-bag-exam';
      const answers=Array(20).fill(null);
      let pager=null;
      const sections=qs.map((q,i)=>{
         const section=document.createElement('fieldset');section.className='basic-bag-question';
         const legend=document.createElement('legend');legend.textContent='السؤال '+(i+1)+' — '+q.question;section.append(legend);
         q.options.forEach((opt,j)=>{
           const label=document.createElement('label'),radio=document.createElement('input');
           radio.type='radio';radio.name='basic_'+number+'_'+i;radio.value=String(j);
           radio.addEventListener('change',()=>{answers[i]=j;pager.update();});
           label.append(radio,document.createTextNode(' '+(q.options.length===2&&q.options[0]==='صح'?'':(['أ','ب','ج','د'][j]||String(j+1))+'. ')+opt));
           section.append(label);
         });
         form.append(section);
         return section;
      });
      pager=pageQuestions(form,sections,{finishLabel:'إنهاء الاختبار والتصحيح التجريبي',isAnswered:i=>answers[i]!==null,onFinish:()=>{
        const approved=qs.filter(q=>Number.isInteger(q.answer));
        const score=qs.reduce((total,q,i)=>total+(Number.isInteger(q.answer)&&answers[i]===q.answer?1:0),0);
        const result=document.createElement('div');result.className='basic-bag-result';
        const h=document.createElement('h2');
        h.textContent='درجة الاختبار: '+Math.round(score*5)+' / 100';
        result.append(h);
        const breakdown=document.createElement('p');
        breakdown.textContent='درجة النجاح: 80 / 100 | أسئلة الاختبار: 20';
        result.append(breakdown);
        const hint=document.createElement('p');
        hint.textContent='هذه درجة اختبار تجريبية للمراجعة فقط، لا تُحفظ في حساب العضو ولا تفتح التدريب التالي.';result.append(hint);
        const wrong=qs.map((q,i)=>Number.isInteger(q.answer)&&answers[i]!==q.answer?{i,answer:q.options[q.answer]}:null).filter(Boolean);
        const text=document.createElement('p');text.textContent=wrong.length?'أسئلة تحتاج مراجعة: '+wrong.map(v=>v.i+1).join('، '):'جميع الإجابات صحيحة';result.append(text);
        wrong.forEach(v=>{const row=document.createElement('p');row.textContent='س'+(v.i+1)+' — الإجابة الصحيحة وفق المفتاح المعتمد: '+v.answer;result.append(row);});
        form.replaceWith(result);
      }});
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
 window.basicBagPreviewEighthQuiz=()=>window.basicBagPreviewFirstQuiz(8);
 window.basicBagPreviewEighthVideo=async()=>{window.__basicVideoEightPreview=true;try{await window.basicBagStartVideo(8);}finally{window.__basicVideoEightPreview=false;}};
 window.basicTrainingCourseHtml=maybeLoad;
})();
