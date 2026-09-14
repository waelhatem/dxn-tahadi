/* Prevent a verified Team-Bidayat-Amal member from opening the account-creation form
   when that DXN member number already has a Community of Health & Wealth account. */
(function(){
  if(window.__DXN_DUPLICATE_MEMBERSHIP_GUARD__)return;
  window.__DXN_DUPLICATE_MEMBERSHIP_GUARD__=true;

  function apiRpc(name,args){
    return fetch('/api/rpc',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fn:name,args:args||{}}),
      cache:'no-store'
    }).then(async function(r){
      var text=await r.text(), data=null;
      try{data=text?JSON.parse(text):null}catch(e){}
      if(!r.ok){
        var err=new Error((data&&(data.message||data.error))||text||('HTTP '+r.status));
        err.status=r.status; err.code=data&&data.code; err.details=data&&data.details; err.hint=data&&data.hint;
        throw err;
      }
      return data;
    });
  }

  function showDuplicate(no,name){
    var status=document.getElementById('verifyMemberStatus');
    if(!status)return;
    status.textContent='⚠️ رقم العضوية مسجل مسبقًا في مجتمع الصحة والثراء، ولا يمكن إنشاء عضوية ثانية باستخدام رقم العضوية نفسه.';
    status.style.cssText='text-align:center;min-height:24px;margin-top:10px;padding:10px 12px;border:1px solid #d99a18;border-radius:12px;background:#fff8df;color:#7a5300;font-weight:900;line-height:1.8;';
    if(typeof toast==='function')toast('رقم العضوية مسجل مسبقًا في مجتمع الصحة والثراء.');
  }

  async function guardedVerify(){
    var input=document.getElementById('verifyMemberNo');
    var btn=document.getElementById('verifyMemberBtn');
    var status=document.getElementById('verifyMemberStatus');
    var no=input?String(input.value||'').trim():'';
    if(!/^\d{9}$/.test(no)){
      if(status)status.textContent='⚠️ رقم العضوية يجب أن يكون 9 أرقام بالضبط.';
      if(typeof toast==='function')toast('رقم العضوية يجب أن يكون 9 أرقام بالضبط.');
      return;
    }
    if(btn){btn.disabled=true;btn.textContent='⏳ جارٍ التحقق...'}
    if(status)status.textContent='جارٍ التحقق من العضوية...';
    try{
      var r=await apiRpc('verify_team_member',{p_member_no:no});
      if(!r||!r.allowed){
        var msg=(r&&r.message)||'هذه العضوية غير مسجلة ضمن فريق بداية أمل.';
        if(status)status.textContent='❌ '+msg;
        if(typeof toast==='function')toast(msg);
        return;
      }

      var existing=await apiRpc('check_member_account_status',{p_member_no:no});
      if(existing&&existing.registered){
        showDuplicate(no,existing.name||r.name||'');
        return;
      }

      if(r.already_registered||r.registered){
        showDuplicate(no,r.name||'');
        return;
      }

      if(status)status.textContent='✅ تم التحقق بنجاح.';
      if(typeof renderMemberAccountSetup==='function')renderMemberAccountSetup(no,r.name||'');
    }catch(e){
      if(status)status.textContent='❌ تعذر الاتصال بخدمة التحقق: '+(e.message||'خطأ غير معروف');
      if(typeof toast==='function')toast(e.message||'تعذر التحقق من العضوية.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='🔎 التحقق من العضوية';}
    }
  }

  function install(){
    if(typeof renderMemberVerify!=='function')return false;
    window.verifyTeamMember=guardedVerify;
    return true;
  }
  var tries=0;
  var timer=setInterval(function(){
    if(install()||++tries>300)clearInterval(timer);
  },100);
})();
