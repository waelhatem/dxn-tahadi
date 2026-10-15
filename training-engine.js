/* V86.90 — Unified training engine (browser side), shared by the basic, professional and advanced tracks.
 * One watch attempt per viewing: it starts at 0 s when the member presses play, credits only time the
 * server confirms (training_watch_begin / training_watch_report), and is never resumed in a later
 * session. 90% confirmed by the server marks the lesson watched for good; the quiz and the next lesson
 * still depend on the server's own checks. Content, question banks and results stay per track.
 * YouTube player data cannot prove attention; this only checks real-time 1x playback without skipping.
 */
(function(){
 'use strict';
 if(window.DXNTrainingEngine)return;
 const REPORT_INTERVAL_MS=5200;   // server credits nothing for reports less than 3 s apart
 const TICK_MS=600;
 const FORWARD_TOLERANCE_S=2.4;   // small player jitter; anything further is a skip
 const DEFAULT_IDLE_S=600;        // replaced by the server's setting on the first begin

 const STATE_TEXT={
  locked:'الدرس مغلق — أكمل الدرس السابق أولًا',
  start:'ابدأ المشاهدة',
  watching:'المشاهدة قيد التنفيذ',
  ready:'المشاهدة مكتملة — ابدأ الاختبار',
  failed:'لم تجتز الاختبار — أعد الاختبار',
  passed:'تم اجتياز الاختبار — الدرس التالي متاح'
 };
 // The same six states in every track, from the server's saved status of the lesson.
 function lessonState(s){
  if(!s.unlocked)return 'locked';
  if(s.passed)return 'passed';
  if(s.watchCompleted&&s.attempted)return 'failed';
  if(s.watchCompleted)return 'ready';
  if(s.watching)return 'watching';
  return 'start';
 }
 const POLICY_NOTE='تُحتسب المشاهدة داخل جلسة واحدة تبدأ من بداية الفيديو بسرعة 1x؛ عند بلوغ 90% يؤكد الخادم الإكمال ويُفتح الاختبار. المشاهدة غير المكتملة لا تُحفظ بين الجلسات، والنجاح في الاختبار (80 / 100) يفتح الدرس التالي.';

 const token=()=>String(localStorage.getItem('dxn_session')||'').trim();
 async function rpc(fn,args){
  const t=token();if(!t)throw Error('سجّل الدخول أولًا');
  const res=await fetch('/api/rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({fn,args:{p_token:t,...args}})});
  const text=await res.text();let j;try{j=text?JSON.parse(text):{};}catch(_){j={};}
  if(!res.ok)throw Error(j.error||j.message||'تعذر الاتصال بخدمة التدريب');
  return j;
 }
 const clock=n=>{n=Math.max(0,Math.round(n));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};

 /* One watch of one lesson. The caller creates the YouTube player and forwards its events:
  *   const w=createWatch({track,lessonNo,watchCompleted,preview,onProgress,onCompleted,onMessage});
  *   events:{onReady:()=>w.attach(player),onStateChange:e=>w.onState(e.data),onPlaybackRateChange:e=>w.onRate(e.data)}
  * onProgress({percent,watched,duration,attempt}) shows the current attempt; preview mode never saves. */
 function createWatch(o){
  const w={track:o.track,lessonNo:o.lessonNo,preview:!!o.preview,lessonCompleted:!!o.watchCompleted,
   session:token(),player:null,timer:null,stopped:false,
   attempt:null,beginning:false,max:0,previousTime:0,previousWall:0,pausedSince:0,idle:DEFAULT_IDLE_S};
  const msg=t=>{if(!w.stopped&&typeof o.onMessage==='function')o.onMessage(t);};
  w.playerDuration=()=>{try{const d=w.player.getDuration();return Number.isFinite(d)&&d>0?d:0;}catch(_){return 0;}};
  const progress=()=>{
   if(w.stopped||typeof o.onProgress!=='function')return;
   if(w.preview){const d=w.playerDuration();o.onProgress({percent:d?Math.min(100,Math.floor(100*w.max/d)):0,watched:w.max,duration:d,attempt:false});return;}
   const a=w.attempt;
   o.onProgress({percent:a&&a.duration?Math.min(100,Math.floor(100*a.watched/a.duration)):0,watched:a?a.watched:0,duration:a?a.duration:0,attempt:!!a});
  };
  const sameAccount=()=>{if(token()===w.session)return true;w.stop();return false;};
  // Forget the current attempt; the next play starts a new one from the beginning.
  function dropAttempt(text){
   w.attempt=null;w.max=0;w.previousTime=0;w.previousWall=performance.now();
   try{w.player.pauseVideo();w.player.seekTo(0,true);}catch(_){}
   progress();if(text)msg(text);
  }
  async function begin(){
   if(w.beginning||w.attempt||w.preview||w.stopped)return;
   w.beginning=true;
   try{
    const r=await rpc('training_watch_begin',{p_track:w.track,p_lesson_no:w.lessonNo});
    if(w.stopped||!sameAccount())return;
    w.idle=Number(r.idle_timeout_seconds)||DEFAULT_IDLE_S;
    w.attempt={id:r.attempt_id,duration:Number(r.duration)||0,watched:0,lastSent:0,saving:false,completed:false};
    w.lessonCompleted=w.lessonCompleted||!!r.watch_completed;
    // The attempt is new: whatever was played before it counts from 0 again.
    w.max=0;try{if(w.player.getCurrentTime()>1)w.player.seekTo(0,true);}catch(_){}
    w.previousTime=0;w.previousWall=performance.now();
    const real=Math.round(w.playerDuration());
    if(real>=60&&w.attempt.duration&&Math.abs(real-w.attempt.duration)>Math.max(5,w.attempt.duration*0.02))
     msg('⚠️ مدة الفيديو على YouTube '+clock(real)+' تختلف عن المدة المعتمدة للدرس '+clock(w.attempt.duration)+'؛ أبلغ إدارة التدريب.');
    else msg('بدأت جلسة مشاهدة جديدة من البداية. يُفتح الاختبار عند تأكيد 90% داخل هذه الجلسة.');
    progress();
   }catch(e){msg('تعذر بدء جلسة المشاهدة: '+e.message);try{w.player.pauseVideo();}catch(_){}}
   finally{w.beginning=false;}
  }
  async function report(){
   const a=w.attempt;
   if(!a||a.saving||a.completed||w.preview||w.stopped)return;
   if(Math.floor(w.max)<=a.watched)return;
   if(a.lastSent&&Date.now()-a.lastSent<REPORT_INTERVAL_MS)return;
   if(!sameAccount())return;
   a.lastSent=Date.now();a.saving=true;
   try{
    const r=await rpc('training_watch_report',{p_attempt_id:a.id,p_current:Math.floor(w.max),p_duration:Math.floor(w.playerDuration())});
    // A late answer for an attempt that is no longer current is ignored entirely.
    if(w.stopped||w.attempt!==a||r.attempt_id!==a.id||token()!==w.session)return;
    if(r.expired){
     dropAttempt(r.reason==='idle'?'انتهت جلسة المشاهدة بسبب الخمول؛ عند التشغيل تبدأ جلسة جديدة من البداية.':
      'بدأت جلسة مشاهدة أحدث لهذا الدرس؛ هذه الجلسة لم تعد تُحتسب.');
     return;
    }
    a.watched=Math.max(a.watched,Number(r.watched)||0);a.duration=Number(r.duration)||a.duration;
    a.completed=!!r.attempt_completed;
    progress();
    if(r.watch_completed&&!w.lessonCompleted){
     w.lessonCompleted=true;msg('✅ أكد الخادم مشاهدة 90% — الاختبار متاح الآن.');
     if(typeof o.onCompleted==='function')o.onCompleted();
    }else if(!r.watch_completed)msg('المشاهدة المؤكدة في هذه الجلسة: '+Math.floor(100*a.watched/a.duration)+'% — يُفتح الاختبار عند 90%.');
   }catch(e){msg('لم تُحفظ المشاهدة: '+e.message);}
   finally{a.saving=false;}
  }
  function tick(){
   if(w.stopped||!w.player)return;
   if(!sameAccount())return;
   let current,state;
   try{current=w.player.getCurrentTime();state=w.player.getPlayerState();}catch(_){return;}
   const duration=w.playerDuration();
   if(!Number.isFinite(current)||!duration)return;
   const PLAYING=window.YT&&window.YT.PlayerState?window.YT.PlayerState.PLAYING:1;
   try{if(w.player.getPlaybackRate()>1.01){w.player.setPlaybackRate(1);msg('سرعة المشاهدة المعتمدة 1x.');}}catch(_){}
   const now=performance.now();
   if(state!==PLAYING){
    // A long pause ends the attempt here as well as on the server.
    if(!w.pausedSince)w.pausedSince=now;
    if(w.attempt&&!w.attempt.completed&&now-w.pausedSince>w.idle*1000){
     dropAttempt('انتهت جلسة المشاهدة بسبب الخمول؛ عند التشغيل تبدأ جلسة جديدة من البداية.');
     return; // the position read above is from before the rewind
    }
   }else w.pausedSince=0;
   if(state===PLAYING&&!w.preview&&!w.attempt){begin();w.previousTime=current;w.previousWall=now;return;}
   if(current>w.max+FORWARD_TOLERANCE_S){
    try{w.player.seekTo(Math.max(0,w.max),true);}catch(_){}
    msg('لا يمكن التقدم إلى جزء لم تتم مشاهدته؛ يمكنك الرجوع إلى الخلف.');
    w.previousTime=w.max;w.previousWall=now;return;
   }
   const elapsed=Math.max(0,Math.min((now-w.previousWall)/1000,2));
   const moving=current>=w.previousTime-0.2&&current-w.previousTime<=elapsed+1;
   w.previousTime=current;w.previousWall=now;
   if(state===PLAYING&&moving&&current>w.max){w.max=Math.min(duration,current);if(w.preview)progress();}
   report();
  }
  w.attach=function(player){
   if(w.stopped)return;
   w.player=player;w.previousWall=performance.now();
   // No seekTo here: on a video that has not started, YouTube's seekTo starts playback by itself.
   try{player.setPlaybackRate(1);}catch(_){}
   if(w.timer)clearInterval(w.timer);
   w.timer=setInterval(tick,TICK_MS);
   progress();
   msg(w.preview?'معاينة: لا تُحفظ المشاهدة.':'اضغط تشغيل لبدء جلسة مشاهدة من البداية.');
  };
  w.onState=function(state){
   const ENDED=window.YT&&window.YT.PlayerState?window.YT.PlayerState.ENDED:0;
   if(state===ENDED){tick();report();}
  };
  w.onRate=function(rate){if(Number(rate)>1.01)try{w.player.setPlaybackRate(1);msg('يجب تشغيل الفيديو بسرعة 1x.');}catch(_){}};
  w.stop=function(){
   if(w.stopped)return;w.stopped=true;
   if(w.timer)clearInterval(w.timer);w.timer=null;w.attempt=null;
  };
  w.tick=tick;
  return w;
 }

 // One question at a time with previous/next; nothing is sent until the finish button on the last one.
 function pageQuestions(form,sections,opts){
  let current=0;const total=sections.length;
  const warning=document.createElement('div');warning.className='basic-bag-unanswered';warning.hidden=true;
  const footer=document.createElement('div');footer.className='basic-bag-pager';
  const status=document.createElement('strong');status.className='basic-bag-pager-status';status.setAttribute('aria-live','polite');
  const back=document.createElement('button');back.type='button';back.className='name-list-btn';back.textContent='→ السابق';
  const next=document.createElement('button');next.type='button';next.className='name-list-btn name-list-primary';next.textContent='التالي ←';
  const finish=document.createElement('button');finish.type='button';finish.className='name-list-btn name-list-primary basic-bag-finish';finish.textContent=opts.finishLabel;
  footer.append(status,back,next,finish);form.append(warning,footer);
  function update(){
   sections.forEach((s,i)=>{s.hidden=i!==current;});
   const answered=sections.filter((_,i)=>opts.isAnswered(i)).length;
   status.textContent='السؤال '+(current+1)+' من '+total+' — تمت الإجابة عن '+answered+' من '+total;
   back.disabled=current===0;next.hidden=current===total-1;finish.hidden=current!==total-1;
  }
  function goTo(i){current=Math.max(0,Math.min(total-1,i));warning.hidden=true;update();}
  back.addEventListener('click',()=>goTo(current-1));
  next.addEventListener('click',()=>goTo(current+1));
  finish.addEventListener('click',()=>{
   const missing=sections.map((_,i)=>i).filter(i=>!opts.isAnswered(i));
   if(!missing.length){warning.hidden=true;opts.onFinish();return;}
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

 window.DXNTrainingEngine={createWatch,lessonState,STATE_TEXT,POLICY_NOTE,pageQuestions,rpc,
  constants:{REPORT_INTERVAL_MS,TICK_MS,FORWARD_TOLERANCE_S,WATCH_PERCENT:90,PASS_SCORE:16}};
})();
