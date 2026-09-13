/* V86.45.12 — تقييم إجابات التدريب + سياسة الملاحظات بعد المحاولة الثالثة */
(function(){
  if(window.__DXN_TRAINING_AI_GRADER_V864512__) return;
  window.__DXN_TRAINING_AI_GRADER_V864512__=true;

  var GENERIC_RETRY='ركز في إجابتك. الإجابة تحتاج إلى مراجعة وإعادة.';
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
      var attemptNo=Number(submitted&&submitted.attempt_no||attempt||1);
      if(!answerId)throw new Error('تم إرسال الإجابة لكن لم يصل رقم الإجابة للخادم.');

      var result=await grade({token:token(),question_id:qid,answer_id:answerId,answer:value});
      var score=Number(result&&result.score||0),status=String(result&&result.status||'retry');
      var note=String(result&&result.note||'').trim();

      if(status==='retry' && attemptNo<=3){
        alert(GENERIC_RETRY);
      }else if(status==='retry'){
        alert('🔁 تحتاج إلى تحسين الإجابة\n\nالدرجة: '+score+'/100\n\nملاحظة القائد:\n'+(note||'راجع إجابتك وحاول تحسينها.'));
      }else{
        alert('✅ تم اجتياز السؤال\n\nالدرجة: '+score+'/100');
      }
      location.reload();
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent=originalText||'📤 إرسال الإجابة'}
      alert('تعذر إكمال التقييم التلقائي: '+e.message+'\n\nيمكنك المحاولة مرة أخرى.');
    }
  }

  function protectLeaderNoteFields(){
    try{
      if(String(localStorage.getItem('dxn_role')||'').toLowerCase()!=='leader')return;
      document.querySelectorAll('[id^="note-"]').forEach(function(input){
        var challenge=input.closest('.challenge');
        if(!challenge)return;
        var text=String(challenge.textContent||'');
        var m=text.match(/المحاولة\s+(\d+)/);
        var attempt=m?Number(m[1]):0;
        if(attempt>0 && attempt<=3){
          input.disabled=true;
          input.placeholder='الملاحظة التفصيلية تظهر بعد المحاولة الثالثة';
          if(!input.value.trim() || input.dataset.dxnGenericLocked==='1'){
            input.value='';
            input.dataset.dxnGenericLocked='1';
          }
          input.title='لا توجد ملاحظة تفصيلية قبل المحاولة الرابعة';
        }else{
          input.disabled=false;
          input.placeholder='ملاحظة مختصرة للقائد';
          input.title='يمكن كتابة الملاحظة التفصيلية بعد المحاولة الثالثة';
        }
      });
    }catch(e){}
  }

  function install(){
    if(typeof window.submitTrainingAnswer!=='function')return false;
    if(window.submitTrainingAnswer.__dxnAiV864512)return true;
    window.submitTrainingAnswer=submit;
    window.submitTrainingAnswer.__dxnAiV864512=true;
    return true;
  }
  var n=0,t=setInterval(function(){install();protectLeaderNoteFields();if(++n>400)clearInterval(t)},100);
  try{new MutationObserver(protectLeaderNoteFields).observe(document.body,{childList:true,subtree:true})}catch(e){}
})();
