/* V86.46.34 — use the uploaded full logo in the previous-user login and authenticated interface. */
(function(){
  'use strict';
  function addStyle(){
    if(document.getElementById('dxn-branding-style'))return;
    var s=document.createElement('style');
    s.id='dxn-branding-style';
    s.textContent='.dxn-full-brand{display:flex;align-items:center;justify-content:center;text-align:center;margin:0 auto 10px;line-height:1}.dxn-full-brand-image{display:block;width:min(360px,70vw);height:auto;max-height:220px;object-fit:contain;border:0;background:transparent}.dxn-login-brand .dxn-full-brand-image{width:min(360px,76vw);max-height:230px}@media(max-width:799px){.dxn-full-brand-image,.dxn-login-brand .dxn-full-brand-image{width:min(300px,78vw);max-height:170px}}';
    document.head.appendChild(s);
  }
  function apply(){
    addStyle();
    var top=document.querySelector('.top');
    var login=document.querySelector('.login');
    var host=top||login;
    if(!host || host.__dxnBrandingApplied)return false;
    host.__dxnBrandingApplied=true;
    var oldLogo=host.querySelector('.logo');
    var oldTitle=host.querySelector('h1');
    var oldTagline=host.querySelector('p');
    if(oldLogo)oldLogo.style.display='none';
    if(oldTitle)oldTitle.style.display='none';
    if(oldTagline)oldTagline.style.display='none';
    var brand=document.createElement('div');
    brand.className='dxn-full-brand'+(login?' dxn-login-brand':'');
    brand.setAttribute('aria-label','مجتمع الصحة والثراء');
    brand.innerHTML='<img src="/logo-full.png?v=86.46.34" alt="مجتمع الصحة والثراء" class="dxn-full-brand-image">';
    var identity=host.querySelector('.member-identity');
    host.insertBefore(brand, identity || host.firstChild);
    return true;
  }
  function start(){
    var n=0,t=setInterval(function(){if(apply()||++n>240)clearInterval(t)},50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
