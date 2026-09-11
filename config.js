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
/* V86.10 — Load the detailed member training profile. */
(function(){if(window.__DXN_TRAINING_PROFILE_LOADER_V8610__)return;window.__DXN_TRAINING_PROFILE_LOADER_V8610__=true;function load(){var s=document.createElement('script');s.src='member-training-profile.js?v=86.13.8';s.async=false;document.head.appendChild(s)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load()})();
/* V86.13 — Load overall training progress. */
(function(){if(window.__DXN_LEADER_OVERALL_TRAINING_LOADER_V8613__)return;window.__DXN_LEADER_OVERALL_TRAINING_LOADER_V8613__=true;function load(){var s=document.createElement('script');s.src='training-overall-progress.js?v=86.13';s.async=false;document.head.appendChild(s)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load()})();
/* V86.18 — زر «من نحن؟» بحجم مماثل للمرشد الذكي وعلى الجهة المقابلة في الموبايل. */
(function(){
if(window.__DXN_ABOUT_V8618__)return;window.__DXN_ABOUT_V8618__=true;
function add(){
 var a=document.getElementById('dxnAboutMainLink');
 if(!a){a=document.createElement('a');a.id='dxnAboutMainLink';a.href='about.html';a.textContent='ℹ️ من نحن؟';a.setAttribute('aria-label','من نحن؟');a.title='من نحن؟';document.body.appendChild(a)}
 var st=document.getElementById('dxnAboutV8618Style');
 if(!st){st=document.createElement('style');st.id='dxnAboutV8618Style';st.textContent='@media(max-width:600px){#dxnAboutMainLink{position:fixed!important;z-index:99999!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;min-height:44px!important;padding:8px 12px!important;border-radius:14px!important;background:#0f6b4f!important;color:#fff!important;border:2px solid #fff!important;box-shadow:0 5px 18px #0004!important;text-decoration:none!important;font-weight:900!important;font-size:15px!important;line-height:1.2!important;direction:rtl!important;transform:none!important;white-space:nowrap!important}}';document.head.appendChild(st)}
 function findGuide(){var els=document.querySelectorAll('button,a,[role="button"],div,span');for(var i=0;i<els.length;i++){var t=(els[i].textContent||'').replace(/\s+/g,' ').trim();if(t.length<2||t.length>80)continue;if(/مرشد|المرشد|ذكي|الذكي|smart\s*guide|guide/i.test(t)&&els[i].id!=='dxnAboutMainLink')return els[i]}return null}
 function position(){
  if(window.innerWidth>600){a.style.position='fixed';a.style.right='0';a.style.top='46%';a.style.transform='translateY(-50%) translateX(92px)';a.style.width='116px';a.style.minHeight='48px';a.style.padding='9px 10px';a.style.borderRadius='14px 0 0 14px';a.style.fontSize='15px';a.style.background='#0f6b4f';a.style.color='#fff';a.style.border='2px solid #fff';a.style.borderRight='0';a.style.boxShadow='0 6px 20px #0004';return}
  var g=findGuide();
  if(g){
   var r=g.getBoundingClientRect();
   var w=Math.min(Math.max(r.width,128),Math.min(180,window.innerWidth-28));
   var gap=12;
   var placeLeft=r.left-w-gap;
   var placeRight=r.right+gap;
   var left=placeLeft>=14?placeLeft:(placeRight+w<=window.innerWidth-14?placeRight:14);
   var top=r.top+(r.height-44)/2;
   top=Math.max(14,Math.min(top,window.innerHeight-58));
   a.style.position='fixed';a.style.left=left+'px';a.style.right='auto';a.style.top=top+'px';a.style.bottom='auto';a.style.width=w+'px';a.style.minHeight=r.height+'px';a.style.opacity='1';a.style.transform='none';
  }else{
   a.style.left='14px';a.style.right='auto';a.style.bottom='14px';a.style.top='auto';a.style.width='150px';a.style.minHeight='44px';a.style.opacity='1';a.style.transform='none';
  }
 }
 position();window.addEventListener('resize',position,{passive:true});window.addEventListener('scroll',position,{passive:true});var mo=new MutationObserver(function(){position()});mo.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add();
})();