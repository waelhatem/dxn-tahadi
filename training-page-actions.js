/* V86.46.50 — إخفاء المركز الذكي عن العضو فقط مع الحفاظ الكامل على وظائف القائد. */
(function(){
  if(window.__DXN_TRAINING_PAGE_ACTIONS_V864650__)return;
  window.__DXN_TRAINING_PAGE_ACTIONS_V864650__=true;

  function role(){
    try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()}catch(e){return ''}
  }
  function isLeader(){return role()==='leader'}
  function isMember(){return role()==='member'}

  function section(){
    var x=document.getElementById('section-training');
    if(x)return x;
    var all=document.querySelectorAll('#app .card,#app section,.app .card,.app section');
    for(var i=0;i<all.length;i++){
      var t=String(all[i].textContent||'').replace(/\s+/g,' ').trim();
      if(t.indexOf('الشروحات والتدريبات')!==-1)return all[i];
    }
    return null;
  }

  function styles(){
    if(document.getElementById('dxn-training-page-actions-style'))return;
    var s=document.createElement('style');s.id='dxn-training-page-actions-style';
    s.textContent=[
      '#leader-training-center .overall-actions{display:none!important}',
      '#leader-training-center .overall-head{display:block!important}',
      '#leader-training-center .overall-head>div:first-child{width:100%!important}',
      '#dxn-training-question-single-nav{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;align-items:stretch!important;margin:14px 0 18px!important;padding:8px!important;border:1px solid var(--line)!important;border-radius:18px!important;background:#f7faf8!important;box-shadow:0 4px 14px rgba(0,0,0,.04)!important}',
      '#dxn-training-question-single-nav button{min-height:48px!important;border-radius:12px!important;font-size:15px!important;font-weight:900!important;cursor:pointer!important}',
      '#dxn-training-question-single-nav #dxn-training-question-single-button{background:var(--green)!important;color:#fff!important;border-color:var(--green)!important}',
      '@media(max-width:600px){#dxn-training-question-single-nav{grid-template-columns:1fr!important}#dxn-training-question-single-nav button{width:100%!important}}'
    ].join('');document.head.appendChild(s);
  }

  function removeMemberSmartCenter(){
    if(!isMember())return;
    var tabs=document.querySelectorAll('.tabs .tab');
    for(var i=0;i<tabs.length;i++){
      var b=tabs[i], text=String(b.textContent||'').replace(/\s+/g,' ').trim();
      var click=String(b.getAttribute('onclick')||'');
      if(text.indexOf('المركز الذكي')!==-1 || /switchTab\(['"]advanced['"]\)/.test(click)){
        b.remove();
      }
    }
    var advanced=document.querySelector('[data-tab="advanced"]');
    if(advanced)advanced.remove();
  }

  function isQuestionText(el){
    return String(el&&el.textContent||'').replace(/\s+/g,' ').trim().indexOf('تعديل أسئلة الاختبارات')!==-1;
  }

  function removeOrphanQuestionButtons(){
    var canonical=document.getElementById('dxn-training-question-single-nav');
    var all=document.querySelectorAll('button,a,[role="button"],[role="tab"],.tab');
    for(var i=0;i<all.length;i++){
      var el=all[i];if(!isQuestionText(el))continue;
      if(canonical && canonical.contains(el))continue;
      var node=el;
      while(node.parentElement&&node.parentElement!==document.body&&node.parentElement.tagName!=='SECTION'){
        var p=node.parentElement,t=String(p.textContent||'').replace(/\s+/g,' ').trim(),controls=p.querySelector('button,input,select,textarea,video,iframe');
        if(t==='تعديل أسئلة الاختبارات'||!controls)node=p;else break;
      }
      if(node&&node!==document.body&&!node.id?.startsWith('section-'))node.remove();
    }
  }

  function removeEmptyOrphanContainer(){
    var sec=section();if(!sec)return;
    var children=Array.from(sec.children||[]);
    for(var i=0;i<children.length;i++){
      var el=children[i];if(el.id==='dxn-training-question-single-nav')continue;
      var text=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
      if(text||el.querySelector('button,input,select,textarea,video,iframe'))continue;
      if(el.offsetHeight>=10&&el.offsetHeight<=100)el.remove();
    }
  }

  function removeExtraActionButtons(sec){
    if(!sec)return;
    var labels=['📚 إدارة التدريبات','إدارة التدريبات','🔄 تحديث التقدم','تحديث التقدم'];
    var els=sec.querySelectorAll('button,a,[role="button"]');
    for(var i=0;i<els.length;i++){
      var e=els[i];if(e.closest('#dxn-training-question-single-nav'))continue;
      var t=String(e.textContent||'').replace(/\s+/g,' ').trim();
      if(labels.indexOf(t)!==-1)e.remove();
    }
  }

  function clean(){
    styles();
    removeMemberSmartCenter();
    removeOrphanQuestionButtons();
    var sec=section();
    if(!sec)return;
    if(isLeader())removeExtraActionButtons(sec);
    removeEmptyOrphanContainer();
    var nav=document.getElementById('dxn-training-question-single-nav');
    if(nav){var buttons=nav.querySelectorAll('button');for(var i=0;i<buttons.length;i++)buttons[i].style.minHeight='48px'}
  }

  function run(){clearTimeout(window.__DXN_TRAINING_PAGE_ACTIONS_TIMER);window.__DXN_TRAINING_PAGE_ACTIONS_TIMER=setTimeout(clean,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  if(document.body)new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
})();