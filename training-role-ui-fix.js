/* V86.46.30 — separate member/leader training labels and hide question management from members */
(function(){
  if(window.__DXN_TRAINING_ROLE_UI_FIX_V864630__)return;
  window.__DXN_TRAINING_ROLE_UI_FIX_V864630__=true;

  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function localRole(){try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()}catch(e){return ''}}

  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    return {ok:r.ok,data:d,text:t};
  }

  function renameTrainingTab(role){
    document.querySelectorAll('.tabs .tab').forEach(function(tab){
      var text=String(tab.textContent||'').replace(/\s+/g,' ').trim();
      if(!/الشروحات\s*والتدريبات/.test(text))return;
      if(role==='leader'){
        tab.innerHTML='📚 إدارة الشروحات والتدريبات';
      }else{
        tab.innerHTML='🎓 التعلم والتدريب';
      }
      tab.setAttribute('aria-label',role==='leader'?'إدارة الشروحات والتدريبات':'التعلم والتدريب');
    });
  }

  function removeMemberQuestionManager(){
    document.querySelectorAll('.dxn-training-manage-btn').forEach(function(btn){btn.remove()});
    var modal=document.getElementById('dxn-training-manage-modal');
    if(modal)modal.remove();
    document.querySelectorAll('[data-ideal],[data-edit],[data-delete]').forEach(function(btn){
      var inside=btn.closest('.dxn-training-manage-modal');
      if(inside)inside.remove();
    });
  }

  function bootRole(role){
    renameTrainingTab(role);
    if(role!=='leader')removeMemberQuestionManager();
    var root=document.body;
    if(!root)return;
    new MutationObserver(function(){
      renameTrainingTab(role);
      if(role!=='leader')removeMemberQuestionManager();
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
