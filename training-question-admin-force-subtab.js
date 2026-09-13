/* V86.46.29 — single working leader-only question editor button under Lessons & Training */
(function(){
  if(window.__DXN_TRAINING_QUESTION_FORCE_SUBTAB_V864629__)return;
  window.__DXN_TRAINING_QUESTION_FORCE_SUBTAB_V864629__=true;

  function leader(){try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader'}catch(e){return false}}
  function trainingSection(){
    var x=document.getElementById('section-training');
    if(x)return x;
    var all=document.querySelectorAll('#app .card,#app section,.app .card,.app section');
    for(var i=0;i<all.length;i++){
      var t=String(all[i].textContent||'').replace(/\s+/g,' ').trim();
      if(t.indexOf('الشروحات والتدريبات')!==-1)return all[i];
    }
    return null;
  }
  function openEditor(){
    if(!leader())return;
    try{
      if(typeof window.openTrainingQuestionAdmin==='function'){
        window.openTrainingQuestionAdmin();
        return;
      }
    }catch(e){}
    var s=document.querySelector('script[data-dxn-training-qadmin-loader="1"]');
    if(s)return;
    s=document.createElement('script');
    s.src='training-question-admin-v864622.js?v=86.46.29';
    s.async=false;
    s.setAttribute('data-dxn-training-qadmin-loader','1');
    s.onload=function(){try{window.openTrainingQuestionAdmin&&window.openTrainingQuestionAdmin()}catch(e){}};
    document.head.appendChild(s);
  }
  function findQuestionButtons(){
    return Array.prototype.slice.call(document.querySelectorAll('button,[role="tab"],.tab')).filter(function(b){
      var t=String(b.textContent||'').replace(/\s+/g,' ').trim();
      return t.indexOf('تعديل أسئلة الاختبارات')!==-1;
    });
  }
  function removeStandalone(buttons,sec){
    buttons.forEach(function(b){
      if(sec && sec.contains(b))return;
      var box=b.closest('[role="tablist"],.tabs,.tabbar,.row,.card,section');
      if(box && sec && box.contains(sec))return;
      b.remove();
    });
  }
  function ensureSingleButton(){
    if(!leader())return;
    var sec=trainingSection();
    if(!sec)return;
    var buttons=findQuestionButtons();
    removeStandalone(buttons,sec);
    buttons=findQuestionButtons().filter(function(b){return sec.contains(b)});
    var keep=null;
    for(var i=0;i<buttons.length;i++){
      var parent=buttons[i].closest('[role="tablist"],.tabs,.tabbar');
      if(parent && sec.contains(parent)){keep=buttons[i];break}
    }
    if(!keep && buttons.length)keep=buttons[0];
    if(!keep){
      var nav=document.createElement('div');
      nav.id='dxn-training-question-admin-single-tab';
      nav.setAttribute('role','tablist');
      nav.style.cssText='display:flex;justify-content:flex-start;gap:8px;margin:10px 0 14px;padding:6px;border:1px solid var(--line);border-radius:15px;background:#f8faf9;direction:rtl';
      var b=document.createElement('button');
      b.type='button';
      b.textContent='⚙️ تعديل أسئلة الاختبارات';
      b.style.cssText='min-width:240px;font-weight:900';
      nav.appendChild(b);
      var title=sec.querySelector('.title,h2,h3');
      var anchor=title&&title.parentNode&&title.parentNode.parentNode===sec?title.parentNode:title;
      if(anchor&&anchor.parentNode===sec)sec.insertBefore(nav,anchor.nextSibling);else sec.insertBefore(nav,sec.firstChild);
      keep=b;
      buttons=[b];
    }
    if(buttons.length>1){
      for(var j=0;j<buttons.length;j++)if(buttons[j]!==keep){
        var wrap=buttons[j].closest('[role="tablist"],.tabs,.tabbar');
        if(wrap && sec.contains(wrap) && wrap!==keep.closest('[role="tablist"],.tabs,.tabbar')){
          var remaining=Array.prototype.slice.call(wrap.querySelectorAll('button,[role="tab"]')).filter(function(x){return String(x.textContent||'').indexOf('تعديل أسئلة الاختبارات')!==-1});
          if(remaining.length===1 && wrap.parentNode)wrap.remove(); else buttons[j].remove();
        }else buttons[j].remove();
      }
    }
    if(!keep.__dxnQuestionBound){
      keep.__dxnQuestionBound=true;
      keep.type='button';
      keep.onclick=function(e){e.preventDefault();e.stopPropagation();openEditor()};
      keep.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
    }
    keep.dataset.forceTab='questions';
  }
  function run(){
    try{
      var old=document.getElementById('dxn-training-question-force-subtabs');if(old)old.remove();
      if(leader())ensureSingleButton();
    }catch(e){}
  }
  run();
  var tries=0,t=setInterval(function(){run();if(++tries>720)clearInterval(t)},250);
  if(document.body)new MutationObserver(function(){clearTimeout(window.__dxnQAdminForceTimer);window.__dxnQAdminForceTimer=setTimeout(run,60)}).observe(document.body,{childList:true,subtree:true});
})();
