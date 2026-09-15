/* V86.46.13 — إخفاء نتائج اختبارات التدريب من لوحة القائد فقط مع بقاء النتيجة محفوظة للعضو */
(function(){
  if(window.__DXN_TRAINING_LEADER_CLEANUP_V864613__) return;
  window.__DXN_TRAINING_LEADER_CLEANUP_V864613__=true;

  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.message||d.error))||t||('HTTP '+r.status));
    return d;
  }
  function token(){return localStorage.getItem('dxn_session')||''}
  function role(){return String((typeof window.role!=='undefined'?window.role:'')||localStorage.getItem('dxn_role')||'').toLowerCase()}

  function addStyle(){
    if(document.getElementById('dxn-leader-cleanup-style'))return;
    var s=document.createElement('style');s.id='dxn-leader-cleanup-style';
    s.textContent='.dxn-leader-delete-btn{margin-inline-start:8px!important;border:1px solid #e1c7c7!important;background:#fff5f5!important;color:#8b2f2f!important;font-weight:900!important}.dxn-leader-delete-btn:disabled{opacity:.55!important;cursor:wait!important}';
    (document.head||document.documentElement).appendChild(s);
  }

  async function hideAnswer(answerId){
    if(!answerId)return;
    if(!confirm('حذف هذا الاختبار من لوحة القائد؟\nستبقى النتيجة والحالة محفوظتين للعضو كما هي.'))return;
    try{
      await rpc('leader_hide_training_answer',{p_token:token(),p_answer_id:answerId});
      location.reload();
    }catch(e){alert('تعذر حذف الاختبار من لوحة القائد: '+e.message)}
  }
  window.hideLeaderTrainingAnswer=hideAnswer;

  function installButtons(){
    if(role()!=='leader')return;
    var box=document.getElementById('dxn-training-answer-center');
    if(!box)return;
    addStyle();
    var cards=box.querySelectorAll('.challenge');
    if(!cards.length)return;
    rpc('training_assessment_bootstrap',{p_token:token()}).then(function(d){
      var rows=d&&Array.isArray(d.all_answers)?d.all_answers:[];
      for(var i=0;i<cards.length&&i<rows.length;i++){
        var card=cards[i],row=rows[i];
        if(!row||!row.id||card.querySelector('.dxn-leader-delete-btn'))continue;
        var host=card.querySelector('.row');
        if(!host)continue;
        var btn=document.createElement('button');
        btn.type='button';btn.className='dxn-leader-delete-btn';btn.textContent='🗑️ حذف من لوحة القائد';
        btn.title='إزالة هذا الاختبار من لوحة القائد مع إبقاء نتيجته وحالته محفوظتين للعضو';
        btn.addEventListener('click',function(id){return function(){hideAnswer(id)}}(String(row.id)),false);
        host.appendChild(btn);
      }
    }).catch(function(e){console.error('V86.46.13 leader cleanup',e)});
  }

  function boot(){
    installButtons();
    try{new MutationObserver(function(){installButtons()}).observe(document.body,{childList:true,subtree:true})}catch(e){}
    setInterval(installButtons,1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();