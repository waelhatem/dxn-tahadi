(function(){
'use strict';
if(window.__DXN_PWA_INSTALL__) return;
window.__DXN_PWA_INSTALL__=true;

function installed(){
  return window.matchMedia &&
    (window.matchMedia('(display-mode: standalone)').matches ||
     window.matchMedia('(display-mode: fullscreen)').matches ||
     window.matchMedia('(display-mode: minimal-ui)').matches) ||
    window.navigator.standalone === true;
}
let deferredPrompt=null;

function addPrompt(){
  if(installed() || document.getElementById('dxn-install-app')) return;
  const wrap=document.createElement('div');
  wrap.id='dxn-install-app';
  wrap.innerHTML='<button type="button" aria-label="تثبيت التطبيق">📲 تثبيت التطبيق</button>';
  const style=document.createElement('style');
  style.textContent='#dxn-install-app{position:fixed;right:18px;bottom:18px;z-index:100000;direction:rtl}#dxn-install-app button{border:0;border-radius:999px;padding:12px 18px;background:linear-gradient(135deg,#0f513f,#176b55);color:#fff;font:800 14px/1.2 system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;cursor:pointer;box-shadow:0 7px 20px rgba(0,0,0,.20);transition:transform .18s ease,box-shadow .18s ease}#dxn-install-app button:hover{transform:translateY(-2px);box-shadow:0 9px 24px rgba(0,0,0,.24)}@media(max-width:700px){#dxn-install-app{right:12px;bottom:12px}#dxn-install-app button{padding:11px 15px;font-size:13px}}';
  document.head.appendChild(style);
  document.body.appendChild(wrap);
  wrap.querySelector('button').addEventListener('click',async function(){
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    try{ await deferredPrompt.userChoice; }catch(e){}
    deferredPrompt=null;
    wrap.remove();
  });
}
function removePrompt(){
  const el=document.getElementById('dxn-install-app');
  if(el) el.remove();
}
window.addEventListener('beforeinstallprompt',function(e){
  if(installed()) return;
  e.preventDefault();
  deferredPrompt=e;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addPrompt,{once:true});
  else addPrompt();
});
window.addEventListener('appinstalled',function(){
  deferredPrompt=null;
  removePrompt();
});
if(installed()) removePrompt();
})();