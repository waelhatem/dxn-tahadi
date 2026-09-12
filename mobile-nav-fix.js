/* V86.30 — إزالة أزرار التقدم والرجوع المضافة سابقًا */
(function(){
if(window.__DXN_MOBILE_NAV_REMOVE_V8630__)return;
window.__DXN_MOBILE_NAV_REMOVE_V8630__=true;
function mobile(){return window.innerWidth<=600||document.body.classList.contains('mobile-mode')}
function removeAdded(){
  ['dxnMobileNextProxy','dxnMobileBackProxy'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove()});
  if(!mobile())return;
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    var e=els[i],t=(e.textContent||'').replace(/\s+/g,' ').trim();
    if(e.closest('.nav')||e.id==='dxnAboutMainLink'||e.id==='dxnSmartGuideMainButton')continue;
    var r=e.getBoundingClientRect();
    var navText=/(^|\s)(رجوع|الرجوع|عودة|العودة|تقدم|التقدم|التالي|الدرس التالي|back|previous|next|forward)(\s|$)/i.test(t);
    var navIcon=/^[\s◀▶◁▷⏮⏭⬅➡️▶️◀️]+$/.test(t);
    var fixedBottom=r.bottom>innerHeight-260&&r.top>innerHeight-360;
    if(navText&&(fixedBottom||e.getAttribute('data-dxn-nav-original')==='1')){
      e.style.setProperty('display','none','important');
      e.style.setProperty('visibility','hidden','important');
      e.style.setProperty('pointer-events','none','important');
    }else if(navIcon&&fixedBottom){
      e.style.setProperty('display','none','important');
      e.style.setProperty('visibility','hidden','important');
      e.style.setProperty('pointer-events','none','important');
    }
  }
}
function run(){setTimeout(removeAdded,20)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
window.addEventListener('resize',run,{passive:true});
window.addEventListener('scroll',run,{passive:true});
new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
})();
