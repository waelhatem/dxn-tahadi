// إعدادات مشروع مجتمع الصحة والثراء
// هذا المفتاح Publishable ومخصص للاستخدام في المتصفح.
window.DXN_CONFIG = {
  SUPABASE_URL: 'https://ryqpstkzppaifpvhezzn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'
};

/* V86.3 — مسار دخول مستقل فعليًا عن دالة login القديمة.
   لا يسجل التوكن أو رقم العضوية أو PIN. */
(function(){
  if(window.__DXN_LOGIN_RUNTIME_V863__) return;
  window.__DXN_LOGIN_RUNTIME_V863__=true;

  var C=window.DXN_CONFIG||{};
  var base=String(C.SUPABASE_URL||'').replace(/\/$/,'');
  var key=String(C.SUPABASE_ANON_KEY||'');

  function show(msg,persist){
    try{
      var t=document.getElementById('toast');
      if(t){
        t.textContent=msg;
        t.classList.remove('hidden');
        if(!persist)setTimeout(function(){t.classList.add('hidden')},5000);
        return;
      }
    }catch(_){ }
    try{ if(window.alert) window.alert(msg); }catch(_){ }
  }

  function showPanel(title,detail){
    try{
      var old=document.getElementById('dxnLoginDiag');
      if(old) old.remove();
      var d=document.createElement('div');
      d.id='dxnLoginDiag';
      d.setAttribute('role','alert');
      d.style.cssText='margin-top:12px;padding:14px;border:2px solid #b42318;border-radius:14px;background:#fff5f4;color:#7a1b15;line-height:1.7;font-weight:700;direction:rtl;text-align:right';
      d.innerHTML='<b>'+String(title||'تعذر الدخول').replace(/[<>]/g,'')+'</b><div style="margin-top:6px;font-weight:500;white-space:pre-wrap">'+String(detail||'').replace(/[<>]/g,'')+'</div>';
      var b=document.getElementById('loginButton');
      if(b&&b.parentNode)b.parentNode.insertBefore(d,b.nextSibling);
    }catch(_){ }
  }

  async function directLogin(){
    var n=document.getElementById('loginNo'),p=document.getElementById('pin');
    var no=n?String(n.value||'').trim():'';
    var pin=p?String(p.value||'').trim():'';
    if(!no||!pin){show('أدخل بيانات الدخول أولاً.');return;}
    if(!base||!key){showPanel('إعداد الاتصال ناقص','بيانات Supabase غير متاحة.');return;}

    var b=document.getElementById('loginButton');
    if(b){b.disabled=true;b.textContent='⏳ جارٍ التحقق...';}
    try{
      var res=await fetch(base+'/rest/v1/rpc/login',{
        method:'POST',
        headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({p_login_no:no,p_pin:pin}),
        cache:'no-store'
      });
      var text=await res.text();
      var payload=null;
      try{payload=text?JSON.parse(text):null}catch(_){payload=null}
      if(!res.ok){
        var msg=(payload&&(payload.message||payload.error_description||payload.hint))||text||('HTTP '+res.status);
        showPanel('فشل طلب الدخول','HTTP '+res.status+'\n'+String(msg));
        return;
      }
      if(!payload||!payload.token){
        showPanel('استجابة الدخول غير صالحة','تم الاتصال بقاعدة البيانات، لكن لم يصل رمز جلسة.');
        return;
      }
      localStorage.setItem('dxn_session',String(payload.token));
      localStorage.setItem('dxn_session_issued',String(Date.now()));
      show('تم تسجيل الدخول، جارٍ تحميل حسابك...');
      if(typeof window.boot==='function'){
        await window.boot();
        if(!localStorage.getItem('dxn_session')){
          var last=window.__DXN_LAST_RPC_ERROR__||{};
          showPanel('تم قبول بيانات الدخول لكن تعذر تحميل الحساب',
            (last.rpc?'RPC: '+last.rpc+'\n':'')+
            (last.http?'HTTP: '+last.http+'\n':'')+
            (last.message||'فشل تحميل بيانات الحساب بعد تسجيل الدخول.')
          );
        }
      }else{
        showPanel('تم تسجيل الدخول لكن التطبيق لم يكتمل تحميله','دالة boot غير متاحة في النسخة الحالية.');
      }
    }catch(err){
      showPanel('تعذر الاتصال بخدمة الدخول',err&&err.message?err.message:String(err));
    }finally{
      if(b){b.disabled=false;b.textContent='🔐 دخول';}
    }
  }

  function patchRpc(){
    try{
      var sb=window.supabase;
      if(!sb||typeof sb.createClient!=='function'||sb.createClient.__dxnV863)return false;
      return true;
    }catch(_){return false}
  }

  function install(){
    try{
      var b=document.getElementById('loginButton');
      if(!b)return false;
      if(!b.__dxnV863){
        b.__dxnV863=true;
        b.removeAttribute('onclick');
        b.type='button';
        b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();directLogin()},false);
      }
      if(typeof window.login==='function' && !window.login.__dxnV863){
        var original=window.login;
        var wrapped=function(){return directLogin()};
        wrapped.__dxnV863=true;
        wrapped.__dxnOriginal=original;
        window.login=wrapped;
      }
      return true;
    }catch(_){return false}
  }

  var tries=0;
  var timer=setInterval(function(){
    if(install()||++tries>180)clearInterval(timer);
  },100);
})();
