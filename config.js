// إعدادات مشروع مجتمع الصحة والثراء
window.DXN_CONFIG={SUPABASE_URL:'https://ryqpstkzppaifpvhezzn.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh'};
/* V86.6 — إصلاح تسليم جلسة الدخول. لا يسجل PIN أو التوكن. */
(function(){
if(window.__DXN_LOGIN_RUNTIME_V866__)return;window.__DXN_LOGIN_RUNTIME_V866__=true;
var C=window.DXN_CONFIG||{},base=String(C.SUPABASE_URL||'').replace(/\/$/,''),key=String(C.SUPABASE_ANON_KEY||'');
function safe(v){return String(v==null?'':v).replace(/[<>]/g,'')}
function panel(title,detail){try{var old=document.getElementById('dxnLoginDiag');if(old)old.remove();var d=document.createElement('div');d.id='dxnLoginDiag';d.setAttribute('role','alert');d.style.cssText='margin-top:12px;padding:14px;border:2px solid #b42318;border-radius:14px;background:#fff5f4;color:#7a1b15;line-height:1.7;font-weight:700;direction:rtl;text-align:right';d.innerHTML='<b>'+safe(title)+'</b><div style="margin-top:6px;font-weight:500;white-space:pre-wrap">'+safe(detail)+'</div>';var b=document.getElementById('loginButton');if(b&&b.parentNode)b.parentNode.insertBefore(d,b.nextSibling)}catch(e){alert(title+'\n'+detail)}}
async function rpcRaw(name,args){var r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store'});var text=await r.text(),data=null;try{data=text?JSON.parse(text):null}catch(e){}if(!r.ok){var msg=(data&&(data.message||data.error_description||data.hint))||text||('HTTP '+r.status);var err=new Error(String(msg));err.status=r.status;err.code=data&&data.code;err.details=data&&data.details;err.hint=data&&data.hint;throw err}return data}
async function directLogin(){var n=document.getElementById('loginNo'),p=document.getElementById('pin');var no=n?String(n.value||'').trim():'',pin=p?String(p.value||'').trim():'';if(!no||!pin){panel('بيانات الدخول ناقصة','أدخل رقم العضوية ورمز PIN.');return}if(!base||!key){panel('إعداد الاتصال ناقص','بيانات Supabase غير متاحة.');return}var b=document.getElementById('loginButton');if(b){b.disabled=true;b.textContent='⏳ جارٍ التحقق...'}try{
var login=await rpcRaw('login',{p_login_no:no,p_pin:pin});
if(!login||!login.token){panel('Login نجح لكن الاستجابة غير صالحة','لم يصل رمز الجلسة من الخادم.');return}
localStorage.setItem('dxn_session',String(login.token));localStorage.setItem('dxn_session_issued',String(Date.now()));
var bootData;try{bootData=await rpcRaw('bootstrap',{p_token:login.token})}catch(e){panel('Login ناجح — لكن Bootstrap فشل','HTTP: '+safe(e.status||'')+'\nCode: '+safe(e.code||'')+'\nMessage: '+safe(e.message||e)+'\nDetails: '+safe(e.details||'')+'\nHint: '+safe(e.hint||''));localStorage.removeItem('dxn_session');localStorage.removeItem('dxn_session_issued');return}
if(!bootData){panel('Bootstrap أعاد استجابة فارغة','تم قبول الدخول لكن لم تصل بيانات الحساب.');localStorage.removeItem('dxn_session');localStorage.removeItem('dxn_session_issued');return}
window.location.reload();
}catch(e){panel('فشل مسار الدخول','HTTP: '+safe(e.status||'')+'\nCode: '+safe(e.code||'')+'\nMessage: '+safe(e.message||e)+'\nDetails: '+safe(e.details||'')+'\nHint: '+safe(e.hint||''));localStorage.removeItem('dxn_session');localStorage.removeItem('dxn_session_issued');}finally{if(b){b.disabled=false;b.textContent='🔐 دخول'}}}
function install(){try{var b=document.getElementById('loginButton');if(!b)return false;if(!b.__dxnV866){b.__dxnV866=true;b.removeAttribute('onclick');b.type='button';b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();directLogin()},false)}if(typeof window.login==='function'&&!window.login.__dxnV866){var old=window.login;var wrap=function(){return directLogin()};wrap.__dxnV866=true;wrap.__dxnOriginal=old;window.login=wrap}return true}catch(e){return false}}
var tries=0,t=setInterval(function(){if(install()||++tries>180)clearInterval(t)},100);
})();
/* V86.6 deployment trigger */

