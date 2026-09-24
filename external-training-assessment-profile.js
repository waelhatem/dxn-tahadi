/* External Google Form assessment history inside the member profile.
 * Uses the fixed membership number and the authenticated app session.
 */
(function(){
  if(window.__DXN_EXTERNAL_ASSESSMENT_PROFILE_V1__) return;
  window.__DXN_EXTERNAL_ASSESSMENT_PROFILE_V1__=true;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function token(){
    try{return localStorage.getItem('dxn_session')||'';}catch(e){return '';}
  }

  async function rpc(name,args){
    var r=await fetch('/api/rpc',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fn:name,args:args||{}}),
      cache:'no-store'
    });
    var t=await r.text(),d=null;
    try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error((d&&(d.message||d.error))||t||('HTTP '+r.status));
    return d;
  }

  function getMembershipNumber(){
    var modal=document.getElementById('memberProfileModal');
    if(!modal)return '';
    var nodes=modal.querySelectorAll('.muted');
    for(var i=0;i<nodes.length;i++){
      var txt=String(nodes[i].textContent||'').trim();
      var m=txt.match(/🪪\s*([^·\s]+)/);
      if(m&&m[1])return m[1].trim();
    }
    return '';
  }

  function formatDate(v){
    try{
      var d=new Date(v);
      if(isNaN(d.getTime()))return esc(v||'');
      return esc(d.toLocaleString('ar-IQ'));
    }catch(e){return esc(v||'');}
  }

  function statusLabel(s){
    return s==='approved'?'✅ معتمدة':s==='retry'?'🔁 تحتاج إعادة المحاولة':'⏳ قيد المعالجة';
  }

  function renderHistory(modal,rows,membershipNumber){
    var old=document.getElementById('dxn-external-assessment-history');
    if(old)old.remove();

    var box=document.createElement('div');
    box.id='dxn-external-assessment-history';
    box.className='card';
    box.style.cssText='margin-top:10px;border:2px solid #d7e7df;background:linear-gradient(135deg,#fbfffd,#fff);direction:rtl;text-align:right';

    var html='<div class="title">📝 سجل اختبارات الحقيبة التدريبية</div>';
    html+='<p class="muted" style="line-height:1.8;margin:6px 0 10px">كل محاولات الاختبار المرسلة عبر Google Form محفوظة هنا حسب رقم العضوية، مع الدرجة وتفاصيل الأسئلة.</p>';

    if(!rows.length){
      html+='<div class="empty">لا توجد محاولات اختبار محفوظة لهذا العضو حتى الآن.</div>';
      box.innerHTML=html;
      insertBox(modal,box);
      return;
    }

    rows.forEach(function(row,index){
      var report=row&&row.report||{};
      var results=Array.isArray(report.results)?report.results:[];
      var total=Number(report.totalScore||0);
      var approved=Number(report.approvedCount||0);
      var retry=Number(report.retryCount||0);
      var overall=report.overallStatus||'retry';

      html+='<details style="margin-top:10px;border:1px solid #d9e7e1;border-radius:12px;padding:10px;background:#fff" '+(index===0?'open':'')+'>';
      html+='<summary style="cursor:pointer;list-style:none"><div class="row" style="border:0;align-items:center">';
      html+='<div><b>📝 محاولة '+(rows.length-index)+'</b><div class="muted" style="margin-top:4px">📅 '+formatDate(row.submitted_at||row.created_at)+'</div></div>';
      html+='<div style="text-align:left"><b style="font-size:18px">'+total+'/100</b><div class="muted">'+statusLabel(overall)+'</div></div>';
      html+='</div></summary>';

      html+='<div class="progress-grid" style="margin-top:10px">';
      html+='<div class="progress-stat"><span class="muted">📊 الدرجة</span><b>'+total+'/100</b></div>';
      html+='<div class="progress-stat"><span class="muted">✅ المعتمدة</span><b>'+approved+'/'+(Number(report.totalQuestions||results.length||0))+'</b></div>';
      html+='<div class="progress-stat"><span class="muted">🔁 تحتاج إعادة</span><b>'+retry+'</b></div>';
      html+='<div class="progress-stat"><span class="muted">📧 السبونسر</span><b style="font-size:12px">'+esc(row.sponsor_email||'')+'</b></div>';
      html+='</div>';

      results.forEach(function(item){
        var st=statusLabel(item.status);
        html+='<div class="challenge" style="margin-top:10px;border-color:#d9e7e1">';
        html+='<div class="row" style="border:0"><div style="flex:1"><b>السؤال '+Number(item.questionNo||0)+'</b><div style="margin-top:4px;line-height:1.7">'+esc(item.question||'')+'</div></div><b>'+Number(item.score||0)+'/100</b></div>';
        html+='<div style="margin-top:8px;background:#f7f7f7;padding:10px;border-radius:10px;white-space:pre-wrap;line-height:1.8"><b>إجابة العضو:</b> '+esc(item.answer||'')+'</div>';
        html+='<div style="margin-top:8px;line-height:1.8"><b>الحالة:</b> '+st+(item.note?'<br><b>ملاحظة التقييم:</b> '+esc(item.note):'')+'</div>';
        html+='</div>';
      });

      html+='</details>';
    });

    box.innerHTML=html;
    insertBox(modal,box);
  }

  function renderError(modal,message){
    var old=document.getElementById('dxn-external-assessment-history');
    if(old)old.remove();
    var box=document.createElement('div');
    box.id='dxn-external-assessment-history';
    box.className='card';
    box.style.cssText='margin-top:10px;border:2px solid #f0b7b2;background:#fff7f6;direction:rtl;text-align:right';
    box.innerHTML='<div class="title">📝 سجل اختبارات الحقيبة التدريبية</div><div class="challenge"><b>⚠️ تعذر تحميل السجل</b><div class="muted" style="margin-top:5px;white-space:pre-wrap">'+esc(message||'خطأ غير معروف')+'</div></div>';
    insertBox(modal,box);
  }

  function insertBox(modal,box){
    var actions=modal.querySelector('.command-actions');
    if(actions&&actions.parentNode){actions.parentNode.insertBefore(box,actions);}
    else{
      var cards=modal.querySelectorAll('.card');
      var last=cards.length?cards[cards.length-1]:null;
      if(last&&last.parentNode)last.parentNode.appendChild(box);else modal.appendChild(box);
    }
  }

  async function loadForModal(modal){
    var no=getMembershipNumber();
    if(!no)return;
    var t=token();
    if(!t)return;
    try{
      var data=await rpc('get_external_training_assessment_submissions',{p_token:t,p_membership_number:no});
      var rows=Array.isArray(data)?data:[];
      renderHistory(modal,rows,no);
    }catch(e){
      console.error('DXN external assessment profile',e);
      renderError(modal,e&&e.message||String(e));
    }
  }

  function scan(){
    var modal=document.getElementById('memberProfileModal');
    if(!modal||modal.getAttribute('data-external-assessment-loaded')==='1')return;
    var no=getMembershipNumber();
    if(!no)return;
    modal.setAttribute('data-external-assessment-loaded','1');
    loadForModal(modal);
  }

  var mo=new MutationObserver(function(){
    try{scan();}catch(e){}
  });
  function start(){
    if(document.body)mo.observe(document.body,{childList:true,subtree:true});
    scan();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();