/* V86.46.10 — قفل اختبارات الشروحات حتى إكمال مشاهدة جميع التدريبات بنسبة 100% */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_GLOBAL_LOCK_V864610__) return;
  window.__DXN_TRAINING_ASSESSMENT_GLOBAL_LOCK_V864610__=true;

  function isMember(){
    var r=String((typeof role!=='undefined'?role:'')||window.role||'').toLowerCase();
    return r==='member';
  }

  function lessons(){
    var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];
    return ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)});
  }

  function progress(){
    return (typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.my_progress))?trainingData.my_progress:[];
  }

  function progressForLesson(lesson){
    var ps=progress(),id=String(lesson&&lesson.id||'');
    var rows=ps.filter(function(p){
      return id && String(p.lesson_id||p.lessonId||'')===id;
    });
    if(!rows.length){
      var no=Number(lesson&&lesson.lesson_no||0);
      rows=ps.filter(function(p){return Number(p.lesson_no||p.lessonNo||0)===no});
    }
    if(!rows.length)return null;
    rows.sort(function(a,b){
      return new Date(String(b.updated_at||b.last_update_at||b.completed_at||0))-new Date(String(a.updated_at||a.last_update_at||a.completed_at||0));
    });
    return rows[0];
  }

  function lessonPercent(lesson){
    var p=progressForLesson(lesson);
    if(!p)return 0;
    if(p.completed===true)return 100;
    var pct=Number(p.watch_percent);
    if(isFinite(pct))return Math.max(0,Math.min(100,pct));
    var watched=Number(p.watched_seconds||0),duration=Number(p.duration_seconds||0);
    return duration>0?Math.max(0,Math.min(100,watched/duration*100)):0;
  }

  function allTrainingsComplete(){
    var ls=lessons();
    if(!ls.length)return false;
    return ls.every(function(l){return lessonPercent(l)>=99.9});
  }

  function overallPercent(){
    var ls=lessons();
    if(!ls.length)return 0;
    return Math.round(ls.reduce(function(total,l){return total+lessonPercent(l)},0)/ls.length);
  }

  function ensureStyle(){
    if(document.getElementById('dxn-global-assessment-lock-style'))return;
    var s=document.createElement('style');
    s.id='dxn-global-assessment-lock-style';
    s.textContent=''
      +'.dxn-assessment-global-locked{position:relative!important;border:2px solid #d9dfe1!important;background:linear-gradient(135deg,#f5f7f7,#fff)!important}'
      +'.dxn-assessment-global-lock-note{display:flex!important;align-items:center;justify-content:center;gap:8px;margin:10px 0 14px;padding:13px 14px;border:1px solid #d9dfe1;border-radius:14px;background:#f1f3f3;color:#59636a;font-weight:900;line-height:1.7;text-align:center}'
      +'.dxn-assessment-global-locked details{display:none!important}'
      +'[data-training-assessment-button][data-dxn-global-assessment-locked="1"]{opacity:.5!important;cursor:not-allowed!important;filter:saturate(.2)!important}'
      +'[data-training-assessment-button][data-dxn-global-assessment-locked="1"]:disabled{opacity:.5!important}'
      ;
    (document.head||document.documentElement).appendChild(s);
  }

  function setGlobalButtons(locked){
    var buttons=document.querySelectorAll('[data-training-assessment-button]');
    for(var i=0;i<buttons.length;i++){
      var b=buttons[i];
      if(!b.hasAttribute('data-dxn-global-original-disabled'))b.setAttribute('data-dxn-global-original-disabled',b.disabled?'1':'0');
      b.setAttribute('data-dxn-global-assessment-locked',locked?'1':'0');
      if(locked){
        b.disabled=true;
        b.innerHTML='🔒 الاختبارات مغلقة';
        b.title='أكمل مشاهدة جميع التدريبات بنسبة 100% لفتح الاختبارات.';
        b.setAttribute('aria-disabled','true');
      }else{
        var original=b.getAttribute('data-dxn-global-original-disabled')==='1';
        b.disabled=original;
        b.removeAttribute('data-dxn-global-assessment-locked');
        b.setAttribute('aria-disabled',original?'true':'false');
      }
    }
  }

  function lockRoot(root,locked){
    if(!root)return;
    root.classList.toggle('dxn-assessment-global-locked',locked);
    root.setAttribute('data-dxn-global-lock',locked?'1':'0');
    var note=root.querySelector('.dxn-assessment-global-lock-note');
    if(locked){
      if(!note){
        note=document.createElement('div');
        note.className='dxn-assessment-global-lock-note';
        root.insertBefore(note,root.firstChild||null);
      }
      note.textContent='🔒 الاختبارات مغلقة حاليًا — أكمل مشاهدة جميع التدريبات بنسبة 100% أولًا. نسبة المشاهدة الحالية: '+overallPercent()+'%';
      var details=root.querySelectorAll('details');
      for(var i=0;i<details.length;i++)details[i].open=false;
    }else if(note){
      note.remove();
    }
  }

  function refresh(){
    if(!isMember())return;
    ensureStyle();
    var complete=allTrainingsComplete(),locked=!complete;
    var root=document.getElementById('dxn-training-assessment');
    lockRoot(root,locked);
    setGlobalButtons(locked);
    return {locked:locked,percent:overallPercent()};
  }

  function boot(){
    refresh();
    clearInterval(window.__dxnGlobalAssessmentLockPoll);
    window.__dxnGlobalAssessmentLockPoll=setInterval(function(){
      var s=refresh();
      if(s&&!s.locked){clearInterval(window.__dxnGlobalAssessmentLockPoll);window.__dxnGlobalAssessmentLockPoll=0;}
    },1500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  try{new MutationObserver(function(){clearTimeout(window.__dxnGlobalAssessmentLockTimer);window.__dxnGlobalAssessmentLockTimer=setTimeout(refresh,120)}).observe(document.body,{childList:true,subtree:true})}catch(e){}
  document.addEventListener('dxn:training-progress-updated',function(){setTimeout(refresh,80);setTimeout(refresh,700);});
  document.addEventListener('dxn:training-rendered',function(){setTimeout(refresh,80);});
})();
