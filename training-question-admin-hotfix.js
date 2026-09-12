/* V86.46.6 — hard-wired leader question-admin opener, resilient role detection */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86466__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86466__=true;

  function leader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    try{if(String(window.__DXN_CONFIG_ROLE__||'').toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-tab') || !!document.getElementById('dxn-training-question-admin-center-button');
  }

  function loadAdmin(done){
    if(typeof window.openTrainingQuestionAdmin==='function'){done();return}
    var old=document.querySelector('script[data-dxn-question-admin-hotload="1"]');
    if(old){
      var wait=0;
      var timer=setInterval(function(){
        if(typeof window.openTrainingQuestionAdmin==='function'){clearInterval(timer);done();}
        else if(++wait>50){clearInterval(timer);console.error('DXN question admin opener is unavailable');}
      },100);
      return;
    }
    var s=document.createElement('script');
    s.src='training-question-admin.js?v=86.46.6';
    s.async=false;
    s.setAttribute('data-dxn-question-admin-hotload','1');
    s.onload=function(){
      if(typeof window.openTrainingQuestionAdmin==='function')done();
      else console.error('DXN question admin opener is unavailable after script load');
    };
    s.onerror=function(){console.error('DXN question admin script failed to load')};
    document.head.appendChild(s);
  }

  function open(){
    if(!leader())return false;
    loadAdmin(function(){
      try{
        if(typeof window.openTrainingQuestionAdmin==='function'){
          window.openTrainingQuestionAdmin();
          return;
        }
        var b=document.getElementById('dxn-training-question-admin-tab');
        if(b){b.classList.contains('active')?null:b.click();return}
        console.error('DXN question admin opener is unavailable');
      }catch(e){console.error('DXN question admin opener failed',e)}
    });
    return true;
  }

  window.__DXN_OPEN_TRAINING_QUESTION_ADMIN__=open;

  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!b||!leader())return;
    var t=String(b.textContent||'').replace(/\s+/g,' ').trim();
    if(t.indexOf('تعديل أسئلة اختبارات التدريبات')===-1 && t.indexOf('تعديل أسئلة الاختبارات')===-1)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  },true);
})();
