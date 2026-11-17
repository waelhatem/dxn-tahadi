/* Member-owned mentor tracking: read-only views of trainees' authentic 3-track records.
 * No trainee progress or score is written by this module.
 */
(function(){
 'use strict';
 if(window.trainingMentorRosterHtml)return;
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>String(localStorage.getItem('dxn_session')||'').trim();
 const state={lookupTimer:null,lookupSeq:0,verifiedNo:'',selected:'',fetchSeq:0};
 const el=id=>document.getElementById(id);
 const readOnlyStatus=s=>s==='approved'?'✅ المتابعة مفعلة':s==='declined'?'⛔ المتدرب ألغى الإذن':'⏳ بانتظار موافقة المتدرب';
 const labels={basic:['📘 التدريبات الأساسية',8],professional:['🎓 التدريبات الاحترافية',5],advanced:['🚀 التدريب المتقدم',10]};
 const percent=v=>Math.max(0,Math.min(100,Number(v)||0));
 const fmtDate=v=>{const d=new Date(v);return v&&!isNaN(d.getTime())?d.toLocaleDateString('ar-IQ'):'';};
 const sessionActive=t=>token()===t&&!!el('trainingMentorRoster');
 async function rpc(fn,args={}){
  const t=token();if(!t)throw Error('يرجى تسجيل الدخول مجددًا');
  const res=await fetch('/api/rpc',{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({fn,args:{p_token:t,...args}})});
  let j;try{j=await res.json()}catch(_){throw Error('تعذّر قراءة استجابة الخادم')}
  if(!res.ok||j?.error){
   const message=String(j?.error||j?.message||'تعذّر تحميل البيانات');
   if(j?.code==='PGRST202'||/could not find the function public\\.training_mentor_/i.test(message))
    throw Error('خدمة متابعة المتدربين غير مفعّلة في قاعدة بيانات النسخة التجريبية بعد. لن تظهر الأسماء أو السجلات حتى اعتماد التحديث، دون تأثير على نتائج الأعضاء الأصلية.');
   throw Error(message);
  }
  return j;
 }
 function notify(message,error=false){
  const node=el('trainingMentorMessage');
  if(node){node.textContent=message||'';node.style.color=error?'#9c2f26':'#136547';}
 }
 function traineeRow(x){
  const n=esc(x.member_no),name=esc(x.name),approved=x.status==='approved';
  const summaries=approved?'<span class="training-mentor-count">الأساسي '+(Number(x.basic_passed)||0)+'/8</span>'+
   '<span class="training-mentor-count">الاحترافي '+(Number(x.professional_passed)||0)+'/5</span>'+
   '<span class="training-mentor-count">المتقدم '+(Number(x.advanced_passed)||0)+'/10</span>':'';
  const reason=approved&&!x.account_linked?' · لم يُربط حساب المنصة بعد':'';
  return '<article class="training-mentor-person"><div class="training-mentor-person-head">'+
   '<div><strong>'+name+'</strong><div class="muted">رقم العضوية: <b dir="ltr">'+n+'</b> · '+readOnlyStatus(x.status)+reason+'</div></div>'+
   '<div class="training-mentor-actions">'+
   (approved?'<button type="button" class="primary" onclick="trainingMentorShow(\''+n+'\')">📊 عرض التقدم</button>':'')+
   (x.status!=='declined'?'<button type="button" onclick="trainingMentorRemove(\''+n+'\')" title="إزالة المتدرب من قائمتي">إزالة</button>':'')+
   '</div></div>'+summaries+'</article>';
 }
 function requestRow(x){
  const id=esc(x.trainer_user_id);
  const accepted=x.status==='approved',pending=x.status==='pending';
  return '<article class="training-mentor-request"><div><b>'+esc(x.name)+'</b>'+
   '<div class="muted">'+(pending?'يرغب في متابعة تقدم تدريباتك':accepted?'يتابع تقدم تدريباتك بموافقتك':'ألغيت صلاحية هذا المدرب')+'</div></div>'+
   '<div class="training-mentor-actions">'+
   (!accepted?'<button type="button" class="primary" onclick="trainingMentorRespond(\''+id+'\',true)">موافقة</button>':'')+
   (x.status!=='declined'?'<button type="button" onclick="trainingMentorRespond(\''+id+'\',false)">'+(accepted?'إلغاء المتابعة':'رفض')+'</button>':'')+
   '</div></article>';
 }
 function renderList(data){
  const list=el('trainingMentorList'),requests=el('trainingMentorRequests');
  if(!list||!requests)return;
  const trainees=Array.isArray(data.trainees)?data.trainees:[];
  const incoming=Array.isArray(data.requests)?data.requests:[];
  list.innerHTML=trainees.length?trainees.map(traineeRow).join(''):'<p class="muted">لا يوجد متدربون مضافون بعد. أدخل رقم العضوية لإضافة أول متدرب.</p>';
  requests.innerHTML=incoming.length?'<h3>🔐 من يمكنه متابعة تدريباتي؟</h3>'+
   '<p class="muted">يمكنك الموافقة على طلب مدرب أو إلغاء صلاحية أي مدرب دون تغيير سجلك التدريبي.</p>'+
   incoming.map(requestRow).join(''):'';
 }
 window.trainingMentorRosterHtml=function(){
  setTimeout(()=>window.trainingMentorRefresh?.(),0);
  return '<section class="card training-mentor-roster" id="trainingMentorRoster" dir="rtl">'+
   '<h2>👥 متدربوني — متابعة التدريبات</h2>'+
   '<p class="muted">أدخل رقم عضوية المتدرب ليظهر اسمه تلقائيًا. يمكنك متابعة المشاهدة والاختبارات في المسارات الثلاثة دون المساس بسجله الأصلي. أعضاء فريقك المباشر وغير المباشر يُربطون مباشرة؛ أما العضو من فريق آخر فيوافق من حسابه أولًا.</p>'+
   '<form class="training-mentor-form" onsubmit="return trainingMentorAdd(event)">'+
   '<label for="trainingMentorNumber">رقم عضوية المتدرب</label>'+
   '<input id="trainingMentorNumber" type="text" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="أدخل 9 أرقام" oninput="trainingMentorInput()" aria-describedby="trainingMentorMessage">'+
   '<label for="trainingMentorName">اسم المتدرب — يُملأ تلقائيًا</label>'+
   '<input id="trainingMentorName" type="text" readonly placeholder="سيظهر الاسم بعد التحقق من رقم العضوية">'+
   '<button type="submit" id="trainingMentorAddButton" class="primary" disabled>＋ إضافة المتدرب</button></form>'+
   '<p id="trainingMentorMessage" role="status" aria-live="polite" class="muted"></p>'+
   '<div class="training-mentor-roster-title"><h3>قائمة المتدربين</h3><button type="button" onclick="trainingMentorRefresh()">🔄 تحديث</button></div>'+
   '<div id="trainingMentorList" role="status">جارٍ تحميل المتدربين...</div>'+
   '<div id="trainingMentorDetails"></div>'+
   '<div id="trainingMentorRequests"></div></section>';
 };
 window.trainingMentorInput=function(){
  const number=el('trainingMentorNumber'),name=el('trainingMentorName'),add=el('trainingMentorAddButton');
  if(!number||!name||!add)return;
  number.value=number.value.replace(/[^0-9]/g,'').slice(0,9);
  name.value='';add.disabled=true;state.verifiedNo='';
  clearTimeout(state.lookupTimer);
  const no=number.value;const seq=++state.lookupSeq,t=token();
  if(no.length!==9){notify(no.length?'أدخل رقم العضوية كاملًا (9 أرقام).':'');return;}
  notify('جارٍ التحقق من رقم العضوية...');
  state.lookupTimer=setTimeout(async()=>{
   try{
    const d=await rpc('training_mentor_lookup',{p_member_no:no});
    if(!sessionActive(t)||seq!==state.lookupSeq||number.value!==no)return;
    name.value=d.name||'';state.verifiedNo=no;add.disabled=!name.value;notify('تم العثور على العضوية.');
   }catch(e){if(sessionActive(t)&&seq===state.lookupSeq)notify(e.message,true);}
  },350);
 };
 window.trainingMentorAdd=async function(event){
  event?.preventDefault?.();
  const no=el('trainingMentorNumber')?.value||'';
  if(!/^[0-9]{9}$/.test(no)||no!==state.verifiedNo){notify('تحقق من رقم العضوية أولًا.',true);return false;}
  const btn=el('trainingMentorAddButton');if(btn)btn.disabled=true;
  const t=token();
  try{
   const d=await rpc('training_mentor_add',{p_member_no:no});
   if(!sessionActive(t))return false;
   el('trainingMentorNumber').value='';el('trainingMentorName').value='';
   state.verifiedNo='';notify((d.name||'تمت الإضافة')+(d.status==='approved'?' — متاح للمتابعة الآن.':d.status==='declined'?' — العضو رفض المتابعة.':' — بانتظار موافقة المتدرب.'));
   await window.trainingMentorRefresh({preserveMessage:true});
  }catch(e){if(sessionActive(t))notify(e.message,true);}
  finally{if(btn)btn.disabled=true;}
  return false;
 };
 window.trainingMentorRefresh=async function(opts={}){
  const root=el('trainingMentorRoster');if(!root)return;
  const t=token(),seq=++state.fetchSeq;
  const list=el('trainingMentorList');if(list&&!opts.silent)list.textContent='جارٍ تحديث قائمة المتدربين...';
  try{
   const d=await rpc('training_mentor_list');
   if(!sessionActive(t)||seq!==state.fetchSeq)return;
   renderList(d);
   if(state.selected&&el('trainingMentorDetails'))window.trainingMentorShow(state.selected,{silent:true});
   if(!opts.preserveMessage)notify('');
  }catch(e){
   if(!sessionActive(t)||seq!==state.fetchSeq)return;
   if(list)list.innerHTML='<p class="muted">تعذّر تحميل المتدربين: '+esc(e.message)+'</p>';
  }
 };
 function lessonCard(x){
  const n=Number(x.lesson_no),pct=x.completed?100:percent(x.watch_percent);
  const status=x.passed?'✅ اجتاز':x.best_score!=null?'❌ لم يجتز':x.completed?'📝 بانتظار الاختبار':pct>0?'▶ قيد المشاهدة':'⏳ لم يبدأ';
  const score=x.best_score==null?'لم يؤدّ الاختبار':Math.round(Math.max(0,Math.min(20,Number(x.best_score)))*5)+' / 100';
  return '<div class="training-mentor-lesson"><div><b>'+esc(n)+'. '+esc(x.title||'التدريب')+'</b>'+
   '<div class="muted">'+status+' · مشاهدة موثقة: '+pct+'% · الاختبار: '+score+
   (Number(x.attempt_count)?' · المحاولات: '+Number(x.attempt_count):'')+
   (x.passed_at?' · الاجتياز: '+fmtDate(x.passed_at):'')+'</div></div>'+
   '<div class="training-mentor-meter"><span style="width:'+pct+'%"></span></div></div>';
 }
 function renderDetails(d){
  const sections=Object.keys(labels).map(k=>{
   const lessons=Array.isArray(d[k])?d[k]:[];
   const passed=lessons.filter(x=>x.passed&&x.completed).length;
   const title=labels[k][0],total=labels[k][1];
   return '<details class="training-mentor-track"><summary>'+title+' — <b>'+passed+' / '+total+' مجتاز</b></summary>'+
    (lessons.length?lessons.map(lessonCard).join(''):'<p class="muted">لا توجد تدريبات معتمدة بعد.</p>')+'</details>';
  }).join('');
  return '<div class="training-mentor-details-head"><h3>📊 تقدم '+esc(d.name)+' <small>('+esc(d.member_no)+')</small></h3>'+
   '<button type="button" onclick="trainingMentorClose()">إغلاق ✕</button></div>'+
   (!d.account_linked?'<p class="muted">لم يُربط رقم العضوية بحساب في المجتمع حتى الآن؛ ستظهر النتائج تلقائيًا عند تسجيل المتدرب.</p>':'')+
   '<p class="muted">النتائج تُقرأ من الحساب الأصلي للمتدرب. شرط مشاهدة الفيديو 90%، واجتياز الاختبار 80/100. لا يملك المدرب صلاحية تعديلها.</p>'+sections+
   '<button type="button" onclick="trainingMentorShow(\''+esc(d.member_no)+'\')">🔄 تحديث تقدم المتدرب</button>';
 }
 window.trainingMentorShow=async function(no,opts={}){
  const box=el('trainingMentorDetails');if(!box)return;
  const t=token();state.selected=no;const seq=++state.lookupSeq;
  if(!opts.silent)box.innerHTML='<p class="muted">جارٍ قراءة نتائج المتدرب...</p>';
  try{
   const d=await rpc('training_mentor_details',{p_member_no:no});
   if(!sessionActive(t)||seq!==state.lookupSeq||state.selected!==no)return;
   box.innerHTML=renderDetails(d);
   if(!opts.silent)box.scrollIntoView?.({behavior:'smooth',block:'start'});
  }catch(e){if(sessionActive(t)&&state.selected===no)box.innerHTML='<p class="muted">تعذّر عرض النتائج: '+esc(e.message)+'</p>';}
 };
 window.trainingMentorClose=function(){state.selected='';const box=el('trainingMentorDetails');if(box)box.innerHTML='';};
 window.trainingMentorRemove=async function(no){
  if(!confirm('إزالة هذا المتدرب من قائمة المتابعة؟ لن تُحذف أي بيانات تدريبية.'))return;
  const t=token();
  try{
   await rpc('training_mentor_remove',{p_member_no:no});
   if(!sessionActive(t))return;
   if(state.selected===no)window.trainingMentorClose();
   await window.trainingMentorRefresh();
   notify('أُزيل المتدرب من قائمة المتابعة، دون تغيير نتائجه.');
  }catch(e){if(sessionActive(t))notify(e.message,true);}
 };
 window.trainingMentorRespond=async function(trainerId,approve){
  const t=token();
  try{
   await rpc('training_mentor_respond',{p_trainer_user_id:trainerId,p_approve:approve});
   if(!sessionActive(t))return;
   await window.trainingMentorRefresh();
   notify(approve?'تم السماح للمدرب بمتابعة تقدمك.':'تم رفض أو إلغاء صلاحية المتابعة.');
  }catch(e){if(sessionActive(t))notify(e.message,true);}
 };
})();
