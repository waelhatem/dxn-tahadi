/* V86.46.26 — leader-only training-question editor launcher; role is verified from the active server session, never from stale localStorage alone. */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V864626__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V864626__=true;

  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function localLeader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role||'').toLowerCase()==='leader')return true}catch(e){}
    return false;
  }
  function verifiedLeader(){return window.__DXN_TRAINING_QUESTION_ADMIN_LEADER_VERIFIED__===true}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  function trainingSection(){
    var direct=document.getElementById('leader-training-center')||document.getElementById('section-training');
    if(direct)return direct;
    var nodes=document.querySelectorAll('#app .card,#app section,.app .card,.app section');
    for(var i=0;i<nodes.length;i++){
      var h=nodes[i].querySelector('.title,h2,h3');
      var t=String((h&&h.textContent)||nodes[i].textContent||'').replace(/\s+/g,' ').trim();
      if(t.indexOf('الشروحات والتدريبات')!==-1||t.toLowerCase().indexOf('lessons & training')!==-1)return nodes[i];
    }
    return null;
  }
  function removeOldUI(){
    ['dxn-training-question-admin-center-button','dxn-qadmin-page-bottom','dxn-training-question-admin-direct-panel','dxn-training-question-admin-tab','dxn-training-question-force-subtabs','dxn-training-question-admin-v864625','dxn-training-question-editor-host'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove()});
    document.querySelectorAll('button,.tab,[role="tab"]').forEach(function(b){var t=String(b.textContent||'').replace(/\s+/g,' ').trim();if(t==='تعديل أسئلة الاختبارات'||t==='تعديل أسئلة اختبارات التدريبات')b.remove()});
    window.__DXN_TRAINING_QUESTION_ADMIN_LEADER_VERIFIED__=false;
  }
  function setActive(which){
    var n=document.getElementById('dxn-training-question-force-subtabs');if(!n)return;
    n.querySelectorAll('button').forEach(function(b){var a=b.getAttribute('data-force-tab')===which;b.style.background=a?'var(--green)':'';b.style.color=a?'#fff':'';b.style.borderColor=a?'var(--green)':'var(--line)'});
  }
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var text=await r.text(),data=null;try{data=text?JSON.parse(text):null}catch(e){}
    if(!r.ok)throw new Error((data&&(data.message||data.error))||text||('HTTP '+r.status));
    return data;
  }
  async function verifyLeaderAccess(){
    var t=token();
    window.__DXN_TRAINING_QUESTION_ADMIN_LEADER_VERIFIED__=false;
    if(!t){removeOldUI();return false}
    try{
      var d=await rpc('training_questions_admin',{p_token:t});
      if(d&&d.ok===true){window.__DXN_TRAINING_QUESTION_ADMIN_LEADER_VERIFIED__=true;return true}
    }catch(e){}
    removeOldUI();
    return false;
  }
  function ensureSubtab(){
    if(!verifiedLeader())return false;
    var sec=trainingSection();if(!sec)return false;
    var n=document.getElementById('dxn-training-question-force-subtabs');
    if(!n){
      n=document.createElement('div');
      n.id='dxn-training-question-force-subtabs';
      n.setAttribute('role','tablist');
      n.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0 14px;padding:6px;border:1px solid var(--line);border-radius:15px;background:#f8faf9;direction:rtl';
      var title=sec.querySelector('.title,h2,h3');
      var anchor=title&&title.parentNode&&title.parentNode.parentNode===sec?title.parentNode:(title&&title.parentNode===sec?title:null);
      if(anchor&&anchor.parentNode===sec)sec.insertBefore(n,anchor.nextSibling);else sec.insertBefore(n,sec.firstChild);
    }
    if(!n.querySelector('[data-force-tab="training"]')){
      var b=document.createElement('button');b.type='button';b.setAttribute('data-force-tab','training');b.textContent='📚 الشروحات والتدريبات';b.style.cssText='flex:1 1 180px;min-width:150px;font-weight:900';b.addEventListener('click',function(){setActive('training');var p=document.getElementById('dxn-training-question-admin-v864625');if(p)p.remove()});n.appendChild(b);
    }
    if(!n.querySelector('[data-force-tab="questions"]')){
      var q=document.createElement('button');q.type='button';q.setAttribute('data-force-tab','questions');q.textContent='⚙️ تعديل أسئلة الاختبارات';q.style.cssText='flex:1 1 180px;min-width:150px;font-weight:900';q.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setActive('questions');openEditor()});n.appendChild(q);
    }
    setActive(document.getElementById('dxn-training-question-admin-v864625')?'questions':'training');
    return true;
  }
  function renderShell(){
    var sec=trainingSection();if(!sec)return null;
    var p=document.getElementById('dxn-training-question-admin-v864625');if(p)p.remove();
    p=document.createElement('section');p.id='dxn-training-question-admin-v864625';p.className='card';
    p.style.cssText='margin:14px 0;border:1px solid var(--line);border-radius:20px;background:#fff;overflow:hidden;direction:rtl;text-align:right';
    p.innerHTML='<div class="qadmin-head" style="padding:16px;background:linear-gradient(135deg,#f7fbf9,#fff);border-bottom:1px solid var(--line)"><div class="row" style="border:0;padding:0"><div><div class="title">⚙️ تعديل أسئلة اختبارات التدريبات</div><div class="muted">خاص بالقائد فقط — يتم التحقق من صلاحية الحساب من الخادم</div></div><button type="button" id="dx-hotfix-close">✕ إغلاق</button></div></div><div id="dx-hotfix-body" style="padding:14px">⏳ جارٍ تحميل أسئلة الاختبارات...</div>';
    sec.appendChild(p);
    var close=document.getElementById('dx-hotfix-close');if(close)close.onclick=function(){p.remove();setActive('training')};
    return p;
  }
  function loadEditorScript(done){
    if(typeof window.openTrainingQuestionAdmin==='function'){done();return}
    var src='training-question-admin-v864622.js?v=86.46.25';
    var old=document.querySelector('script[data-dxn-tq-editor="1"]');
    if(old){old.addEventListener('load',done,{once:true});return}
    var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute('data-dxn-tq-editor','1');s.onload=done;s.onerror=function(){done(new Error('تعذر تحميل محرر الأسئلة.'))};document.head.appendChild(s);
  }
  async function openEditor(){
    if(!verifiedLeader())return false;
    try{
      ensureSubtab();
      if(typeof window.openTrainingQuestionAdmin==='function'){
        var ok=window.openTrainingQuestionAdmin();
        if(ok!==false)setActive('questions');
        return true;
      }
      var p=renderShell();
      loadEditorScript(function(err){
        if(err){var b=p&&p.querySelector('#dx-hotfix-body');if(b)b.innerHTML='<div style="padding:12px;border:1px solid #e5a19a;border-radius:12px;background:#fff7f6;color:#8a1c13">⚠️ '+esc(err.message||String(err))+'</div>';return}
        try{
          if(typeof window.openTrainingQuestionAdmin==='function'){
            window.openTrainingQuestionAdmin();
            setActive('questions');
            setTimeout(function(){var r=document.getElementById('dxn-training-question-admin');if(r&&verifiedLeader()){p.style.display='none';r.style.display='block';r.scrollIntoView({behavior:'smooth',block:'start'})}},100);
          }
        }catch(e){}
      });
      return true;
    }catch(e){return false}
  }
  window.__DXN_OPEN_TRAINING_QUESTION_ADMIN__=openEditor;

  var lastToken='';
  async function install(){
    var t=token();
    if(t!==lastToken){lastToken=t;await verifyLeaderAccess()}
    if(!verifiedLeader())return false;
    ensureSubtab();
    return !!document.getElementById('dxn-training-question-force-subtabs');
  }
  var tries=0,timer=setInterval(function(){install();if(++tries>720)clearInterval(timer)},500);
  if(document.body)new MutationObserver(function(){if(verifiedLeader())ensureSubtab()}).observe(document.body,{childList:true,subtree:true});
  install();
})();
