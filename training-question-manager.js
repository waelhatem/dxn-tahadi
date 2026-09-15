/* V86.46.21 — leader-only per-training question manager */
(function(){
  if(window.__DXN_TRAINING_QUESTION_MANAGER_V864621__)return;
  window.__DXN_TRAINING_QUESTION_MANAGER_V864621__=true;

  var state={questions:[],lesson:1,loading:false,saving:false,open:false};
  var LESSONS=[1,2,3,4,5,6,7,8];

  function isLeader(){
    try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader'}catch(e){return false}
  }
  function token(){try{return String(localStorage.getItem('dxn_session')||'')}catch(e){return ''}}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  function lessonTitle(no){
    try{
      if(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons)){
        var l=trainingData.lessons.find(function(x){return Number(x.lesson_no)===Number(no)});
        if(l)return String(l.title||l.lesson_title||('التدريب '+no));
      }
    }catch(e){}
    return 'التدريب '+no;
  }
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.message||d.error))||t||('HTTP '+r.status));
    return d;
  }
  function style(){
    if(document.getElementById('dxn-tqm-style-864621'))return;
    var s=document.createElement('style');s.id='dxn-tqm-style-864621';
    s.textContent=''
      +'.dxn-training-manage-btn{background:#f1f7f4!important;color:var(--green)!important;border:1px solid #c9ded5!important;font-weight:950!important}'
      +'.dxn-training-manage-modal{position:fixed;inset:0;z-index:100000;background:#102a2288;display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl}'
      +'.dxn-training-manage-panel{width:min(1080px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 20px 60px #0004;border:1px solid var(--line)}'
      +'.dxn-training-manage-head{position:sticky;top:0;z-index:3;background:linear-gradient(135deg,#f7fbf9,#fff);border-bottom:1px solid var(--line);padding:16px}'
      +'.dxn-training-manage-lessons{display:flex;gap:8px;flex-wrap:wrap;padding:12px;border-bottom:1px solid var(--line);background:#fbfdfc}'
      +'.dxn-training-manage-lesson{min-width:150px;background:#fff;border:1px solid var(--line);font-weight:950}'
      +'.dxn-training-manage-lesson.active{background:var(--green)!important;color:#fff!important;border-color:var(--green)!important}'
      +'.dxn-training-question-card{margin:12px;padding:15px;border:1px solid #eadcb0;border-radius:18px;background:#fffdf5}'
      +'.dxn-training-question-tools{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}'
      +'.dxn-training-question-tools .danger{background:#fee4e2!important;color:#9f2118!important}'
      +'.dxn-training-question-tools .ideal{background:#fff4d5!important;color:#7a5300!important}'
      +'.dxn-training-question-editor{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}'
      +'.dxn-training-question-card.inactive{opacity:.7;background:#f7f7f7}'
      +'@media(max-width:700px){.dxn-training-manage-lesson{flex:1 1 140px;min-width:0}.dxn-training-question-card{margin:9px;padding:12px}}';
    document.head.appendChild(s);
  }
  function findTrainingCards(){
    var out=[];
    document.querySelectorAll('#section-training .card,#leader-training-center .card,.card').forEach(function(card){
      var watch=Array.prototype.slice.call(card.querySelectorAll('button')).find(function(b){return /إعادة المشاهدة/.test(String(b.textContent||''))});
      if(!watch)return;
      var txt=String(card.textContent||'').replace(/\s+/g,' ').trim();
      var m=txt.match(/التدريب\s*(\d+)/);
      if(!m)return;
      out.push({card:card,watch:watch,lessonNo:Number(m[1])});
    });
    return out;
  }
  function attachButtons(){
    if(!isLeader())return;
    style();
    findTrainingCards().forEach(function(x){
      if(x.card.querySelector('.dxn-training-manage-btn'))return;
      var b=document.createElement('button');b.type='button';b.className='dxn-training-manage-btn';b.textContent='⚙️ إدارة اسئلة التدريبات';
      b.title='إدارة أسئلة هذا التدريب فقط';
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openManager(x.lessonNo)},false);
      var host=x.watch.parentElement;
      if(host){host.insertBefore(b,x.watch.nextSibling)}else if(x.watch.parentNode){x.watch.parentNode.appendChild(b)}
    });
  }
  function openManager(lessonNo){
    if(!isLeader())return;
    state.lesson=Number(lessonNo)||1;state.open=true;style();renderModal();loadQuestions();
  }
  function closeManager(){state.open=false;var m=document.getElementById('dxn-training-manage-modal');if(m)m.remove()}
  window.__DXN_OPEN_TRAINING_QUESTION_MANAGER__=openManager;
  function renderModal(){
    var old=document.getElementById('dxn-training-manage-modal');if(old)old.remove();
    var m=document.createElement('div');m.id='dxn-training-manage-modal';m.className='dxn-training-manage-modal';
    m.innerHTML='<div class="dxn-training-manage-panel">'
      +'<div class="dxn-training-manage-head"><div class="row" style="border:0;padding:0"><div><div class="title">⚙️ إدارة اسئلة التدريبات</div><div class="muted">القائد فقط — اختر التدريب ثم أدِر أسئلته بالكامل</div></div><button type="button" id="dxn-tqm-close">✕ إغلاق</button></div></div>'
      +'<div class="dxn-training-manage-lessons" id="dxn-tqm-lessons"></div>'
      +'<div style="padding:0 12px 18px"><div class="muted" style="padding:12px 2px 2px">'+esc(lessonTitle(state.lesson))+'</div><div id="dxn-tqm-body">⏳ جارٍ تحميل الأسئلة...</div></div>'
      +'</div>';
    document.body.appendChild(m);
    m.addEventListener('click',function(e){if(e.target===m)closeManager()});
    m.querySelector('#dxn-tqm-close').onclick=closeManager;
    var tabs=m.querySelector('#dxn-tqm-lessons');
    LESSONS.forEach(function(no){
      var b=document.createElement('button');b.type='button';b.className='dxn-training-manage-lesson '+(no===state.lesson?'active':'');b.textContent='📚 اسئلة التدريب '+numberWord(no);b.addEventListener('click',function(){state.lesson=no;renderModal();loadQuestions()});tabs.appendChild(b);
    });
  }
  function numberWord(n){return ({1:'الأول',2:'الثاني',3:'الثالث',4:'الرابع',5:'الخامس',6:'السادس',7:'السابع',8:'الثامن'})[n]||String(n)}
  async function loadQuestions(){
    var body=document.getElementById('dxn-tqm-body');if(!body)return;
    body.innerHTML='<div class="empty">⏳ جارٍ تحميل أسئلة التدريب...</div>';
    try{
      var d=await rpc('training_questions_admin',{p_token:token()});
      state.questions=(d&&Array.isArray(d.questions)?d.questions:[]).filter(function(q){return Number(q.lesson_no)===Number(state.lesson)}).sort(function(a,b){return Number(a.question_no)-Number(b.question_no)});
      renderQuestions();
    }catch(e){body.innerHTML='<div style="padding:14px;border:1px solid #e5a19a;border-radius:14px;background:#fff7f6;color:#8a1c13">تعذر تحميل الأسئلة: '+esc(e.message||e)+'</div>'}
  }
  function renderQuestions(){
    var body=document.getElementById('dxn-tqm-body');if(!body)return;
    if(!state.questions.length){body.innerHTML='<div class="empty">لا توجد أسئلة لهذا التدريب.</div>';return}
    var html='';
    state.questions.forEach(function(q){
      var id=String(q.id),inactive=q.active===false;
      html+='<article class="dxn-training-question-card '+(inactive?'inactive':'')+'" data-q-card="'+esc(id)+'">'
        +'<div class="row" style="border:0;padding:0"><div style="min-width:0"><div style="font-size:18px;font-weight:950">السؤال '+Number(q.question_no)+'</div><div class="muted">'+(inactive?'🔒 غير مفعّل':'🟢 مفعّل')+' · الدرجة '+Number(q.points||100)+'</div></div>'
        +'<div class="dxn-training-question-tools"><button type="button" data-edit="'+esc(id)+'">✏️ تعديل</button><button type="button" class="ideal" data-ideal="'+esc(id)+'">✨ اعتماد جواب مثالي</button><button type="button" class="danger" data-delete="'+esc(id)+'">'+(inactive?'🔄 إعادة تفعيل':'🗑️ حذف السؤال')+'</button></div></div>'
        +'<div style="margin-top:10px;line-height:1.85"><b>السؤال:</b><div>'+esc(q.question)+'</div></div>'
        +'<div style="margin-top:8px;line-height:1.85"><b>الجواب المثالي:</b><div class="answer" data-answer-view="'+esc(id)+'">'+esc(q.model_answer||'لم يتم اعتماد جواب مثالي بعد.')+'</div></div>'
        +'<div style="margin-top:8px;line-height:1.85"><b>معيار التقييم:</b><div class="muted">'+esc(q.rubric||'')+'</div></div>'
        +'<div class="dxn-training-question-editor" id="dxn-tqm-editor-'+esc(id)+'" style="display:none"></div>'
        +'</article>';
    });
    body.innerHTML=html;
    body.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){toggleEditor(String(b.dataset.edit))}});
    body.querySelectorAll('[data-ideal]').forEach(function(b){b.onclick=function(){generateIdeal(String(b.dataset.ideal),b)}});
    body.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){toggleQuestion(String(b.dataset.delete),b)}});
  }
  function getQ(id){return state.questions.find(function(q){return String(q.id)===String(id)})}
  function toggleEditor(id){
    var q=getQ(id),host=document.getElementById('dxn-tqm-editor-'+id);if(!q||!host)return;
    if(host.style.display!=='none'){host.style.display='none';host.innerHTML='';return}
    host.style.display='block';host.innerHTML='<label style="font-weight:900">نص السؤال</label><textarea id="tqm-q-'+esc(id)+'" rows="3">'+esc(q.question)+'</textarea>'
      +'<label style="font-weight:900">الإجابة النموذجية</label><textarea id="tqm-a-'+esc(id)+'" rows="4">'+esc(q.model_answer||'')+'</textarea>'
      +'<label style="font-weight:900">معيار التقييم</label><textarea id="tqm-r-'+esc(id)+'" rows="3">'+esc(q.rubric||'')+'</textarea>'
      +'<div class="row" style="align-items:end"><div style="width:120px"><label style="font-weight:900">الدرجة</label><input id="tqm-p-'+esc(id)+'" type="number" min="1" max="100" value="'+Number(q.points||100)+'"></div>'
      +'<div><label style="display:flex;align-items:center;gap:8px;font-weight:900"><input id="tqm-active-'+esc(id)+'" type="checkbox" '+(q.active!==false?'checked':'')+' style="width:auto;margin:0"> مفعّل</label></div>'
      +'<div class="dxn-training-question-tools"><button type="button" class="primary" data-save="'+esc(id)+'">💾 حفظ</button><button type="button" data-cancel-editor="'+esc(id)+'">إلغاء</button></div></div>';
    host.querySelector('[data-save]').onclick=function(){saveQuestion(id)};
    host.querySelector('[data-cancel-editor]').onclick=function(){toggleEditor(id)};
  }
  async function saveQuestion(id){
    if(state.saving)return;var q=getQ(id);if(!q)return;
    var qe=document.getElementById('tqm-q-'+id),ae=document.getElementById('tqm-a-'+id),re=document.getElementById('tqm-r-'+id),pe=document.getElementById('tqm-p-'+id),ac=document.getElementById('tqm-active-'+id);
    if(!qe||String(qe.value||'').trim().length<5){alert('اكتب سؤالًا واضحًا قبل الحفظ.');return}
    state.saving=true;
    try{
      var saved=await rpc('update_training_question',{p_token:token(),p_question_id:id,p_question:String(qe.value||'').trim(),p_model_answer:String(ae&&ae.value||'').trim(),p_rubric:String(re&&re.value||'').trim(),p_points:Math.max(1,Math.min(100,Number(pe&&pe.value||100))),p_active:!!(ac&&ac.checked)});
      if(saved&&saved.question){q.question=saved.question.question;q.model_answer=saved.question.model_answer;q.rubric=saved.question.rubric;q.points=saved.question.points;q.active=saved.question.active}
      renderQuestions();alert('تم حفظ التعديل بنجاح.');
    }catch(e){alert('تعذر حفظ التعديل: '+(e.message||e))}finally{state.saving=false}
  }
  async function generateIdeal(id,btn){
    var q=getQ(id);if(!q)return;
    if(!confirm('توليد جواب مثالي لهذا السؤال واعتماده بدل الجواب الحالي؟'))return;
    try{
      btn.disabled=true;btn.textContent='⏳ جارٍ التوليد...';
      var r=await fetch('/api/generate-training-answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token(),question_id:id}),cache:'no-store'});
      var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
      if(!r.ok)throw new Error((d&&(d.message||d.error))||t||('HTTP '+r.status));
      if(!d||d.ok!==true||!d.question)throw new Error('لم يؤكد الخادم اعتماد الجواب المثالي.');
      q.question=d.question.question;q.model_answer=d.question.model_answer;q.rubric=d.question.rubric;q.points=d.question.points;q.active=d.question.active;
      renderQuestions();
      alert('تم توليد الجواب المثالي واعتماده بنجاح.');
    }catch(e){alert('تعذر توليد الجواب المثالي: '+(e.message||e))}finally{btn.disabled=false;btn.textContent='✨ اعتماد جواب مثالي'}
  }
  async function toggleQuestion(id,btn){
    var q=getQ(id);if(!q)return;
    var turningOn=q.active===false;
    if(!turningOn&&!confirm('حذف هذا السؤال من الاختبار؟\nسيتم تعطيله فقط مع الحفاظ على النتائج التاريخية.'))return;
    try{
      btn.disabled=true;btn.textContent='⏳ جارٍ التنفيذ...';
      var d=await rpc('update_training_question',{p_token:token(),p_question_id:id,p_question:String(q.question||''),p_model_answer:String(q.model_answer||''),p_rubric:String(q.rubric||''),p_points:Number(q.points||100),p_active:turningOn});
      if(d&&d.question){q.active=d.question.active}
      renderQuestions();
      alert(turningOn?'تمت إعادة تفعيل السؤال.':'تم حذف السؤال من الاختبار مع الحفاظ على النتائج السابقة.');
    }catch(e){alert('تعذر تنفيذ العملية: '+(e.message||e))}finally{btn.disabled=false}
  }
  function boot(){
    if(!isLeader())return;
    style();attachButtons();
    try{new MutationObserver(function(){attachButtons()}).observe(document.body,{childList:true,subtree:true})}catch(e){}
    setInterval(attachButtons,1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();