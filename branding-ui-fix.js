/* V86.46.35 — use the approved full logo reliably on the previous-user login and authenticated interface. */
(function(){
  'use strict';
  function addStyle(){
    if(document.getElementById('dxn-branding-style'))return;
    var s=document.createElement('style');
    s.id='dxn-branding-style';
    s.textContent='.dxn-full-brand{display:flex;align-items:center;justify-content:center;text-align:center;margin:0 auto 10px;line-height:1}.dxn-full-brand-image{display:block;width:min(360px,76vw);height:auto;max-height:230px;object-fit:contain;border:0;background:transparent}@media(max-width:799px){.dxn-full-brand-image{width:min(300px,78vw);max-height:170px}}';
    document.head.appendChild(s);
  }
  function hideOldBranding(login){
    var nodes=document.querySelectorAll('h1,h2,.logo');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i],txt=(el.textContent||'').trim();
      if(el.classList.contains('logo') || txt.indexOf('مجتمع الصحة والثراء')!==-1)el.style.display='none';
    }
    if(login){
      var ps=login.querySelectorAll('p');
      for(var j=0;j<ps.length;j++){
        var ptxt=(ps[j].textContent||'').trim();
        if(ptxt.indexOf('دخول موحد')!==-1)ps[j].style.display='none';
      }
    }
  }
  function apply(){
    addStyle();
    var top=document.querySelector('.top');
    var login=document.querySelector('.login');
    var host=top||login;
    if(!host)return false;
    hideOldBranding(login);
    if(host.querySelector('.dxn-full-brand'))return true;
    var brand=document.createElement('div');
    brand.className='dxn-full-brand'+(login?' dxn-login-brand':'');
    brand.setAttribute('aria-label','مجتمع الصحة والثراء');
    brand.innerHTML='<img src="/logo.png?v=86.46.35" alt="مجتمع الصحة والثراء" class="dxn-full-brand-image">';
    var identity=host.querySelector('.member-identity');
    host.insertBefore(brand, identity || host.firstChild);
    return true;
  }
  function start(){
    var n=0,t=setInterval(function(){if(apply()||++n>240)clearInterval(t)},50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
