(function(){
'use strict';

try{
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});
  }
}catch(e){}

if(window.__DXN_PWA_INSTALL__) return;
window.__DXN_PWA_INSTALL__=true;

(function setCommunityFavicon(){
  try{
    var href='/community-icon-512.png?v=20260922';
    var old=document.querySelector('link[data-dxn-community-icon]');
    if(old) old.href=href;
    else{
      var link=document.createElement('link');
      link.rel='icon';
      link.type='image/webp';
      link.sizes='192x192';
      link.href=href;
      link.setAttribute('data-dxn-community-icon','true');
      (document.head||document.documentElement).appendChild(link);
    }
  }catch(e){}
})();

function installed(){
  return (window.matchMedia && (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  )) || window.navigator.standalone === true;
}

function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}

let deferredPrompt=null;

function removePrompt(){
  const el=document.getElementById('dxn-install-app');
  if(el) el.remove();
}

function isIOSSafari(){
  return isIOS() &&
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios|opios|duckduckgo/i.test(navigator.userAgent);
}

function showInstallNotice(mode){
  if(installed() || document.getElementById('dxn-install-app')) return;

  const ios=isIOSSafari();
  const wrap=document.createElement('div');
  wrap.id='dxn-install-app';

  const title=ios
    ? 'ثبّت مجتمع الصحة والثراء على جهازك'
    : 'ثبّت تطبيق مجتمع الصحة والثراء';

  const text=ios
    ? 'ثبّته على الشاشة الرئيسية للوصول إليه بسرعة في كل مرة.'
    : 'ثبّت التطبيق على جهازك للوصول إليه بسرعة، بدون الحاجة لفتح المتصفح كل مرة.';

  const action=ios
    ? '<div class="dxn-ios-steps">'+
        '<div class="dxn-ios-step"><b>١</b><span>اضغط زر <strong>المشاركة</strong> ⬆️ في Safari.</span></div>'+
        '<div class="dxn-ios-step"><b>٢</b><span>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</span></div>'+
        '<div class="dxn-ios-step"><b>٣</b><span>اضغط <strong>إضافة</strong> لتثبيت التطبيق.</span></div>'+
      '</div>'
    : '<button class="dxn-install-main" type="button">📲 تثبيت التطبيق الآن</button>'+
      '<div class="dxn-install-help">اضغط الزر أعلاه لبدء تثبيت التطبيق مباشرة.</div>';

  wrap.innerHTML=
    '<div class="dxn-install-backdrop"></div>'+
    '<div class="dxn-install-card" role="dialog" aria-modal="true" aria-label="'+title+'">'+
      '<button class="dxn-install-close" type="button" aria-label="إغلاق">×</button>'+
      '<div class="dxn-install-icon">'+(ios?'🍎':'📲')+'</div>'+
      '<div class="dxn-install-title">'+title+'</div>'+
      '<div class="dxn-install-text">'+text+'</div>'+
      action+
      '<button class="dxn-install-later" type="button">'+(ios?'فهمت':'ليس الآن')+'</button>'+
    '</div>';

  const style=document.createElement('style');
  style.id='dxn-install-style';
  style.textContent=
    '#dxn-install-app{position:fixed;inset:0;z-index:2147483647;direction:rtl;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif}'+
    '#dxn-install-app .dxn-install-backdrop{position:absolute;inset:0;background:rgba(7,35,28,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}'+
    '#dxn-install-app .dxn-install-card{position:relative;width:min(520px,calc(100vw - 30px));padding:34px 30px 27px;text-align:center;background:linear-gradient(145deg,#ffffff,#f1faf6);border:2px solid rgba(217,154,24,.65);border-radius:30px;box-shadow:0 25px 80px rgba(0,0,0,.35);animation:dxnInstallPop .32s ease-out}'+
    '#dxn-install-app .dxn-install-icon{width:82px;height:82px;margin:0 auto 17px;display:grid;place-items:center;border-radius:24px;background:linear-gradient(135deg,#0f513f,#1c7b60);font-size:42px;box-shadow:0 10px 28px rgba(15,81,63,.25)}'+
    '#dxn-install-app .dxn-install-title{font-size:26px;font-weight:950;color:#123b30;line-height:1.35;margin-bottom:10px}'+
    '#dxn-install-app .dxn-install-text{font-size:17px;font-weight:650;color:#53645e;line-height:1.8;margin:0 auto 20px;max-width:430px}'+
    '#dxn-install-app .dxn-install-main{width:100%;border:0;border-radius:17px;padding:16px 20px;background:linear-gradient(135deg,#0f513f,#176b55);color:#fff;font-size:19px;font-weight:950;cursor:pointer;box-shadow:0 10px 24px rgba(15,81,63,.25);transition:.18s transform,.18s box-shadow}'+
    '#dxn-install-app .dxn-install-main:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(15,81,63,.30)}'+
    '#dxn-install-app .dxn-install-help{margin-top:12px;color:#687872;font-size:13px;line-height:1.7}'+
    '#dxn-install-app .dxn-ios-steps{display:grid;gap:10px;text-align:right;margin:0 auto 8px;max-width:450px}'+
    '#dxn-install-app .dxn-ios-step{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid #dcebe4;border-radius:15px;background:#f7fbf9;color:#294c41;font-size:15px;line-height:1.65}'+
    '#dxn-install-app .dxn-ios-step b{width:31px;height:31px;flex:0 0 31px;border-radius:50%;display:grid;place-items:center;background:#0f513f;color:#fff;font-size:14px}'+
    '#dxn-install-app .dxn-install-later{margin-top:15px;border:0;background:transparent;color:#7a8581;font-size:14px;font-weight:750;cursor:pointer;padding:7px 14px}'+
    '#dxn-install-app .dxn-install-close{position:absolute;top:12px;left:14px;width:38px;height:38px;border:0;border-radius:50%;background:#eaf2ef;color:#476057;font-size:28px;line-height:1;cursor:pointer}'+
    '@keyframes dxnInstallPop{from{opacity:0;transform:translateY(15px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}'+
    '@media(max-width:600px){#dxn-install-app{padding:14px}#dxn-install-app .dxn-install-card{padding:29px 20px 22px;border-radius:26px}#dxn-install-app .dxn-install-icon{width:72px;height:72px;font-size:36px;margin-bottom:13px}#dxn-install-app .dxn-install-title{font-size:22px}#dxn-install-app .dxn-install-text{font-size:15px;line-height:1.75}#dxn-install-app .dxn-install-main{font-size:17px;padding:15px 14px}#dxn-install-app .dxn-ios-step{font-size:14px}}';

  if(!document.getElementById('dxn-install-style')) document.head.appendChild(style);
  document.body.appendChild(wrap);

  const close=function(){removePrompt()};
  wrap.querySelector('.dxn-install-close').addEventListener('click',close);
  wrap.querySelector('.dxn-install-later').addEventListener('click',close);
  wrap.querySelector('.dxn-install-backdrop').addEventListener('click',close);

  const main=wrap.querySelector('.dxn-install-main');
  if(main){
    main.addEventListener('click',async function(){
      if(!deferredPrompt){ removePrompt(); return; }
      try{
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      }catch(e){}
      deferredPrompt=null;
      removePrompt();
    });
  }
}

