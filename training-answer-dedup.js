/* V86.46.18 — عرض أحدث محاولة فقط لكل عضو/سؤال في مراجعة القائد */
(function(){
  if(window.__DXN_TRAINING_ANSWER_DEDUP_V864618__)return;
  window.__DXN_TRAINING_ANSWER_DEDUP_V864618__=true;

  function parseCard(card){
    var muted=card.querySelector('.row .muted');
    var text=String(muted&&muted.textContent||'').replace(/\s+/g,' ').trim();
    var m=text.match(/🪪\s*(.*?)\s*·\s*التدريب\s*(\d+)\s*·\s*السؤال\s*(\d+)\s*·\s*المحاولة\s*(\d+)/);
    if(!m)return null;
    return {key:m[1]+'|'+m[2]+'|'+m[3],attempt:Number(m[4]||1)};
  }

  function updateSummary(box,counted){
    var stats=box.querySelectorAll('.progress-stat');
    for(var i=0;i<stats.length;i++){
      var label=String(stats[i].querySelector('.muted')&&stats[i].querySelector('.muted').textContent||'');
      var b=stats[i].querySelector('b');
      if(!b)continue;
      if(label.indexOf('📨 الإجابات')!==-1)b.textContent=String(counted.total);
      else if(label.indexOf('⏳ بانتظار المراجعة')!==-1)b.textContent=String(counted.pending);
      else if(label.indexOf('✅ معتمدة')!==-1)b.textContent=String(counted.approved);
      else if(label.indexOf('🔁 إعادة')!==-1)b.textContent=String(counted.retry);
    }
  }

  function dedup(){
    var box=document.getElementById('dxn-training-answer-center');
    if(!box)return false;
    var cards=Array.prototype.slice.call(box.querySelectorAll(':scope > .challenge'));
    var latest={};
    cards.forEach(function(card,idx){
      var p=parseCard(card);
      if(!p)return;
      var prev=latest[p.key];
      if(!prev||p.attempt>prev.attempt||(p.attempt===prev.attempt&&idx>prev.idx)){
        latest[p.key]={card:card,attempt:p.attempt,idx:idx};
      }
    });
    var visible=[];
    cards.forEach(function(card){
      var p=parseCard(card);
      if(!p)return;
      var keep=latest[p.key]&&latest[p.key].card===card;
      if(!keep){card.remove();return}
      visible.push(card);
      if(p.attempt>1&&!card.querySelector('.dxn-answer-update-badge')){
        var row=card.querySelector('.row');
        if(row){var badge=document.createElement('span');badge.className='badge dxn-answer-update-badge';badge.style.cssText='margin-right:6px;background:#eef8f2;color:#176b55';badge.textContent='✏️ تعديل على الإجابة السابقة';var right=row.lastElementChild;if(right)right.parentNode.insertBefore(badge,right);else row.appendChild(badge)}
      }
    });
    var counted={total:visible.length,pending:0,approved:0,retry:0};
    visible.forEach(function(card){
      var row=card.querySelector('.row');
      var st=String(row&&row.textContent||'');
      if(st.indexOf('⏳ بانتظار المراجعة')!==-1)counted.pending++;
      if(st.indexOf('✅ معتمدة')!==-1)counted.approved++;
      if(st.indexOf('🔁 إعادة المحاولة')!==-1)counted.retry++;
    });
    updateSummary(box,counted);
    return true;
  }

  var tries=0;
  var timer=setInterval(function(){dedup();if(++tries>900)clearInterval(timer)},200);
  if(document.body)new MutationObserver(function(){dedup()}).observe(document.body,{childList:true,subtree:true});
})();
