/* V86.15 — Restore detailed-profile buttons in the leader training list. */
(function(){
  if(window.__DXN_MEMBER_PROFILE_BUTTONS_V8615__) return;
  window.__DXN_MEMBER_PROFILE_BUTTONS_V8615__=true;
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]});}
  function open(id){
    if(typeof window.__DXNOpenDetailedMemberProfile==='function') return window.__DXNOpenDetailedMemberProfile(id);
    if(typeof window.openMemberProfile==='function') return window.openMemberProfile(id);
    if(typeof window.toast==='function') window.toast('لم يتم تحميل الملف التفصيلي بعد.');
  }
  function install(){
    try{
      var members=(typeof window.data!=='undefined'&&window.data&&Array.isArray(window.data.members))?window.data.members:[];
      if(!members.length) return;
      document.querySelectorAll('.row').forEach(function(row){
        if(row.closest('#memberProfileModal')) return;
        var text=row.textContent||'';
        var member=members.find(function(m){
          var no=String(m.member_no||'').trim(), name=String(m.name||'').trim();
          return no && text.indexOf(no)>=0 && (!name || text.indexOf(name)>=0);
        });
        if(!member) return;
        if(row.querySelector('[data-dxn-profile-button]')) return;
        var b=document.createElement('button');
        b.type='button';
        b.setAttribute('data-dxn-profile-button','1');
        b.setAttribute('aria-label','فتح الملف التفصيلي لـ '+String(member.name||'العضو'));
        b.className='primary';
        b.textContent='👤 الملف التفصيلي';
        b.style.cssText='flex:0 0 auto;white-space:nowrap;margin-inline-start:10px;align-self:center;min-width:155px;';
        b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();open(member.id);},true);
        row.appendChild(b);
      });
    }catch(e){console.debug('V86.15 profile buttons',e)}
  }
  window.__DXNRestoreMemberProfileButtons=install;
  install();
  new MutationObserver(function(){clearTimeout(window.__dxnProfileButtonTimer);window.__dxnProfileButtonTimer=setTimeout(install,30);}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  setInterval(install,1200);
})();
