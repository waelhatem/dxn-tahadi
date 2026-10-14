/* Leader-only editor for basic training revisions. Never exposes answer keys to member sessions. */
(function(){
'use strict';
if(window.basicTrainingAdminPage)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={training:1,data:null,busy:false};
async function call(action,payload){
 const token=String(localStorage.getItem('dxn_session')||'').trim();
 if(!token)throw Error('سجل الدخول أولاً');
 const response=await fetch('/api/rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({fn:'basic_training_admin_revision',args:{p_token:token,p_training_no:state.training,p_action:action,p_payload:payload||null}})});
 const d=await response.json();
 if(!response.ok||d?.error)throw Error(d?.error||'تعذر تنفيذ الطلب');
 return d;
}
function renderEditor(){
 const root=document.getElementById('basicTrainingAdminBody');if(!root||!state.data)return;
 const d=state.data;
 root.innerHTML='<div class="card" style="padding:14px;background:#f8fbf8"><p><b>الإصدار:</b> '+d.revision+' · <b>الحالة:</b> '+(d.status==='draft'?'مسودة غير منشورة':'منشور')+'</p>'+
 '<label>عنوان التدريب<input id="btaTitle" style="width:100%" value="'+esc(d.title)+'"></label>'+
 '<label>معرّف فيديو YouTube (11 حرفًا)<input id="btaVideo" style="width:100%" value="'+esc(d.video_id)+'"></label>'+
 '<label>مدة الفيديو بالثواني<input id="btaDuration" type="number" min="60" max="14400" value="'+Number(d.expected_duration_seconds)+'"></label></div>'+
 '<h3>تعديل الأسئلة — سؤالًا سؤالًا</h3>'+
 d.questions.map((q,i)=>'<details class="card" style="padding:12px;margin:8px 0"><summary style="cursor:pointer"><b>السؤال '+(i+1)+':</b> '+esc(q.question).slice(0,90)+'</summary>'+
 '<label>نص السؤال<textarea data-bta-question="'+i+'" style="width:100%;min-height:65px">'+esc(q.question)+'</textarea></label>'+
 q.options.map((o,j)=>'<label>الخيار '+(j+1)+'<input style="width:100%" data-bta-opt="'+i+'-'+j+'" value="'+esc(o)+'"></label>').join('')+
 '<label>الإجابة الصحيحة<select data-bta-answer="'+i+'">'+[0,1,2].map(j=>'<option value="'+j+'" '+(j===q.correct_index?'selected':'')+'>الخيار '+(j+1)+'</option>').join('')+'</select></label></details>').join('')+
 '<p class="muted">الحفظ ينشئ مسودة. لن تتغير اختبارات الأعضاء إلا بعد الضغط على «نشر النسخة».</p>'+
 '<div class="row"><button class="primary" type="button" onclick="basicTrainingAdminSave()">💾 حفظ المسودة</button>'+
 '<button type="button" onclick="basicTrainingAdminPublish()">✅ نشر النسخة</button></div>';
}
function collect(){
 const d=state.data;
 return {title:document.getElementById('btaTitle').value.trim(),
 video_id:document.getElementById('btaVideo').value.trim(),
 expected_duration_seconds:Number(document.getElementById('btaDuration').value),
 questions:d.questions.map((q,i)=>({no:i+1,question:document.querySelector('[data-bta-question="'+i+'"]').value.trim(),
 options:[0,1,2].map(j=>document.querySelector('[data-bta-opt="'+i+'-'+j+'"]').value.trim()),
 correct_index:Number(document.querySelector('[data-bta-answer="'+i+'"]').value)}))};
}
window.basicTrainingAdminPage=()=>'<section class="card" dir="rtl" style="max-width:980px;margin:16px auto;padding:20px;text-align:right">'+
 '<h2>⚙️ إدارة التدريبات الأساسية — حساب القائد</h2><p class="muted">تعديل الفيديو والاختبارات مع حفظ إصدارات منفصلة وحماية نتائج الأعضاء السابقة.</p>'+
 '<label>اختر التدريب <select id="btaTraining" onchange="basicTrainingAdminLoad(this.value)">'+Array.from({length:8},(_,i)=>'<option value="'+(i+1)+'">التدريب الأساسي '+(i+1)+'</option>').join('')+'</select></label>'+
 '<div id="basicTrainingAdminBody" style="margin-top:14px">اختر التدريب لتحميل إعداداته.</div></section>';
window.basicTrainingAdminLoad=async n=>{
 if(typeof role==='undefined'||role!=='leader')return;
 state.training=Number(n)||1;state.data=null;
 const root=document.getElementById('basicTrainingAdminBody');if(!root)return;
 root.textContent='جارٍ تحميل النسخة الحالية...';
 try{state.data=await call('get');renderEditor();}
 catch(e){root.textContent='تعذر تحميل محرر التدريبات: '+(e.message||e);}
};
window.basicTrainingAdminSave=async()=>{
 if(state.busy||!state.data)return;state.busy=true;
 try{state.data=await call('save',collect());renderEditor();alert('حُفظت المسودة دون نشرها للأعضاء.');}
 catch(e){alert('تعذر الحفظ: '+(e.message||e));}finally{state.busy=false;}
};
window.basicTrainingAdminPublish=async()=>{
 if(state.busy||!state.data)return;
 if(state.data.status!=='draft'){alert('احفظ مسودة أولًا ثم انشرها.');return;}
 if(!confirm('نشر الإصدار الجديد؟ تبقى نتائج الأعضاء السابقة معتمدة.'))return;
 state.busy=true;
 try{state.data=await call('publish');renderEditor();alert('نُشرت النسخة الجديدة.');}
 catch(e){alert('تعذر النشر: '+(e.message||e));}finally{state.busy=false;}
};
})();
