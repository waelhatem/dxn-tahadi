/* V86.46.5 — hard-wired leader question-admin opener */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86465__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86465__=true;
  function leader(){try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader'}catch(e){return false}}
  function loadAdmin(done){
    if(typeof window.openTrainingQuestionAdmin==='function'){done();return}
    var s=document.createElement('script');
    s.src='training-question-admin.js?v=86.46.5';
    s.async=false;
    s.onload=function(){done()};
    s.onerror=function(){console.error('DXN question admin script failed to load')};
    document.head.appendChild(s);
  }
  function open(){
    if(!leader())return;
    loadAdmin(function(){
      try{
        if(typeof window.openTrainingQuestionAdmin==='function'){
          window.openTrainingQuestionAdmin();
          return;
        }
        console.error('DXN question admin opener is unavailable');
      }catch(e){console.error('DXN question admin opener failed',e)}
    });
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