async function hasInstalledApp(){
  if(installed()) return true;
  try{
    if(typeof navigator.getInstalledRelatedApps==='function'){
      const apps=await navigator.getInstalledRelatedApps();
      if(Array.isArray(apps) && apps.length) return true;
    }
  }catch(_){}
  return false;
}

async function maybeShow(){
  if(await hasInstalledApp()) return;
  if(deferredPrompt){
    showInstallNotice('native');
    return;
  }
  // Chrome can dispatch beforeinstallprompt after the first page lifecycle.
  // Re-check for a short period without fabricating a non-functional prompt.
  [1500,3000,5000,8000].forEach(function(delay){
    setTimeout(async function(){
      if(await hasInstalledApp()) return;
      if(deferredPrompt && !document.getElementById('dxn-install-app')){
        showInstallNotice('native');
      }
    },delay);
  });
}

window.addEventListener('beforeinstallprompt',function(e){
  if(installed()) return;
  e.preventDefault();
  deferredPrompt=e;
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){showInstallNotice('native')},{once:true});
  }else{
    showInstallNotice('native');
  }
});

window.addEventListener('appinstalled',function(){
  deferredPrompt=null;
  removePrompt();
});

window.addEventListener('pageshow',function(){
  setTimeout(maybeShow,250);
});

document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible'){
    setTimeout(maybeShow,250);
  }
});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(maybeShow,900);
  },{once:true});
}else{
  setTimeout(maybeShow,900);
}
})();