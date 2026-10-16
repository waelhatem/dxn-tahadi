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
// V86.90 — The cached lessons belong to one signed-in account; a different account starts clean.
let session=token();
function resetIfAccountChanged(){
 if(token()===session)return;
 session=token();
 if(watch){watch.engine?.stop();try{watch.player?.destroy()}catch(_){}watch=null;}
 data=[];role='';loaded=false;loading=false;exam=null;selectedLesson=1;
 document.querySelectorAll('.advanced-financial-overlay').forEach(x=>x.remove());
}
async function refresh(){
 const asked=session;
 const d=await rpc('advanced_financial_overview');
 if(asked!==session||token()!==session)return;
 if(!Array.isArray(d.lessons))throw Error('استجابة التدريب غير صحيحة');
 data=d.lessons;role=d.role;loaded=true;render();
}
const prevDone=n=>n===1||!!data.find(x=>x.lesson_no===n-1&&x.completed&&x.passed);
const isReady=x=>x&&x.active&&x.published&&x.duration>=60;
const canStart=x=>isReady(x)&&prevDone(x.lesson_no);
const canView=x=>!!(x&&x.video_id&&prevDone(x.lesson_no));
let selectedLesson=1;
// V86.92 — The quiz button's text and colour come from the lesson's saved state only. The same function
// renders the page and updates the button in place when the server confirms 90% (the player keeps playing).
function quizButton(x){
 const E=window.DXNTrainingEngine,ready=canStart(x);
 const state=E.lessonState({unlocked:prevDone(x.lesson_no),watchCompleted:!!x.completed,passed:!!x.passed,attempted:x.best_score!=null,watching:false});
 const open=ready&&!!x.completed;
 const text=!isReady(x)&&x.completed?E.MESSAGES.quizUnpublished:state==='passed'?'إعادة الاختبار':state==='failed'?'أعد الاختبار':open?'ابدأ اختبار الدرس':'اختبار الدرس — غير متاح';
 return {open,text:'📝 '+text,background:open?'#087b55':'#d7e6df',color:open?'#fff':'#224c3f'};
}
const cards=()=>{
 const selected=data.find(x=>x.lesson_no===selectedLesson)||data[0];
 if(!selected)return '';
 selectedLesson=selected.lesson_no;
 const n=selected.lesson_no,ready=canStart(selected),viewable=canView(selected);
 const side=data.map(x=>{
  const allowed=canView(x),active=x.lesson_no===n;
  return '<button type="button" class="advanced-profit-lesson" data-select-lesson="'+x.lesson_no+'" aria-pressed="'+active+'" '+(allowed?'':'disabled')+'>'+
    '<span class="advanced-profit-index">'+x.lesson_no+'</span><span>الدرس '+x.lesson_no+': '+esc(x.title)+'</span><span aria-hidden="true">▶</span></button>';
 }).join('');
 /* V86.90 — Unified training engine: the same six lesson states as the basic and professional tracks. */
 const E=window.DXNTrainingEngine;
 const state=E.lessonState({unlocked:prevDone(n),watchCompleted:!!selected.completed,passed:!!selected.passed,attempted:selected.best_score!=null,watching:false});
 const label=ready?E.STATE_TEXT[state]:'المشاهدة داخل الصفحة للعرض فقط؛ لا تُحتسب قبل اعتماد الدرس.';
 const q=quizButton(selected);
 const shown=selected.completed?100:0;
 const score=selected.best_score==null?'لم يُختبر':(5*selected.best_score)+' / 100';
 return '<p class="muted">اختر الدرس من القائمة. الفيديو العاشر خلاصة الدروس السابقة.</p>'+
 '<div class="advanced-profit-grid">'+
 '<div id="advancedProfitLessonList" class="advanced-profit-list" aria-label="دروس خطة أرباح DXN">'+side+'</div>'+
 '<div class="advanced-profit-viewer">'+
 '<strong id="advancedProfitVideoTitle">الدرس '+n+' من 10 — '+esc(selected.title)+'</strong>'+
 '<div class="advanced-financial-inline-actions" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;width:100%;">'+
 '<span class="muted" style="margin-inline-end:auto;">'+(ready?'▶ عند التشغيل تبدأ جلسة مشاهدة جديدة من البداية':'⏳ هذا الدرس غير منشور بعد، والمشاهدة لا تُحتسب')+'</span>'+
 (role==='leader'&&window.innerWidth>=900?'<button type="button" class="name-list-btn" data-preview="'+n+'">⏱ اعتماد مدة الفيديو</button>':'')+
 '</div>'+
 '<div class="training-professional-video" id="advancedFinancialInlineBox"><div id="advFinancialYT"></div></div>'+
 '<div class="basic-bag-inline-progress"><div class="basic-bag-progress"><div id="advFinancialWatchBar" style="width:'+shown+'%"></div></div><strong id="advFinancialWatchPct">'+esc(selected.completed?E.completionLabel(isReady(selected)):'0%')+'</strong></div>'+ 
  '<p id="advFinancialWatchMessage" class="muted">'+esc(label)+'</p>'+
  '<div class="advanced-financial-quiz-location">'+
 '<button type="button" class="name-list-btn primary advanced-financial-test-cta" data-test="'+n+'" style="display:inline-flex;justify-content:center;align-items:center;gap:8px;margin-inline-start:0;padding:13px 22px;min-width:0;font-size:1.05rem;font-weight:800;background:'+q.background+';color:'+q.color+';border:2px solid #0b805c;border-radius:12px;cursor:pointer;" '+(q.open?'':'disabled')+'>'+q.text+'</button>'+
  '</div>'+
  '<p class="muted">الدرجة: '+esc(score)+'</p>'+
 '</div></div>';
};
function render(){
 const host=document.getElementById('advancedFinancialLessons');
 if(!host)return;
 if(!loaded){host.innerHTML='<p class="muted">جارٍ تحميل حالة التدريب المحفوظة...</p>';return;}
 if(watch){watch.engine?.stop();try{watch.player?.destroy()}catch(_){}watch=null;}
 host.innerHTML=cards();
 host.querySelectorAll('[data-select-lesson]').forEach(b=>b.onclick=()=>{const n=+b.dataset.selectLesson,x=data.find(l=>l.lesson_no===n);if(canView(x)){selectedLesson=n;render();}});
 const chosen=data.find(x=>x.lesson_no===selectedLesson);if(chosen)mountInline(chosen);
 host.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>startWatch(+b.dataset.watch));
 host.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>startQuiz(+b.dataset.test));
 host.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewVideo(+b.dataset.preview));
 const p=document.getElementById('advancedFinancialProgress');
 if(p){const passed=data.filter(x=>x.passed&&x.completed).length;p.textContent='الدروس المجتازة: '+passed+' / 10'+(passed===10?' — 🎉 اكتملت دورة خطة DXN المالية':'');}
}
window.advancedFinancialCoursePage=function(){
 resetIfAccountChanged();
 if(!loading&&!loaded&&token()){loading=true;setTimeout(()=>refresh().catch(e=>notify(e.message)).finally(()=>{loading=false;}),0);}
 // Coming back to the page (it was rebuilt): show the lessons already loaded instead of "loading".
 else if(loaded)setTimeout(render,0);
 const vids=window.advancedProfitVideos||[];
 return '<section class="card advanced-financial-course" dir="rtl"><div class="title">🚀 التدريب المتقدم</div>'+
 '<details class="advanced-profit-course academy-camps-course"><summary><span class="advanced-profit-course-emoji">📈</span>'+
 '<span class="advanced-profit-course-copy"><strong>التدريب المتقدم الأول: خطة أرباح DXN المالية</strong>'+
 '<small>المهندس محمود المصري — 10 دروس متتابعة واختبار لكل درس</small></span>'+
 '<span class="academy-camps-open-hint"><span class="academy-camps-hint-closed">▶ اضغط لعرض الدروس العشرة</span>'+
 '<span class="academy-camps-hint-open">▲ إغلاق قائمة الدروس</span></span></summary><div class="advanced-profit-content">'+
 '<p class="muted">'+(window.DXNTrainingEngine?window.DXNTrainingEngine.POLICY_NOTE:'')+' الاختبار من 20 سؤالًا.</p>'+
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
 if(watch){watch.engine?.stop();try{watch.player?.destroy()}catch(_){}watch=null;}
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
function watchUi(p){
 const bar=document.getElementById('advFinancialWatchBar');if(bar)bar.style.width=p.percent+'%';
 const n=document.getElementById('advFinancialWatchPct');if(n)n.textContent=p.label||p.percent+'%';
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

async function mountInline(x){
 const target=document.getElementById('advFinancialYT');if(!target)return;
 const n=x.lesson_no,tracked=canStart(x);
 if(!tracked)status('يمكن مشاهدة الفيديو، لكن المشاهدة لا تُحتسب قبل اكتمال اعتماد الدرس.');
 try{
  await youtube();if(!target.isConnected||selectedLesson!==n)return;
  // V86.90 — One attempt per viewing through the unified engine; untracked lessons play as preview.
  const w={engine:null,player:null};
  w.engine=window.DXNTrainingEngine.createWatch({track:'advanced',lessonNo:n,watchCompleted:!!x.completed,preview:!tracked,
   quizReady:()=>isReady(data.find(l=>l.lesson_no===n)),
   onMessage:t=>{if(watch===w)status(t);},
   onProgress:p=>{if(watch===w&&tracked)watchUi(p);},
   onCompleted:()=>{
    // Saved state first (startQuiz reads it), then the existing button — no render, so no new player.
    const d=data.find(l=>l.lesson_no===n);if(!d||watch!==w)return;
    d.completed=true;
    const test=document.querySelector('#advancedFinancialLessons [data-test="'+n+'"]');
    if(test){const q=quizButton(d);test.textContent=q.text;test.style.background=q.background;test.style.color=q.color;test.disabled=!q.open;}
   }});
  watch=w;
  w.player=new window.YT.Player(target,{videoId:x.video_id,playerVars:{rel:0,disablekb:tracked?1:0,playsinline:1,start:0},
   events:{onReady:()=>{if(watch===w&&document.getElementById('advancedFinancialInlineBox')&&selectedLesson===n)w.engine.attach(w.player);},
    onPlaybackRateChange:e=>{if(watch===w)w.engine.onRate(e.data);},
    onStateChange:e=>{if(watch===w)w.engine.onState(e.data);}}});
 }catch(e){status('تعذّر تشغيل الفيديو: '+e.message);}
}
async function startQuiz(n){
 const x=data.find(p=>p.lesson_no===n);
 if(!x)return notify('الدرس غير موجود');
 if(!isReady(x))return notify('الاختبار ينتظر إكمال اعتماد أسئلته ونشر الدرس وتثبيت مدة الفيديو في إعدادات القائد. هذه المشاهدة لا تُحفظ بعد.');
 if(!prevDone(n))return notify('اجتز اختبار الدرس السابق أولًا');
 if(!x.completed)return notify('أكمل مشاهدة 90% من الفيديو في جلسة واحدة أولًا');
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
 const field=document.createElement('fieldset');field.className='basic-bag-question';field.dir='rtl';field.style.cssText='display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;margin:14px 0;padding:18px;border:1px solid #d4e6de;border-radius:12px;';
 const legend=document.createElement('legend');legend.textContent=q.question;legend.style.cssText='font-weight:800;padding:0 8px;line-height:1.8;max-width:100%;text-align:right;white-space:normal;';field.append(legend);
 q.options.forEach((o,j)=>{
 const label=document.createElement('label'),input=document.createElement('input'),answer=document.createElement('span');
 input.type='radio';input.name='ans';input.value=j;input.checked=e.answers[index]===j;
 input.style.cssText='margin:0;flex:0 0 auto;width:18px;height:18px;accent-color:#087b55;';
 answer.textContent=['أ','ب','ج','د'][j]+' — '+o;answer.style.cssText='display:block;flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.8;text-align:right;';
 label.style.cssText='display:flex;flex-direction:row;align-items:center;gap:12px;min-height:48px;width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #d9e7e1;border-radius:10px;background:#fff;cursor:pointer;text-align:right;';
 label.append(input,answer);
 input.onchange=()=>{e.answers[index]=j;field.querySelectorAll('label').forEach((item,k)=>{item.style.background=k===j?'#e0f4ea':'#fff';item.style.borderColor=k===j?'#087b55':'#d9e7e1';});updateFooter()};
 if(input.checked){label.style.background='#e0f4ea';label.style.borderColor='#087b55';}
 field.append(label);
 });body.append(field);
 const foot=document.createElement('div');foot.className='advanced-financial-footer';
 const back=document.createElement('button');back.textContent='السابق';back.disabled=index===0;back.onclick=()=>{e.index--;renderExam(body)};
 const next=document.createElement('button');next.textContent='التالي';next.disabled=index===19;next.onclick=()=>{if(e.answers[index]<0)return; e.index++;renderExam(body)};
 const submit=document.createElement('button');submit.className='primary';submit.textContent='إنهاء الاختبار وتصحيحه';submit.disabled=true;
 submit.onclick=async()=>{if(e.busy||e.answers.includes(-1))return;e.busy=true;submit.disabled=true;
 try{const result=await rpc('advanced_financial_submit_quiz',{p_lesson_no:e.no,p_answers:e.answers,p_revision:e.revision});
 body.replaceChildren();const resultBox=document.createElement('section');resultBox.className='basic-bag-result';
 resultBox.textContent='درجة الاختبار: '+result.score*5+' / 100 — '+(result.passed?window.DXNTrainingEngine.MESSAGES.passed:window.DXNTrainingEngine.MESSAGES.failed);
 body.append(resultBox);await refresh();
 }catch(err){notify(err.message);e.busy=false;updateFooter()}};
 foot.append(back,next,submit);body.append(foot);
 function updateFooter(){next.disabled=e.answers[index]<0||index===19;submit.disabled=e.busy||index!==19||e.answers.includes(-1)}
 updateFooter();
}
window.advancedFinancialMemberProfile=function(){
 setTimeout(()=>window.advancedFinancialMemberRefresh?.(),0);
 return '<section class="card advanced-financial-member-profile"><div class="title">🚀 التدريب المتقدم — سجلي التدريبي</div>'+
 '<div id="advancedFinancialMemberBody">جارٍ قراءة السجل...</div></section>';
};
window.advancedFinancialMemberRefresh=async function(){
 const root=document.getElementById('advancedFinancialMemberBody');if(!root)return;
 try{const d=await rpc('advanced_financial_overview');
 if(!root.isConnected)return;
 const list=(d.lessons||[]).slice().sort((a,b)=>Number(a.lesson_no)-Number(b.lesson_no)),complete=list.length===10&&list.every(x=>x.completed&&x.passed&&x.best_score!=null);
 const average=complete?list.reduce((a,x)=>a+x.best_score*5,0)/10:null;
 root.innerHTML=(complete?'<strong>🏆 المعدل النهائي: '+average.toFixed(1)+' / 100</strong>':'<p class="muted">لا يظهر المعدل النهائي حتى إكمال الاختبارات العشرة.</p>')+
 list.map(x=>'<div class="card"><b>الدرس '+x.lesson_no+': '+esc(x.title)+'</b><p class="muted">المشاهدة: '+(x.completed?'✅ مكتملة':'غير مكتملة')+' — الدرجة: '+
 (x.best_score==null?'لم يُختبر':(x.best_score*5)+' / 100')+' — '+(x.passed?'✅ مجتاز':x.best_score!=null?'❌ لم يجتز':x.completed?'📝 جاهز للاختبار':'⏳ لم تكتمل المشاهدة')+'</p>'+(x.passed_at?'<p class="muted">📅 تاريخ الاجتياز: '+esc(new Date(x.passed_at).toLocaleDateString('ar-IQ'))+'</p>':'')+'</div>').join('');
 }catch(e){root.textContent='تعذر قراءة السجل: '+e.message;}
};
window.advancedFinancialLeaderProfile=async function(memberId){
 if(typeof role==='undefined'||role!=='leader')return;
 const modal=document.getElementById('memberProfileModal');if(!modal||!memberId)return;
 modal.querySelector('#advancedFinancialLeaderSection')?.remove();
 const section=document.createElement('section');section.id='advancedFinancialLeaderSection';section.className='card';
 section.innerHTML='<div class="title">🚀 التدريب المتقدم</div><p class="muted">جارٍ تحميل نتائج العضو...</p>';
 const resultsPanel=modal.querySelector('#leaderTrainingResultsPanelAdvanced');
 if(resultsPanel)resultsPanel.appendChild(section);
 else {
 const anchor=modal.querySelector('.command-actions');
 if(anchor&&anchor.parentElement)anchor.insertAdjacentElement('beforebegin',section);
 else (modal.querySelector('.evidence-modal')||modal).appendChild(section);
 }
 try{const d=await rpc('advanced_financial_leader_member_profile',{p_member_id:String(memberId)});
 if(!section.isConnected||String(d.member_id)!==String(memberId))return;
 const lessons=(d.lessons||[]).slice().sort((a,b)=>Number(a.lesson_no)-Number(b.lesson_no));const allPassed=lessons.length===10&&lessons.every(x=>x.completed&&x.passed&&x.best_score!=null);
 const average=allPassed?lessons.reduce((total,x)=>total+Number(x.best_score)*5,0)/10:null;
 section.innerHTML='<div class="title">🚀 التدريب المتقدم</div>'+ 
 (allPassed?'<p class="basic-training-average-score">🏆 المعدل النهائي: '+average.toFixed(1)+' / 100</p>':'<p class="muted">يظهر المعدل النهائي عند اكتمال الدروس والاختبارات العشرة.</p>')+
 lessons.map(x=>'<div class="row"><span>'+x.lesson_no+'. '+esc(x.title)+'</span><span>المشاهدة '+(x.completed?'مكتملة':'غير مكتملة')+' | '+(x.best_score==null?'لا توجد درجة':x.best_score*5+' / 100')+' | '+(x.passed?'✅ مجتاز':x.best_score!=null?'❌ لم يجتز':x.completed?'📝 جاهز للاختبار':'⏳ لم تكتمل المشاهدة')+'</span>'+(x.passed_at?'<span>📅 '+esc(new Date(x.passed_at).toLocaleDateString('ar-IQ'))+'</span>':'')+'</div>').join('');
 }catch(e){if(section.isConnected)section.innerHTML='<p class="muted">تعذر تحميل سجل التدريب: '+esc(e.message)+'</p>';}
};
})();
