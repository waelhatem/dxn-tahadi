/* V86.46.32 — separate member/leader training labels; never show question management inside member learning tab */
(function(){
  if(window.__DXN_TRAINING_ROLE_UI_FIX_V864632__)return;
  window.__DXN_TRAINING_ROLE_UI_FIX_V864632__=true;

  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function localRole(){try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()}catch(e){return ''}}

  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    return {ok:r.ok,data:d,text:t};
  }

  function renameTrainingTab(role){
    var label=role==='leader'?'📚 إدارة الشروحات والتدريبات':'🎓 التعلم والتدريب';
    var aria=role==='leader'?'إدارة الشروحات والتدريبات':'التعلم والتدريب';
    document.querySelectorAll('.tabs .tab').forEach(function(tab){
      var text=String(tab.textContent||'').replace(/\s+/g,' ').trim();
      if(!/الشروحات\s*والتدريبات/.test(text) && text!==label)return;
      if(String(tab.textContent||'').trim()!==label)tab.textContent=label;
      if(tab.getAttribute('aria-label')!==aria)tab.setAttribute('aria-label',aria);
    });
  }

  function isMemberLearningTabActive(){
    var active=document.querySelector('.tabs .tab.active');
    if(!active)return false;
    var text=String(active.textContent||'').replace(/\s+/g,' ').trim();
    return /التعلم\s*والتدريب/.test(text);
  }

  function removeMemberQuestionManager(){
    document.querySelectorAll('.dxn-training-manage-btn').forEach(function(btn){btn.remove()});
    var modal=document.getElementById('dxn-training-manage-modal');
    if(modal)modal.remove();
  }

  function applyRole(role){
    renameTrainingTab(role);
    // قاعدة واجهة مستقلة: داخل تبويب العضو «التعلم والتدريب» لا يظهر مدير الأسئلة مهما كانت
    // قيمة الدور المخزنة محليًا أو توقيت تحميل باقي الملفات.
    if(role!=='leader' || isMemberLearningTabActive())removeMemberQuestionManager();
  }

  function bootRole(role){
    applyRole(role);
    var root=document.body;
    if(!root)return;
    var scheduled=false;
    new MutationObserver(function(){
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(function(){
        scheduled=false;
        applyRole(role);
      });
    }).observe(root,{childList:true,subtree:true});
  }

  async function resolveRole(){
    var local=localRole();
    var t=token();
    if(!t){bootRole(local==='leader'?'leader':'member');return}
    try{
      var result=await rpc('training_questions_admin',{p_token:t});
      if(result.ok && result.data && Array.isArray(result.data.questions)){
        bootRole('leader');
        return;
      }
      bootRole('member');
    }catch(e){
      bootRole(local==='leader'?'leader':'member');
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resolveRole,{once:true});
  else resolveRole();
})();
