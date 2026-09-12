/* V86.44.7 — إدارة أسئلة اختبارات التدريبات للقائد */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_V86447__) return;
  window.__DXN_TRAINING_QUESTION_ADMIN_V86447__=true;

  var state={loaded:false,loading:false,questions:[],lesson:1,saving:{}};
  function token(){return localStorage.getItem('dxn_session')||''}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  async function rpc(fn,args){
    var r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    var text=await r.text(),data=null;try{data=text?JSON.parse(text):null}catch(e){}
    if(!r.ok)throw new Error((data&&(data.message||data.error))||text||('HTTP '+r.status));
    return data;
  }
  function lessons(){
    var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];
    ls=ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)});
    if(ls.length)return ls;
    return [1,2,3,4,5,6,7,8].map(function(n){return {lesson_no:n,title:'التدريب '+n}});
  }
  function lessonTitle(no){var x=lessons().find(function(l){return Number(l.lesson_no)===Number(no)});return x?String(x.title||x.lesson_title||('التدريب '+no)):('التدريب '+no)}
  function root(){return document.getElementById('dxn-training-question-admin')}

  async function load(force){
    if(!token()||state.loading)return;
    state.loading=true;
    try{
      var d=await rpc('training_questions_admin',{p_token:token()});
      state.questions=d&&Array.isArray(d.questions)?d.questions:[];
      state.loaded=true;
      render(!!force);
    }catch(e){console.error('V86.44.7 training question admin',e)}
    finally{state.loading=false}
  }

  function render(force){
    var center=document.getElementById('leader-training-center');
    if(!center)return;
    var old=root();
    if(old&&!force){if(document.body.contains(old))return;old=null}
    if(old)old.remove();

    var wrap=document.createElement('section');
    wrap.id='dxn-training-question-admin';
    wrap.className='card';
    wrap.style.cssText='margin-top:14px;border:2px solid #d8d2ef;background:linear-gradient(135deg,#fbfaff,#fff);direction:rtl;text-align:right';

    var buttons='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">';
    lessons().forEach(function(l){
      var no=Number(l.lesson_no);
      buttons+='<button type="button" data-admin-lesson="'+no+'" style="'+(no===state.lesson?'background:var(--green);color:#fff':'')+'">📚 '+no+'</button>';
    });
    buttons+='</div>';

    var qs=state.questions.filter(function(q){return Number(q.lesson_no)===Number(state.lesson)}).sort(function(a,b){return Number(a.question_no)-Number(b.question_no)});
    var html='<div class="title">⚙️ إدارة أسئلة اختبارات التدريبات</div>'+
      '<p class="muted" style="line-height:1.8;margin:6px 0">من هنا يستطيع القائد تعديل الأسئلة يدويًا قبل أن يجيب عنها الأعضاء. يمكنك تعديل نص السؤال، الإجابة النموذجية، معيار التقييم، الدرجة، أو إغلاق السؤال.</p>'+
      '<div class="progress-grid">'+
      '<div class="progress-stat"><span class="muted">📚 التدريب الحالي</span><b>'+Number(state.lesson)+'</b></div>'+
      '<div class="progress-stat"><span class="muted">📝 الأسئلة</span><b>'+qs.length+'/10</b></div>'+
      '<div class="progress-stat"><span class="muted">🟢 المفعلة</span><b>'+qs.filter(function(q){return q.active!==false}).length+'</b></div>'+
      '<div class="progress-stat"><span class="muted">📦 إجمالي الأسئلة</span><b>'+state.questions.length+'</b></div></div>'+buttons;

    if(!qs.length){html+='<div class="empty" style="margin-top:12px">لا توجد أسئلة لهذا التدريب.</div>'}
    qs.forEach(function(q){
      var id=String(q.id),saving=!!state.saving[id];
      html+='<div class="challenge" style="margin-top:12px;background:#fff;border-color:#d8d2ef">'+
        '<div class="row" style="padding-top:0"><div><b>السؤال '+Number(q.question_no)+'</b><div class="muted">التدريب '+Number(q.lesson_no)+' · '+esc(lessonTitle(q.lesson_no))+'</div></div><span class="badge">'+(q.active!==false?'🟢 مفعّل':'🔒 مغلق')+'</span></div>'+
        '<label style="display:block;font-weight:900;margin-top:12px">نص السؤال</label>'+
        '<textarea id="tqa-q-'+esc(id)+'" rows="3" style="width:100%;box-sizing:border-box">'+esc(q.question)+'</textarea>'+
        '<label style="display:block;font-weight:900;margin-top:6px">الإجابة النموذجية <span class="muted">(يراها القائد فقط)</span></label>'+
        '<textarea id="tqa-a-'+esc(id)+'" rows="3" style="width:100%;box-sizing:border-box">'+esc(q.model_answer||'')+'</textarea>'+
        '<label style="display:block;font-weight:900;margin-top:6px">معيار التقييم</label>'+
        '<textarea id="tqa-r-'+esc(id)+'" rows="2" style="width:100%;box-sizing:border-box">'+esc(q.rubric||'')+'</textarea>'+
        '<div class="row" style="margin-top:6px;align-items:end"><div style="width:120px"><label style="font-weight:900">الدرجة</label><input id="tqa-p-'+esc(id)+'" type="number" min="1" max="100" value="'+Number(q.points||100)+'"></div><label style="display:flex;align-items:center;gap:8px;font-weight:900;padding-bottom:12px"><input id="tqa-active-'+esc(id)+'" type="checkbox" '+(q.active!==false?'checked':'')+' style="width:auto;margin:0"> السؤال مفعّل</label><button class="primary" type="button" '+(saving?'disabled':'')+' onclick="saveTrainingQuestion(\''+esc(id)+'\')">'+(saving?'⏳ جارٍ الحفظ...':'💾 حفظ التعديل')+'</button></div>'+
        '</div>';
    });

    wrap.innerHTML=html;
    center.appendChild(wrap);
    wrap.querySelectorAll('[data-admin-lesson]').forEach(function(btn){btn.addEventListener('click',function(){state.lesson=Number(btn.getAttribute('data-admin-lesson'));render(true)})});
  }

  window.saveTrainingQuestion=async function(id){
    var q=document.getElementById('tqa-q-'+id),a=document.getElementById('tqa-a-'+id),r=document.getElementById('tqa-r-'+id),p=document.getElementById('tqa-p-'+id),ac=document.getElementById('tqa-active-'+id);
    if(!q||String(q.value||'').trim().length<5){alert('اكتب سؤالًا واضحًا قبل الحفظ.');return}
    var payload={p_token:token(),p_question_id:id,p_question:String(q.value||'').trim(),p_model_answer:String(a&&a.value||'').trim(),p_rubric:String(r&&r.value||'').trim(),p_points:Math.max(1,Math.min(100,Number(p&&p.value||100))),p_active:!!(ac&&ac.checked)};
    state.saving[id]=true;render(true);
    try{
      await rpc('update_training_question',payload);
      state.saving[id]=false;
      await load(true);
      alert('تم حفظ تعديل السؤال بنجاح.');
    }catch(e){state.saving[id]=false;render(true);alert('تعذر حفظ السؤال: '+e.message)}
  };

  function ensure(){
    var center=document.getElementById('leader-training-center');
    if(!center)return;
    if(!state.loaded)load(false); else if(!root())render(false);
  }
  var tries=0;
  var timer=setInterval(function(){ensure();if(++tries>240)clearInterval(timer)},500);
  new MutationObserver(function(){ensure()}).observe(document.body,{childList:true,subtree:true});
})();
