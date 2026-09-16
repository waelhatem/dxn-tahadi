/* V86.46.34 — replace the old central brand block with the full site identity inside the previous-user interface. */
(function(){
  'use strict';
  function apply(){
    var top=document.querySelector('.top');
    if(!top || top.__dxnBrandingApplied)return false;
    top.__dxnBrandingApplied=true;
    var oldLogo=top.querySelector('.logo');
    var oldTitle=top.querySelector('h1');
    var oldTagline=top.querySelector('p');
    if(oldLogo)oldLogo.style.display='none';
    if(oldTitle)oldTitle.style.display='none';
    if(oldTagline)oldTagline.style.display='none';
    var brand=document.createElement('div');
    brand.className='dxn-full-brand';
    brand.setAttribute('aria-label','مجتمع الصحة والثراء');
    brand.innerHTML='<img src="/logo.png" alt="مجتمع الصحة والثراء" class="dxn-full-brand-icon"><div class="dxn-full-brand-name">مجتمع الصحة والثراء</div><div class="dxn-full-brand-tagline">حياة أفضل ... فرص أوسع ... مستقبل أجمل</div>';
    var identity=top.querySelector('.member-identity');
    top.insertBefore(brand, identity || top.firstChild);
    return true;
  }
  function start(){
    if(apply())return;
    var n=0,t=setInterval(function(){if(apply()||++n>240)clearInterval(t)},50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
