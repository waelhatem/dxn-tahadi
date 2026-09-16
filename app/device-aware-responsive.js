/* V86.61 — Device-aware responsive layout for login and member/new-user flows. */
(function(){
  'use strict';
  var STYLE_ID='dxn-device-aware-responsive-style';
  var BODY_FLOW='dxn-member-flow';
  var BODY_DEVICE='dxn-device-aware';

  function viewport(){
    var vv=window.visualViewport;
    return {
      w:Math.round((vv&&vv.width)||window.innerWidth||document.documentElement.clientWidth||0),
      h:Math.round((vv&&vv.height)||window.innerHeight||document.documentElement.clientHeight||0)
    };
  }

  function deviceClass(w,h){
    var portrait=h>=w;
    if(w<=600) return portrait?'mobile-portrait':'mobile-landscape';
    if(w<=1024) return portrait?'tablet-portrait':'tablet-landscape';
    if(w<=1440) return 'laptop';
    return 'desktop-large';
  }

  function setDeviceClass(){
    var v=viewport();
    var html=document.documentElement;
    var cls=['mobile-portrait','mobile-landscape','tablet-portrait','tablet-landscape','laptop','desktop-large'];
    for(var i=0;i<cls.length;i++)html.classList.remove('dxn-'+cls[i]);
    html.classList.add('dxn-'+deviceClass(v.w,v.h));
    html.style.setProperty('--dxn-vw',v.w+'px');
    html.style.setProperty('--dxn-vh',v.h+'px');
    html.style.setProperty('--dxn-safe-top','env(safe-area-inset-top, 0px)');
    html.style.setProperty('--dxn-safe-bottom','env(safe-area-inset-bottom, 0px)');
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    var s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
/* Device state and safe viewport */
html.dxn-device-aware{scroll-behavior:smooth}
body{overflow-x:hidden}

/* Member / new-user information pages: preserve the existing card design, but make it fluid. */
body.${BODY_FLOW}{min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important}
body.${BODY_FLOW} .app{width:min(100%, 980px);margin-inline:auto;padding-inline:clamp(12px,2.4vw,28px)!important;padding-bottom:max(24px,var(--dxn-safe-bottom))!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card{width:min(100%, 720px)!important;max-width:720px!important;margin:clamp(14px,4vh,48px) auto!important;padding:clamp(14px,2.4vw,24px)!important;box-sizing:border-box!important;overflow:visible!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card>div:first-child{width:100%!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card img.logo{display:block!important;width:clamp(88px,16vw,140px)!important;height:auto!important;aspect-ratio:1/1!important;object-fit:contain!important;margin-inline:auto!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card h1{font-size:clamp(21px,3vw,30px)!important;line-height:1.3!important;overflow-wrap:anywhere!important;margin:clamp(8px,1.5vh,14px) 0 6px!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card .muted{font-size:clamp(13px,1.7vw,16px)!important;line-height:1.8!important;overflow-wrap:anywhere!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card>.card{margin-top:clamp(12px,2.5vh,20px)!important;padding:clamp(12px,2.2vw,20px)!important;overflow:visible!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card label{display:block;line-height:1.6;overflow-wrap:anywhere}
body.${BODY_FLOW} .login.dxn-responsive-member-card input,
body.${BODY_FLOW} .login.dxn-responsive-member-card textarea,
body.${BODY_FLOW} .login.dxn-responsive-member-card select{font-size:16px!important;min-height:48px!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card textarea{min-height:120px!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card button{min-height:48px!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important}
body.${BODY_FLOW} .login.dxn-responsive-member-card .actions{width:100%!important;gap:8px!important;align-items:stretch!important}

/* Login scene: keep the same branding/design but let the complete flow reflow and scroll naturally. */
body.dxn-login-scene-mode{min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;background-image:url('/logo2.png?v=86.61')!important;background-size:cover!important;background-repeat:no-repeat!important;background-position:center center!important;background-attachment:fixed!important}
body.dxn-login-scene-mode #app{min-height:100dvh!important;height:auto!important;max-width:none!important;overflow:visible!important;padding:0!important}
body.dxn-login-scene-mode .login{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;transform:none!important;width:min(430px,88vw)!important;max-width:430px!important;min-height:0!important;margin:clamp(20px,7vh,78px) auto clamp(30px,7vh,84px)!important;padding:0 0 max(24px,var(--dxn-safe-bottom))!important;box-sizing:border-box!important}
body.dxn-login-scene-mode .login>div:first-child{margin-bottom:clamp(36px,8vh,105px)!important}
body.dxn-login-scene-mode .login>div:first-child .dxn-scene-logo{width:clamp(220px,28vw,360px)!important;max-width:100%!important;max-height:none!important;height:auto!important;margin:0 auto!important}
body.dxn-login-scene-mode .login>label{font-size:clamp(15px,1.4vw,18px)!important;line-height:1.5!important;margin-bottom:7px!important}
body.dxn-login-scene-mode .login #role,
body.dxn-login-scene-mode .login #loginNo,
body.dxn-login-scene-mode .login #pin{font-size:clamp(15px,1.35vw,17px)!important;min-height:50px!important;height:auto!important;padding-block:12px!important;margin-bottom:clamp(12px,2vh,20px)!important}
body.dxn-login-scene-mode .login #loginButton{min-height:52px!important;height:auto!important;padding-block:12px!important;font-size:clamp(17px,1.8vw,20px)!important}
body.dxn-login-scene-mode .login button[onclick*="renderMemberVerify"]{min-height:68px!important;height:auto!important;margin-top:clamp(13px,2vh,20px)!important}
body.dxn-login-scene-mode .login .dxn-login-account-note{font-size:clamp(13px,1.2vw,15px)!important;line-height:1.5!important}
body.dxn-login-scene-mode .login .dxn-login-footer-note{font-size:clamp(16px,1.7vw,19px)!important;line-height:1.5!important}

/* Mobile portrait: use the dedicated mobile framing when available so the family scene remains recognizable. */
@media (max-width:600px) and (orientation:portrait){
  body.dxn-login-scene-mode{background-image:url('/mobile-scene.webp?v=86.61')!important;background-size:cover!important;background-position:center center!important;background-attachment:scroll!important}
  body.dxn-login-scene-mode .login{width:min(390px,90vw)!important;margin-top:clamp(18px,5.5vh,50px)!important;margin-bottom:48px!important}
  body.dxn-login-scene-mode .login>div:first-child{margin-bottom:clamp(28px,5.5vh,65px)!important}
  body.dxn-login-scene-mode .login>div:first-child .dxn-scene-logo{width:min(300px,76vw)!important}
  body.dxn-login-scene-mode .login>label{font-size:15px!important}
  body.dxn-login-scene-mode .login #role,
  body.dxn-login-scene-mode .login #loginNo,
  body.dxn-login-scene-mode .login #pin{min-height:48px!important;margin-bottom:12px!important;font-size:16px!important}
  body.dxn-login-scene-mode .login #loginButton{min-height:52px!important;font-size:18px!important}
  body.dxn-login-scene-mode .login button[onclick*="renderMemberVerify"]{min-height:68px!important;margin-top:13px!important}
}

/* Mobile landscape: prioritize usable height; scrolling is allowed instead of hiding content. */
@media (max-width:600px) and (orientation:landscape){
  body.dxn-login-scene-mode{background-image:url('/logo2.png?v=86.61')!important;background-size:cover!important;background-position:center center!important;background-attachment:scroll!important}
  body.dxn-login-scene-mode .login{width:min(440px,86vw)!important;margin-top:18px!important;margin-bottom:40px!important}
  body.dxn-login-scene-mode .login>div:first-child{margin-bottom:28px!important}
  body.dxn-login-scene-mode .login>div:first-child .dxn-scene-logo{width:min(250px,42vw)!important}
  body.dxn-login-scene-mode .login #role,
  body.dxn-login-scene-mode .login #loginNo,
  body.dxn-login-scene-mode .login #pin{min-height:46px!important;margin-bottom:10px!important}
}

/* Tablet */
@media (min-width:601px) and (max-width:1024px){
  body.dxn-login-scene-mode{background-size:cover!important;background-position:center center!important;background-attachment:scroll!important}
  body.dxn-login-scene-mode .login{width:min(430px,58vw)!important;margin-top:clamp(22px,6vh,60px)!important;margin-bottom:56px!important}
  body.${BODY_FLOW} .login.dxn-responsive-member-card{width:min(92vw,700px)!important}
}

/* Laptop / desktop */
@media (min-width:1025px){
  body.dxn-login-scene-mode .login{width:min(430px,30vw)!important;margin-top:clamp(28px,6.5vh,78px)!important}
  body.${BODY_FLOW} .login.dxn-responsive-member-card{width:min(94vw,720px)!important}
}

/* Short viewport: tighten non-essential gaps only. Content remains scrollable. */
@media (max-height:700px){
  body.dxn-login-scene-mode .login{margin-top:18px!important;margin-bottom:40px!important}
  body.dxn-login-scene-mode .login>div:first-child{margin-bottom:28px!important}
  body.dxn-login-scene-mode .login>div:first-child .dxn-scene-logo{width:min(250px,32vw)!important}
  body.${BODY_FLOW} .login.dxn-responsive-member-card{margin-top:14px!important;margin-bottom:28px!important}
}

/* Extra-short mobile landscape: preserve every control by allowing natural page scrolling. */
@media (max-width:600px) and (orientation:landscape) and (max-height:520px){
  body.dxn-login-scene-mode .login{margin-top:12px!important;margin-bottom:28px!important}
  body.dxn-login-scene-mode .login>div:first-child{margin-bottom:20px!important}
  body.dxn-login-scene-mode .login>div:first-child .dxn-scene-logo{width:min(190px,34vw)!important}
}

/* Accessibility / touch targets */
body.${BODY_FLOW} button,body.dxn-login-scene-mode button{touch-action:manipulation}
body.${BODY_FLOW} input:focus,body.${BODY_FLOW} textarea:focus,body.${BODY_FLOW} select:focus,
body.dxn-login-scene-mode input:focus,body.dxn-login-scene-mode select:focus{outline:2px solid rgba(15,81,63,.55);outline-offset:2px}
`;
    document.head.appendChild(s);
  }

  function markFlow(){
    var hasVerify=!!document.getElementById('verifyMemberNo');
    var hasMemberSetup=!!document.getElementById('verifiedName')||!!document.getElementById('verifiedPin')||!!document.getElementById('verifiedPin2');
    var hasRegister=!!document.getElementById('dxnFullName')||!!document.getElementById('dxnResidenceCountry');
    var on=hasVerify||hasMemberSetup||hasRegister;
    document.body.classList.toggle(BODY_FLOW,on);
    var card=document.querySelector('.login');
    if(card&&(hasVerify||hasMemberSetup||hasRegister))card.classList.add('dxn-responsive-member-card');
    return on;
  }

  function install(){
    ensureStyle();
    setDeviceClass();
    markFlow();
    var app=document.getElementById('app');
    if(app&&!window.__DXN_DEVICE_AWARE_OBSERVER__){
      window.__DXN_DEVICE_AWARE_OBSERVER__=true;
      new MutationObserver(function(){markFlow();setDeviceClass()}).observe(app,{childList:true,subtree:true});
    }
    var resize=function(){setDeviceClass();markFlow()};
    window.addEventListener('resize',resize,{passive:true});
    window.addEventListener('orientationchange',resize,{passive:true});
    if(window.visualViewport)window.visualViewport.addEventListener('resize',resize,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
