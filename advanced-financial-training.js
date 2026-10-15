/* Isolated, server-authoritative advanced financial training UI. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=[],role='',loading=false,loaded=false,watch=null,exam=null;
const pct=p=>p&&p.duration?Math.min(100,Math.round(100*(+p.watched||0)/(+p.duration))):0;
const token=()=>String(localStorage.getItem('dxn_session')||'').trim();
const notify=s=>typeof window.toast==='function'?window.toast(s):alert(s);
async function rpc(fn,args={}){
 const t=token();if(!t)throw Error('يرجى تسجيل الدخول');
 const res=await fetch('/api/rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({fn,args:{p_token:t,...args}})});
 const j=await res.json();if(!res.ok)throw Error(j.error||j.message||'تعذر الاتصال بخدمة التدريب');return j;
}
async function refresh(){
 const d=await rpc('advanced_financial_overview');
 if(!Array.isArray(d.lessons))throw Error('استجابة التدريب غير صحيحة');
 data=d.lessons;role=d.role;loaded=true;render();
}
const prevDone=n=>n===1||!!data.find(x=>x.lesson_no===n-1&&x.completed&&x.passed);
const isReady=x=>x&&x.active&&x.published&&x.duration>=60;
const canStart=x=>isReady(x)&&prevDone(x.lesson_no);
const canView=x=>!!(x&&x.video_id&&prevDone(x.lesson_no));
const cards=()=>data.map(x=>{
 const n=x.lesson_no,ready=canStart(x),viewable=canView(x),percentage=pct(x);
 const label=x.passed?'✅ ناجح':x.completed?'📝 مشاهدة مكتملة — أدِّ الاختبار':
 !isReady(x)?'⏳ الفيديو متاح للمشاهدة التمهيدية؛ احتساب التقدم والاختبار ينتظران نشر الأسئلة واعتماد مدة الفيديو':
 ready?'▶ تابع مشاهدة الفيديو':'🔒 يجب اجتياز الفيديو والاختبار السابق أولًا';
 const score=x.best_score==null?'لم يُختبر':(5*x.best_score)+' / 100';
 return '<article class="advanced-financial-lesson" data-no="'+n+'"><div class="advanced-financial-meta">'+
 '<div class="advanced-financial-num">الدرس '+n+' من 10</div><h3>'+esc(x.title)+'</h3>'+
 '<p class="muted">'+label+'</p><div class="basic-bag-progress-line"><strong class="basic-bag-percentage">'+percentage+'%</strong>'+
 '<div class="basic-bag-progress"><div style="width:'+percentage+'%"></div></div></div>'+
 '<p class="muted">درجة الاختبار: '+esc(score)+' · النجاح 80 / 100 · المشاهدة 90%</p></div>'+
 '<div class="advanced-financial-actions">'+
 '<button type="button" class="primary" data-watch="'+n+'" '+(viewable?'':'disabled')+'>'+(ready?'▶ مشاهدة الدرس':'▶ معاينة الفيديو دون حفظ التقدم')+'</button>'+
 '<button type="button" data-test="'+n+'" '+(ready&&x.completed?'':'disabled')+'>📝 اختبار الدرس</button>'+
 (role==='leader'&&window.innerWidth>=900?'<button type="button" data-preview="'+n+'">👁 معاينة فيديو (للقائد فقط)</button>':'')+
 '</div></article>';
}).join('');
function render(){
 const host=document.getElementById('advancedFinancialLessons');
 if(!host)return;
 if(!loaded){host.innerHTML='<p class="muted">جارٍ تحميل حالة التدريب المحفوظة...</p>';return;}
 host.innerHTML=cards();
 host.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>{const n=+b.dataset.watch,x=data.find(l=>l.lesson_no===n);if(canStart(x))startWatch(n);else if(canView(x))viewUnpublishedVideo(n);});
 host.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>startQuiz(+b.dataset.test));
 host.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewVideo(+b.dataset.preview));
 const p=document.getElementById('advancedFinancialProgress');
 if(p){const passed=data.filter(x=>x.passed&&x.completed).length;p.textContent='الدروس المجتازة: '+passed+' / 10'+(passed===10?' — 🎉 اكتملت دورة خطة DXN المالية':'');}
}
window.advancedFinancialCoursePage=function(){
 if(!loading&&!loaded&&token()){loading=true;setTimeout(()=>refresh().catch(e=>notify(e.message)).finally(()=>{loading=false;}),0);}
 const vids=window.advancedProfitVideos||[];
 return '<section class="card advanced-financial-course" dir="rtl"><div class="title">🚀 التدريب المتقدم</div>'+
 '<details class="advanced-profit-course academy-camps-course"><summary><span class="advanced-profit-course-emoji">📈</span>'+
 '<span class="advanced-profit-course-copy"><strong>التدريب المتقدم الأول: خطة أرباح DXN المالية</strong>'+
 '<small>المهندس محمود المصري — 10 دروس متتابعة واختبار لكل درس</small></span>'+
 '<span class="academy-camps-open-hint"><span class="academy-camps-hint-closed">▶ اضغط لعرض الدروس العشرة</span>'+
 '<span class="academy-camps-hint-open">▲ إغلاق قائمة الدروس</span></span></summary><div class="advanced-profit-content">'+
 '<p class="muted">شروط التقدم: مشاهدة 90% من الفيديو بسرعة 1x، ثم اجتياز اختبار من 20 سؤالًا ودرجة 80 / 100. يُفتح الدرس التالي بعد الاجتياز.</p>'+
 '<p id="advancedFinancialProgress" class="muted">يُحفظ التقدم في ملف العضو ولوحة القائد.</p>'+
 '<div id="advancedFinancialLessons">'+(token()?'جارٍ تحميل الدروس المحفوظة...':'سجّل الدخول لعرض التدريبات.')+'</div>'+
 '</div></details></section>';
};
function modal(title){
 close();const overlay=document.createElement('div');overlay.className='basic-bag-overlay advanced-financial-overlay';
 overlay.innerHTML='<div class="basic-bag-modal" role="dialog" aria-modal="true"><header><strong>'+esc(title)+'</strong>'+
 '<button type="button" id="advFinancialClose">✕ إغلاق</button></header><div id="advFinancialBody"></div></div>';
 document.body.append(overlay);overlay.querySelector('#advFinancialClose').onclick=close;return overlay.querySelector('#advFinancialBody');
}
function close(){
 if(watch){if(watch.timer)clearInterval(watch.timer);try{watch.player?.destroy()}catch(_){}watch=null;}
 exam=null;document.querySelectorAll('.advanced-financial-overlay').forEach(x=>x.remove());render();
}
async function youtube(){
 if(window.YT&&window.YT.Player)return;
 if(window.__advFinancialYTPromise)return window.__advFinancialYTPromise;
 window.__advFinancialYTPromise=new Promise((resolve,reject)=>{
 const old=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{if(typeof old==='function')old();resolve();};
 const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>reject(Error('فشل تحميل مشغل YouTube'));document.head.append(s);
 });return window.__advFinancialYTPromise;
}
function status(s){const el=document.getElementById('advFinancialWatchMessage');if(el)el.textContent=s;}
function watchUi(){
 if(!watch)return;const p=Math.min(100,Math.round(100*watch.max/(watch.duration||1)));
 const bar=document.getElementById('advFinancialWatchBar');if(bar)bar.style.width=p+'%';
 const n=document.getElementById('advFinancialWatchPct');if(n)n.textContent=p+'%';
}
async function heartbeat(){
 const w=watch;if(!w||w.saving||w.completed||!w.duration||w.lastSent&&Date.now()-w.lastSent<5200||w.max<=w.confirmed)return;
 w.lastSent=Date.now();w.saving=true;
 try{const p=await rpc('advanced_financial_watch_update',{p_lesson_no:w.no,p_current:Math.floor(w.max),p_duration:Math.floor(w.duration)});
 if(w!==watch)return;w.confirmed=Math.max(w.confirmed,+p.watched||0);w.completed=!!p.completed;
 const d=data.find(x=>x.lesson_no===w.no);if(d){d.watched=p.watched;d.completed=w.completed;}
 status(w.completed?'✅ اكتملت مشاهدة 90% — الاختبار متاح الآن.':'نسبة المشاهدة المحفوظة: '+Math.round(100*w.confirmed/w.duration)+'%');
 }catch(e){status('تعذّر حفظ المشاهدة: '+e.message)}finally{w.saving=false;}
}
function tick(){
 const w=watch;if(!w||!w.ready)return;
 let current,duration,state;try{current=w.player.getCurrentTime();duration=w.player.getDuration();state=w.player.getPlayerState()}catch(_){return;}
 if(!Number.isFinite(current)||!Number.isFinite(duration)||duration<=0)return;
 w.duration=duration;
 try{if(w.player.getPlaybackRate()>1.01){w.player.setPlaybackRate(1);status('يجب مشاهدة الفيديو بسرعة 1x')}}catch(_){}
 if(current>w.max+2.4){w.player.seekTo(Math.max(0,w.max),true);status('لا يمكن القفز إلى جزء لم تتم مشاهدته.');return;}
 const now=performance.now(),elapsed=Math.max(0,Math.min((now-w.previousWall)/1000,2));
 const moving=current>=w.previousTime-0.2&&current-w.previousTime<=elapsed+1;
 w.previousTime=current;w.previousWall=now;
 if(state===window.YT.PlayerState.PLAYING&&moving&&current>w.max){w.max=Math.min(duration,current);watchUi();}
 if(state===window.YT.PlayerState.PLAYING&&w.max>w.confirmed)heartbeat();
 if(!w.completed&&current>=duration-3.5&&w.max>=duration-4.5)heartbeat();
}
async function previewVideo(n){
 if(role!=='leader'||window.innerWidth<900)return notify('المعاينة للقائد على الحاسوب فقط');
 const x=data.find(l=>l.lesson_no===n);if(!x)return;
 const body=modal('معاينة القائد: الدرس '+n);
 body.innerHTML='<div class="basic-bag-player"><div id="advFinancialPreviewPlayer"></div></div>'+
 '<p class="muted">معاينة القائد غير محفوظة ضمن تقدم الأعضاء. يمكن تثبيت مدة الفيديو الفعلية بعد تحميله من YouTube.</p>'+
 '<p id="advFinancialDurationMessage" class="basic-bag-notice">جارٍ قراءة مدة الفيديو من المشغل...</p>'+
 '<button id="advFinancialVerifyDuration" type="button" disabled>⏱ تثبيت مدة الفيديو المعتمدة</button>';
 try{
  await youtube();
  if(!body.isConnected)return;
  let seconds=0;const button=body.querySelector('#advFinancialVerifyDuration');
  const notice=body.querySelector('#advFinancialDurationMessage');
  new window.YT.Player('advFinancialPreviewPlayer',{
   videoId:x.video_id,playerVars:{rel:0,playsinline:1},
   events:{onReady:e=>{
    if(!body.isConnected)return;
    seconds=Math.round(Number(e.target.getDuration())||0);
    if(seconds>=60&&seconds<=14400){
     notice.textContent='المدة الواردة من مشغل YouTube: '+Math.floor(seconds/60)+' دقيقة و'+seconds%60+' ثانية.';
     button.disabled=false;
    }else notice.textContent='لم تُرجع منصة YouTube مدة صالحة. شغّل الفيديو ثم حاول إعادة المعاينة.';
   }}
  });
  button.onclick=async()=>{
   if(seconds<60||!body.isConnected)return;
   button.disabled=true;notice.textContent='جارٍ تثبيت مدة الفيديو للقائد...';
   try{
    const saved=await rpc('advanced_financial_verify_duration',{p_lesson_no:n,p_duration:seconds});
    notice.textContent='✅ تم اعتماد مدة الفيديو '+saved.duration+' ثانية.';
    await refresh();
   }catch(e){notice.textContent='تعذر اعتماد المدة: '+e.message;button.disabled=false;}
  };
 }catch(e){const notice=body.querySelector('#advFinancialDurationMessage');if(notice)notice.textContent='فشل تحميل المشغل: '+e.message;}
}

async function viewUnpublishedVideo(n){
 const x=data.find(l=>l.lesson_no===n);
 if(!canView(x))return notify('أكمل الدرس السابق أولًا');
 const body=modal('مشاهدة تمهيدية — الدرس '+n);
 body.innerHTML='<div class="basic-bag-player"><div id="advFinancialUnpublishedPlayer"></div></div>'+ 
 '<p class="basic-bag-notice">هذا الفيديو متاح للمشاهدة فقط. لن تُسجّل نسبة المشاهدة ولن يُفتح الاختبار حتى تُنشر الأسئلة المعتمدة ويُثبّت وقت الفيديو من حساب القائد. لا تحتاج إلى إعادة أي اختبار سابق.</p>';
 try{await youtube();if(!body.isConnected)return;new window.YT.Player('advFinancialUnpublishedPlayer',{videoId:x.video_id,playerVars:{rel:0,playsinline:1}});}
 catch(e){notify('تعذّر تشغيل الفيديو: '+e.message);}
}
async function startWatch(n){
 const x=data.find(p=>p.lesson_no===n);if(!canStart(x))return notify('التدريب غير متاح بعد');
 const body=modal('الدرس '+n+' — '+x.title);
 body.innerHTML='<div class="basic-bag-player"><div id="advFinancialYT"></div></div>'+
 '<div class="basic-bag-inline-progress"><div class="basic-bag-progress"><div id="advFinancialWatchBar"></div></div>'+
 '<strong id="advFinancialWatchPct">0%</strong></div><p class="basic-bag-notice" id="advFinancialWatchMessage">جارٍ تحميل الفيديو...</p>'+
 '<p class="muted">يُحتسب وقت المشاهدة الحقيقي بسرعة 1x؛ الرجوع للخلف مسموح، والقفز للأمام غير محتسب.</p>';
 watch={no:n,max:+x.watched||0,confirmed:+x.watched||0,duration:+x.duration||0,completed:!!x.completed,
 player:null,ready:false,timer:null,lastSent:0,saving:false,previousTime:0,previousWall:performance.now()};
 try{await youtube();if(!watch||watch.no!==n)return;const w=watch;
 w.player=new window.YT.Player('advFinancialYT',{videoId:x.video_id,playerVars:{rel:0,disablekb:1,playsinline:1},
 events:{onReady:()=>{
 if(watch!==w)return;w.ready=true;w.duration=w.player.getDuration();
 if(w.max)w.player.seekTo(Math.min(w.max,w.duration),true);
 try{w.player.setPlaybackRate(1)}catch(_){}
 w.previousTime=w.player.getCurrentTime();w.previousWall=performance.now();
 watchUi();status('يمكنك متابعة المشاهدة من تقدمك المحفوظ.');w.timer=setInterval(tick,600);
 },onPlaybackRateChange:e=>{if(watch===w&&e.data>1.01)try{w.player.setPlaybackRate(1)}catch(_){}},
 onStateChange:e=>{if(watch===w&&e.data===window.YT.PlayerState.ENDED){tick();heartbeat();}}
 }});
 }catch(e){status('تعذر تحميل الفيديو: '+e.message)}
}
async function startQuiz(n){
 const x=data.find(p=>p.lesson_no===n);if(!canStart(x)||!x.completed)return notify('أكمل مشاهدة الفيديو أولاً');
 const body=modal('اختبار الدرس '+n+' — '+x.title);body.textContent='جارٍ تحميل الاختبار...';
 try{const r=await rpc('advanced_financial_get_quiz',{p_lesson_no:n});
 if(!Array.isArray(r.questions)||r.questions.length!==20||r.questions.some(q=>!Array.isArray(q.options)||q.options.length!==4))
 throw Error('أسئلة الاختبار غير مكتملة');
 exam={no:n,revision:r.revision,questions:r.questions,answers:Array(20).fill(-1),index:0,busy:false};
 renderExam(body);
 }catch(e){body.textContent=e.message}
}
function renderExam(body){
 const e=exam;if(!e)return;
 const q=e.questions[e.index],index=e.index;
 body.replaceChildren();
 const h=document.createElement('div');h.className='advanced-financial-exam-header';h.textContent='السؤال '+(index+1)+' من 20 — كل سؤال 5 درجات';body.append(h);
 const field=document.createElement('fieldset');field.className='basic-bag-question';const legend=document.createElement('legend');legend.textContent=q.question;field.append(legend);
 q.options.forEach((o,j)=>{
 const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='ans';input.value=j;input.checked=e.answers[index]===j;
 input.onchange=()=>{e.answers[index]=j;updateFooter()};label.append(input,document.createTextNode(['أ','ب','ج','د'][j]+' — '+o));field.append(label);
 });body.append(field);
 const foot=document.createElement('div');foot.className='advanced-financial-footer';
 const back=document.createElement('button');back.textContent='السابق';back.disabled=index===0;back.onclick=()=>{e.index--;renderExam(body)};
 const next=document.createElement('button');next.textContent='التالي';next.disabled=index===19;next.onclick=()=>{if(e.answers[index]<0)return; e.index++;renderExam(body)};
 const submit=document.createElement('button');submit.className='primary';submit.textContent='إنهاء الاختبار وتصحيحه';submit.disabled=true;
 submit.onclick=async()=>{if(e.busy||e.answers.includes(-1))return;e.busy=true;submit.disabled=true;
 try{const result=await rpc('advanced_financial_submit_quiz',{p_lesson_no:e.no,p_answers:e.answers,p_revision:e.revision});
 body.replaceChildren();const resultBox=document.createElement('section');resultBox.className='basic-bag-result';
 resultBox.textContent='درجة الاختبار: '+result.score*5+' / 100 — '+(result.passed?'✅ ناجح، يمكنك الانتقال للتدريب التالي.':'لم تجتز الاختبار؛ راجع الدرس وأعد المحاولة.');
 body.append(resultBox);await refresh();
 }catch(err){notify(err.message);e.busy=false;updateFooter()}};
 foot.append(back,next,submit);body.append(foot);
 function updateFooter(){next.disabled=e.answers[index]<0||index===19;submit.disabled=e.busy||index!==19||e.answers.includes(-1)}
 updateFooter();
}
window.advancedFinancialMemberProfile=function(){
 setTimeout(()=>window.advancedFinancialMemberRefresh?.(),0);
 return '<section class="card advanced-financial-member-profile"><div class="title">📈 خطة DXN المالية — سجلي التدريبي</div>'+
 '<div id="advancedFinancialMemberBody">جارٍ قراءة السجل...</div></section>';
};
window.advancedFinancialMemberRefresh=async function(){
 const root=document.getElementById('advancedFinancialMemberBody');if(!root)return;
 try{const d=await rpc('advanced_financial_overview');
 if(!root.isConnected)return;
 const list=d.lessons||[],complete=list.every(x=>x.completed&&x.passed&&x.best_score!=null);
 const average=complete?list.reduce((a,x)=>a+x.best_score*5,0)/10:null;
 root.innerHTML=(complete?'<strong>🏆 المعدل النهائي: '+average.toFixed(1)+' / 100</strong>':'<p class="muted">لا يظهر المعدل النهائي حتى إكمال الاختبارات العشرة.</p>')+
 list.map(x=>'<div class="card"><b>الدرس '+x.lesson_no+': '+esc(x.title)+'</b><p class="muted">مشاهدة: '+pct(x)+'% — الدرجة: '+
 (x.best_score==null?'لم يُختبر':(x.best_score*5)+' / 100')+' — '+(x.passed?'✅ ناجح':'⏳ قيد الإنجاز')+'</p></div>').join('');
 }catch(e){root.textContent='تعذر قراءة السجل: '+e.message;}
};
window.advancedFinancialLeaderProfile=async function(memberId){
 if(typeof role==='undefined'||role!=='leader')return;
 const modal=document.getElementById('memberProfileModal');if(!modal||!memberId)return;
 modal.querySelector('#advancedFinancialLeaderSection')?.remove();
 const section=document.createElement('section');section.id='advancedFinancialLeaderSection';section.className='card';
 section.innerHTML='<div class="title">📈 التدريب المتقدم — خطة DXN المالية</div><p class="muted">جارٍ تحميل نتائج العضو...</p>';
 modal.append(section);
 try{const d=await rpc('advanced_financial_leader_member_profile',{p_member_id:String(memberId)});
 if(!section.isConnected||String(d.member_id)!==String(memberId))return;
 const lessons=d.lessons||[];const allPassed=lessons.length===10&&lessons.every(x=>x.completed&&x.passed&&x.best_score!=null);
 const average=allPassed?lessons.reduce((total,x)=>total+Number(x.best_score)*5,0)/10:null;
 section.innerHTML='<div class="title">📈 التدريب المتقدم — خطة DXN المالية</div>'+ 
 (allPassed?'<p class="basic-training-average-score">🏆 المعدل النهائي: '+average.toFixed(1)+' / 100</p>':'<p class="muted">يظهر المعدل النهائي عند اكتمال الدروس والاختبارات العشرة.</p>')+
 (d.lessons||[]).map(x=>'<div class="row"><span>'+x.lesson_no+'. '+esc(x.title)+'</span><span>مشاهدة '+pct(x)+'% | '+(x.best_score==null?'لا توجد درجة':x.best_score*5+' / 100')+' | '+(x.passed?'✅':'⏳')+'</span></div>').join('');
 }catch(e){if(section.isConnected)section.innerHTML='<p class="muted">تعذر تحميل سجل التدريب: '+esc(e.message)+'</p>';}
};
})();
