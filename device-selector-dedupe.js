(function(){
  'use strict';
  function ownSelectors(){
    return Array.prototype.slice.call(document.querySelectorAll('.view-switch,.device-switch,#viewSwitch,#deviceViewSwitch'));
  }
  function introOverlayPresent(){
    if(document.querySelector('.scene .scene-bg,.pretest-intro,.intro-overlay,[data-pretest-intro="true"]')) return true;
    var frames=document.querySelectorAll('iframe');
    for(var i=0;i<frames.length;i++){
      var src=frames[i].getAttribute('src')||'';
      if(/02-pretest-intro|03-pretest|pretest-intro/i.test(src)) return true;
    }
    return false;
  }
  function sync(){
    var own=ownSelectors();
    var global=document.querySelectorAll('#dxn-global-device-switch');
    if(global.length){
      var hide=own.length>0||introOverlayPresent();
      for(var i=0;i<global.length;i++) global[i].style.display=hide?'none':'flex';
      if(global.length>1){for(var j=1;j<global.length;j++)global[j].remove();}
    }
    if(own.length>1){
      var keep=null;
      for(var k=0;k<own.length;k++){if(own[k].offsetParent!==null){keep=own[k];break;}}
      if(!keep)keep=own[0];
      for(var n=0;n<own.length;n++)if(own[n]!==keep)own[n].remove();
    }
  }
  function init(){
    sync();
    if(window.MutationObserver){
      var timer=null;
      new MutationObserver(function(){
        clearTimeout(timer);
        timer=setTimeout(sync,30);
      }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','src']});
    }
    window.addEventListener('load',sync,{once:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();