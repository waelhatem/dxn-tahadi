/* V86.46.11 — question admin button in the actual Smart Center container */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864611__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864611__=true;

  function isLeader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-center-button');
  }

  /* The existing leader Smart Center is rendered as #leader-training-center. */
  function smartCenter(){
    var direct=document.getElementById('leader-training-center');
    if(direct)return direct;
    var ids=['leader-smart-center','smart-center','leaderSmartCenter','dxn-smart-center','smartCenter'];
    for(var i=0;i<ids.length;i++){
      var byId=document.getElementById(ids[i]);
      if(byId)return byId.closest&&byId.closest('.card,section')||byId;
    }
    var nodes=document.querySelectorAll('.card,section,.title,h2,h3,button,.tab,[role="tab"]');
    for(var j=0;j<nodes.length;j++){
      var txt=String(nodes[j].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('المركز الذكي')!==-1 || txt.toLowerCase().indexOf('smart center')!==-1){
        var host=nodes[j].closest&&nodes[j].closest('.card,section');
        if(host)return host;
        if(nodes[j].tagName==='BUTTON'||nodes[j].classList.contains('tab')){
          var parent=nodes[j].parentElement;
          if(parent)return parent;
        }
      }
    }
    return null;
  }

  function actionHost(c){
    if(!c)return null;
    var a=c.querySelector('.overall-actions,.actions,.admin-toolbar');
    if(a)return a;
    var a2=document.createElement('div');
    a2.className='admin-toolbar';
    a2.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
    var title=c.querySelector('.title,h2,h3');
    if(title&&title.parentNode===c)title.parentNode.insertBefore(a2,title.nextSibling);else c.insertBefore(a2,c.firstChild);
    return a2;
  }

  function panel(){return document.getElementById('dxn-training-question-admin')||document.getElementById('dxn-training-question-admin-direct-panel')}

  function movePanel(){
    var c=smartCenter(),p=panel();
    if(!c||!p)return false;
    if(p.parentElement!==c)c.appendChild(p);
    p.style.width='100%';p.style.boxSizing='border-box';p.style.margin='14px 0 0';
    return true;
  }

  function loadAdminAndOpen(){
    if(!isLeader())return;
    if(typeof window.openTrainingQuestionAdmin==='function'){
      try{window.openTrainingQuestionAdmin();return}catch(e){}
    }
    var existing=document.querySelector('script[data-dxn-qadmin-center-loader="1"]');
    if(existing)return;
    var s=document.createElement('script');
    s.src='training-question-admin.js?v=86.46.11';s.async=false;s.setAttribute('data-dxn-qadmin-center-loader','1');
    s.onload=function(){
      if(typeof window.openTrainingQuestionAdmin==='function'){try{window.openTrainingQuestionAdmin();}catch(e){}}
    };
    document.head.appendChild(s);
  }

  function openEditor(){
    if(!isLeader())return;
    loadAdminAndOpen();
    setTimeout(function(){var p=panel();if(p){p.style.display='block';movePanel();p.scrollIntoView({behavior:'smooth',block:'start'})}},180);
    setTimeout(movePanel,500);setTimeout(movePanel,900);
  }

  function makeButton(){
    var b=document.createElement('button');b.type='button';b.id='dxn-training-question-admin-center-button';b.className='primary';
    b.textContent='⚙️ تعديل أسئلة اختبارات التدريبات';b.title='فتح تعديل أسئلة اختبارات التدريبات';b.style.fontWeight='900';b.style.whiteSpace='nowrap';
    b.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();openEditor()},true);
    b.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
    return b;
  }

  function installButton(){
    if(!isLeader())return false;
    var c=smartCenter();
    if(!c)return false;
    var b=document.getElementById('dxn-training-question-admin-center-button');
    if(b){var a=actionHost(c);if(a&&b.parentElement!==a)a.insertBefore(b,a.firstChild);return true}
    b=makeButton();var a2=actionHost(c);if(a2)a2.insertBefore(b,a2.firstChild);else c.insertBefore(b,c.firstChild);return true;
  }

  function protectRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped4611)return;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){var result=original.apply(this,arguments);setTimeout(function(){installButton();movePanel()},0);setTimeout(function(){installButton();movePanel()},160);return result}
    wrapped.__dxnCenterWrapped4611=true;window.renderLeaderOverallTraining=wrapped;
  }

  function run(){
    if(!isLeader())return;
    protectRefresh();
    installButton();
    movePanel();
  }

  var n=0,t=setInterval(function(){run();if(++n>900)clearInterval(t)},100);
  if(document.body)new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
})();
