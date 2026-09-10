// إعدادات مشروع مجتمع الصحة والثراء
// هذا المفتاح Publishable ومخصص للاستخدام في المتصفح.
window.DXN_CONFIG = {
  SUPABASE_URL: 'https://ryqpstkzppaifpvhezzn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'
};

/* V85.5 — تشخيص مباشر لمسار RPC login/bootstrap.
   لا يسجل التوكن ولا رقم العضوية ولا PIN.
   يغطي أيضاً حالة Supabase التي لا تمر عبر window.fetch بعد إنشاء العميل. */
(function(){
  if(window.__DXN_RPC_DIAGNOSTIC_V855__) return;
  window.__DXN_RPC_DIAGNOSTIC_V855__=true;

  function safe(v){
    return String(v==null?'':v).replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function showRpcError(rpc,error,status){
    try{
      const e=error||{};
      const box=document.getElementById('dxnRpcDiagnostic')||document.createElement('div');
      box.id='dxnRpcDiagnostic';
      box.setAttribute('role','alert');
      box.style.cssText='position:fixed;left:12px;right:12px;bottom:76px;z-index:99999;background:#fff4f2;color:#7a1b13;border:2px solid #d92d20;border-radius:14px;padding:13px 15px;font:700 13px/1.65 system-ui,Arial;box-shadow:0 8px 30px #0003;direction:rtl;text-align:right;max-height:42vh;overflow:auto';
      box.innerHTML='<b>تشخيص مشكلة الدخول</b><br>RPC: '+safe(rpc)+'<br>HTTP: '+safe(status||e.status||'')+'<br>الرسالة: '+safe(e.message||e.error_description||'خطأ غير معروف من خادم Supabase')+(e.code?'<br>Code: '+safe(e.code):'')+(e.details?'<br>Details: '+safe(e.details):'')+(e.hint?'<br>Hint: '+safe(e.hint):'')+'<br><small>V85.5 — التشخيص مؤقت ولن يعرض بيانات الدخول.</small>';
      if(!box.parentNode){
        const mount=()=>{if(document.body&&!box.parentNode)document.body.appendChild(box)};
        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
      }
      try{localStorage.setItem('dxn_last_rpc_error',JSON.stringify({rpc,status:status||e.status||'',message:e.message||'',code:e.code||'',details:e.details||'',hint:e.hint||'',at:new Date().toISOString()}))}catch(_){ }
    }catch(_){ }
  }

  // 1) Capture direct Supabase RPC errors after the client is created.
  function patchClientFactory(){
    try{
      if(!window.supabase||typeof window.supabase.createClient!=='function') return false;
      if(window.supabase.createClient.__dxnWrapped) return true;
      const original=window.supabase.createClient;
      function wrappedCreateClient(){
        const client=original.apply(this,arguments);
        if(client&&typeof client.rpc==='function'&&!client.rpc.__dxnWrapped){
          const originalRpc=client.rpc.bind(client);
          const wrappedRpc=function(fn,args,options){
            const result=originalRpc(fn,args,options);
            if(fn==='login'||fn==='bootstrap'){
              Promise.resolve(result).then(out=>{
                if(out&&out.error) showRpcError(fn,out.error,out.error.status);
              }).catch(err=>showRpcError(fn,err,err&&err.status));
            }
            return result;
          };
          wrappedRpc.__dxnWrapped=true;
          client.rpc=wrappedRpc;
        }
        return client;
      }
      wrappedCreateClient.__dxnWrapped=true;
      window.supabase.createClient=wrappedCreateClient;
      return true;
    }catch(_){return false}
  }
  if(!patchClientFactory()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(patchClientFactory()||tries>40)clearInterval(timer)},250);
  }

  // 2) Also observe raw REST responses as a fallback.
  try{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const response=await nativeFetch(input,init);
      try{
        const url=typeof input==='string'?input:(input&&input.url)||'';
        const m=url.match(/\/rest\/v1\/rpc\/(login|bootstrap)(?:\?|$)/);
        if(m){
          const clone=response.clone();
          clone.json().then(payload=>{
            if(!response.ok) showRpcError(m[1],payload,response.status);
          }).catch(()=>{});
        }
      }catch(_){ }
      return response;
    };
  }catch(_){ }
})();

/* V85.6 — delegated login click handler.
   login() is rendered inside the SPA and inline onclick can fail silently
   in some hosted/cached environments. Capture the login action independently. */
(function(){
  if(window.__DXN_LOGIN_CLICK_FIX_V856__) return;
  window.__DXN_LOGIN_CLICK_FIX_V856__=true;
  document.addEventListener('click',function(e){
    try{
      const btn=e.target&&e.target.closest?e.target.closest('button.primary'):null;
      if(!btn) return;
      const loginNo=document.getElementById('loginNo');
      const pin=document.getElementById('pin');
      if(!loginNo||!pin) return;
      if(!String(btn.textContent||'').includes('دخول')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(typeof window.login==='function') window.login();
    }catch(_){ }
  },true);
})();
