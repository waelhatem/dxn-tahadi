/* V86.45.11 — زر تعديل أسئلة الاختبارات داخل المركز الذكي نفسه */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864511__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864511__=true;

  function leader(){
    try{if(String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader')return true}catch(e){}
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!document.getElementById('dxn-training-question-admin-tab');
  }
  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')}
  function adminTab(){return document.getElementById('dxn-training-question-admin-tab')}
  function isOpen(){var p=panel();return !!(p&&p.style.display!=='none')}

  function moveIntoCenter(){
    var c=center(),p=panel();
    if(!c||!p)return false;
    if(p.parentElement!==c)c.appendChild(p);
    p.style.width='100%';p.style.boxSizing='border-box';p.style.margin='14px 0 0';
    return true;
  }

  function openEditor(){
    if(!leader())return;
    var b=adminTab();
    if(b){
      b.click();
      setTimeout(moveIntoCenter,20);
      setTimeout(moveIntoCenter,150);
      setTimeout(moveIntoCenter,500);
      return;
    }
    setTimeout(openEditor,200);
  }

  function installButton(){
    if(!leader())return false;
    var c=center();if(!c)return false;
    var actions=c.querySelector('.overall-actions');
    if(!actions)return false;
    var old=document.getElementById('dxn-training-question-admin-center-button');
    if(old&&old.parentElement===actions)return true;
    if(old)old.remove();
    var b=document.createElement('button');
    b.id='dxn-training-question-admin-center-button';
    b.type='button';
    b.className='primary';
    b.textContent='⚙️ تعديل أسئلة اختبارات التدريبات';
    b.title='فتح إدارة أسئلة اختبارات التدريبات داخل مركز القيادة الذكي';
    b.addEventListener('click',openEditor);
    actions.appendChild(b);
    return true;
  }

  function protectOverallRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return false;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped4511)return true;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){
      if(isOpen()){
        setTimeout(function(){installButton();moveIntoCenter()},0);
        return true;
      }
      var result=original.apply(this,arguments);
      setTimeout(function(){installButton();moveIntoCenter()},0);
      return result;
    }
    wrapped.__dxnCenterWrapped4511=true;
    window.renderLeaderOverallTraining=wrapped;
    return true;
  }

  function run(){
    if(!leader())return;
    protectOverallRefresh();
    installButton();
    moveIntoCenter();
  }

  var n=0,t=setInterval(function(){run();if(++n>400)clearInterval(t)},100);
  new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
})();
