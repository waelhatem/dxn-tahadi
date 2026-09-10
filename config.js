// إعدادات مشروع مجتمع الصحة والثراء
// هذا المفتاح Publishable ومخصص للاستخدام في المتصفح.
window.DXN_CONFIG = {
  SUPABASE_URL: 'https://ryqpstkzppaifpvhezzn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'
};

/* V86.2 — تشخيص ومسار دخول مستقل عن النسخ القديمة.
   لا يسجل التوكن أو رقم العضوية أو PIN. */
(function(){
  if(window.__DXN_LOGIN_RUNTIME_V862__) return;
  window.__DXN_LOGIN_RUNTIME_V862__=true;

  function show(msg){
    try{
      var t=document.getElementById('toast');
      if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(function(){t.classList.add('hidden')},2600);return;}
    }catch(_){ }
    try{ if(window.alert) window.alert(msg); }catch(_){ }
  }

  function install(){
    try{
      var b=document.getElementById('loginButton');
      if(!b) return false;
      if(b.__dxnV862) return true;
      b.__dxnV862=true;
      b.removeAttribute('onclick');
      b.type='button';
      b.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        var n=document.getElementById('loginNo');
        var p=document.getElementById('pin');
        var no=n?String(n.value||'').trim():'';
        var pin=p?String(p.value||'').trim():'';
        if(!no||!pin){ show('أدخل بيانات الدخول أولاً.'); return; }
        if(typeof window.login!=='function'){
          show('تعذر تحميل وظيفة الدخول. أعد تحميل الصفحة مرة واحدة.');
          return;
        }
        try{ window.login(); }catch(err){ show(err&&err.message?err.message:'تعذر تنفيذ الدخول.'); }
      },false);
      return true;
    }catch(_){ return false; }
  }

  if(!install()){
    var tries=0;
    var timer=setInterval(function(){
      if(install()||++tries>120) clearInterval(timer);
    },100);
  }
})();
