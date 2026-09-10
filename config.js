// إعدادات مشروع مجتمع الصحة والثراء
// هذا المفتاح Publishable ومخصص للاستخدام في المتصفح.
window.DXN_CONFIG = {
  SUPABASE_URL: 'https://ryqpstkzppaifpvhezzn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'
};

/* V85.4 — تشخيص RPC الدخول دون كشف التوكن أو أي بيانات حساسة.
   إذا فشل login/bootstrap، يظهر الخطأ الفعلي للمستخدم بدل العودة بصمت لشاشة الدخول. */
(function(){
  if(window.__DXN_RPC_DIAGNOSTIC__) return;
  window.__DXN_RPC_DIAGNOSTIC__=true;
  const nativeFetch=window.fetch.bind(window);
  function showRpcError(url,status,payload){
    try{
      const text=(payload&&payload.message)||((payload&&payload.error_description)||'خطأ غير معروف من خادم Supabase');
      const code=(payload&&payload.code)||'';
      const details=(payload&&payload.details)||'';
      const hint=(payload&&payload.hint)||'';
      const box=document.getElementById('dxnRpcDiagnostic')||document.createElement('div');
      box.id='dxnRpcDiagnostic';
      box.setAttribute('role','alert');
      box.style.cssText='position:fixed;left:12px;right:12px;bottom:76px;z-index:99999;background:#fff4f2;color:#7a1b13;border:2px solid #d92d20;border-radius:14px;padding:13px 15px;font:700 13px/1.65 system-ui,Arial;box-shadow:0 8px 30px #0003;direction:rtl;text-align:right;max-height:42vh;overflow:auto';
      const safe=(v)=>String(v||'').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[m]));
      box.innerHTML='<b>تشخيص مشكلة الدخول</b><br>RPC: '+safe(url.split('/rpc/').pop()||url)+'<br>HTTP: '+safe(status)+'<br>الرسالة: '+safe(text)+(code?'<br>Code: '+safe(code):'')+(details?'<br>Details: '+safe(details):'')+(hint?'<br>Hint: '+safe(hint):'')+'<br><small>هذه الرسالة مؤقتة للتشخيص فقط.</small>';
      if(!box.parentNode) document.body.appendChild(box);
      localStorage.setItem('dxn_last_rpc_error',JSON.stringify({rpc:url.split('/rpc/').pop(),status,message:text,code,details,hint,at:new Date().toISOString()}));
    }catch(e){}
  }
  window.fetch=async function(input,init){
    const response=await nativeFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(url.includes('/rest/v1/rpc/login')||url.includes('/rest/v1/rpc/bootstrap')){
        const clone=response.clone();
        clone.json().then(payload=>{
          if(!response.ok || (payload&&payload.error)) showRpcError(url,response.status,payload);
        }).catch(()=>{});
      }
    }catch(e){}
    return response;
  };
})();
