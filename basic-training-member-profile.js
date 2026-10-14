/* Basic-training member profile. Read-only and scoped by the authenticated session.
 * Uses basic_training_overview; no client-supplied member id or duplicated records.
 */
(function(){
 'use strict';
 if(window.basicTrainingMemberPage)return;
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const titles=['التعريف بمشروع DXN ومنتجاتها ونظامها التسويقي','التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح','منتجات DXN وأصنافها وطرق تسويقها','نظام البيع المباشر في DXN','خطة الأرباح والحوافز لشركة DXN','التطبيق العملي لخطة الأرباح خلال ستة أشهر','تفعيل العضوية وتسجيل أعضاء الفريق','أساسيات النجاح التسعة مع DXN'];
 const percent=p=>Math.min(100,Math.max(0,Math.round(100*(Number(p.watched)||0)/(Number(p.duration)||1))));
 window.basicTrainingMemberPage=function(){
   return '<section class="card" id="basicTrainingMemberProfile" dir="rtl" style="max-width:960px;margin:14px auto;padding:20px;text-align:right"><h2>📘 ملفي التدريبي — التدريبات الأساسية</h2><p class="muted">درجات الاختبارات ونسب المشاهدة المحفوظة في حسابك.</p><div id="basicTrainingMemberBody" role="status">اضغط «عرض سجلي» لتحميل نتائجك.</div><button type="button" class="primary" onclick="basicTrainingLoadMemberPage()" style="margin-top:12px">🔄 عرض سجلي / تحديث</button></section>';
 };
 window.basicTrainingLoadMemberPage=async function(){
   const root=document.getElementById('basicTrainingMemberBody');
   if(!root||root.dataset.loading==='1')return;
   if(typeof role==='undefined'||role!=='member'||!me){root.textContent='هذه الصفحة مخصصة لحساب العضو.';return;}
   const token=String(localStorage.getItem('dxn_session')||'').trim();
   if(!token){root.textContent='يرجى تسجيل الدخول لعرض سجلك.';return;}
   root.dataset.loading='1';root.textContent='جارٍ قراءة السجل المحفوظ...';
   try{
     const response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({fn:'basic_training_overview',args:{p_token:token}})});
     const payload=await response.json();
     if(!response.ok||!payload||!Array.isArray(payload.progress))throw Error(payload.error||payload.message||'خدمة حفظ التدريبات غير مفعلة بعد');
     if(payload.role!=='member')throw Error('صلاحية الحساب غير متطابقة');
     if(!root.isConnected)return;
     const progress=payload.progress;
     const completed=progress.filter(p=>p.passed===true).length;
     // Never show a provisional average: reveal the final score ONLY after
     // the member passed all eight trainings (90% watch + >=16/20 quiz).
     const tested=Array.from({length:8},(_,i)=>progress.find(p=>Number(p.training_no)===i+1))
       .filter(p=>p&&p.best_score!=null&&Number.isFinite(Number(p.best_score)));
     const testedCount=tested.length;
     const allPassed=Array.from({length:8},(_,i)=>progress.find(p=>Number(p.training_no)===i+1))
       .every(p=>p&&p.passed===true&&p.completed===true&&p.best_score!=null);
     let html='';
     if(allPassed){
       const avg=tested.reduce((sum,p)=>sum+Number(p.best_score)*5,0)/8;
       const avgLabel=(Number.isInteger(avg)?String(avg):avg.toFixed(1))+' / 100';
       html='<section class="basic-training-average-card" aria-label="الدرجة النهائية لمعدل الاختبارات">'+
         '<div class="basic-training-average-title">🏆 الدرجة النهائية لمعدل الاختبارات</div>'+
         '<div class="basic-training-average-score" dir="ltr">'+esc(avgLabel)+'</div>'+
         '<div class="basic-training-average-note">✅ اكتملت التدريبات الثمانية واجتُزيت اختباراتُها.</div></section>';
     }
     html+='<div class="mini-grid" style="margin:12px 0"><div><b>📚 التدريبات</b><h3>8</h3></div><div><b>✅ المكتملة</b><h3>'+completed+'</h3></div><div><b>📝 الاختبارات المؤداة</b><h3>'+testedCount+'/8</h3></div></div>';
     for(let i=1;i<=8;i++){
       const p=progress.find(x=>Number(x.training_no)===i)||{},pct=percent(p),score=p.best_score==null?'لم يُختبر':Math.round(Number(p.best_score)*5)+' / 100';
       const state=p.passed?'✅ ناجح':p.best_score!=null?'❌ لم يجتز':p.completed?'📝 جاهز للاختبار':pct?'▶ قيد المشاهدة':'⏳ لم يبدأ';
       const date=p.passed_at?new Date(p.passed_at).toLocaleDateString('ar-IQ'):'';
       html+='<article class="card" style="margin:10px 0;padding:12px"><b>التدريب الأساسي '+i+' — '+esc(titles[i-1])+'</b><p class="muted">'+state+' · درجة الاختبار: <strong dir="ltr">'+esc(score)+'</strong></p><div class="muted">مشاهدة الفيديو: '+pct+'%</div><div style="height:9px;background:#e5eee9;border-radius:10px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:#168257"></div></div>'+(date?'<p class="muted">تاريخ الاجتياز: '+esc(date)+'</p>':'')+'</article>';
     }
     root.innerHTML=html;
   }catch(e){if(root.isConnected)root.textContent='تعذّر تحميل السجل: '+(e.message||'خدمة التدريبات غير متاحة');}
   finally{root.dataset.loading='0';}
 };
})();
