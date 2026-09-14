/* V86.46.2 — تقييم إجابات التدريب + اعتماد تلقائي + تكريم 90+ */
(function(){
  if(window.__DXN_TRAINING_AI_GRADER_V86462__) return;
  window.__DXN_TRAINING_AI_GRADER_V86462__=true;

  var GENERIC_RETRY='ركز في إجابتك. حصلت الإجابة على أقل من 60/100 وتحتاج إلى مراجعة وإعادة.';

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

  function celebrate90(){
    var old=document.getElementById('dxn-training-success-celebration');
    if(old)old.remove();

    var wrap=document.createElement('div');
    wrap.id='dxn-training-success-celebration';
    wrap.setAttribute('role','status');
    wrap.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;background:rgba(255,255,255,.08);backdrop-filter:blur(1px);';

    var style=document.createElement('style');
    style.textContent='@keyframes dxnCupPop{0%{transform:scale(.3) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}@keyframes dxnConfettiFall{0%{transform:translate3d(0,-12vh,0) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot));opacity:0}}#dxn-training-success-celebration .dxn-cup{font-size:110px;animation:dxnCupPop .75s cubic-bezier(.2,.85,.25,1) both;filter:drop-shadow(0 12px 22px rgba(0,0,0,.22))}#dxn-training-success-celebration .dxn-message{position:absolute;top:50%;transform:translateY(95px);background:#fff;border-radius:22px;padding:14px 24px;box-shadow:0 14px 40px rgba(0,0,0,.18);font:900 22px/1.4 system-ui,sans-serif;color:#0f513f;direction:rtl;text-align:center;animation:dxnCupPop .75s .12s both}';
    wrap.appendChild(style);

    var cup=document.createElement('div');
    cup.className='dxn-cup';
    cup.textContent='🏆';
    wrap.appendChild(cup);

    var msg=document.createElement('div');
    msg.className='dxn-message';
    msg.textContent='ممتاز! حصلت على 90 درجة أو أكثر 🎉';
    wrap.appendChild(msg);

    for(var i=0;i<90;i++){
      var c=document.createElement('i');
      c.style.cssText='position:absolute;top:-6vh;left:'+(Math.random()*100)+'%;width:'+(6+Math.random()*8)+'px;height:'+(10+Math.random()*12)+'px;border-radius:2px;background:hsl('+(Math.random()*360)+',85%,'+(45+Math.random()*15)+'%);transform:rotate('+(Math.random()*180)+'deg);--dx:'+((Math.random()-.5)*34)+'vw;--rot:'+((Math.random()>.5?1:-1)*(180+Math.random()*720))+'deg;animation:dxnConfettiFall '+(2.2+Math.random()*2.6)+'s '+(Math.random()*.25)+'s linear forwards;';
      wrap.appendChild(c);
    }

    document.body.appendChild(wrap);
    setTimeout(function(){if(wrap&&wrap.parentNode)wrap.remove()},4600);
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

      if(status==='retry'){
        alert(GENERIC_RETRY+'\n\nالدرجة: '+score+'/100');
      }else if(score>=90){
        celebrate90();
      }else{
        alert('✅ تم اعتماد السؤال تلقائيًا بالذكاء الاصطناعي\n\nالدرجة: '+score+'/100');
      }

      var waitMs=score>=90?4500:0;
      if(waitMs)setTimeout(function(){location.reload()},waitMs);else location.reload();
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent=originalText||'📤 إرسال الإجابة'}
      alert('تعذر إكمال التقييم التلقائي: '+e.message+'\n\nيمكنك المحاولة مرة أخرى.');
    }
  }

  function install(){
    if(typeof window.submitTrainingAnswer!=='function')return false;
    if(window.submitTrainingAnswer.__dxnAiV86462)return true;
    window.submitTrainingAnswer=submit;
    window.submitTrainingAnswer.__dxnAiV86462=true;
    return true;
  }

  var n=0,t=setInterval(function(){install();if(++n>400)clearInterval(t)},100);
})();
