/* V86.46.4 — إصلاح فتح محرر أسئلة الاختبارات من مركز القائد */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86464__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86464__=true;

  function isLeader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-tab');
  }
  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')}

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
    var direct=window.openTrainingQuestionAdmin;
    if(typeof direct==='function'){
      try{
        var ok=direct();
        if(ok!==false){
          setTimeout(moveIntoCenter,80);
          setTimeout(moveIntoCenter,250);
          setTimeout(moveIntoCenter,600);
          return;
        }
      }catch(e){console.debug('DXN direct question admin open failed',e)}
    }

    /* النسخة الاحتياطية: لا نضيف active قبل click لأن click نفسه يبدّل الحالة. */
    var b=document.getElementById('dxn-training-question-admin-tab');
    if(b){
      if(!b.classList.contains('active')) b.click();
      else {
        var p0=panel();
        if(p0)p0.style.display='block';
      }
    }
    setTimeout(function(){
      var p=panel();
      if(p){
        p.style.display='block';
        moveIntoCenter();
        p.scrollIntoView({behavior:'smooth',block:'start'});
      }
    },150);
    setTimeout(moveIntoCenter,400);
    setTimeout(moveIntoCenter,800);
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
    b.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      openEditor();
    });
    return b;
  }

  function installButton(){
    if(!isLeader())return false;
    var c=center();
    if(!c)return false;
    var existing=c.querySelector('#dxn-training-question-admin-center-button');
    var actions=c.querySelector('.overall-actions');
    if(existing){
      if(actions&&existing.parentElement!==actions)actions.insertBefore(existing,actions.firstChild);
      return true;
    }
    var button=makeButton();
    if(actions){actions.insertBefore(button,actions.firstChild);return true}
    var buttons=c.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      var txt=String(buttons[i].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('إدارة التدريبات')!==-1){buttons[i].parentNode.insertBefore(button,buttons[i]);return true}
    }
    var head=c.querySelector('.overall-head');
    if(head){head.insertBefore(button,head.firstChild);return true}
    return false;
  }

  function protectRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped464)return;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){
      var result=original.apply(this,arguments);
      setTimeout(function(){installButton();moveIntoCenter()},0);
      setTimeout(function(){installButton();moveIntoCenter()},150);
      return result;
    }
    wrapped.__dxnCenterWrapped464=true;
    window.renderLeaderOverallTraining=wrapped;
  }

  function run(){
    if(!isLeader())return;
    protectRefresh();
    installButton();
    moveIntoCenter();
  }

  var n=0;
  var timer=setInterval(function(){run();if(++n>600)clearInterval(timer)},100);
  if(document.body)new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
})();
