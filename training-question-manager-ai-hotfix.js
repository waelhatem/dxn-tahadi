/* V86.46.28 — intercept ideal-answer generation and use the stable /api/rpc route */
(function(){
  if(window.__DXN_TRAINING_QUESTION_MANAGER_AI_HOTFIX_V864628__)return;
  window.__DXN_TRAINING_QUESTION_MANAGER_AI_HOTFIX_V864628__=true;

  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var text=await r.text(),data=null;try{data=text?JSON.parse(text):null}catch(e){}
    if(!r.ok)throw new Error((data&&(data.message||data.error))||text||('HTTP '+r.status));
    return data;
  }
  async function generate(btn,id){
    try{
      btn.disabled=true;
      btn.textContent='⏳ جارٍ التوليد...';
      var d=await rpc('generate_training_answer',{p_token:token(),p_question_id:id});
      if(!d||d.ok!==true||!d.question)throw new Error('لم يرجع الخادم جوابًا مثاليًا صالحًا.');
      var q=d.question;
      var view=document.querySelector('[data-answer-view="'+CSS.escape(String(id))+'"]');
      if(view)view.textContent=String(q.model_answer||'');
      btn.textContent='✅ تم اعتماد الجواب المثالي';
      btn.disabled=false;
      window.setTimeout(function(){if(btn.isConnected){btn.textContent='✨ اعتماد جواب مثالي';}},1800);
    }catch(e){
      btn.disabled=false;
      btn.textContent='✨ اعتماد جواب مثالي';
      alert('تعذر توليد الجواب المثالي: '+String(e&&e.message||e));
    }
  }
  document.addEventListener('click',function(e){
    var btn=e.target&&e.target.closest?e.target.closest('[data-ideal]'):null;
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var id=btn.getAttribute('data-ideal');
    if(!id)return;
    if(!confirm('توليد جواب مثالي لهذا السؤال واعتماده بدل الجواب الحالي؟'))return;
    generate(btn,id);
  },true);
})();
