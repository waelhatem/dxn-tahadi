/* V86.58 — Hide only the standalone copyright phrase on the previous-user login scene. */
(function(){
  'use strict';
  var DONE='data-dxn-copyright-hidden';
  function normalize(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function hideOnlyCopyright(){
    var nodes=document.querySelectorAll('body *');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(!el || !el.style || el.getAttribute(DONE)==='1')continue;
      if(el.closest && el.closest('.login'))continue;
      if(el===document.body || el===document.documentElement || el.id==='app')continue;
      var txt=normalize(el.textContent);
      if(txt.length>0 && txt.length<=120 && txt.indexOf('مجتمع الصحة والثراء')!==-1 && txt.indexOf('جميع الحقوق محفوظة')!==-1 && txt.indexOf('2026')!==-1){
        if(el.querySelector && el.querySelector('#loginButton,#role,#loginNo,#pin,[onclick*="renderMemberVerify"]'))continue;
        el.setAttribute(DONE,'1');
        el.style.display='none';
        return;
      }
    }
  }
  function start(){
    hideOnlyCopyright();
    var app=document.getElementById('app');
    if(app&&!window.__DXN_COPYRIGHT_FIX_OBSERVED__){
      window.__DXN_COPYRIGHT_FIX_OBSERVED__=true;
      new MutationObserver(function(){setTimeout(hideOnlyCopyright,10)}).observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