/* V86.10 — Load the detailed member training profile after the main application script has defined its globals. */
(function(){
  if(window.__DXN_TRAINING_PROFILE_LOADER_V8610__)return;
  window.__DXN_TRAINING_PROFILE_LOADER_V8610__=true;
  function load(){var s=document.createElement('script');s.src='member-training-profile.js?v=86.13.8';s.async=false;s.onload=function(){console.debug('V86.13.8 detailed member training profile loaded')};s.onerror=function(){console.warn('V86.13.8 detailed member training profile unavailable')};document.head.appendChild(s)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

/* V86.13 — Load overall training progress in Leader Center. */
(function(){
  if(window.__DXN_LEADER_OVERALL_TRAINING_LOADER_V8613__)return;
  window.__DXN_LEADER_OVERALL_TRAINING_LOADER_V8613__=true;
  function load(){var s=document.createElement('script');s.src='training-overall-progress.js?v=86.13';s.async=false;s.onload=function(){console.debug('V86.13 overall training progress loaded')};s.onerror=function(){console.warn('V86.13 overall training progress unavailable')};document.head.appendChild(s)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

/* V86.16 — تبويب جانبي عائم قابل للانكماش لصفحة «من نحن؟». */
(function(){
  if(window.__DXN_ABOUT_SIDE_TAB_V8616__)return;
  window.__DXN_ABOUT_SIDE_TAB_V8616__=true;
  function add(){
    if(document.getElementById('dxnAboutMainLink'))return;
    var a=document.createElement('a');
    a.id='dxnAboutMainLink';
    a.href='about.html';
    a.textContent='ℹ️ من نحن؟';
    a.setAttribute('aria-label','من نحن؟');
    a.title='من نحن؟';
    a.style.cssText='position:fixed;right:0;top:46%;transform:translateY(-50%) translateX(92px);z-index:99999;display:flex;align-items:center;justify-content:center;gap:7px;width:116px;min-height:48px;padding:9px 10px;border-radius:14px 0 0 14px;background:#0f6b4f;color:#fff;border:2px solid #fff;border-right:0;box-shadow:0 6px 20px #0004;text-decoration:none;font-weight:900;font-size:15px;line-height:1.2;direction:rtl;cursor:pointer;transition:transform .28s ease,box-shadow .2s ease;';
    function show(){a.style.transform='translateY(-50%) translateX(0)';a.style.boxShadow='0 8px 26px #0005'}
    function hide(){a.style.transform='translateY(-50%) translateX(92px)';a.style.boxShadow='0 4px 14px #0003'}
    var lastY=window.scrollY||0,timer;
    function onScroll(){
      var y=window.scrollY||0;
      show();
      clearTimeout(timer);
      timer=setTimeout(hide,900);
      lastY=y;
    }
    a.addEventListener('mouseenter',show);
    a.addEventListener('mouseleave',function(){clearTimeout(timer);timer=setTimeout(hide,700)});
    a.addEventListener('touchstart',show,{passive:true});
    window.addEventListener('scroll',onScroll,{passive:true});
    document.head.appendChild((function(){var s=document.createElement('style');s.textContent='@media(max-width:600px){#dxnAboutMainLink{top:50%!important;width:104px!important;min-height:44px!important;font-size:14px!important;padding:8px 8px!important;transform:translateY(-50%) translateX(82px)!important;}#dxnAboutMainLink.dxn-about-open{transform:translateY(-50%) translateX(0)!important;}}';return s})());
    document.body.appendChild(a);
    setTimeout(hide,1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add();
})();
