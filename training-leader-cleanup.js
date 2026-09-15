/* V86.46.17 — إصلاح حذف نتيجة الاختبار من لوحة القائد وربط كل بطاقة برقم الإجابة الحقيقي */
(function(){
  if(window.__DXN_TRAINING_LEADER_CLEANUP_V864617__) return;
  window.__DXN_TRAINING_LEADER_CLEANUP_V864617__=true;

  var hiddenAnswers=window.__DXN_LEADER_HIDDEN_ANSWERS__||{};
  window.__DXN_LEADER_HIDDEN_ANSWERS__=hiddenAnswers;

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

  function findCardByAnswerId(answerId){
    var id=String(answerId||''),cards=document.querySelectorAll('#dxn-training-answer-center .challenge');
    for(var i=0;i<cards.length;i++){
      if(String(cards[i].getAttribute('data-dxn-answer-id')||'')===id)return cards[i];
    }
    return null;
  }

  function scrollToNextAfterRemoval(card){
    try{
      var section=card&&card.parentNode&&card.parentNode.classList&&card.parentNode.classList.contains('dxn-leader-training-group')?card.parentNode:null;
      var next=null;
      if(section){
        var cards=Array.prototype.slice.call(section.querySelectorAll('.challenge'));
        next=cards[0]||null;
        if(!next){
          var sections=Array.prototype.slice.call(document.querySelectorAll('.dxn-leader-training-group'));
          var sidx=sections.indexOf(section);
          if(sidx>=0&&sections[sidx+1])next=sections[sidx+1].querySelector('.challenge');
        }
      }
      if(!next)next=document.querySelector('#dxn-training-answer-center .challenge');
      if(next){
        var details=next.closest('details');
        if(details)details.open=true;
        setTimeout(function(){try{next.scrollIntoView({behavior:'smooth',block:'center'})}catch(e){try{next.scrollIntoView()}catch(_){}}},120);
      }
    }catch(e){console.error('V86.46.17 next leader result',e)}
  }

  async function hideAnswer(answerId){
    answerId=String(answerId||'').trim();
    if(!answerId)return;
    if(!confirm('حذف هذا الاختبار من لوحة القائد؟\nستبقى النتيجة والحالة محفوظتين للعضو كما هي.'))return;
    var btn=document.querySelector('.dxn-leader-delete-btn[data-answer-id="'+answerId.replace(/"/g,'\\"')+'"]');
    var card=findCardByAnswerId(answerId)||(btn&&btn.closest('.challenge'));
    try{
      if(!token())throw new Error('جلسة القائد غير موجودة. يرجى تسجيل الدخول من جديد.');
      if(btn){btn.disabled=true;btn.textContent='⏳ جارٍ الحذف...'}
      var d=await rpc('leader_hide_training_answer',{p_token:token(),p_answer_id:answerId});
      if(!d||d.ok!==true)throw new Error('لم يؤكد الخادم نجاح الحذف.');

      hiddenAnswers[answerId]=true;
      if(card){
        card.setAttribute('data-dxn-leader-hidden','1');
        var section=card.closest('.dxn-leader-training-group');
        card.remove();
        if(section&&!section.querySelector('.challenge'))section.remove();
      }
      window.dispatchEvent(new CustomEvent('dxn:leader-answer-hidden',{detail:{answerId:answerId}}));
      scrollToNextAfterRemoval(card);
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent='🗑️ حذف من لوحة القائد'}
      alert('تعذر حذف الاختبار من لوحة القائد: '+e.message);
    }
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

    for(var m=0;m<cards.length&&m<rows.length;m++){
      var rr=rows[m];
      if(rr&&rr.id)cards[m].setAttribute('data-dxn-answer-id',String(rr.id));
    }

    for(var h=cards.length-1;h>=0;h--){
      var cid=String(cards[h].getAttribute('data-dxn-answer-id')||'');
      if(cid&&hiddenAnswers[cid])cards[h].remove();
    }
    cards=Array.prototype.slice.call(box.querySelectorAll('.challenge'));
    if(!cards.length)return;

    var groupsHost=document.createElement('div');
    groupsHost.id='dxn-leader-training-groups';
    var order=[],groups={};
    for(var i=0;i<cards.length;i++){
      var no=Number((rows[i]||{}).lesson_no||0);
      if(!no){
        var rid=String(cards[i].getAttribute('data-dxn-answer-id')||'');
        for(var z=0;z<rows.length;z++){if(String(rows[z]&&rows[z].id||'')===rid){no=Number(rows[z].lesson_no||0);break}}
      }
      if(!no)continue;
      var matched=null;
      for(var r=0;r<rows.length;r++){if(String(rows[r]&&rows[r].id||'')===String(cards[i].getAttribute('data-dxn-answer-id')||'')){matched=rows[r];break}}
      if(!matched)continue;
      if(!groups[no]){groups[no]={lesson_no:no,title:String(matched.lesson_title||('التدريب '+no)),cards:[]};order.push(no)}
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
      for(var i=0;i<cards.length;i++){
        var card=cards[i],answerId=String(card.getAttribute('data-dxn-answer-id')||'');
        if(!answerId||hiddenAnswers[answerId]||card.querySelector('.dxn-leader-delete-btn'))continue;
        var host=card.querySelector('.row');
        if(!host)continue;
        var btn=document.createElement('button');
        btn.type='button';btn.className='dxn-leader-delete-btn';btn.textContent='🗑️ حذف من لوحة القائد';btn.setAttribute('data-answer-id',answerId);
        btn.title='إزالة هذا الاختبار من لوحة القائد مع إبقاء نتيجته وحالته محفوظتين للعضو';
        btn.addEventListener('click',function(id){return function(){hideAnswer(id)}}(answerId),false);
        host.appendChild(btn);
      }
    }).catch(function(e){console.error('V86.46.17 leader cleanup',e)});
  }

  function boot(){
    installButtons();
    try{new MutationObserver(function(){installButtons()}).observe(document.body,{childList:true,subtree:true})}catch(e){}
    setInterval(installButtons,1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();