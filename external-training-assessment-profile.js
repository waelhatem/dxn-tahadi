/* V2 — Google Form assessment history for both leader member-profile and the member's own account. */
(function(){
  if(window.__DXN_EXTERNAL_ASSESSMENT_PROFILE_V2__) return;
  window.__DXN_EXTERNAL_ASSESSMENT_PROFILE_V2__=true;

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
  function memberNo(){
    try{
      if(typeof me!=='undefined'&&me&&me.member_no)return String(me.member_no).trim();
    }catch(e){}
    try{
      var appData=(typeof data!=='undefined'&&data)?data:(window.data||{});
      if(Array.isArray(appData.members)&&appData.members[0]&&appData.members[0].member_no){
        return String(appData.members[0].member_no).trim();
      }
    }catch(e){}
    return '';
  }

  function buildAttemptHtml(row,index,includeSponsor){
    var report=row&&row.report||{};
    var results=Array.isArray(report.results)?report.results:[];
    var total=Number(report.totalScore||0);
    var approved=Number(report.approvedCount||0);
    var retry=Number(report.retryCount||0);
    var totalQ=Number(report.totalQuestions||results.length||0);
    var overall=report.overallStatus||'retry';
    var html='<details style="margin-top:10px;border:1px solid #d9e7e1;border-radius:14px;padding:10px;background:#fff" '+(index===0?'open':'')+'>';
    html+='<summary style="cursor:pointer;list-style:none"><div class="row" style="border:0;align-items:center">';
    html+='<div><b>📝 محاولة '+(index+1)+'</b><div class="muted" style="margin-top:4px">📅 '+formatDate(row.submitted_at||row.created_at)+'</div></div>';
    html+='<div style="text-align:left"><b style="font-size:18px">'+total+'/100</b><div class="muted">'+statusLabel(overall)+'</div></div>';
    html+='</div></summary>';
    html+='<div class="progress-grid" style="margin-top:10px">';
    html+='<div class="progress-stat"><span class="muted">📊 الدرجة</span><b>'+total+'/100</b></div>';
    html+='<div class="progress-stat"><span class="muted">✅ المعتمدة</span><b>'+approved+'/'+totalQ+'</b></div>';
    html+='<div class="progress-stat"><span class="muted">🔁 تحتاج إعادة</span><b>'+retry+'</b></div>';
    if(includeSponsor){
      html+='<div class="progress-stat"><span class="muted">📧 السبونسر</span><b style="font-size:12px">'+esc(row.sponsor_email||'')+'</b></div>';
    }
    html+='</div>';
    results.forEach(function(item){
      html+='<div class="challenge" style="margin-top:10px;border-color:#d9e7e1">';
      html+='<div class="row" style="border:0;align-items:flex-start"><div style="flex:1"><b>السؤال '+Number(item.questionNo||0)+'</b><div style="margin-top:4px;line-height:1.8">'+esc(item.question||'')+'</div></div><b style="white-space:nowrap">'+Number(item.score||0)+'/100</b></div>';
      html+='<div style="margin-top:8px;background:#f7f9f8;padding:10px;border-radius:10px;white-space:pre-wrap;line-height:1.8"><b>إجابتك:</b> '+esc(item.answer||'')+'</div>';
      html+='<div style="margin-top:8px;line-height:1.8"><b>الحالة:</b> '+statusLabel(item.status);
      if(item.note)html+='<br><b>ملاحظة التقييم:</b> '+esc(item.note);
      html+='</div></div>';
    });
    html+='</details>';
    return html;
  }

  function renderLeaderHistory(modal,rows){
    var old=document.getElementById('dxn-external-assessment-history');
    if(old)old.remove();
    var box=document.createElement('div');
    box.id='dxn-external-assessment-history';
    box.className='card';
    box.style.cssText='margin-top:10px;border:2px solid #d7e7df;background:linear-gradient(135deg,#fbfffd,#fff);direction:rtl;text-align:right';
    var html='<div class="title">📝 سجل اختبارات الحقيبة التدريبية</div>';
    html+='<p class="muted" style="line-height:1.8;margin:6px 0 10px">كل محاولات الاختبار المرسلة عبر Google Form محفوظة حسب رقم العضوية.</p>';
    if(!rows.length) html+='<div class="empty">لا توجد محاولات اختبار محفوظة لهذا العضو حتى الآن.</div>';
    else rows.forEach(function(row,i){html+=buildAttemptHtml(row,i,true);});
    box.innerHTML=html;
    insertBox(modal,box);
  }

  function renderMemberHistory(rows){
    var root=document.getElementById('app');
    if(!root)return;
    var old=document.getElementById('dxn-member-external-assessment-history');
    if(old)old.remove();

    var box=document.createElement('section');
    box.id='dxn-member-external-assessment-history';
    box.className='card';
    box.style.cssText='margin-top:14px;border:2px solid #d7e7df;background:linear-gradient(135deg,#fbfffd,#fff);direction:rtl;text-align:right';

    var html='<div class="row" style="border:0;align-items:flex-start"><div><div class="title">📝 سجل اختباراتي</div><div class="muted" style="margin-top:4px;line-height:1.7">هنا تظهر جميع محاولات اختبار الحقيبة التدريبية ونتائج التقييم الآلي بالتفصيل.</div></div><button type="button" id="dxnMemberAssessmentRefresh">🔄 تحديث</button></div>';

    if(!rows.length){
      html+='<div class="empty" style="margin-top:10px">لم ترسل أي محاولة اختبار حتى الآن.</div>';
    }else{
      var latest=rows[0], latestReport=latest.report||{};
      html+='<div class="progress-grid" style="margin-top:10px">';
      html+='<div class="progress-stat"><span class="muted">آخر درجة</span><b>'+Number(latestReport.totalScore||0)+'/100</b></div>';
      html+='<div class="progress-stat"><span class="muted">الحالة</span><b style="font-size:15px">'+statusLabel(latestReport.overallStatus||'retry')+'</b></div>';
      html+='<div class="progress-stat"><span class="muted">عدد المحاولات</span><b>'+rows.length+'</b></div>';
      html+='<div class="progress-stat"><span class="muted">آخر إرسال</span><b style="font-size:12px">'+formatDate(latest.submitted_at||latest.created_at)+'</b></div>';
      html+='</div>';
      rows.forEach(function(row,i){html+=buildAttemptHtml(row,i,false);});
    }

    box.innerHTML=html;

    var anchor=null;
    try{
      var cards=root.querySelectorAll('.card');
      for(var i=0;i<cards.length;i++){
        var title=cards[i].querySelector('.title');
        if(title&&/اختبارات استيعاب التدريبات|التقدّم|تقدّمي/.test(title.textContent||'')){anchor=cards[i];break;}
      }
    }catch(e){}
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);
    else root.appendChild(box);

    var btn=document.getElementById('dxnMemberAssessmentRefresh');
    if(btn)btn.onclick=function(){loadMemberHistory();};
  }

  function renderMemberError(message){
    renderMemberHistory([]);
    var box=document.getElementById('dxn-member-external-assessment-history');
    if(!box)return;
    var old=box.querySelector('.dxn-member-assessment-error');
    if(old)old.remove();
    var err=document.createElement('div');
    err.className='challenge dxn-member-assessment-error';
    err.style.cssText='border-color:#f0b7b2;background:#fff7f6';
    err.innerHTML='<b>⚠️ تعذر تحميل سجل الاختبارات</b><div class="muted" style="margin-top:5px;white-space:pre-wrap">'+esc(message||'خطأ غير معروف')+'</div>';
    box.appendChild(err);
  }

  async function loadMemberHistory(){
    if(typeof role!=='undefined'&&role!=='member')return;
    var no=memberNo(), t=token();
    if(!no||!t)return;
    try{
      var data=await rpc('get_external_training_assessment_submissions',{p_token:t,p_membership_number:no});
      var rows=Array.isArray(data)?data:[];
      renderMemberHistory(rows);
    }catch(e){
      console.error('DXN member external assessment history',e);
      renderMemberError(e&&e.message||String(e));
    }
  }

  function getModalMembershipNumber(){
    var modal=document.getElementById('memberProfileModal');
    if(!modal)return '';
    var nodes=modal.querySelectorAll('.muted');
    for(var i=0;i<nodes.length;i++){
      var txt=String(nodes[i].textContent||'').trim();
      var m=txt.match(/🪪s*([^·s]+)/);
      if(m&&m[1])return m[1].trim();
    }
    return '';
  }

  function insertBox(modal,box){
    var actions=modal.querySelector('.command-actions');
    if(actions&&actions.parentNode)actions.parentNode.insertBefore(box,actions);
    else{
      var cards=modal.querySelectorAll('.card');
      var last=cards.length?cards[cards.length-1]:null;
      if(last&&last.parentNode)last.parentNode.appendChild(box);else modal.appendChild(box);
    }
  }

  async function loadForModal(modal){
    var no=getModalMembershipNumber(), t=token();
    if(!no||!t)return;
    try{
      var data=await rpc('get_external_training_assessment_submissions',{p_token:t,p_membership_number:no});
      renderLeaderHistory(modal,Array.isArray(data)?data:[]);
    }catch(e){
      console.error('DXN external assessment leader profile',e);
      var old=document.getElementById('dxn-external-assessment-history'); if(old)old.remove();
      var box=document.createElement('div'); box.id='dxn-external-assessment-history'; box.className='card';
      box.style.cssText='margin-top:10px;border:2px solid #f0b7b2;background:#fff7f6;direction:rtl;text-align:right';
      box.innerHTML='<div class="title">📝 سجل اختبارات الحقيبة التدريبية</div><div class="challenge"><b>⚠️ تعذر تحميل السجل</b><div class="muted" style="margin-top:5px;white-space:pre-wrap">'+esc(e&&e.message||String(e))+'</div></div>';
      insertBox(modal,box);
    }
  }

  function scanLeaderModal(){
    if(typeof role!=='undefined'&&role!=='leader')return;
    var modal=document.getElementById('memberProfileModal');
    if(!modal||modal.getAttribute('data-external-assessment-loaded')==='1')return;
    if(!getModalMembershipNumber())return;
    modal.setAttribute('data-external-assessment-loaded','1');
    loadForModal(modal);
  }

  var lastMemberRenderKey='';
  function scanMember(){
    if(typeof role!=='undefined'&&role!=='member')return;
    var root=document.getElementById('app');
    if(!root)return;
    var key=memberNo()+'|'+String(typeof tab!=='undefined'?tab:'');
    var eligible=String(typeof tab!=='undefined'?tab:'home');
    if(eligible!=='home'&&eligible!=='progress')return;
    if(!memberNo())return;
    if(document.getElementById('dxn-member-external-assessment-history') && lastMemberRenderKey===key)return;
    loadMemberHistory();
    lastMemberRenderKey=key;
  }

  var mo=new MutationObserver(function(){
    try{
      if(typeof role!=='undefined'&&role==='member')scanMember();
      if(typeof role!=='undefined'&&role==='leader')scanLeaderModal();
    }catch(e){}
  });

  function start(){
    if(document.body)mo.observe(document.body,{childList:true,subtree:true});
    setTimeout(function(){
      try{
        if(typeof role!=='undefined'&&role==='member')scanMember();
        if(typeof role!=='undefined'&&role==='leader')scanLeaderModal();
      }catch(e){}
    },600);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();