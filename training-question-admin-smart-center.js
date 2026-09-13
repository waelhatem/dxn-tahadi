/* V86.46.22 — Leader-only question editor (Stable - No Loops) */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_SUBTAB_V864622__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_SUBTAB_V864622__=true;

  function isLeader(){
    try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader'}catch(e){return false}
  }
  function topTabs(){return document.querySelector('.tabs')}
  function trainingTab(){
    var t=topTabs();if(!t)return null;
    var bs=t.querySelectorAll('button.tab,[role="tab"],.tab');
    for(var i=0;i<bs.length;i++){
      var x=bs[i],txt=String(x.textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('الشروحات والتدريبات')!==-1||txt.indexOf('Lessons & Training')!==-1)return x;
    }
    return null;
  }
  function trainingSection(){
    var s=document.getElementById('section-training');
    if(s)return s;
    var nodes=document.querySelectorAll('.card,section');
    for(var i=0;i<nodes.length;i++){
      var txt=String(nodes[i].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('الشروحات والتدريبات')!==-1||txt.indexOf('Lessons & Training')!==-1)return nodes[i];
    }
    return null;
  }
  function editor(){return document.getElementById('dxn-training-question-admin')||document.getElementById('dxn-training-question-admin-direct-panel')}

  function removeOldTopLevel(){
    var ids=['dxn-training-question-admin-tab','dxn-training-question-admin-center-button','dxn-qadmin-page-bottom','dxn-qadmin-bottom-host','dxn-smart-qadmin-host'];
    for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el&&ids[i]!=='dxn-training-question-admin')el.remove()}
    var t=topTabs();if(!t)return;
    var bs=t.querySelectorAll('button,.tab,[role="tab"]');
    for(var j=0;j<bs.length;j++){
      var txt=String(bs[j].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('تعديل أسئلة الاختبارات')!==-1||txt.indexOf('تعديل أسئلة اختبارات التدريبات')!==-1)bs[j].remove();
    }
  }

  function ensureCss(){
    if(document.getElementById('dxn-training-question-subtab-css-86421'))return;
    var s=document.createElement('style');s.id='dxn-training-question-subtab-css-86421';
    s.textContent='html,body{overflow-x:hidden!important}.dxn-training-subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;padding:8px;background:#f8faf9;border:1px solid var(--line);border-radius:16px}.dxn-training-subtabs button{min-height:42px;padding:9px 14px;border-radius:12px;background:#fff;color:var(--text);font-weight:900;border:1px solid var(--line);cursor:pointer}.dxn-training-subtabs button.active{background:var(--green);color:#fff;border-color:var(--green)}#dxn-training-question-admin{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;position:relative!important;left:auto!important;right:auto!important;transform:none!important;margin:14px 0!important}.dxn-training-editor-host{width:100%!important;max-width:100%!important;box-sizing:border-box!important;display:block!important;clear:both!important;margin-top:14px!important}.dxn-training-editor-host textarea,.dxn-training-editor-host input{max-width:100%!important;box-sizing:border-box!important}';
    document.head.appendChild(s);
  }

  function subtab(){return document.getElementById('dxn-training-question-subtab')}

  function installSubtab(){
    if(!isLeader())return false;
    var tabs=topTabs(),tt=trainingTab();if(!tabs||!tt)return false;
    var old=subtab();
    if(!old){
      var bar=document.createElement('div');bar.className='dxn-training-subtabs';bar.id='dxn-training-subtabs';
      var b=document.createElement('button');b.type='button';b.id='dxn-training-question-subtab';b.textContent='⚙️ تعديل أسئلة الاختبارات';b.title='تعديل أسئلة اختبارات التدريبات للقائد';
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openEditor(true)});
      bar.appendChild(b);
      if(tabs.parentNode){tabs.parentNode.insertBefore(bar,tabs.nextSibling)}
      old=b;
    }
    var trainingActive=tt.classList.contains('active')||tt.getAttribute('aria-selected')==='true';
    var bar2=document.getElementById('dxn-training-subtabs');
    if(bar2)bar2.style.display=trainingActive?'flex':'none';
    return true;
  }

  function ensureEditorHost(){
    var sec=trainingSection();if(!sec)return null;
    var h=sec.querySelector(':scope > .dxn-training-editor-host');
    if(!h){h=document.createElement('div');h.className='dxn-training-editor-host';h.id='dxn-training-editor-host';sec.appendChild(h)}
    return h;
  }

  function placeEditor(){
    if(!isLeader())return false;
    var p=editor(),h=ensureEditorHost();if(!p||!h)return false;
    if(p.parentElement!==h)h.appendChild(p);
    p.style.display=p.style.display==='none'?'none': 'block';
    return true;
  }

  function openEditor(scroll){
    if(!isLeader())return;
    var fn=window.openTrainingQuestionAdmin;
    if(typeof fn==='function'){try{fn()}catch(e){}}
    setTimeout(function(){
      placeEditor();
      var p=editor();if(p){p.style.display='block';if(scroll)p.scrollIntoView({behavior:'smooth',block:'start'})}
      var b=subtab();if(b)b.classList.add('active');
    },80);
  }

  var isSyncing = false;
  function sync(){
    if(!isLeader() || isSyncing) return;
    isSyncing = true;
    try {
      ensureCss();
      removeOldTopLevel();
      installSubtab();
      placeEditor();
      var tt=trainingTab(),p=editor(),b=subtab();
      if(tt&&b){
        var active=tt.classList.contains('active')||tt.getAttribute('aria-selected')==='true';
        b.classList.toggle('active',!!p&&p.style.display!=='none'&&active);
        if(!active&&p)p.style.display='none';
      }
    } finally {
      setTimeout(function(){ isSyncing = false; }, 50);
    }
  }

  // تشغيل آمن ومحدود عند التحميل فقط
  var attempts = 0;
  var initTimer = setInterval(function(){
    sync();
    if(++attempts > 15) clearInterval(initTimer);
  }, 300);

  // تحديث خفيف فقط عند النقر على التبويبات بدون تجميد
  document.addEventListener('click', function(e){
    var target = e.target && e.target.closest('button, .tab, [role="tab"]');
    if(target) setTimeout(sync, 100);
  });

  window.addEventListener('resize', sync, {passive:true});
})();
