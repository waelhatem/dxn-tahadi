/* V86.46.14 — إخفاء نتائج التدريب من لوحة القائد فقط + حذف إجابات تدريب بالكامل عند طلب القائد */
(function(){
  if(window.__DXN_TRAINING_LEADER_CLEANUP_V864614__) return;
  window.__DXN_TRAINING_LEADER_CLEANUP_V864614__=true;

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
    s.textContent=''
      +'.dxn-leader-delete-btn{margin-inline-start:8px!important;border:1px solid #e1c7c7!important;background:#fff5f5!important;color:#8b2f2f!important;font-weight:900!important}'
      +'.dxn-leader-delete-btn:disabled,.dxn-leader-reset-btn:disabled{opacity:.55!important;cursor:wait!important}'
      +'.dxn-leader-training-group{margin-top:16px;padding:12px;border:2px solid #d9e6df;border-radius:14px;background:#fbfefd}'
      +'.dxn-leader-training-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;padding:4px 2px}'
      +'.dxn-leader-reset-btn{border:1px solid #d9b6b6!important;background:#fff4f4!important;color:#8b2525!important;font-weight:900!important;white-space:nowrap}'
      +'@media(max-width:700px){.dxn-leader-training-group-head{align-items:flex-start;flex-direction:column}.dxn-leader-reset-btn{width:100%}}';
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

  async function deleteTrainingAnswers(lessonNo,lessonTitle,btn){
    if(!lessonNo)return;
    var name=lessonTitle||('التدريب '+lessonNo);
    var ok=confirm('حذف إجابات '+name+' نهائيًا؟\n\nسيتم حذف جميع إجابات ومحاولات هذا التدريب من حساب القائد وحساب العضو، وستصبح أسئلته متاحة للعضو من جديد كأنها لم تُجب سابقًا.\n\nهذا الحذف نهائي ولا يمكن التراجع عنه.');
    if(!ok)return;
    try{
      if(btn){btn.disabled=true;btn.textContent='⏳ جارٍ الحذف...'}
      var d=await rpc('leader_delete_training_answers',{p_token:token(),p_lesson_no:Number(lessonNo)});
      var n=Number(d&&d.deleted_count||0);
      alert('تم حذف '+n+' إجابة/محاولة من '+name+' نهائيًا.');
      location.reload();
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent='🗑️ حذف إجابات التدريب نهائيًا'}
      alert('تعذر حذف إجابات التدريب: '+e.message);
    }
  }
  window.deleteLeaderTrainingAnswers=deleteTrainingAnswers;

  function groupByTraining(box,rows){
    if(!box||box.getAttribute('data-dxn-training-groups')==='1')return;
    var cards=Array.prototype.slice.call(box.querySelectorAll('.challenge'));
    if(!cards.length||!rows.length)return;
    var groupsHost=document.createElement('div');
    groupsHost.id='dxn-leader-training-groups';
    var order=[],groups={};
    for(var i=0;i<cards.length&&i<rows.length;i++){
      var row=rows[i],no=Number(row&&row.lesson_no||0);
      if(!no)continue;
      if(!groups[no]){groups[no]={lesson_no:no,title:String(row.lesson_title||('التدريب '+no)),cards:[]};order.push(no)}
      groups[no].cards.push(cards[i]);
    }
    if(!order.length)return;
    box.setAttribute('data-dxn-training-groups','1');
    box.appendChild(groupsHost);
    order.sort(function(a,b){return a-b});
    order.forEach(function(no){
      var g=groups[no];
      var section=document.createElement('section');section.className='dxn-leader-training-group';section.setAttribute('data-lesson-no',String(no));
      var head=document.createElement('div');head.className='dxn-leader-training-group-head';
      var title=document.createElement('div');title.style.fontWeight='900';title.style.lineHeight='1.7';title.textContent='📚 التدريب '+no+': '+g.title;
      var btn=document.createElement('button');btn.type='button';btn.className='dxn-leader-reset-btn';btn.textContent='🗑️ حذف إجابات التدريب نهائيًا';btn.title='حذف جميع إجابات ومحاولات هذا التدريب من القائد والعضو وإتاحة الاختبار من جديد';
      btn.addEventListener('click',function(){deleteTrainingAnswers(no,g.title,btn)},false);
      head.appendChild(title);head.appendChild(btn);section.appendChild(head);
      g.cards.forEach(function(card){section.appendChild(card)});
      groupsHost.appendChild(section);
    });
  }

  function installButtons(){
    if(role()!=='leader')return;
    var box=document.getElementById('dxn-training-answer-center');
    if(!box)return;
    addStyle();
    rpc('training_assessment_bootstrap',{p_token:token()}).then(function(d){
      var rows=d&&Array.isArray(d.all_answers)?d.all_answers:[];
      groupByTraining(box,rows);
      var cards=box.querySelectorAll('.challenge');
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
    }).catch(function(e){console.error('V86.46.14 leader cleanup',e)});
  }

  function boot(){
    installButtons();
    try{new MutationObserver(function(){installButtons()}).observe(document.body,{childList:true,subtree:true})}catch(e){}
    setInterval(installButtons,1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();