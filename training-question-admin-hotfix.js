/* V86.46.8 — direct leader question editor, independent of training_questions_admin load */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86468__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_HOTFIX_V86468__=true;
  function leader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-center-button') || !!document.getElementById('dxn-training-question-admin-tab');
  }
  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var text=await r.text(),data=null;try{data=text?JSON.parse(text):null}catch(e){}
    if(!r.ok)throw new Error((data&&(data.message||data.error))||text||('HTTP '+r.status));
    return data;
  }
  function panel(){return document.getElementById('dxn-training-question-admin-direct-panel')}
  function removeOld(){var p=panel();if(p)p.remove()}
  function lessonTitle(no){
    try{
      var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons:[];
      var x=ls.find(function(l){return Number(l.lesson_no)===Number(no)});
      return x?String(x.title||x.lesson_title||('التدريب '+no)):('التدريب '+no);
    }catch(e){return 'التدريب '+no}
  }
  function renderShell(body){
    removeOld();
    var p=document.createElement('section');p.id='dxn-training-question-admin-direct-panel';p.className='card';
    p.style.cssText='margin:14px 0;border:2px solid #d8d2ef;background:linear-gradient(135deg,#fbfaff,#fff);direction:rtl;text-align:right;position:relative;z-index:9999';
    p.innerHTML='<div class="row"><div><div class="title">⚙️ تعديل أسئلة اختبارات التدريبات</div><div class="muted">إدارة القائد فقط</div></div><button type="button" id="dxn-tqa-direct-close">✕ إغلاق</button></div><div id="dxn-tqa-direct-body" style="line-height:1.8">'+body+'</div>';
    var c=document.getElementById('leader-training-center')||document.querySelector('.app')||document.body;c.appendChild(p);
    var close=document.getElementById('dxn-tqa-direct-close');if(close)close.onclick=removeOld;return p;
  }
  async function loadQuestions(){
    var t=token();if(!t)throw new Error('جلسة القائد غير موجودة. أعد تسجيل الدخول.');
    try{var d=await rpc('training_assessment_bootstrap',{p_token:t});var qs=d&&Array.isArray(d.questions)?d.questions:[];if(qs.length)return qs}catch(e){}
    var a=await rpc('training_questions_admin',{p_token:t});return a&&Array.isArray(a.questions)?a.questions:[];
  }
  function renderQuestions(qs){
    var p=panel();if(!p)return;var body=p.querySelector('#dxn-tqa-direct-body');if(!body)return;
    qs=(qs||[]).slice().sort(function(a,b){return Number(a.lesson_no)-Number(b.lesson_no)||Number(a.question_no)-Number(b.question_no)});
    var by={};qs.forEach(function(q){(by[q.lesson_no]||(by[q.lesson_no]=[])).push(q)});
    var lessons=Object.keys(by).sort(function(a,b){return Number(a)-Number(b)});
    if(!qs.length){body.innerHTML='<div class="empty">لا توجد أسئلة متاحة حاليًا في قاعدة البيانات.</div>';return}
    var html='<p class="muted">يمكنك تعديل نص السؤال، الإجابة النموذجية، معيار التقييم، الدرجة، وتفعيل السؤال. الحفظ يتم مباشرة في قاعدة البيانات.</p>';
    lessons.forEach(function(no){
      html+='<details class="card" open style="margin-top:12px;background:#fff"><summary style="cursor:pointer;font-weight:950">📚 التدريب '+esc(no)+' — '+esc(lessonTitle(no))+' ('+by[no].length+' أسئلة)</summary>';
      by[no].forEach(function(q){
        var id=String(q.id);
        html+='<div class="challenge" style="margin-top:10px;background:#fffdf5"><div class="row" style="padding-top:0"><div><b>السؤال '+Number(q.question_no)+'</b><div class="muted">التدريب '+esc(q.lesson_no)+'</div></div><span class="badge">'+(q.active===false?'🔒 مغلق':'🟢 مفعّل')+'</span></div>'+ 
          '<label style="display:block;font-weight:900;margin-top:10px">نص السؤال</label><textarea data-q="'+esc(id)+'" data-f="question" rows="3">'+esc(q.question)+'</textarea>'+ 
          '<label style="display:block;font-weight:900;margin-top:4px">الإجابة النموذجية</label><textarea data-q="'+esc(id)+'" data-f="model_answer" rows="3">'+esc(q.model_answer||'')+'</textarea>'+ 
          '<label style="display:block;font-weight:900;margin-top:4px">معيار التقييم</label><textarea data-q="'+esc(id)+'" data-f="rubric" rows="2">'+esc(q.rubric||'')+'</textarea>'+ 
          '<div class="row" style="align-items:end;margin-top:4px"><div style="width:120px"><label style="font-weight:900">الدرجة</label><input data-q="'+esc(id)+'" data-f="points" type="number" min="1" max="100" value="'+Number(q.points||100)+'"></div><label style="display:flex;align-items:center;gap:8px;padding-bottom:11px;font-weight:900"><input data-q="'+esc(id)+'" data-f="active" type="checkbox" '+(q.active!==false?'checked':'')+' style="width:auto;margin:0"> مفعّل</label><button class="primary" type="button" data-save-q="'+esc(id)+'">💾 حفظ التعديل</button></div></div>';
      });
      html+='</details>';
    });
    body.innerHTML=html;body.querySelectorAll('[data-save-q]').forEach(function(btn){btn.addEventListener('click',function(){saveQuestion(btn.getAttribute('data-save-q'),btn)})});
  }
  async function saveQuestion(id,btn){
    var fields=document.querySelectorAll('[data-q="'+String(id).replace(/"/g,'\\"')+'"]'),v={};fields.forEach(function(x){v[x.getAttribute('data-f')]=x.type==='checkbox'?!!x.checked:String(x.value||'').trim()});
    var payload={p_token:token(),p_question_id:id,p_question:String(v.question||''),p_model_answer:String(v.model_answer||''),p_rubric:String(v.rubric||''),p_points:Math.max(1,Math.min(100,Number(v.points||100))),p_active:!!v.active};
    if(payload.p_question.length<5){alert('نص السؤال قصير جدًا.');return}
    btn.disabled=true;btn.textContent='⏳ جارٍ الحفظ...';
    try{await rpc('update_training_question',payload);btn.textContent='✅ تم الحفظ';btn.disabled=false}catch(e){btn.disabled=false;btn.textContent='💾 حفظ التعديل';alert('تعذر حفظ السؤال: '+e.message+'\n\nيجب تطبيق Migration إدارة أسئلة الاختبارات في قاعدة البيانات.')}
  }
  async function open(){
    if(!leader())return false;
    renderShell('<div style="padding:18px;text-align:center">⏳ جارٍ تحميل أسئلة الاختبارات...</div>');
    try{renderQuestions(await loadQuestions())}catch(e){var p=panel(),b=p&&p.querySelector('#dxn-tqa-direct-body');if(b)b.innerHTML='<div class="challenge" style="border-color:#e5a19a;background:#fff7f6"><b>⚠️ تعذر تحميل أسئلة الاختبارات</b><div style="margin-top:8px;white-space:pre-wrap">'+esc(e.message||String(e))+'</div><div class="muted" style="margin-top:8px">الواجهة تعمل، لكن بيانات أسئلة الاختبارات تحتاج استكمال إعداد قاعدة البيانات.</div></div>'}
    return true;
  }
  window.openTrainingQuestionAdmin=open;window.__DXN_OPEN_TRAINING_QUESTION_ADMIN__=open;
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b||!leader())return;var t=String(b.textContent||'').replace(/\s+/g,' ').trim();
    if(t.indexOf('تعديل أسئلة اختبارات التدريبات')===-1&&t.indexOf('تعديل أسئلة الاختبارات')===-1)return;
    e.preventDefault();e.stopImmediatePropagation();open();
  },true);
})();
