/* V86.44 — اختبارات التدريبات والشروحات: 10 أسئلة لكل تدريب + مراجعة القائد */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_V8644__) return;
  window.__DXN_TRAINING_ASSESSMENT_V8644__=true;
  var state={loaded:false,role:'',assessments:[],my_answers:[],all_answers:[]};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function token(){return localStorage.getItem('dxn_session')||''}
  async function rpc(fn,args){var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}if(!r.ok)throw new Error((d&&(d.message||d.error))||t||('HTTP '+r.status));return d}
  function ansFor(qid){var rows=state.my_answers.filter(function(x){return String(x.question_id)===String(qid)});rows.sort(function(a,b){return Number(b.attempt_no||0)-Number(a.attempt_no||0)});return rows[0]||null}
  function statusBadge(a){if(!a)return '<span class="muted">لم تُجب بعد</span>';if(a.status==='approved')return '<span style="font-weight:800">✅ معتمدة · '+Number(a.score||0)+'/100</span>';if(a.status==='retry')return '<span style="font-weight:800">🔁 تحتاج إعادة المحاولة · '+Number(a.score||0)+'/100</span>';return '<span style="font-weight:800">⏳ بانتظار المراجعة</span>'}
  function renderMember(){
    if(state.role!=='member')return;
    var root=document.getElementById('dxn-training-assessment');if(!root){root=document.createElement('section');root.id='dxn-training-assessment';root.className='card';root.style.cssText='margin:18px 0;border:2px solid #cfe4da;background:linear-gradient(135deg,#f8fcfa,#fff);direction:rtl;text-align:right';document.body.appendChild(root)}
    var total=0,answered=0,approved=0;state.assessments.forEach(function(a){(a.questions||[]).forEach(function(q){total++;var x=ansFor(q.id);if(x){answered++;if(x.status==='approved')approved++}})});
    var html='<div class="title">🧠 اختبارات استيعاب التدريبات</div><p class="muted" style="line-height:1.8">بعد مشاهدة كل تدريب، أجب عن أسئلته. الإجابات لا تظهر للأعضاء الآخرين، ويستطيع القائد مراجعتها واعتمادها أو طلب إعادة المحاولة.</p><div class="mini-grid"><div><b>📚 التدريبات</b><div style="font-size:20px;font-weight:900">'+state.assessments.length+'</div></div><div><b>📝 الإجابات</b><div style="font-size:20px;font-weight:900">'+answered+'/'+total+'</div></div><div><b>✅ المعتمدة</b><div style="font-size:20px;font-weight:900">'+approved+'/'+total+'</div></div></div>';
    state.assessments.forEach(function(a){
      var qs=a.questions||[];var done=qs.filter(function(q){return !!ansFor(q.id)}).length;
      html+='<div class="card" style="margin-top:14px;border:1px solid var(--line);background:#fff"><div class="row"><div><div class="title">📚 التدريب '+esc(a.lesson_no)+': '+esc(a.lesson_title)+'</div><div class="muted">'+done+'/'+qs.length+' أسئلة تمت الإجابة عنها</div></div><a href="'+esc(a.video_url)+'" target="_blank" rel="noopener" style="text-decoration:none"><button type="button">▶️ فتح التدريب</button></a></div>';
      if(!qs.length)html+='<div class="empty" style="margin-top:10px">لم تُعتمد أسئلة هذا التدريب بعد.</div>';
      qs.forEach(function(q){var old=ansFor(q.id);html+='<div class="challenge" style="margin-top:12px;border-color:#d9e7e1"><div style="font-weight:900">'+q.question_no+'. '+esc(q.question)+'</div><textarea data-assessment-q="'+esc(q.id)+'" rows="4" placeholder="اكتب إجابتك هنا..." style="width:100%;margin-top:9px;box-sizing:border-box">'+esc(old&&old.answer||'')+'</textarea><div class="row" style="margin-top:8px"><div>'+statusBadge(old)+(old&&old.reviewer_note?'<div class="muted" style="margin-top:4px">ملاحظة القائد: '+esc(old.reviewer_note)+'</div>':'')+'</div><button class="primary" type="button" onclick="submitTrainingAnswer(\''+esc(q.id)+'\')">📤 إرسال الإجابة</button></div></div>'});
      html+='</div>';
    });
    root.innerHTML=html;
  }
  function renderLeader(){
    if(state.role!=='leader')return;
    var box=document.getElementById('leader-training-center');if(!box)return;
    var old=document.getElementById('dxn-training-answer-center');if(old)old.remove();
    var wrap=document.createElement('div');wrap.id='dxn-training-answer-center';wrap.className='card';wrap.style.cssText='margin-top:14px;border:2px solid #d8d2ef;background:linear-gradient(135deg,#fbfaff,#fff);direction:rtl;text-align:right';
    var rows=state.all_answers||[];var pending=rows.filter(function(x){return x.status==='pending'}).length;var approved=rows.filter(function(x){return x.status==='approved'}).length;
    var html='<div class="title">🧠 متابعة اختبارات التدريبات</div><p class="muted">هنا تظهر إجابات الأعضاء باسم المتدرب، مع التدريب والسؤال والحالة والدرجة. المراجعة منفصلة عن الأسئلة الشهرية.</p><div class="mini-grid"><div><b>📨 إجمالي الإجابات</b><div style="font-size:20px;font-weight:900">'+rows.length+'</div></div><div><b>⏳ بانتظار المراجعة</b><div style="font-size:20px;font-weight:900">'+pending+'</div></div><div><b>✅ معتمدة</b><div style="font-size:20px;font-weight:900">'+approved+'</div></div></div>';
    if(!rows.length)html+='<div class="empty" style="margin-top:12px">لا توجد إجابات حتى الآن.</div>';
    else rows.forEach(function(x){html+='<div class="challenge" style="margin-top:10px"><div class="row"><div><b>👤 '+esc(x.member_name||'عضو')+'</b><div class="muted">🪪 '+esc(x.member_no||'')+' · التدريب '+esc(x.lesson_no)+' · السؤال '+esc(x.question_no)+'</div></div><b>'+esc(x.status)+'</b></div><div style="margin-top:8px"><b>السؤال:</b> '+esc(x.question)+'</div><div style="margin-top:8px;background:#f7f7f7;padding:10px;border-radius:10px;white-space:pre-wrap"><b>إجابة العضو:</b>\n'+esc(x.answer)+'</div><div class="row" style="margin-top:9px"><input id="score-'+x.id+'" type="number" min="0" max="100" value="'+Number(x.score||0)+'" placeholder="الدرجة" style="width:90px"><input id="note-'+x.id+'" type="text" value="'+esc(x.reviewer_note||'')+'" placeholder="ملاحظة مختصرة للقائد" style="flex:1"><button class="primary" type="button" onclick="reviewTrainingAnswer(\''+esc(x.id)+'\',\'approved\')">✅ اعتماد</button><button type="button" onclick="reviewTrainingAnswer(\''+esc(x.id)+'\',\'retry\')">🔁 إعادة</button></div></div>'});
    wrap.innerHTML=html;box.appendChild(wrap);
  }
  async function load(){var t=token();if(!t)return;try{var d=await rpc('training_assessment_bootstrap',{p_token:t});state=d||state;state.loaded=true;renderMember();renderLeader()}catch(e){console.error('training assessment',e)}}
  window.submitTrainingAnswer=async function(qid){var el=document.querySelector('[data-assessment-q="'+String(qid).replace(/"/g,'\\"')+'"]');var value=el?String(el.value||'').trim():'';if(value.length<2){alert('اكتب إجابة قبل الإرسال.');return}try{await rpc('submit_training_answer',{p_token:token(),p_question_id:qid,p_answer:value,p_attempt_no:1});await load();alert('تم إرسال الإجابة للمراجعة.')}catch(e){alert('تعذر إرسال الإجابة: '+e.message)}};
  window.reviewTrainingAnswer=async function(id,status){var s=document.getElementById('score-'+id),n=document.getElementById('note-'+id);var score=Math.max(0,Math.min(100,Number(s&&s.value||0)));var note=String(n&&n.value||'');try{await rpc('review_training_answer',{p_token:token(),p_answer_id:id,p_status:status,p_score:score,p_note:note});await load();}catch(e){alert('تعذر حفظ المراجعة: '+e.message)}};
  function start(){var tries=0,t=setInterval(function(){if(token()){load();clearInterval(t)}else if(++tries>300)clearInterval(t)},100);var mo=new MutationObserver(function(){if(state.loaded){if(state.role==='member')renderMember();if(state.role==='leader')renderLeader()}});mo.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
