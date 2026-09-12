/* V86.45 — تقييم إجابات التدريب تلقائيًا بالذكاء الاصطناعي */
(function(){
  if(window.__DXN_TRAINING_AI_GRADER_V8645__) return;
  window.__DXN_TRAINING_AI_GRADER_V8645__=true;

  function token(){return localStorage.getItem('dxn_session')||''}
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.message||d.error||d.hint))||t||('HTTP '+r.status));
    return d;
  }
  async function grade(payload){
    var r=await fetch('/api/grade-training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.error||d.message))||t||('HTTP '+r.status));
    return d;
  }

  async function submit(qid){
    var el=document.querySelector('[data-assessment-q="'+String(qid).replace(/"/g,'\\"')+'"]');
    var value=el?String(el.value||'').trim():'';
    if(value.length<2){alert('اكتب إجابة قبل الإرسال.');return}

    var btn=el&&el.closest('.challenge')?el.closest('.challenge').querySelector('button.primary'):null;
    var originalText=btn?btn.textContent:'';
    if(btn){btn.disabled=true;btn.textContent='🤖 جارٍ التقييم...'}

    try{
      var boot=await rpc('training_assessment_bootstrap',{p_token:token()});
      var rows=Array.isArray(boot&&boot.my_answers)?boot.my_answers:[];
      var old=rows.filter(function(x){return String(x.question_id)===String(qid)}).sort(function(a,b){return Number(b.attempt_no||0)-Number(a.attempt_no||0)})[0]||null;
      var attempt=Math.max(1,Number(old&&old.attempt_no||0)+(old&&old.status==='retry'?1:0));

      var submitted=await rpc('submit_training_answer',{p_token:token(),p_question_id:qid,p_answer:value,p_attempt_no:attempt});
      var answerId=submitted&&submitted.answer_id;
      if(!answerId)throw new Error('تم إرسال الإجابة لكن لم يصل رقم الإجابة للخادم.');

      var result=await grade({token:token(),question_id:qid,answer_id:answerId,answer:value});
      var score=Number(result&&result.score||0),status=String(result&&result.status||'retry');
      var note=String(result&&result.note||'').trim();
      alert((status==='approved'?'✅ تم اجتياز السؤال':'🔁 تحتاج إلى تحسين الإجابة')+'\n\nالدرجة: '+score+'/100\n\nملاحظة القائد:\n'+(note||'تم تقييم الإجابة تلقائيًا.'));
      location.reload();
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent=originalText||'📤 إرسال الإجابة'}
      alert('تعذر إكمال التقييم التلقائي: '+e.message+'\n\nيمكنك المحاولة مرة أخرى.');
    }
  }

  function install(){
    if(typeof window.submitTrainingAnswer!=='function')return false;
    if(window.submitTrainingAnswer.__dxnAiV8645)return true;
    window.submitTrainingAnswer=submit;
    window.submitTrainingAnswer.__dxnAiV8645=true;
    return true;
  }
  var n=0,t=setInterval(function(){if(install()||++n>240)clearInterval(t)},50);
})();
