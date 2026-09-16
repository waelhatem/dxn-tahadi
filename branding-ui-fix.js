/* V86.46.34 — replace the old central brand block with the full site identity inside the previous-user interface. */
(function(){
  'use strict';
  function addStyle(){
    if(document.getElementById('dxn-branding-style'))return;
    var s=document.createElement('style');
    s.id='dxn-branding-style';
    s.textContent='.dxn-full-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;margin:0 auto 8px;line-height:1.05}.dxn-full-brand-icon{width:108px;height:108px;object-fit:contain;border:0;border-radius:0;box-shadow:none;background:transparent}.dxn-full-brand-name{margin-top:-2px;font-size:28px;font-weight:950;color:#0f513f;letter-spacing:-.5px}.dxn-full-brand-tagline{margin-top:5px;font-size:13px;font-weight:800;color:#176b55}@media(max-width:799px){.dxn-full-brand-icon{width:86px;height:86px}.dxn-full-brand-name{font-size:22px}.dxn-full-brand-tagline{font-size:11px}}';
    document.head.appendChild(s);
  }
  function apply(){
    var top=document.querySelector('.top');
    if(!top || top.__dxnBrandingApplied)return false;
    top.__dxnBrandingApplied=true;
    addStyle();
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
