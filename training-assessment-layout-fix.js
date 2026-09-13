/* V86.46.43 — تثبيت بنية بطاقة التدريب + إخفاء تعديل الاختبارات من العضو */
(function(){
  if(window.__DXN_TRAINING_LAYOUT_FIX_V864643__)return;
  window.__DXN_TRAINING_LAYOUT_FIX_V864643__=true;

  function addStyles(){
    if(document.getElementById('dxn-training-layout-fix-style'))return;
    var s=document.createElement('style');
    s.id='dxn-training-layout-fix-style';
    s.textContent=''
      +'.dxn-training-fixed-head{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0!important;padding:0!important}'
      +'.dxn-training-fixed-head>.dxn-training-title-fixed{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:0 0 10px 0!important;text-align:right!important;white-space:normal!important}'
      +'.dxn-training-fixed-head>.dxn-training-action-row{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;flex-wrap:nowrap!important;direction:rtl!important;margin:0 0 12px 0!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important;-webkit-overflow-scrolling:touch!important}'
      +'.dxn-training-fixed-head>.dxn-training-action-row::-webkit-scrollbar{display:none!important}'
      +'.dxn-training-fixed-head>.dxn-training-action-row>.dxn-training-primary-action{display:inline-flex!important;flex:1 1 auto!important;min-width:0!important;width:auto!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}'
      +'.dxn-training-fixed-head>.dxn-training-action-row>[data-training-assessment-button]{display:inline-flex!important;flex:0 0 auto!important;width:auto!important;min-width:max-content!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;white-space:nowrap!important}'
      +'@media(max-width:600px){.dxn-training-fixed-head>.dxn-training-title-fixed{font-size:18px!important;line-height:1.45!important;margin-bottom:8px!important}.dxn-training-fixed-head>.dxn-training-action-row{gap:6px!important;margin-bottom:10px!important}.dxn-training-fixed-head>.dxn-training-action-row>.dxn-training-primary-action{font-size:13px!important;padding-left:10px!important;padding-right:10px!important}.dxn-training-fixed-head>.dxn-training-action-row>[data-training-assessment-button]{font-size:13px!important;padding:8px 10px!important;min-height:40px!important}}'
      +'@media(max-width:390px){.dxn-training-fixed-head>.dxn-training-action-row{gap:5px!important}.dxn-training-fixed-head>.dxn-training-action-row>.dxn-training-primary-action{font-size:12px!important;padding-left:8px!important;padding-right:8px!important}.dxn-training-fixed-head>.dxn-training-action-row>[data-training-assessment-button]{font-size:12px!important;padding:8px!important}}';
    (document.head||document.documentElement).appendChild(s);
  }

  function memberPage(){
    var r=String((typeof window.role!=='undefined'?window.role:'')||window.currentRole||localStorage.getItem('dxn_role')||'').toLowerCase();
    return r==='member'||!!document.querySelector('[data-role="member"]')||!!document.getElementById('dxn-training-assessment');
  }

  function normalize(){
    if(!memberPage())return;
    addStyles();
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-training-assessment-button]'));
    buttons.forEach(function(btn){
      var card=btn.closest('.card');
      if(!card)return;
      var head=card.querySelector(':scope > .dxn-training-fixed-head');
      if(!head){
        head=document.createElement('div');
        head.className='dxn-training-fixed-head';
        card.insertBefore(head,card.firstChild);
      }

      var title=head.querySelector('.dxn-training-title-fixed');
      if(!title){
        var nodes=card.querySelectorAll('.title,h2,h3,h4,strong,b');
        for(var i=0;i<nodes.length;i++){
          if(nodes[i]===btn||nodes[i].closest('.dxn-training-fixed-head'))continue;
          var t=String(nodes[i].textContent||'').replace(/\s+/g,' ').trim();
          if(/التدريب\s*\d+/.test(t)){
            title=nodes[i];
            break;
          }
        }
      }
      if(title){
        title.classList.add('dxn-training-title-fixed');
        if(title.parentNode!==head)head.appendChild(title);
      }

      var row=btn.parentElement;
      if(!row||!row.classList.contains('dxn-training-action-row')){
        row=document.createElement('div');
        row.className='dxn-training-action-row';
        if(btn.parentNode)btn.parentNode.insertBefore(row,btn);
        row.appendChild(btn);
      }
      if(row.parentNode!==head)head.appendChild(row);

      var primary=row.querySelector('.dxn-training-primary-action');
      if(!primary){
        var candidates=card.querySelectorAll('button,a');
        for(var j=0;j<candidates.length;j++){
          var el=candidates[j];
          if(el.hasAttribute('data-training-assessment-button'))continue;
          var txt=String(el.textContent||'').trim();
          if(/مشاهدة|إعادة المشاهدة|بدء التدريب|ابدأ التدريب/.test(txt)){
            primary=el;
            break;
          }
        }
      }
      if(primary){
        primary.classList.add('dxn-training-primary-action');
        if(primary.parentNode!==row)row.insertBefore(primary,row.firstChild);
      }

      var same=Array.prototype.slice.call(card.querySelectorAll('[data-training-assessment-button]'));
      same.forEach(function(x,idx){if(x!==btn)x.remove()});
    });
  }

  function hideQuestionEditControls(){
    if(!memberPage())return;
    var nodes=document.querySelectorAll('button,a,[role="button"],summary');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(!el||el.dataset&&el.dataset.dxnHideQuestionEdit==='1')continue;
      var text=(String(el.textContent||'')+' '+String(el.getAttribute('aria-label')||'')+' '+String(el.getAttribute('title')||'')).replace(/\s+/g,' ').trim();
      if(!/تعديل\s+أسئلة\s+الاختبارات|تعديل\s+الاختبارات/.test(text))continue;
      el.dataset.dxnHideQuestionEdit='1';
      var wrapper=el;
      var p=el.parentElement;
      if(p&&p.tagName==='A'&&p.children.length<=1)wrapper=p;
      wrapper.remove();
      if(wrapper.parentElement){
        var parent=wrapper.parentElement;
        var remaining=parent.querySelectorAll('button,a,[role="button"]');
        if(!remaining.length && !String(parent.textContent||'').trim())parent.remove();
      }
    }
  }

  function boot(){
    normalize();
    hideQuestionEditControls();
    setTimeout(function(){normalize();hideQuestionEditControls()},150);
    setTimeout(function(){normalize();hideQuestionEditControls()},500);
    setTimeout(function(){normalize();hideQuestionEditControls()},1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  try{new MutationObserver(function(){clearTimeout(window.__dxnTrainingLayoutFixTimer);window.__dxnTrainingLayoutFixTimer=setTimeout(function(){normalize();hideQuestionEditControls()},80)}).observe(document.body,{childList:true,subtree:true})}catch(e){}
})();
