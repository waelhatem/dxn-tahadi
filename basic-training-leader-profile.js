/* Profile panel: approved basic-training grades and viewing progress.
 * Read-only; server resolves the member's account and verifies leader session.
 * The preview-only quizzes never write to this history.
 */
(function(){
  'use strict';
  if(window.__DXN_BASIC_TRAINING_LEADER_PROFILE__)return;
  window.__DXN_BASIC_TRAINING_LEADER_PROFILE__=true;

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function safePercent(value){
    var n=Number(value);
    return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0;
  }
  function dateLabel(value){
    if(!value)return '';
    var d=new Date(value);
    return Number.isNaN(d.getTime())?'':d.toLocaleDateString('ar-IQ');
  }
  function insertBeforeActions(modal,element){
    // Prefer immediately after the existing detailed training history, keeping it intact.
    var nodes=Array.from(modal.querySelectorAll('.card,.title,h2,h3,b'));
    var history=nodes.find(function(node){
      return (node.textContent||'').trim()==='سجل التدريبات التفصيلي' ||
        (node.textContent||'').trim()==='📚 سجل التدريبات التفصيلي';
    });
    if(history){
      var section=history.closest('.card')||history.parentElement;
      if(section&&section.parentElement&&section!==modal){
        section.insertAdjacentElement('afterend',element);return;
      }
    }
    var anchor=modal.querySelector('.command-actions');
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(element,anchor);
    else modal.querySelector('.evidence-modal')?.appendChild(element);
  }
  function renderResult(root,data){
    var list=Array.isArray(data.lessons)?data.lessons:[];
    if(list.length!==8){
      root.innerHTML='<div class="title">📘 سجل التدريبات الأساسية</div><p class="muted">بيانات الدورات غير مكتملة بعد. تحقق من ترحيلات قاعدة البيانات.</p>';
      return;
    }
    if(!data.account_linked){
      root.innerHTML='<div class="title">📘 سجل التدريبات الأساسية</div><p class="muted">هذا العضو ليس لديه حساب منصة مرتبط برقم عضويته حتى الآن، لذلك لا توجد نسب مشاهدة أو درجات اختبار محفوظة.</p>';
      return;
    }
    var success=Math.max(0,Math.min(8,Number(data.passed)||0));
    var average=safePercent(data.average_watch_percent);
    var html='<div class="title">📘 التدريبات الأساسية — سجل العضو</div>'+
      '<p class="muted" style="margin:5px 0 12px">هذه البيانات محفوظة في قاعدة البيانات وتتحدث عند إعادة فتح ملف العضو. درجات المعاينة التجريبية لا تُحتسب.</p>'+
      '<div class="mini-grid" style="margin-bottom:12px">'+
      '<div><b>✅ تدريبات اجتازها</b><div style="font-size:22px;font-weight:900">'+success+' / 8</div></div>'+
      '<div><b>📊 متوسط المشاهدة</b><div style="font-size:22px;font-weight:900">'+average+'%</div></div>'+
      '<div><b>🎯 شرط الاجتياز</b><div style="font-size:15px;font-weight:700">90% مشاهدة و16/20 درجة</div></div>'+
      '</div>';
    list.forEach(function(item){
      var pct=safePercent(item.watch_percent);
      var grade=item.best_score==null?'لم يؤدِّ الاختبار':Math.max(0,Math.min(20,Number(item.best_score)))+' / 20';
      var passed=Boolean(item.passed);
      var watchComplete=Boolean(item.watch_completed);
      var status=passed?'✅ مجتاز':watchComplete?'📝 بانتظار اجتياز الاختبار':pct>0?'▶️ قيد المشاهدة':'⏳ لم يبدأ';
      var attempts=Math.max(0,Number(item.attempt_count)||0);
      var passAt=dateLabel(item.passed_at);
      html+='<div class="card" style="margin:8px 0;background:#f9fcfb;padding:12px">'+
        '<div class="row" style="margin:0;padding:0;align-items:center"><b>'+Number(item.training_no)+'. '+escapeHtml(item.title)+'</b>'+
        '<span style="font-weight:700">'+status+'</span></div>'+
        '<div class="muted" style="margin-top:7px">🎬 نسبة المشاهدة: <b>'+pct+'%</b></div>'+
        '<div class="bar" style="margin-top:4px"><span style="width:'+pct+'%"></span></div>'+
        '<div class="muted" style="margin-top:7px">📝 درجة الاختبار: <b>'+grade+'</b>'+
        (attempts?' · عدد المحاولات: '+attempts:'')+'</div>'+
        (passAt?'<div class="muted">📅 تاريخ الاجتياز: '+escapeHtml(passAt)+'</div>':'')+
        '</div>';
    });
    root.innerHTML=html;
  }

  window.loadBasicTrainingLeaderMemberProfile=async function(memberId){
    if(typeof role==='undefined'||role!=='leader')return;
    var modal=document.getElementById('memberProfileModal');
    if(!modal||!memberId)return;
    var selector='dxn-member-basic-training-progress';
    var old=modal.querySelector('#'+selector);if(old)old.remove();
    var root=document.createElement('section');
    root.id=selector;
    root.className='card';
    root.style.cssText='margin-top:10px;direction:rtl;text-align:right;border:1px solid #d7e7df';
    root.innerHTML='<div class="title">📘 التدريبات الأساسية — سجل العضو</div>'+
      '<p class="muted">جارٍ تحميل درجات الاختبارات ونسب مشاهدة الفيديوهات...</p>';
    insertBeforeActions(modal,root);

    var token=String(localStorage.getItem('dxn_session')||'').trim();
    if(!token){
      root.innerHTML='<div class="title">📘 سجل التدريبات الأساسية</div><p class="muted">سجّل الدخول لعرض سجل العضو.</p>';return;
    }
    try{
      var response=await fetch('/api/rpc',{method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fn:'basic_training_leader_member_profile',args:{
          p_token:token,p_member_id:String(memberId)
        }})});
      var data=await response.json();
      if(!response.ok||!data||typeof data!=='object'||Array.isArray(data)){
        throw new Error((data&&data.error)||'تعذر تحميل سجل التدريب');
      }
      if(!root.isConnected||document.getElementById('memberProfileModal')!==modal)return;
      if(String(data.member_id)!==String(memberId))throw new Error('بيانات العضو غير متطابقة');
      renderResult(root,data);
    }catch(error){
      if(!root.isConnected)return;
      root.innerHTML='<div class="title">📘 سجل التدريبات الأساسية</div>'+
        '<p class="muted">بيانات التدريبات بانتظار تفعيل قاعدة البيانات التجريبية أو أن الاتصال غير متاح. لا توجد درجات محفوظة في المعاينة الحالية.</p>'+
        '<p class="muted" style="font-size:12px">'+escapeHtml(error&&error.message||'')+'</p>';
    }
  };
})();
