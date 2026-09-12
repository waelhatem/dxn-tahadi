/* V86.46.7 — robust leader question-admin opener + visible diagnostics */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86467__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86467__=true;
  function leader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    try{if(String(window.__DXN_CONFIG_ROLE__||'').toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-tab') || !!document.getElementById('dxn-training-question-admin-center-button');
  }
  function show(msg){
    var old=document.getElementById('dxn-question-admin-hotfix-error');if(old)old.remove();
    var d=document.createElement('div');d.id='dxn-question-admin-hotfix-error';d.style.cssText='position:fixed;top:18px;left:18px;right:18px;z-index:9999;padding:14px;border:2px solid #b42318;border-radius:14px;background:#fff5f4;color:#7a1b15;font-weight:800;direction:rtl;text-align:right;box-shadow:0 8px 24px #0002';d.textContent=msg;document.body.appendChild(d);setTimeout(function(){if(d.parentNode)d.remove()},8000)
  }
  function loadAdmin(done){
    if(typeof window.openTrainingQuestionAdmin==='function'){done();return}
    var old=document.querySelector('script[data-dxn-question-admin-hotload="1"]');
    if(old){var wait=0,t=setInterval(function(){if(typeof window.openTrainingQuestionAdmin==='function'){clearInterval(t);done()}else if(++wait>50){clearInterval(t);show('محرر أسئلة الاختبارات لم يتم تحميله.')}} ,100);return}
    var s=document.createElement('script');s.src='training-question-admin.js?v=86.46.7';s.async=false;s.setAttribute('data-dxn-question-admin-hotload','1');
    s.onload=function(){if(typeof window.openTrainingQuestionAdmin==='function')done();else show('تم تحميل الملف لكن محرر الأسئلة غير متاح.')};
    s.onerror=function(){show('تعذر تحميل محرر أسئلة الاختبارات.')};document.head.appendChild(s);
  }
  function open(){
    if(!leader())return false;
    loadAdmin(function(){try{
      if(typeof window.openTrainingQuestionAdmin==='function'){var ok=window.openTrainingQuestionAdmin();if(ok===false)show('تعذر فتح محرر أسئلة الاختبارات.');return}
      var b=document.getElementById('dxn-training-question-admin-tab');if(b){b.click();return}show('محرر أسئلة الاختبارات غير متاح حالياً.');
    }catch(e){show('حدث خطأ عند فتح محرر الأسئلة: '+(e&&e.message||e))}});return true;
  }
  window.__DXN_OPEN_TRAINING_QUESTION_ADMIN__=open;
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var t=String(b.textContent||'').replace(/\s+/g,' ').trim();if(t.indexOf('تعديل أسئلة اختبارات التدريبات')===-1&&t.indexOf('تعديل أسئلة الاختبارات')===-1)return;if(!leader())return;e.preventDefault();e.stopImmediatePropagation();open()},true);
})();
