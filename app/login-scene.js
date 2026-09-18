/* V86.65 — Previous-user login scene with persistent mobile/desktop background selection. */
(function(){
  'use strict';
  var MODE='dxn-login-scene-mode';
  var DEVICE_KEY='dxn_selected_device_mode';
  var LEGACY_KEY='dxn_view_mode';

  function getSelectedMode(){
    try{
      var saved=localStorage.getItem(DEVICE_KEY)||localStorage.getItem(LEGACY_KEY);
      if(saved==='mobile'||saved==='desktop'){
        try{localStorage.setItem(DEVICE_KEY,saved);}catch(e){}
        return saved;
      }
    }catch(e){}
    return null;
  }

  function detectMode(){
    try{
      var ua=navigator.userAgent||'';
      var mobileUA=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
      var coarse=window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;
      var noHover=window.matchMedia&&window.matchMedia('(hover: none)').matches;
      var width=window.innerWidth||document.documentElement.clientWidth||9999;
      var touch=Number(navigator.maxTouchPoints||0)>0;
      return (mobileUA||(coarse&&noHover&&width<=1100)||(touch&&width<=1100))?'mobile':'desktop';
    }catch(e){return 'desktop'}
  }

  function getMode(){
    return getSelectedMode()||detectMode();
  }

  function removeDeviceControls(){
    var selectors=['#dxn-global-device-switch','.device-switch','.view-switch','#viewSwitch','#deviceViewSwitch'];
    selectors.forEach(function(selector){
      try{
        document.querySelectorAll(selector).forEach(function(el){el.remove();});
      }catch(e){}
    });
  }

  function applyDeviceMode(){
    var mode=getMode();
    var mobile=mode==='mobile';
    document.documentElement.dataset.deviceMode=mode;
    if(document.body){
      document.body.classList.toggle('mobile-mode',mobile);
      document.body.classList.toggle('desktop-mode',!mobile);
      document.body.classList.toggle('manual-mobile',mobile);
      document.body.classList.toggle('manual-desktop',!mobile);
    }
    return mode;
  }

  function addStyle(){
    if(document.getElementById('dxn-login-scene-style'))return;
    var s=document.createElement('style');
    s.id='dxn-login-scene-style';
    s.textContent=`
html,body{min-height:100%;}
body.${MODE}{background:#efe8dc url('/logo2.png?v=86.61') center center/cover fixed no-repeat!important;overflow-x:hidden}
html[data-device-mode="mobile"] body.${MODE}{background-image:url('/app/mobile-login-background.png?v=86.67')!important;background-size:cover!important;background-position:center center!important}
html[data-device-mode="desktop"] body.${MODE}{background-image:url('/logo2.png?v=86.61')!important;background-size:cover!important;background-position:center center!important}
body.${MODE}::before{display:none!important}
body.${MODE} #site-language-bar{display:none!important}
body.${MODE} #app{padding:0!important;min-height:100vh!important;max-width:none!important;background:transparent!important;position:relative!important}
body.${MODE} .login{position:absolute!important;left:50%!important;top:8.6vh!important;transform:translateX(-50%)!important;width:min(430px,88vw)!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#183d33!important;text-align:right!important}
body.${MODE} .login>div:first-child{display:block!important;text-align:center!important;margin:0 0 150px!important;padding:0!important;background:transparent!important;color:#173b31!important}
body.${MODE} .login>div:first-child .dxn-scene-logo{display:block!important;width:min(360px,78vw)!important;height:auto!important;max-height:190px!important;object-fit:contain!important;margin:0 auto!important;background:transparent!important;border:0!important;box-shadow:none!important}
body.${MODE} .login>div:first-child>img:not(.dxn-scene-logo){display:none!important}
body.${MODE} .login>div:first-child h1,body.${MODE} .login>div:first-child p{display:none!important}
body.${MODE} .login>label{display:block!important;position:static!important;width:auto!important;height:auto!important;padding:0!important;margin:0 0 7px!important;overflow:visible!important;clip:auto!important;white-space:normal!important;border:0!important;background:transparent!important;color:#183d33!important;font-size:18px!important;font-weight:800!important;text-align:right!important}
body.${MODE} .login #role,body.${MODE} .login #loginNo,body.${MODE} .login #pin{display:block!important;width:100%!important;height:52px!important;margin:0 0 20px!important;padding:9px 17px!important;background:rgba(255,255,255,.77)!important;border:1px solid rgba(255,255,255,.72)!important;border-radius:15px!important;box-shadow:0 8px 22px rgba(58,61,52,.06)!important;color:#173b31!important;font-size:17px!important;font-weight:700!important;text-align:right!important;backdrop-filter:blur(3px)!important;outline:none!important}
body.${MODE} .login #role{height:50px!important;cursor:pointer!important;appearance:auto!important}
body.${MODE} .login #loginNo::placeholder,body.${MODE} .login #pin::placeholder{color:#71807b!important;font-weight:500!important}
body.${MODE} .login #loginButton{position:relative!important;display:block!important;width:100%!important;height:56px!important;margin:0!important;padding:0!important;background:#247b68!important;border:0!important;border-radius:17px!important;box-shadow:0 8px 18px rgba(36,123,104,.18)!important;color:#fff!important;font-size:20px!important;font-weight:900!important;cursor:pointer!important}
body.${MODE} .login #loginButton::after{content:'🔒';margin-inline-start:8px;font-size:21px}
body.${MODE} .login #loginButton:focus-visible{outline:3px solid #fff!important;outline-offset:3px!important}
body.${MODE} .login #dxnBuildMarker,body.${MODE} .login>p:last-child{display:none!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]{position:relative!important;width:100%!important;height:74px!important;margin:20px 0 0!important;padding:0!important;background:rgba(255,255,255,.10)!important;border:1.5px solid #245b50!important;border-radius:20px!important;box-shadow:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important;backdrop-filter:blur(1px)!important}
body.${MODE} .login button[onclick*="renderMemberVerify"]::before{content:'👤  عضو في بداية أمل';position:absolute;inset:10px 12px auto;line-height:25px;color:#173d33;font-size:20px;font-weight:900;text-align:center;direction:rtl;unicode-bidi:plaintext}
body.${MODE} .login button[onclick*="renderMemberVerify"]::after{content:'عمل حساب جديد';position:absolute;left:0;right:0;bottom:10px;color:#53645f;font-size:12px;font-weight:700;text-align:center;direction:rtl;unicode-bidi:plaintext}
body.${MODE} .login button[onclick*="renderIdea"]{position:absolute!important;left:0!important;right:0!important;top:100%!important;width:100%!important;height:1px!important;margin:0!important;padding:0!important;opacity:0!important;pointer-events:auto!important;border:0!important;overflow:hidden!important}
body.${MODE} .dxn-login-account-note{display:block!important;margin:13px 0 0!important;text-align:center!important;color:#254740!important;font-size:15px!important;font-weight:700!important}
body.${MODE} #dxnInAppNav{display:none!important}
body.${MODE} .dxn-login-footer-note{display:block!important;margin:18px 0 0!important;text-align:center!important;color:#23473e!important;font-size:19px!important;font-weight:700!important}
@media(max-width:799px){
  body.${MODE}{background-position:center center!important;background-attachment:scroll!important}
  body.${MODE} .login{top:6.3vh!important;width:min(390px,90vw)!important}
  body.${MODE} .login>div:first-child{margin-bottom:150px!important}
  body.${MODE} .login>div:first-child .dxn-scene-logo{width:min(300px,78vw)!important;max-height:150px!important;margin:0 auto 8px!important}
  body.${MODE} .login>label{font-size:15px!important;margin-bottom:5px!important}
  body.${MODE} .login #role,body.${MODE} .login #loginNo,body.${MODE} .login #pin{height:48px!important;margin-bottom:12px!important;font-size:15px!important}
  body.${MODE} .login #loginButton{height:52px!important;font-size:17px!important}
  body.${MODE} .login button[onclick*="renderMemberVerify"]{height:68px!important;margin-top:13px!important}
  body.${MODE} .dxn-login-account-note{font-size:13px!important;margin-top:9px!important}
}
`;
    document.head.appendChild(s);
  }

  function addCosmeticNodes(){
    var form=document.querySelector('.login');
    if(!form)return;
    var header=form.querySelector('>div:first-child');
    if(header&&!header.querySelector('.dxn-scene-logo')){
      var logo=document.createElement('img');
      logo.className='dxn-scene-logo';
      logo.src='/logo.png?v=86.61';
      logo.alt='مجتمع الصحة والثراء';
      header.insertBefore(logo,header.firstChild);
    }
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
    removeDeviceControls();
    var mode=applyDeviceMode();
    var on=active();
    document.body.classList.toggle(MODE,on);
    if(on){
      addCosmeticNodes();
      var b=document.getElementById('loginButton');if(b){b.setAttribute('aria-label','دخول');b.title='دخول'}
      var m=document.querySelector('.login button[onclick*="renderMemberVerify"]');if(m){m.setAttribute('aria-label','عضو في بداية أمل — عمل حساب جديد');m.title='عضو في بداية أمل — عمل حساب جديد'}
      var role=document.getElementById('role');if(role)role.setAttribute('aria-label','نوع الدخول');
      var no=document.getElementById('loginNo');if(no)no.setAttribute('aria-label','رقم العضوية أو رمز القائد');
      var pin=document.getElementById('pin');if(pin)pin.setAttribute('aria-label','رمز الدخول PIN');
    }
  }

  function install(){
    addStyle();
    removeDeviceControls();
    applyDeviceMode();
    var n=0,t=setInterval(function(){
      if(typeof window.renderLogin==='function'&&!window.__DXN_LOGIN_SCENE_WRAPPED__){
        var original=window.renderLogin;
        window.renderLogin=function(){var r=original.apply(this,arguments);setTimeout(apply,0);return r};
        window.__DXN_LOGIN_SCENE_WRAPPED__=true;
        clearInterval(t);
      }
      removeDeviceControls();
      applyDeviceMode();
      if(++n>240)clearInterval(t);
    },50);
    apply();
    var app=document.getElementById('app');
    if(app&&!window.__DXN_LOGIN_SCENE_OBSERVED__){
      window.__DXN_LOGIN_SCENE_OBSERVED__=true;
      new MutationObserver(function(){
        clearTimeout(window.__dxnLoginSceneTimer);
        window.__dxnLoginSceneTimer=setTimeout(apply,20);
      }).observe(app,{childList:true,subtree:true});
    }
    if(!window.__DXN_LOGIN_DEVICE_OBSERVED__){
      window.__DXN_LOGIN_DEVICE_OBSERVED__=true;
      new MutationObserver(function(){removeDeviceControls();applyDeviceMode();}).observe(document.body,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();