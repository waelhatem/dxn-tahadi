// إعدادات مشروع مجتمع الصحة والثراء
// هذا المفتاح Publishable ومخصص للاستخدام في المتصفح.
window.DXN_CONFIG = {
  SUPABASE_URL: 'https://ryqpstkzppaifpvhezzn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'
};

/* V86.4 — تسجيل الدخول ينجح، لذلك نلتقط خطأ bootstrap الحقيقي بدل إخفائه. */
(function(){
  if(window.__DXN_LOGIN_RUNTIME_V864__) return;
  window.__DXN_LOGIN_RUNTIME_V864__=true;

  var C=window.DXN_CONFIG||{};
  var base=String(C.SUPABASE_URL||'').replace(/\/$/,'');
  var key=String(C.SUPABASE_ANON_KEY||'');

  function safe(v){return String(v==null?'':v).replace(/[<>]/g,'')}
  function show(msg){
    try{
      var t=document.getElementById('toast');
      if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(function(){t.classList.add('hidden')},6000);return;}
    }catch(_){ }
    try{if(window.alert)window.alert(msg)}catch(_){ }
  }
  function showPanel(title,detail){
    try{
      var old=document.getElementById('dxnLoginDiag');
      if(old)old.remove();
      var d=document.createElement('div');
      d.id='dxnLoginDiag';
      d.setAttribute('role','alert');
      d.style.cssText='margin-top:12px;padding:14px;border:2px solid #b42318;border-radius:14px;background:#fff5f4;color:#7a1b15;line-height:1.7;font-weight:700;direction:rtl;text-align:right';
      d.innerHTML='<b>'+safe(title||'تعذر تحميل الحساب')+'</b><div style="margin-top:6px;font-weight:500;white-space:pre-wrap">'+safe(detail||'')+'</div>';
      var b=document.getElementById('loginButton');
      if(b&&b.parentNode)b.parentNode.insertBefore(d,b.nextSibling);
    }catch(_){ }
  }

  function recordRpcError(name,error){
    var e=error||{};
    window.__DXN_LAST_RPC_ERROR__={
      rpc:String(name||''),
      http:String(e.status||e.code||''),
      code:String(e.code||''),
      message:String(e.message||e.error_description||''),
      details:String(e.details||''),
      hint:String(e.hint||'')
    };
  }

  /* Patch Supabase clients so bootstrap errors survive boot()'s catch block. */
  function patchSupabase(){
    try{
      var api=window.supabase;
      if(!api||typeof api.createClient!=='function')return false;
      if(api.createClient.__dxnV864)return true;
      var originalCreate=api.createClient;
      var wrappedCreate=function(){
        var client=originalCreate.apply(this,arguments);
        try{
          if(client&&typeof client.rpc==='function'&&!client.rpc.__dxnV864){
            var originalRpc=client.rpc;
            client.rpc=async function(name,args){
              try{
                var result=await originalRpc.apply(this,arguments);
                if(result&&result.error)recordRpcError(name,result.error);
                return result;
              }catch(err){
                recordRpcError(name,err);
                throw err;
              }
            };
            client.rpc.__dxnV864=true;
          }
        }catch(_){ }
        return client;
      };
      wrappedCreate.__dxnV864=true;
      wrappedCreate.__dxnOriginal=originalCreate;
      api.createClient=wrappedCreate;
      return true;
    }catch(_){return false}
  }

  async function directLogin(){
    var n=document.getElementById('loginNo'),p=document.getElementById('pin');
    var no=n?String(n.value||'').trim():'';
    var pin=p?String(p.value||'').trim():'';
    if(!no||!pin){show('أدخل بيانات الدخول أولاً.');return;}
    if(!base||!key){showPanel('إعداد الاتصال ناقص','بيانات Supabase غير متاحة.');return;}

    var b=document.getElementById('loginButton');
    if(b){b.disabled=true;b.textContent='⏳ جارٍ التحقق...';}
    window.__DXN_LAST_RPC_ERROR__={};
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
        showPanel('فشل طلب الدخول','HTTP '+res.status+'\n'+safe(msg));
        return;
      }
      if(!payload||!payload.token){
        showPanel('استجابة الدخول غير صالحة','تم الاتصال بقاعدة البيانات، لكن لم يصل رمز جلسة.');
        return;
      }
      localStorage.setItem('dxn_session',String(payload.token));
      localStorage.setItem('dxn_session_issued',String(Date.now()));
      show('تم تسجيل الدخول، جارٍ تحميل حسابك...');
      if(typeof window.boot!=='function'){
        showPanel('تم تسجيل الدخول لكن التطبيق لم يكتمل تحميله','دالة boot غير متاحة في النسخة الحالية.');
        return;
      }
      await window.boot();
      if(!localStorage.getItem('dxn_session')){
        var last=window.__DXN_LAST_RPC_ERROR__||{};
        showPanel('تم قبول الدخول لكن فشل تحميل الحساب',
          (last.rpc?'RPC: '+safe(last.rpc)+'\n':'')+
          (last.http?'HTTP: '+safe(last.http)+'\n':'')+
          (last.code?'Code: '+safe(last.code)+'\n':'')+
          (last.message?'Message: '+safe(last.message)+'\n':'')+
          (last.details?'Details: '+safe(last.details)+'\n':'')+
          (last.hint?'Hint: '+safe(last.hint):'لم يصل خطأ RPC واضح؛ تم رفض/إنهاء الجلسة أثناء boot.')
        );
      }
    }catch(err){
      showPanel('تعذر الاتصال بخدمة الدخول',safe(err&&err.message?err.message:err));
    }finally{
      if(b){b.disabled=false;b.textContent='🔐 دخول';}
    }
  }

  function install(){
    try{
      patchSupabase();
      var b=document.getElementById('loginButton');
      if(!b)return false;
      if(!b.__dxnV864){
        b.__dxnV864=true;
        b.removeAttribute('onclick');
        b.type='button';
        b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();directLogin()},false);
      }
      if(typeof window.login==='function'&&!window.login.__dxnV864){
        var original=window.login;
        var wrapped=function(){return directLogin()};
        wrapped.__dxnV864=true;
        wrapped.__dxnOriginal=original;
        window.login=wrapped;
      }
      return true;
    }catch(_){return false}
  }

  var tries=0;
  var timer=setInterval(function(){
    patchSupabase();
    if(install()||++tries>180)clearInterval(timer);
  },100);
})();
