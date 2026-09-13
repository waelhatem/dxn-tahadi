/* V86.32 — same-origin Supabase RPC proxy. */
(function(){
  if(window.__DXN_SAME_ORIGIN_RPC_PROXY_V8632__) return;
  window.__DXN_SAME_ORIGIN_RPC_PROXY_V8632__=true;
  async function proxyRpc(name,args){
    const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:name,args:args||{}}),cache:'no-store'});
    const tx=await r.text(); let d=null; try{d=tx?JSON.parse(tx):null}catch(e){}
    if(!r.ok){const e=new Error((d&&(d.message||d.error))||tx||('HTTP '+r.status));e.status=r.status;e.code=d&&d.code;e.details=d&&d.details;e.hint=d&&d.hint;throw e}
    return d;
  }
  function patchClient(){
    try{
      if(!window.supabase||typeof window.supabase.createClient!=='function'||window.supabase.createClient.__dxnV8632) return false;
      const original=window.supabase.createClient;
      function wrapped(){
        const client=original.apply(this,arguments);
        if(client&&typeof client.rpc==='function'&&!client.rpc.__dxnV8632){client.rpc=proxyRpc;client.rpc.__dxnV8632=true}
        return client;
      }
      wrapped.__dxnV8632=true; window.supabase.createClient=wrapped; return true;
    }catch(e){return false}
  }
  async function proxyLogin(){
    const n=document.getElementById('loginNo'),p=document.getElementById('pin'),b=document.getElementById('loginButton');
    const no=n?String(n.value||'').trim():'',pin=p?String(p.value||'').trim():'';
    if(!no||!pin){if(typeof toast==='function')toast('أدخل بيانات الدخول أولاً.');return}
    if(b){b.disabled=true;b.textContent='⏳ جارٍ التحقق...'}
    try{
      const login=await proxyRpc('login',{p_login_no:no,p_pin:pin});
      if(!login||!login.token) throw new Error('لم يصل رمز الجلسة من الخادم.');
      localStorage.setItem('dxn_session',String(login.token));
      localStorage.setItem('dxn_session_issued',String(Date.now()));
      await proxyRpc('bootstrap',{p_token:login.token});
      location.reload();
    }catch(e){
      const detail='HTTP: '+(e.status||'')+'\nCode: '+(e.code||'')+'\nMessage: '+(e.message||e)+'\nDetails: '+(e.details||'')+'\nHint: '+(e.hint||'');
      const old=document.getElementById('dxnLoginDiag');if(old)old.remove();
      const d=document.createElement('div');d.id='dxnLoginDiag';d.setAttribute('role','alert');d.style.cssText='margin-top:12px;padding:14px;border:2px solid #b42318;border-radius:14px;background:#fff5f4;color:#7a1b15;line-height:1.7;font-weight:700;direction:rtl;text-align:right';d.innerHTML='<b>فشل مسار الدخول عبر الخادم الوسيط</b><div style="margin-top:6px;font-weight:500;white-space:pre-wrap">'+detail.replace(/[<>]/g,'')+'</div>';b&&b.parentNode&&b.parentNode.insertBefore(d,b.nextSibling);
    }finally{if(b){b.disabled=false;b.textContent='🔐 دخول'}}
  }
  document.addEventListener('click',function(e){const btn=e.target&&e.target.closest?e.target.closest('#loginButton'):null;if(!btn)return;e.preventDefault();e.stopImmediatePropagation();proxyLogin()},true);
  let n=0,t=setInterval(function(){if(patchClient()||++n>240)clearInterval(t)},50);
})();
