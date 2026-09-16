/* V86.50 — Full visual login scene for the page opened from "مستخدم سابق".
   Functional controls remain real; the approved scene is only the visual layer. */
(function(){
  'use strict';
  var MODE='dxn-login-scene-mode';
  function addStyle(){
    if(document.getElementById('dxn-login-scene-style'))return;
    var s=document.createElement('style');
    s.id='dxn-login-scene-style';
    s.textContent=`
html,body{min-height:100%;}
body.${MODE}{background:#dfe9e3 url('/login-scene.webp?v=86.50') center center/cover fixed no-repeat!important;overflow-x:hidden}
body.${MODE}::before{content:'';position:fixed;inset:0;z-index:-1;background:rgba(249,247,238,.18);pointer-events:none}
body.${MODE} #site-language-bar{background:rgba(255,255,255,.04)!important;border-bottom:0!important;box-shadow:none!important;color:#fff!important;backdrop-filter:blur(2px)}
body.${MODE} #site-language-bar .site-language-inner{color:#fff!important;max-width:none;padding-inline:18px}
body.${MODE} #internal_language_select{background:rgba(255,255,255,.12)!important;color:#fff!important;border-color:rgba(255,255,255,.55)!important;min-width:150px}
body.${MODE} #app{padding:0!important;min-height:100vh!important;max-width:none!important;background:transparent!important;position:relative!important}
body.${MODE} #viewSwitch,body.${MODE} .view-switch{display:none!important}
body.${MODE} .login{position:absolute!important;left:50%!important;top:38.6vh!important;transform:translateX(-50%)!important;width:min(430px,88vw)!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#173b31!important}
body.${MODE} .login>div:first-child{display:none!important}
body.${MODE} .login>label{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
body.${MODE} .login #role,
body.${MODE} .login #loginNo,
body.${MODE} .login #pin{display:block!important;width:100%!important;height:52px!important;margin:0 0 16px!important;padding:10px 18px!important;background:rgba(255,255,255,.20)!important;border:0!important;border-radius:12px!important;box-shadow:none!important;color:#193d33!important;font-size:17px!important;font-weight:700!important;text-align:right!important;backdrop-filter:blur(2px)!important;outline:none!important}
body.${MODE} .login #role{height:50px!important;cursor:pointer!important;appearance:auto!important}
body.${MODE} .login #loginNo::placeholder,body.${MODE} .login #pin::placeholder{color:rgba(45,66,59,.58)!important}
body.${MODE} .login #loginButton{position:relative!important;display:block!important;width:100%!important;height:56px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:14px!important;box-shadow:none!important;color:transparent!important;font-size:0!important;cursor:pointer!important}
body.${MODE} .login #loginButton:focus-visible{outline:3px solid #fff!important;outline-offset:3px!important}
body.${MODE} .login #dxnBuildMarker,body.${MODE} .login>p:last-child{display:none!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]{position:relative!important;width:100%!important;height:74px!important;margin:16px 0 0!important;padding:0!important;background:rgba(255,255,255,.10)!important;border:1px solid rgba(15,81,63,.55)!important;border-radius:22px!important;box-shadow:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important;backdrop-filter:blur(2px)!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]::before{content:'👤 مستخدم سابق';position:absolute;inset:10px 12px auto;line-height:25px;color:#183d33;font-size:20px;font-weight:950;text-align:center}
body.${MODE} .login button[onclick*="renderMemberVerify"]::after{content:'تسجيل الدخول إلى حسابك';position:absolute;left:0;right:0;bottom:9px;color:rgba(41,67,58,.72);font-size:12px;font-weight:700;text-align:center}
body.${MODE} .login button[onclick*="renderIdea"]{position:absolute!important;left:0!important;right:0!important;top:100%!important;width:100%!important;height:1px!important;margin:0!important;padding:0!important;opacity:0!important;pointer-events:auto!important;border:0!important;overflow:hidden!important}
body.${MODE} #dxnInAppNav{bottom:20px!important;background:rgba(255,255,255,.10)!important;border-color:rgba(255,255,255,.55)!important;box-shadow:0 8px 28px rgba(0,0,0,.10)!important;backdrop-filter:blur(4px)!important}
body.${MODE} #dxnInAppNav .dxn-nav-btn{min-width:122px!important;background:rgba(255,255,255,.16)!important;color:#173b31!important;border-color:rgba(15,81,63,.35)!important;font-weight:950!important;backdrop-filter:blur(4px)!important}
body.${MODE} #dxnInAppNav .dxn-nav-btn:disabled{opacity:.35!important}
@media(max-width:799px){
  body.${MODE}{background-position:center center!important;background-attachment:scroll!important}
  body.${MODE} .login{top:32.5vh!important;width:min(390px,90vw)!important}
  body.${MODE} .login #role,body.${MODE} .login #loginNo,body.${MODE} .login #pin{height:48px!important;margin-bottom:12px!important;font-size:15px!important}
  body.${MODE} .login #loginButton{height:52px!important}
  body.${MODE} .login button[onclick*="renderMemberVerify"]{height:68px!important;margin-top:13px!important}
  body.${MODE} #dxnInAppNav{bottom:8px!important}
  body.${MODE} #dxnInAppNav .dxn-nav-btn{min-width:90px!important;padding:9px 10px!important;font-size:14px!important}
}
`;
    document.head.appendChild(s);
  }
  function active(){return !!document.querySelector('#loginButton') && !!document.querySelector('.login')}
  function apply(){
    addStyle();
    var on=active();
    document.body.classList.toggle(MODE,on);
    if(on){
      var b=document.getElementById('loginButton');
      if(b){b.setAttribute('aria-label','دخول');b.title='دخول';}
      var m=document.querySelector('.login button[onclick*="renderMemberVerify"]');
      if(m){m.setAttribute('aria-label','مستخدم سابق — تسجيل الدخول إلى حسابك');m.title='مستخدم سابق — تسجيل الدخول إلى حسابك';}
      var role=document.getElementById('role');
      if(role)role.setAttribute('aria-label','نوع الدخول');
      var no=document.getElementById('loginNo');
      if(no)no.setAttribute('aria-label','رقم العضوية أو رمز القائد');
      var pin=document.getElementById('pin');
      if(pin)pin.setAttribute('aria-label','رمز الدخول PIN');
    }
  }
  function install(){
    addStyle();
    var n=0,t=setInterval(function(){
      if(typeof window.renderLogin==='function' && !window.__DXN_LOGIN_SCENE_WRAPPED__){
        var original=window.renderLogin;
        window.renderLogin=function(){var r=original.apply(this,arguments);setTimeout(apply,0);return r};
        window.__DXN_LOGIN_SCENE_WRAPPED__=true;
        clearInterval(t);
      }
      if(++n>240)clearInterval(t);
    },50);
    apply();
    var app=document.getElementById('app');
    if(app&&!window.__DXN_LOGIN_SCENE_OBSERVED__){
      window.__DXN_LOGIN_SCENE_OBSERVED__=true;
      new MutationObserver(function(){clearTimeout(window.__dxnLoginSceneTimer);window.__dxnLoginSceneTimer=setTimeout(apply,20)}).observe(app,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
