/* V86.45.12 — زر تعديل أسئلة الاختبارات داخل المركز الذكي، مستقل عن بنية الأزرار */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864512__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864512__=true;

  function isLeader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-tab');
  }
  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')}
  function adminTab(){return document.getElementById('dxn-training-question-admin-tab')}

  function moveIntoCenter(){
    var c=center(),p=panel();
    if(!c||!p)return false;
    if(p.parentElement!==c)c.appendChild(p);
    p.style.width='100%';
    p.style.boxSizing='border-box';
    p.style.margin='14px 0 0';
    return true;
  }

  function openEditor(){
    if(!isLeader())return;
    var b=adminTab();
    if(b)b.click();
    setTimeout(function(){
      var p=panel();
      if(p){
        p.style.display='block';
        moveIntoCenter();
        p.scrollIntoView({behavior:'smooth',block:'start'});
      }
    },80);
    setTimeout(moveIntoCenter,250);
    setTimeout(moveIntoCenter,600);
  }

  function makeButton(){
    var b=document.createElement('button');
    b.type='button';
    b.id='dxn-training-question-admin-center-button';
    b.className='primary';
    b.textContent='⚙️ تعديل أسئلة اختبارات التدريبات';
    b.title='فتح تعديل أسئلة اختبارات التدريبات';
    b.style.fontWeight='900';
    b.style.whiteSpace='nowrap';
    b.addEventListener('click',openEditor);
    return b;
  }

  function installButton(){
    if(!isLeader())return false;
    var c=center();
    if(!c)return false;
    if(c.querySelector('#dxn-training-question-admin-center-button'))return true;

    var actions=c.querySelector('.overall-actions');
    if(actions){
      actions.appendChild(makeButton());
      return true;
    }

    /* fallback: ابحث عن زر إدارة التدريبات نفسه، حتى لو تغيّر class الحاوية */
    var buttons=c.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      var txt=String(buttons[i].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('إدارة التدريبات')!==-1){
        buttons[i].parentNode.insertBefore(makeButton(),buttons[i].nextSibling);
        return true;
      }
    }

    /* fallback أخير: أضفه مباشرة إلى رأس المركز */
    var head=c.querySelector('.overall-head');
    if(head){head.appendChild(makeButton());return true}
    return false;
  }

  function protectRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped4512)return;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){
      var result=original.apply(this,arguments);
      setTimeout(function(){installButton();moveIntoCenter()},0);
      setTimeout(function(){installButton();moveIntoCenter()},150);
      return result;
    }
    wrapped.__dxnCenterWrapped4512=true;
    window.renderLeaderOverallTraining=wrapped;
  }

  function run(){
    if(!isLeader())return;
    protectRefresh();
    installButton();
    moveIntoCenter();
  }

  var n=0;
  var timer=setInterval(function(){
    run();
    if(++n>600)clearInterval(timer);
  },100);

  if(document.body){
    new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
  }
})();
