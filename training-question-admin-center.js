/* V86.46.9 — pointerdown-safe leader question-admin opener */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86469__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86469__=true;

  function isLeader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-center-button');
  }
  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')||document.getElementById('dxn-training-question-admin-direct-panel')}

  function loadAdminAndOpen(){
    if(!isLeader())return;
    if(typeof window.openTrainingQuestionAdmin==='function'){
      try{window.openTrainingQuestionAdmin();return}catch(e){console.debug('DXN question admin direct open failed',e)}
    }
    var existing=document.querySelector('script[data-dxn-qadmin-center-loader="1"]');
    if(existing)return;
    var s=document.createElement('script');
    s.src='training-question-admin.js?v=86.46.9';
    s.async=false;
    s.setAttribute('data-dxn-qadmin-center-loader','1');
    s.onload=function(){
      if(typeof window.openTrainingQuestionAdmin==='function'){
        try{window.openTrainingQuestionAdmin()}catch(e){console.error('DXN question admin opener failed',e)}
      }else{
        showFallback();
      }
    };
    s.onerror=function(){showFallback()};
    document.head.appendChild(s);
  }

  function showFallback(){
    var c=center()||document.querySelector('.app')||document.body;
    var old=document.getElementById('dxn-training-question-admin-direct-panel');
    if(old)old.remove();
    var p=document.createElement('section');
    p.id='dxn-training-question-admin-direct-panel';
    p.className='card';
    p.style.cssText='margin:14px 0;border:2px solid #d8d2ef;background:#fff;direction:rtl;text-align:right;position:relative;z-index:9999';
    p.innerHTML='<div class="row"><div><div class="title">⚙️ تعديل أسئلة اختبارات التدريبات</div><div class="muted">تعذر تحميل محرر الأسئلة.</div></div><button type="button">✕ إغلاق</button></div><div class="challenge" style="margin-top:12px"><b>المحرر لم يتم تحميله من الخادم.</b><div class="muted" style="margin-top:6px">تحقق من اتصال التطبيق ثم أعد تحميل الصفحة.</div></div>';
    c.appendChild(p);
    var close=p.querySelector('button');if(close)close.onclick=function(){p.remove()};
    p.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function moveIntoCenter(){
    var c=center(),p=panel();
    if(!c||!p)return false;
    if(p.parentElement!==c)c.appendChild(p);
    p.style.width='100%';
    p.style.boxSizing='border-box';
    p.style.margin='14px 0 0';
    return true;
  }

  function openEditor(){
    if(!isLeader())return;
    loadAdminAndOpen();
    setTimeout(function(){
      var p=panel();
      if(p){p.style.display='block';moveIntoCenter();p.scrollIntoView({behavior:'smooth',block:'start'})}
    },160);
    setTimeout(moveIntoCenter,450);
    setTimeout(moveIntoCenter,900);
  }

  function makeButton(){
    var b=document.createElement('button');
    b.type='button';
    b.id='dxn-training-question-admin-center-button';
    b.className='primary';
    b.textContent='⚙️ تعديل أسئلة اختبارات التدريبات';
    b.title='فتح تعديل أسئلة اختبارات التدريبات';
    b.style.fontWeight='900';
    b.style.whiteSpace='nowrap';
    /* مهم: pointerdown يسبق أي click handlers ويضمن استجابة الزر. */
    b.addEventListener('pointerdown',function(e){
      e.preventDefault();
      e.stopPropagation();
      openEditor();
    },true);
    b.addEventListener('click',function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      openEditor();
    },true);
    return b;
  }

  function installButton(){
    if(!isLeader())return false;
    var c=center();
    if(!c)return false;
    var existing=c.querySelector('#dxn-training-question-admin-center-button');
    var actions=c.querySelector('.overall-actions');
    if(existing){
      if(actions&&existing.parentElement!==actions)actions.insertBefore(existing,actions.firstChild);
      return true;
    }
    var button=makeButton();
    if(actions){actions.insertBefore(button,actions.firstChild);return true}
    var buttons=c.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      var txt=String(buttons[i].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('إدارة التدريبات')!==-1){buttons[i].parentNode.insertBefore(button,buttons[i]);return true}
    }
    var head=c.querySelector('.overall-head');
    if(head){head.insertBefore(button,head.firstChild);return true}
    return false;
  }

  function protectRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped469)return;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){
      var result=original.apply(this,arguments);
      setTimeout(function(){installButton();moveIntoCenter()},0);
      setTimeout(function(){installButton();moveIntoCenter()},150);
      return result;
    }
    wrapped.__dxnCenterWrapped469=true;
    window.renderLeaderOverallTraining=wrapped;
  }

  function run(){
    if(!isLeader())return;
    protectRefresh();
    installButton();
    moveIntoCenter();
  }

  var n=0;
  var timer=setInterval(function(){run();if(++n>600)clearInterval(timer)},100);
  if(document.body)new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
})();
