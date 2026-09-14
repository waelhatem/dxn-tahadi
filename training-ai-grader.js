/* V86.46.8 — نتيجة كل إجابة تظهر في الوسط + نتيجة تحت السؤال + تحويل الزر إلى تمت الإجابة بعد الاعتماد + احتفالية 90+ */
(function(){
  if(window.__DXN_TRAINING_AI_GRADER_V86468__) return;
  window.__DXN_TRAINING_AI_GRADER_V86468__=true;
  var GENERIC_RETRY='ركز في إجابتك. حصلت الإجابة على أقل من 60/100 وتحتاج إلى مراجعة وإعادة.';
  var CROWD_AUDIO='/achievement_crowd_5s.mp3';
  var NEXT_KEY='dxn_training_next_destination';
  var crowdAudio=null;

  function token(){return localStorage.getItem('dxn_session')||''}
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;
    try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.message||d.error||d.hint))||t||('HTTP '+r.status));
    return d;
  }
  async function grade(payload){
    var r=await fetch('/api/grade-training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    var t=await r.text(),d=null;
    try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.error||d.message))||t||('HTTP '+r.status));
    return d;
  }

  function prepareCrowdAudio(){
    try{
      if(!crowdAudio){crowdAudio=new Audio(CROWD_AUDIO);crowdAudio.preload='auto';crowdAudio.volume=0.95}
      crowdAudio.load();
    }catch(e){}
  }
  function playCrowdAudio(){
    try{
      if(!crowdAudio)prepareCrowdAudio();
      if(!crowdAudio)return;
      crowdAudio.currentTime=0;
      var p=crowdAudio.play();
      if(p&&typeof p.catch==='function')p.catch(function(){});
    }catch(e){}
  }

  function findNextDestination(qid){
    try{
      var current=document.querySelector('[data-assessment-q="'+String(qid).replace(/"/g,'\\"')+'"]');
      if(!current)return null;
      var currentDetail=current.closest('details');
      var same=currentDetail?Array.prototype.slice.call(currentDetail.querySelectorAll('textarea[data-assessment-q]')):[];
      var at=same.findIndex(function(x){return String(x.getAttribute('data-assessment-q'))===String(qid)});
      if(at>=0&&same[at+1])return {kind:'question',qid:String(same[at+1].getAttribute('data-assessment-q')||'')};
      var details=Array.prototype.slice.call(document.querySelectorAll('details.dxn-training-assessment-inline'));
      if(currentDetail&&details.indexOf(currentDetail)<0)details.push(currentDetail);
      details.sort(function(a,b){return (a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1});
      var idx=details.indexOf(currentDetail);
      if(idx<0){for(var i=0;i<details.length;i++){if(details[i].contains(current)){idx=i;break}}}
      if(idx>=0&&details[idx+1]){
        var next=details[idx+1].querySelector('textarea[data-assessment-q]');
        if(next)return {kind:'question',qid:String(next.getAttribute('data-assessment-q')||'')}
      }
      return {kind:'stay',qid:String(qid)};
    }catch(e){return {kind:'stay',qid:String(qid)}}
  }
  function rememberNextDestination(qid){try{sessionStorage.setItem(NEXT_KEY,JSON.stringify(findNextDestination(qid)||{kind:'stay',qid:String(qid)}));}catch(e){}}
  function clearRememberedDestination(){try{sessionStorage.removeItem(NEXT_KEY)}catch(e){}}
  function goToRememberedDestination(){
    var raw=null;
    try{raw=sessionStorage.getItem(NEXT_KEY);sessionStorage.removeItem(NEXT_KEY)}catch(e){}
    if(!raw)return;
    var dest=null;try{dest=JSON.parse(raw)}catch(e){return}
    if(!dest||!dest.qid||dest.kind==='stay')return;
    var tries=0,timer=setInterval(function(){
      tries++;
      var target=document.querySelector('[data-assessment-q="'+String(dest.qid).replace(/"/g,'\\"')+'"]');
      if(target){
        clearInterval(timer);
        var detail=target.closest('details');
        if(detail)detail.open=true;
        setTimeout(function(){target.scrollIntoView({behavior:'smooth',block:'center'});try{target.focus({preventScroll:true})}catch(e){try{target.focus()}catch(_e){}}},120);
        return;
      }
      if(tries>80)clearInterval(timer);
    },250);
  }

  function challengeFor(el){return el&&el.closest?el.closest('.challenge'):null}

  function updateInlineResult(el,score,status){
    var challenge=challengeFor(el);
    if(!challenge)return;
    var old=challenge.querySelector('.dxn-inline-ai-result');
    if(old)old.remove();
    var box=document.createElement('div');
    box.className='dxn-inline-ai-result';
    box.style.cssText='margin-top:10px;padding:11px 14px;border-radius:12px;direction:rtl;text-align:right;font-weight:900;line-height:1.7;';
    if(status==='approved'){
      box.style.background='#eef9f3';
      box.style.border='1px solid #b8dfca';
      box.style.color='#176b55';
      box.innerHTML='✅ النتيجة المعتمدة: <b>'+score+'/100</b>';
    }else{
      box.style.background='#fff8e8';
      box.style.border='1px solid #ead29b';
      box.style.color='#8a5300';
      box.innerHTML='🔁 النتيجة: <b>'+score+'/100</b> — تحتاج إلى إعادة المحاولة';
    }
    var row=challenge.querySelector('.row');
    if(row&&row.parentNode)row.parentNode.insertBefore(box,row.nextSibling);else challenge.appendChild(box);
  }

  function updateAnswerControls(el,score,status){
    var challenge=challengeFor(el);
    if(!challenge)return;
    var btn=challenge.querySelector('button.primary');
    var textarea=el;
    if(status==='approved'){
      if(textarea)textarea.disabled=true;
      if(btn){btn.disabled=true;btn.textContent='✅ تمت الإجابة';btn.style.opacity='0.85';btn.style.cursor='default'}
    }else if(status==='retry'){
      if(textarea)textarea.disabled=false;
      if(btn){btn.disabled=false;btn.textContent='🔁 إعادة إرسال';btn.style.opacity='1';btn.style.cursor='pointer'}
    }
  }

  function showCentralResult(score,status){
    var old=document.getElementById('dxn-training-result-notice');
    if(old)old.remove();
    var wrap=document.createElement('div');
    wrap.id='dxn-training-result-notice';
    wrap.setAttribute('role','status');
    wrap.style.cssText='position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(0,0,0,.08);backdrop-filter:blur(2px);padding:20px;box-sizing:border-box;direction:rtl;';
    var card=document.createElement('div');
    card.style.cssText='min-width:min(390px,92vw);max-width:92vw;padding:24px 28px;border-radius:22px;background:#fff;box-shadow:0 18px 55px rgba(0,0,0,.22);text-align:center;font-family:system-ui,sans-serif;';
    var title=document.createElement('div');
    title.style.cssText='font-weight:900;font-size:22px;line-height:1.5;';
    title.textContent=status==='approved'?'✅ تم اعتماد إجابتك تلقائيًا':'🔁 تحتاج الإجابة إلى إعادة المحاولة';
    var scoreBox=document.createElement('div');
    scoreBox.style.cssText='margin-top:9px;font-weight:1000;font-size:34px;line-height:1.2;color:'+(status==='approved'?'#176b55':'#8a5300')+';';
    scoreBox.textContent=score+'/100';
    var sub=document.createElement('div');
    sub.style.cssText='margin-top:8px;font-size:15px;font-weight:700;color:#5d646b;';
    sub.textContent=status==='approved'?'النتيجة التي حصلت عليها لهذا السؤال':'راجع إجابتك ثم أرسل محاولة جديدة';
    card.appendChild(title);card.appendChild(scoreBox);card.appendChild(sub);wrap.appendChild(card);document.body.appendChild(wrap);
    return wrap;
  }

  function celebrate90(score){
    playCrowdAudio();
    var old=document.getElementById('dxn-training-success-celebration');
    if(old)old.remove();
    var wrap=document.createElement('div');
    wrap.id='dxn-training-success-celebration';
    wrap.setAttribute('role','status');
    wrap.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;background:rgba(255,255,255,.08);backdrop-filter:blur(1px);';
    var style=document.createElement('style');
    style.textContent='@keyframes dxnCupPop{0%{transform:scale(.3) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}@keyframes dxnConfettiFall{0%{transform:translate3d(0,-12vh,0) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot));opacity:0}}#dxn-training-success-celebration .dxn-cup{font-size:110px;animation:dxnCupPop .75s cubic-bezier(.2,.85,.25,1) both;filter:drop-shadow(0 12px 22px rgba(0,0,0,.22))}#dxn-training-success-celebration .dxn-message{position:absolute;top:50%;transform:translateY(95px);background:#fff;border-radius:22px;padding:14px 24px;box-shadow:0 14px 40px rgba(0,0,0,.18);font:900 22px/1.4 system-ui,sans-serif;color:#0f513f;direction:rtl;text-align:center;animation:dxnCupPop .75s .12s both}';
    wrap.appendChild(style);
    var cup=document.createElement('div');cup.className='dxn-cup';cup.textContent='🏆';wrap.appendChild(cup);
    var msg=document.createElement('div');msg.className='dxn-message';msg.textContent='🎉 مبروك! حصلت على '+score+'/100';wrap.appendChild(msg);
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
    prepareCrowdAudio();
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
      updateInlineResult(el,score,status);
      updateAnswerControls(el,score,status);
      if(status==='retry'){
        clearRememberedDestination();
        showCentralResult(score,status);
        setTimeout(function(){var n=document.getElementById('dxn-training-result-notice');if(n)n.remove()},2400);
      }else{
        rememberNextDestination(qid);
        if(score>=90){
          celebrate90(score);
          setTimeout(goToRememberedDestination,4600);
        }else{
          var notice=showCentralResult(score,status);
          setTimeout(function(){if(notice&&notice.parentNode)notice.remove();goToRememberedDestination()},2300);
        }
      }
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent=originalText||'📤 إرسال الإجابة'}
      alert('تعذر إكمال التقييم التلقائي: '+e.message+'\n\nيمكنك المحاولة مرة أخرى.')
    }
  }

  function install(){
    if(typeof window.submitTrainingAnswer!=='function')return false;
    if(window.submitTrainingAnswer.__dxnAiV86468)return true;
    window.submitTrainingAnswer=submit;
    window.submitTrainingAnswer.__dxnAiV86468=true;
    return true;
  }
  var n=0,t=setInterval(function(){install();if(++n>400)clearInterval(t)},100);
})();
