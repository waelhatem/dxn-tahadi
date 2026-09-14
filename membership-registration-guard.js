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
    var app=document.getElementById('app');
    if(!app)return;
    var displayName=name?String(name):'';
    app.innerHTML='<div class="login card" style="max-width:700px;text-align:center">'
      +'<div style="text-align:center">'
      +'<img class="logo" src="logo.png" alt="شعار مجتمع الصحة والثراء">'
      +'<div style="font-size:44px;margin:10px 0">✅</div>'
      +'<h1>رقم العضوية مسجل مسبقًا</h1>'
      +'<p style="font-size:18px;line-height:2;margin:10px auto;max-width:560px">'
      +'رقم العضوية <b>'+String(no).replace(/[<>]/g,'')+'</b> مسجل مسبقًا كعضو في مجتمع الصحة والثراء، ولا يمكن إنشاء عضوية ثانية باستخدام رقم العضوية نفسه.'
      +'</p>'
      +(displayName?'<div class="muted" style="margin-top:8px">الاسم المسجل: <b>'+displayName.replace(/[<>]/g,'')+'</b></div>':'')
      +'<button class="primary" style="width:100%;margin-top:18px" onclick="renderLogin()">🔐 العودة لتسجيل الدخول</button>'
      +'</div></div>';
    if(typeof renderViewSwitch==='function')renderViewSwitch();
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
      /* First verify eligibility in Team Bidayat Amal. */
      var r=await apiRpc('verify_team_member',{p_member_no:no});
      if(!r||!r.allowed){
        var msg=(r&&r.message)||'هذه العضوية غير مسجلة ضمن فريق بداية أمل.';
        if(status)status.textContent='❌ '+msg;
        if(typeof toast==='function')toast(msg);
        return;
      }

      /* Second check: has this DXN member number already been registered? */
      var existing=await apiRpc('check_member_account_status',{p_member_no:no});
      if(existing&&existing.registered){
        showDuplicate(no,existing.name||r.name||'');
        return;
      }

      /* Also honor a future backend response without requiring a new frontend release. */
      if(r.already_registered||r.registered){
        showDuplicate(no,r.name||'');
        return;
      }

      if(status)status.textContent='✅ تم التحقق بنجاح.';
      if(typeof renderMemberAccountSetup==='function')renderMemberAccountSetup(no,r.name||'');
    }catch(e){
      /* Keep the original eligibility flow usable if the new optional status RPC has not
         reached the live database yet. The database unique constraint still blocks duplicates
         at final creation, while the UI guard activates immediately after the RPC is deployed. */
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
