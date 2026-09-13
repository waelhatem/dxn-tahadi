/* V86.46.44 — قفل الاختبار مستقر ويُحدّث عند تغير الحالة فقط */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_LOCK_V864644__)return;
  window.__DXN_TRAINING_ASSESSMENT_LOCK_V864644__=true;

  function addStyles(){
    if(document.getElementById('dxn-training-assessment-lock-style'))return;
    var s=document.createElement('style');s.id='dxn-training-assessment-lock-style';
    s.textContent=''
      +'.dxn-assessment-locked{position:relative!important;opacity:.82!important;border-color:#d8dee0!important;background:#f7f8f8!important}'
      +'.dxn-assessment-locked>summary{cursor:not-allowed!important;user-select:none!important}'
      +'.dxn-assessment-lock-note{display:flex!important;align-items:center!important;gap:8px!important;margin:10px 0 12px!important;padding:10px 12px!important;border:1px solid #e1e5e6!important;border-radius:12px!important;background:#f1f3f3!important;color:#68737a!important;font-weight:800!important;line-height:1.7!important}'
      +'.dxn-assessment-locked .challenge,.dxn-assessment-locked textarea,.dxn-assessment-locked button{cursor:not-allowed!important}'
      +'.dxn-assessment-locked .challenge{opacity:.72!important}'
      +'[data-training-assessment-button][data-dxn-assessment-locked="1"]{opacity:.52!important;cursor:not-allowed!important;filter:saturate(.25)!important}'
      +'[data-training-assessment-button][data-dxn-assessment-ready="1"]{opacity:1!important;cursor:pointer!important;filter:none!important}'
      +'@media(max-width:600px){.dxn-assessment-lock-note{font-size:13px!important;padding:9px 10px!important}}';
    (document.head||document.documentElement).appendChild(s);
  }
  function lessons(){
    var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];
    return ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)});
  }
  function progressForLesson(lesson){
    var ps=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.my_progress))?trainingData.my_progress:[];
    var id=String(lesson&&lesson.id||''),candidates=ps.filter(function(p){return id&&String(p.lesson_id||p.lessonId||'')===id});
    if(!candidates.length){var no=Number(lesson&&lesson.lesson_no||0);candidates=ps.filter(function(p){return Number(p.lesson_no||p.lessonNo||0)===no})}
    if(!candidates.length)return null;
    candidates.sort(function(a,b){return new Date(String(b.updated_at||b.last_update_at||b.completed_at||0))-new Date(String(a.updated_at||a.last_update_at||a.completed_at||0))});
    return candidates[0];
  }
  function isComplete(lesson){
    var p=progressForLesson(lesson);if(!p)return false;if(p.completed===true)return true;
    var pct=Number(p.watch_percent);if(isFinite(pct)&&pct>=99.9)return true;
    var watched=Number(p.watched_seconds||0),dur=Number(p.duration_seconds||0);return dur>0&&watched>0&&watched/dur>=.999;
  }
  function currentRole(){return String((typeof role!=='undefined'?role:'')||window.role||localStorage.getItem('dxn_role')||'').toLowerCase()}
  function detailNo(d){var s=d.querySelector('summary'),m=String(s?s.textContent:d.textContent||'').match(/التدريب\s*(\d+)/);return m?Number(m[1]):0}
  function buttonNo(b){return Number(b.getAttribute('data-training-assessment-button')||0)}
  function assessmentDetails(){return Array.prototype.slice.call(document.querySelectorAll('details')).filter(function(d){var s=d.querySelector('summary'),t=String(s?s.textContent:'');return /التدريب\s*\d+/.test(t)&&/أسئلة|سؤال|تمت الإجابة|إجابة/.test(String(d.textContent||''))})}
  function setManagedDisabled(el,locked){if(!el)return;if(!el.hasAttribute('data-dxn-lock-original-disabled'))el.setAttribute('data-dxn-lock-original-disabled',el.disabled?'1':'0');var original=el.getAttribute('data-dxn-lock-original-disabled')==='1';el.disabled=locked?true:original}
  function syncButton(b,ready){var locked=!ready;b.setAttribute('data-dxn-assessment-ready',ready?'1':'0');b.setAttribute('data-dxn-assessment-locked',locked?'1':'0');b.disabled=locked;b.setAttribute('aria-disabled',locked?'true':'false');b.innerHTML=locked?'🔒 اختبار التدريب':'🧠 اختبار التدريب';b.title=locked?'أكمل مشاهدة فيديو التدريب بالكامل لفتح الاختبار.':'فتح اختبار التدريب'}
  function syncDetail(d,ready){
    if(!d)return;var locked=!ready;d.classList.toggle('dxn-assessment-locked',locked);d.setAttribute('aria-disabled',locked?'true':'false');
    var summary=d.querySelector('summary');
    if(summary&&!summary.__dxnLockClick){summary.__dxnLockClick=true;summary.addEventListener('click',function(e){if(d.classList.contains('dxn-assessment-locked')){e.preventDefault();e.stopPropagation()}},true)}
    if(locked){d.open=false;var note=d.querySelector('.dxn-assessment-lock-note');if(!note){note=document.createElement('div');note.className='dxn-assessment-lock-note';note.innerHTML='🔒 الاختبار مغلق — يجب مشاهدة فيديو التدريب بالكامل أولًا.';if(summary&&summary.nextSibling)d.insertBefore(note,summary.nextSibling);else d.appendChild(note)}}
    else{var old=d.querySelector('.dxn-assessment-lock-note');if(old)old.remove()}
    var controls=d.querySelectorAll('textarea,button,input,select');for(var i=0;i<controls.length;i++)setManagedDisabled(controls[i],locked);
  }
  function refresh(){
    addStyles();if(currentRole()==='leader')return {locked:0,total:0};
    var ls=lessons();if(!ls.length)return {locked:0,total:0};
    var details=assessmentDetails(),lockedCount=0,total=0;
    for(var i=0;i<details.length;i++){var d=details[i],no=detailNo(d),lesson=ls.find(function(x){return Number(x.lesson_no)===no})||{lesson_no:no},ready=isComplete(lesson);syncDetail(d,ready);total++;if(!ready)lockedCount++}
    var buttons=document.querySelectorAll('[data-training-assessment-button]');
    for(var j=0;j<buttons.length;j++){var b=buttons[j],no2=buttonNo(b),lesson2=ls.find(function(x){return Number(x.lesson_no)===no2});if(lesson2){var ready2=isComplete(lesson2);syncButton(b,ready2);if(!ready2)lockedCount++;total++}}
    return {locked:lockedCount,total:total};
  }
  function schedule(){clearTimeout(window.__dxnAssessmentLockTimer);window.__dxnAssessmentLockTimer=setTimeout(refresh,120)}
  function adaptiveWatch(){
    clearInterval(window.__dxnAssessmentLockPoll);
    window.__dxnAssessmentLockPoll=setInterval(function(){var s=refresh();if(!s.locked||!s.total){clearInterval(window.__dxnAssessmentLockPoll);window.__dxnAssessmentLockPoll=0}},2500);
  }
  function boot(){var s=refresh();if(s.locked)adaptiveWatch();setTimeout(function(){var x=refresh();if(x.locked)adaptiveWatch()},500);setTimeout(function(){var x=refresh();if(x.locked)adaptiveWatch()},1200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}catch(e){}
  document.addEventListener('dxn:training-progress-updated',function(){schedule();adaptiveWatch()});
  document.addEventListener('dxn:training-rendered',function(){schedule();adaptiveWatch()});
  document.addEventListener('ended',function(){schedule();adaptiveWatch()},true);
})();