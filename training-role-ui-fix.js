/* V86.46.34 — exact distinct member/leader training tab names using visible account role */
(function(){
  if(window.__DXN_TRAINING_ROLE_UI_FIX_V864634__)return;
  window.__DXN_TRAINING_ROLE_UI_FIX_V864634__=true;

  function detectRole(){
    var label=document.querySelector('.member-identity .role-label');
    var text=String(label&&label.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    if(/قائد|leader/.test(text))return 'leader';
    if(/عضو|member/.test(text))return 'member';
    try{
      var r=String(localStorage.getItem('dxn_role')||'').toLowerCase();
      if(r==='leader'||r==='member')return r;
    }catch(e){}
    return 'member';
  }

  function renameTrainingTab(role){
    var label=role==='leader'?'ادارة الشروحات والتدريبات':'التدريب والتعلم';
    var aria=role==='leader'?'ادارة الشروحات والتدريبات':'التدريب والتعلم';
    document.querySelectorAll('.tabs .tab').forEach(function(tab){
      var text=String(tab.textContent||'').replace(/\s+/g,' ').trim();
      if(!/الشروحات\s*والتدريبات/.test(text) &&
         !/التعلم\s*والتدريب/.test(text) &&
         !/التدريب\s*والتعلم/.test(text) &&
         !/ادارة\s*الشروحات\s*والتدريبات/.test(text))return;
      if(text!==label)tab.textContent=label;
      if(tab.getAttribute('aria-label')!==aria)tab.setAttribute('aria-label',aria);
    });
  }

  function isMemberLearningTabActive(){
    var active=document.querySelector('.tabs .tab.active');
    if(!active)return false;
    return /التدريب\s*والتعلم/.test(String(active.textContent||'').replace(/\s+/g,' ').trim());
  }

  function removeMemberQuestionManager(){
    document.querySelectorAll('.dxn-training-manage-btn').forEach(function(btn){btn.remove()});
    var modal=document.getElementById('dxn-training-manage-modal');
    if(modal)modal.remove();
  }

  function applyRole(role){
    renameTrainingTab(role);
    if(role!=='leader' || isMemberLearningTabActive())removeMemberQuestionManager();
  }

  function boot(){
    var lastRole='';
    function apply(){
      var role=detectRole();
      if(role!==lastRole){lastRole=role;applyRole(role);}
      else applyRole(role);
    }
    apply();
    var root=document.body;
    if(!root)return;
    var scheduled=false;
    new MutationObserver(function(){
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(function(){scheduled=false;apply()});
    }).observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
