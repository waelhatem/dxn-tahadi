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

  function resultLabel(report){
    var status=String((report&&report.overallStatus)||'retry');
    if(status==='approved')return '✅ ناجح';
    if(status==='retry')return '🔁 إعادة المحاولة';
    return '⏳ قيد المعالجة';
  }

  function scoreOf(row){
    var report=row&&row.report||{};
    return Number(report.totalScore||0);
  }

  function simpleRow(row){
    var report=row&&row.report||{};
    return '<div class="row" style="border:1px solid #d9e7e1;border-radius:14px;margin-top:8px;padding:12px 14px;background:#fff;align-items:center">'
      +'<div style="flex:1;min-width:0"><b>'+esc(row.member_name||'عضو غير معروف')+'</b></div>'
      +'<div style="min-width:120px;text-align:center"><b>'+esc(row.membership_number||'—')+'</b></div>'
      +'<div style="min-width:90px;text-align:center"><b>'+scoreOf(row)+'/100</b></div>'
      +'<div style="min-width:125px;text-align:center"><b>'+resultLabel(report)+'</b></div>'
      +'</div>';
  }

  function compactRows(rows){
    var latestByMember={};
    (Array.isArray(rows)?rows:[]).forEach(function(row){
      var no=String(row.membership_number||row.member_name||'').trim();
      if(!no)return;
      var prev=latestByMember[no];
      var curTime=new Date(row.submitted_at||row.created_at||0).getTime()||0;
      var prevTime=prev?new Date(prev.submitted_at||prev.created_at||0).getTime()||0:-1;
      if(!prev||curTime>prevTime)latestByMember[no]=row;
    });
    return Object.keys(latestByMember).map(function(k){return latestByMember[k];})
      .sort(function(a,b){return (new Date(b.submitted_at||b.created_at||0).getTime()||0)-(new Date(a.submitted_at||a.created_at||0).getTime()||0);});
  }

  function tableHtml(rows,emptyText){
    var compact=compactRows(rows);
    var html='<div style="overflow:auto"><div style="min-width:520px">'
      +'<div class="row" style="border:0;background:#f4f8f6;font-weight:900;margin-top:10px;border-radius:12px;padding:10px 14px">'
      +'<div style="flex:1">اسم العضو</div><div style="min-width:120px;text-align:center">رقم العضوية</div><div style="min-width:90px;text-align:center">الدرجة</div><div style="min-width:125px;text-align:center">النتيجة</div>'
      +'</div>';
    if(!compact.length) html+='<div class="empty" style="margin-top:10px">'+esc(emptyText)+'</div>';
    else compact.forEach(function(row){html+=simpleRow(row);});
    html+='</div></div>';
    return html;
  }

  function renderLeaderHistory(modal,rows){
    var old=document.getElementById('dxn-external-assessment-history');
    if(old)old.remove();
    var box=document.createElement('div');
    box.id='dxn-external-assessment-history';
    box.className='card';
    box.style.cssText='margin-top:10px;border:2px solid #d7e7df;background:linear-gradient(135deg,#fbfffd,#fff);direction:rtl;text-align:right';
    box.innerHTML='<div class="title">📝 سجل اختبار الحقيبة التدريبية</div>'
      +'<p class="muted" style="line-height:1.8;margin:6px 0 10px">الاسم والدرجة والنتيجة فقط. تفاصيل الإجابات تصل إلى البريد الإلكتروني للسبونسر.</p>'
      +tableHtml(rows,'لا توجد نتيجة اختبار محفوظة لهذا العضو حتى الآن.');
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
    box.innerHTML='<div class="row" style="border:0;align-items:center"><div><div class="title">📝 سجل الاختبارات</div><div class="muted" style="margin-top:4px">اسم العضو، الدرجة، والنتيجة فقط.</div></div><button type="button" id="dxnMemberAssessmentRefresh">🔄 تحديث</button></div>'
      +tableHtml(rows,'لم يرسل هذا العضو أي اختبار حتى الآن.');

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

  async function loadMemberHistory(){
    if(typeof role!=='undefined'&&role!=='member')return;
    var no=memberNo(), t=token();
    if(!no||!t)return;
    try{
      var data=await rpc('get_external_training_assessment_submissions',{p_token:t,p_membership_number:no});
      renderMemberHistory(Array.isArray(data)?data:[]);
    }catch(e){
      console.error('DXN member external assessment history',e);
      renderMemberHistory([]);
      var box=document.getElementById('dxn-member-external-assessment-history');
      if(box){
        var err=document.createElement('div');err.className='challenge';err.style.cssText='margin-top:10px;border-color:#f0b7b2;background:#fff7f6';
        err.innerHTML='<b>⚠️ تعذر تحميل السجل</b><div class="muted" style="margin-top:5px">'+esc(e&&e.message||String(e))+'</div>';box.appendChild(err);
      }
    }
  }

  function leaderSummaryRow(row){
    var result=String(row.result||'retry');
    var label=result==='approved'?'✅ ناجح':result==='retry'?'🔁 إعادة المحاولة':'⏳ قيد المعالجة';
    return '<div class="row" style="border:1px solid #d9e7e1;border-radius:14px;margin-top:8px;padding:12px 14px;background:#fff;align-items:center">'
      +'<div style="flex:1;min-width:0"><b>'+esc(row.member_name||'عضو غير معروف')+'</b></div>'
      +'<div style="min-width:120px;text-align:center"><b>'+esc(row.membership_number||'—')+'</b></div>'
      +'<div style="min-width:90px;text-align:center"><b>'+Number(row.score||0)+'/100</b></div>'
      +'<div style="min-width:125px;text-align:center"><b>'+label+'</b></div>'
      +'</div>';
  }

  function renderLeaderSummary(rows){
    if(typeof role!=='undefined'&&role!=='leader')return;
    var root=document.getElementById('app');
    if(!root)return;
    var old=document.getElementById('dxn-external-assessment-summary');
    if(old)old.remove();
    var box=document.createElement('section');
    box.id='dxn-external-assessment-summary';
    box.className='card';
    box.style.cssText='margin:14px 0;border:2px solid #d7e7df;background:linear-gradient(135deg,#fbfffd,#fff);direction:rtl;text-align:right';
    var html='<div class="row" style="border:0;align-items:center"><div><div class="title">📋 سجل اختبارات الأعضاء الجدد</div><div class="muted" style="margin-top:4px">اسم العضو — رقم العضوية — الدرجة — النتيجة.</div></div><button type="button" id="dxnLeaderAssessmentRefresh">🔄 تحديث</button></div>'
      +'<div class="row" style="border:0;background:#f4f8f6;font-weight:900;margin-top:10px;border-radius:12px;padding:10px 14px">'
      +'<div style="flex:1">اسم العضو</div><div style="min-width:120px;text-align:center">رقم العضوية</div><div style="min-width:90px;text-align:center">الدرجة</div><div style="min-width:125px;text-align:center">النتيجة</div></div>';
    if(!Array.isArray(rows)||!rows.length){
      html+='<div class="empty" style="margin-top:10px">لا توجد اختبارات محفوظة حتى الآن.</div>';
    }else{
      rows.forEach(function(row){html+=leaderSummaryRow(row);});
    }
    box.innerHTML=html;
    var tabs=root.querySelector('.tabs');
    if(tabs&&tabs.parentNode)tabs.parentNode.insertBefore(box,tabs.nextSibling);
    else if(root.firstChild)root.insertBefore(box,root.firstChild);
    else root.appendChild(box);
    var btn=document.getElementById('dxnLeaderAssessmentRefresh');
    if(btn)btn.onclick=function(){loadLeaderSummary();};
  }

  async function loadLeaderSummary(){
    if(typeof role!=='undefined'&&role!=='leader')return;
    var t=token();
    if(!t)return;
    try{
      var data=await rpc('get_external_training_assessment_summary',{p_token:t});
      renderLeaderSummary(Array.isArray(data)?data:[]);
    }catch(e){
      console.error('DXN leader external assessment summary',e);
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
      if(typeof role!=='undefined'&&role==='leader'){
        scanLeaderModal();
        if(!document.getElementById('dxn-external-assessment-summary'))loadLeaderSummary();
      }
    }catch(e){}
  });

  function start(){
    if(document.body)mo.observe(document.body,{childList:true,subtree:true});
    setTimeout(function(){
      try{
        if(typeof role!=='undefined'&&role==='member')scanMember();
        if(typeof role!=='undefined'&&role==='leader'){
          scanLeaderModal();
          loadLeaderSummary();
        }
      }catch(e){}
    },600);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();