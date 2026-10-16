/* Professional training results in member/leader training profiles.
 * Read-only: member uses the authenticated overview; leader uses a separately authorized RPC.
 * Show /100 grades and completed viewing conditions; never invent progress.
 */
(function(){
 'use strict';
 if(window.professionalTrainingMemberProfile)return;
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>String(localStorage.getItem('dxn_session')||'').trim();
 const lessonsOf=data=>(Array.isArray(data.lessons)?data.lessons:[]).slice().sort((a,b)=>Number(a.lesson_no)-Number(b.lesson_no));
 const completed=x=>x.completed===true||x.watch_completed===true;
 const grade=x=>x.best_score==null?'لم يؤدِّ الاختبار':Math.round(Math.max(0,Math.min(20,Number(x.best_score)))*5)+' / 100';
 const when=x=>{if(!x.passed_at)return '';const d=new Date(x.passed_at);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('ar-IQ');};
 function card(x){
  const n=Number(x.lesson_no),done=completed(x),passed=x.passed===true;
  const status=passed?'✅ مجتاز':x.best_score!=null?'❌ لم يجتز':done?'📝 جاهز للاختبار':'⏳ لم تكتمل المشاهدة';
  const date=when(x),tries=x.attempt_count==null?'':Math.max(0,Number(x.attempt_count)||0);
  return '<article class="card" style="margin:8px 0;padding:12px;background:#f9fcfb">'+
   '<div class="row" style="margin:0;padding:0;align-items:center;flex-wrap:wrap;gap:8px"><b>التدريب الاحترافي '+esc(n)+' — '+esc(x.title||'')+'</b><strong>'+status+'</strong></div>'+
   '<div class="muted" style="margin-top:7px">🎬 المشاهدة: <b>'+(done?'✅ اكتمل شرط المشاهدة':'غير مكتملة')+'</b></div>'+
   '<div class="bar" style="margin-top:5px"><span style="width:'+(done?100:0)+'%"></span></div>'+
   '<div class="muted" style="margin-top:7px">📝 درجة الاختبار: <b dir="ltr">'+esc(grade(x))+'</b>'+
   (tries!==''?' · عدد المحاولات: '+tries:'')+'</div>'+
   (date?'<div class="muted">📅 تاريخ الاجتياز: '+esc(date)+'</div>':'')+'</article>';
 }
 function render(data){
  const lessons=lessonsOf(data);
  if(lessons.length!==5)return '<p class="muted">سجل التدريبات الاحترافية غير مكتمل؛ تعذّر عرض النتائج بصورة موثوقة.</p>';
  if(data.account_linked===false)return '<p class="muted">هذا العضو ليس لديه حساب منصة مرتبط، لذلك لا توجد نتائج محفوظة.</p>';
  const passed=lessons.filter(x=>x.passed===true&&completed(x)).length;
  const watched=lessons.filter(completed).length;
  const tested=lessons.filter(x=>x.best_score!=null).length;
  const allPassed=passed===5&&lessons.every(x=>x.best_score!=null);
  const final=allPassed?lessons.reduce((sum,x)=>sum+Number(x.best_score)*5,0)/5:null;
  return (allPassed?'<section class="basic-training-average-card" aria-label="المعدل النهائي للتدريبات الاحترافية">'+
   '<div class="basic-training-average-title">🏆 المعدل النهائي للتدريبات الاحترافية</div>'+
   '<div class="basic-training-average-score" dir="ltr">'+esc(Number.isInteger(final)?final:final.toFixed(1))+' / 100</div>'+
   '</section>':'')+
   '<div class="mini-grid" style="margin:12px 0">'+
   '<div><b>📚 التدريبات</b><h3>5</h3></div>'+
   '<div><b>✅ المجتازة</b><h3>'+passed+' / 5</h3></div>'+
   '<div><b>🎬 المشاهدات المكتملة</b><h3>'+watched+' / 5</h3></div>'+
   '<div><b>📝 الاختبارات المؤداة</b><h3>'+tested+' / 5</h3></div></div>'+
   lessons.map(card).join('');
 }
 async function rpc(fn,args,key){
  const r=await fetch('/api/rpc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({fn,args:{p_token:key,...args}})});
  const value=await r.json();
  if(!r.ok||!value||typeof value!=='object'||Array.isArray(value))throw Error(value&&value.error||'تعذّر تحميل سجل التدريبات');
  return value;
 }
 window.professionalTrainingMemberProfile=function(){
  setTimeout(()=>window.professionalTrainingMemberRefresh?.(),0);
  return '<section class="card" id="professionalTrainingMemberProfile" dir="rtl" style="max-width:960px;margin:14px auto;padding:20px;text-align:right">'+
   '<h2>🎓 التدريبات الاحترافية — نتائجي</h2><p class="muted">خمسة تدريبات مرتبة بالتسلسل مع درجات الاختبارات المحفوظة.</p>'+
   '<div id="professionalTrainingMemberBody" role="status">جارٍ قراءة النتائج...</div>'+
   '<button type="button" class="primary" onclick="professionalTrainingMemberRefresh()" style="margin-top:12px">🔄 تحديث النتائج</button></section>';
 };
 window.professionalTrainingMemberRefresh=async function(){
  const root=document.getElementById('professionalTrainingMemberBody');if(!root)return;
  const key=token();
  if(typeof role==='undefined'||role!=='member'||!me){root.textContent='هذا الملف مخصص للعضو.';return;}
  if(!key){root.textContent='يرجى تسجيل الدخول.';return;}
  if(root.dataset.loading==='1'&&root.dataset.requestToken===key)return;
  root.dataset.loading='1';root.dataset.requestToken=key;root.textContent='جارٍ قراءة نتائج التدريبات الاحترافية...';
  try{
   const data=await rpc('professional_training_overview',{},key);
   if(!root.isConnected||root.dataset.requestToken!==key||token()!==key||typeof role==='undefined'||role!=='member')return;
   if(data.role!=='member')throw Error('صلاحية الحساب غير متطابقة');
   root.innerHTML=render(data);
  }catch(e){
   if(root.isConnected&&root.dataset.requestToken===key&&token()===key)root.textContent='تعذّر تحميل النتائج: '+(e.message||'خطأ غير معروف');
  }finally{if(root.dataset.requestToken===key){root.dataset.loading='0';delete root.dataset.requestToken;}}
 };
 window.professionalTrainingLeaderProfile=async function(memberId){
  if(typeof role==='undefined'||role!=='leader'||!memberId)return;
  const modal=document.getElementById('memberProfileModal');if(!modal)return;
  modal.querySelector('#professionalTrainingLeaderSection')?.remove();
  const section=document.createElement('section');section.id='professionalTrainingLeaderSection';section.className='card';
  section.style.cssText='margin-top:10px;direction:rtl;text-align:right;border:1px solid #d7e7df';
  section.innerHTML='<h3>🎓 التدريبات الاحترافية — سجل العضو</h3><p class="muted">جارٍ قراءة النتائج...</p>';
  const resultsPanel=modal.querySelector('#leaderTrainingResultsPanelProfessional');
  if(resultsPanel)resultsPanel.appendChild(section);
  else {
  const anchor=modal.querySelector('.command-actions');
  if(anchor&&anchor.parentElement)anchor.insertAdjacentElement('beforebegin',section);
  else (modal.querySelector('.evidence-modal')||modal).appendChild(section);
  }
  const key=token();
  if(!key){section.textContent='يرجى تسجيل الدخول.';return;}
  try{
   const data=await rpc('professional_training_leader_member_profile',{p_member_id:String(memberId)},key);
   if(!section.isConnected||document.getElementById('memberProfileModal')!==modal||token()!==key||typeof role==='undefined'||role!=='leader')return;
   if(String(data.member_id)!==String(memberId))throw Error('ملف العضو غير متطابق');
   section.innerHTML='<h3>🎓 التدريبات الاحترافية — سجل العضو</h3>'+render(data);
  }catch(e){if(section.isConnected&&token()===key)section.innerHTML='<h3>🎓 التدريبات الاحترافية — سجل العضو</h3>'+
   '<p class="muted">تعذّر قراءة نتائج العضو: '+esc(e.message||'الخدمة غير متاحة')+'</p>';}
 };
})();
