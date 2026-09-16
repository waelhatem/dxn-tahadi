/* V86.52 — Approved full visual login scene for the page opened from "مستخدم سابق".
   Functional controls remain real; this file only changes the presentation layer and adds cosmetic labels. */
(function(){
  'use strict';
  var MODE='dxn-login-scene-mode';
  function addStyle(){
    if(document.getElementById('dxn-login-scene-style'))return;
    var s=document.createElement('style');
    s.id='dxn-login-scene-style';
    s.textContent=`
html,body{min-height:100%;}
body.${MODE}{background:#efe8dc url('/logo2.png?v=86.52') center center/cover fixed no-repeat!important;overflow-x:hidden}
body.${MODE}::before{display:none!important}
body.${MODE} #site-language-bar{display:none!important}
body.${MODE} #app{padding:0!important;min-height:100vh!important;max-width:none!important;background:transparent!important;position:relative!important}
body.${MODE} #viewSwitch,body.${MODE} .view-switch{display:none!important}
body.${MODE} .login{position:absolute!important;left:50%!important;top:8.6vh!important;transform:translateX(-50%)!important;width:min(430px,88vw)!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#183d33!important;text-align:right!important}
body.${MODE} .login>div:first-child{display:block!important;text-align:center!important;margin:0 0 28px!important;padding:0!important;background:transparent!important;color:#173b31!important}
body.${MODE} .login>div:first-child img{display:none!important}
body.${MODE} .login>div:first-child h1{margin:34px 0 8px!important;font-size:42px!important;line-height:1.15!important;font-weight:900!important;color:#153d33!important;letter-spacing:-.7px!important;text-align:center!important}
body.${MODE} .login>div:first-child h1::before{content:'مرحباً بك في';display:block!important;margin:0 0 14px!important;font-size:25px!important;line-height:1.25!important;font-weight:500!important;letter-spacing:0!important;color:#23443c!important}
body.${MODE} .login>div:first-child p{margin:0!important;font-size:19px!important;line-height:1.35!important;font-weight:600!important;color:#23443c!important;text-align:center!important}
body.${MODE} .login>div:first-child p::before{content:'معاً نحو حياة أفضل';font-size:19px!important}
body.${MODE} .login>div:first-child p{font-size:0!important}
body.${MODE} .login>label{display:block!important;position:static!important;width:auto!important;height:auto!important;padding:0!important;margin:0 0 7px!important;overflow:visible!important;clip:auto!important;white-space:normal!important;border:0!important;background:transparent!important;color:#183d33!important;font-size:18px!important;font-weight:800!important;text-align:right!important}
body.${MODE} .login #role,
body.${MODE} .login #loginNo,
body.${MODE} .login #pin{display:block!important;width:100%!important;height:52px!important;margin:0 0 20px!important;padding:9px 17px!important;background:rgba(255,255,255,.77)!important;border:1px solid rgba(255,255,255,.72)!important;border-radius:15px!important;box-shadow:0 8px 22px rgba(58,61,52,.06)!important;color:#173b31!important;font-size:17px!important;font-weight:700!important;text-align:right!important;backdrop-filter:blur(3px)!important;outline:none!important}
body.${MODE} .login #role{height:50px!important;cursor:pointer!important;appearance:auto!important}
body.${MODE} .login #loginNo::placeholder,body.${MODE} .login #pin::placeholder{color:#71807b!important;font-weight:500!important}
body.${MODE} .login #loginButton{position:relative!important;display:block!important;width:100%!important;height:56px!important;margin:0!important;padding:0!important;background:#247b68!important;border:0!important;border-radius:17px!important;box-shadow:0 8px 18px rgba(36,123,104,.18)!important;color:#fff!important;font-size:20px!important;font-weight:900!important;cursor:pointer!important}
body.${MODE} .login #loginButton::after{content:'🔒';margin-inline-start:8px;font-size:21px}
body.${MODE} .login #loginButton:focus-visible{outline:3px solid #fff!important;outline-offset:3px!important}
body.${MODE} .login #dxnBuildMarker,body.${MODE} .login>p:last-child{display:none!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]{position:relative!important;width:100%!important;height:74px!important;margin:20px 0 0!important;padding:0!important;background:rgba(255,255,255,.10)!important;border:1.5px solid #245b50!important;border-radius:20px!important;box-shadow:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important;backdrop-filter:blur(1px)!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]::before{content:'👤  مستخدم سابق';position:absolute;inset:10px 12px auto;line-height:25px;color:#173d33;font-size:20px;font-weight:900;text-align:center}
body.${MODE} .login button[onclick*="renderMemberVerify"]::after{content:'تسجيل الدخول إلى حسابك';position:absolute;left:0;right:0;bottom:10px;color:#53645f;font-size:12px;font-weight:700;text-align:center}
body.${MODE} .login button[onclick*="renderIdea"]{position:absolute!important;left:0!important;right:0!important;top:100%!important;width:100%!important;height:1px!important;margin:0!important;padding:0!important;opacity:0!important;pointer-events:auto!important;border:0!important;overflow:hidden!important}
body.${MODE} .dxn-login-account-note{display:block!important;margin:13px 0 0!important;text-align:center!important;color:#254740!important;font-size:15px!important;font-weight:700!important}
body.${MODE} #dxnInAppNav{bottom:20px!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;gap:12px!important}
body.${MODE} #dxnInAppNav .dxn-nav-btn{min-width:200px!important;height:56px!important;background:rgba(255,255,255,.10)!important;color:#173b31!important;border:1px solid rgba(36,91,80,.28)!important;border-radius:18px!important;font-size:17px!important;font-weight:900!important;backdrop-filter:blur(2px)!important}
body.${MODE} #dxnInAppNav .dxn-nav-btn:disabled{opacity:.45!important}
body.${MODE} .dxn-login-footer-note{display:block!important;margin:18px 0 0!important;text-align:center!important;color:#23473e!important;font-size:19px!important;font-weight:700!important}
@media(max-width:799px){
  body.${MODE}{background-position:center center!important;background-attachment:scroll!important}
  body.${MODE} .login{top:6.3vh!important;width:min(390px,90vw)!important}
  body.${MODE} .login>div:first-child{margin-bottom:20px!important}
  body.${MODE} .login>div:first-child h1{margin-top:24px!important;font-size:31px!important}
  body.${MODE} .login>div:first-child h1::before{font-size:19px!important;margin-bottom:9px!important}
  body.${MODE} .login>div:first-child p::before{font-size:15px!important}
  body.${MODE} .login>label{font-size:15px!important;margin-bottom:5px!important}
  body.${MODE} .login #role,body.${MODE} .login #loginNo,body.${MODE} .login #pin{height:48px!important;margin-bottom:12px!important;font-size:15px!important}
  body.${MODE} .login #loginButton{height:52px!important;font-size:17px!important}
  body.${MODE} .login button[onclick*="renderMemberVerify"]{height:68px!important;margin-top:13px!important}
  body.${MODE} .dxn-login-account-note{font-size:13px!important;margin-top:9px!important}
  body.${MODE} #dxnInAppNav{bottom:8px!important;gap:8px!important}
  body.${MODE} #dxnInAppNav .dxn-nav-btn{min-width:calc(45vw - 12px)!important;height:46px!important;font-size:14px!important}
}
`;
    document.head.appendChild(s);
  }
  function addCosmeticNodes(){
    var form=document.querySelector('.login');
    if(!form)return;
    var member=form.querySelector('button[onclick*="renderMemberVerify"]');
    if(member&&!form.querySelector('.dxn-login-account-note')){
      var note=document.createElement('div');
      note.className='dxn-login-account-note';
      note.textContent='ليس لديك حساب؟';
      member.parentNode.insertBefore(note,member);
    }
    if(form&&!form.querySelector('.dxn-login-footer-note')){
      var foot=document.createElement('div');
      foot.className='dxn-login-footer-note';
      foot.textContent='🌿 معاً نحو حياة أفضل';
      form.appendChild(foot);
    }
  }
  function active(){return !!document.querySelector('#loginButton')&&!!document.querySelector('.login')}
  function apply(){
    addStyle();
    var on=active();
    document.body.classList.toggle(MODE,on);
    if(on){
      addCosmeticNodes();
      var b=document.getElementById('loginButton');
      if(b){b.setAttribute('aria-label','دخول');b.title='دخول'}
      var m=document.querySelector('.login button[onclick*="renderMemberVerify"]');
      if(m){m.setAttribute('aria-label','مستخدم سابق — تسجيل الدخول إلى حسابك');m.title='مستخدم سابق — تسجيل الدخول إلى حسابك'}
      var role=document.getElementById('role'); if(role)role.setAttribute('aria-label','نوع الدخول');
      var no=document.getElementById('loginNo'); if(no)no.setAttribute('aria-label','رقم العضوية أو رمز القائد');
      var pin=document.getElementById('pin'); if(pin)pin.setAttribute('aria-label','رمز الدخول PIN');
    }
  }
  function install(){
    addStyle();
    var n=0,t=setInterval(function(){
      if(typeof window.renderLogin==='function'&&!window.__DXN_LOGIN_SCENE_WRAPPED__){
        var original=window.renderLogin;
        window.renderLogin=function(){var r=original.apply(this,arguments);setTimeout(apply,0);return r};
        window.__DXN_LOGIN_SCENE_WRAPPED__=true;clearInterval(t);
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
