/* V86.45.10 — إضافة تبويب تعديل أسئلة الاختبارات داخل مركز القيادة الذكي */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864510__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V864510__=true;

  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')}
  function globalTab(){return document.getElementById('dxn-training-question-admin-tab')}
  function isLeader(){
    var r='';
    try{r=String(localStorage.getItem('dxn_role')||'').toLowerCase()}catch(e){}
    if(r==='leader')return true;
    try{if(typeof role!=='undefined'&&String(role).toLowerCase()==='leader')return true}catch(e){}
    return !!globalTab();
  }
  function isOpen(){var p=panel();return !!(p&&p.style.display!=='none')}

  function installCenterButton(){
    var c=center();
    if(!c||!isLeader())return false;
    var actions=c.querySelector('.overall-actions');
    if(!actions)return false;
    var old=document.getElementById('dxn-training-question-admin-center-button');
    if(old&&old.parentElement===actions)return true;
    if(old)old.remove();
    var b=document.createElement('button');
    b.id='dxn-training-question-admin-center-button';
    b.type='button';
    b.textContent='⚙️ تعديل أسئلة اختبارات التدريبات';
    b.title='فتح إدارة أسئلة اختبارات التدريبات داخل مركز القيادة الذكي';
    b.style.fontWeight='900';
    b.addEventListener('click',function(){
      var t=globalTab();
      if(t)t.click();
      setTimeout(function(){
        var p=panel();
        if(p){p.style.display='block';moveIntoCenter();p.scrollIntoView({behavior:'smooth',block:'start'})}
      },80);
    });
    actions.appendChild(b);
    return true;
  }

  function moveIntoCenter(){
    var c=center(),p=panel();
    if(!c||!p)return false;
    if(p.parentElement!==c)c.appendChild(p);
    p.style.width='100%';
    p.style.boxSizing='border-box';
    p.style.margin='14px 0 0';
    return true;
  }

  function protectOverallRefresh(){
    if(typeof window.renderLeaderOverallTraining!=='function')return false;
    if(window.renderLeaderOverallTraining.__dxnCenterWrapped)return true;
    var original=window.renderLeaderOverallTraining;
    function wrapped(){
      if(isOpen()){
        installCenterButton();
        moveIntoCenter();
        return true;
      }
      var result=original.apply(this,arguments);
      setTimeout(function(){installCenterButton();moveIntoCenter()},0);
      return result;
    }
    wrapped.__dxnCenterWrapped=true;
    window.renderLeaderOverallTraining=wrapped;
    return true;
  }

  function run(){
    if(!isLeader())return;
    protectOverallRefresh();
    installCenterButton();
    moveIntoCenter();
  }

  var n=0;
  var timer=setInterval(function(){
    run();
    if(++n>300)clearInterval(timer);
  },100);

  new MutationObserver(function(){run()}).observe(document.body,{childList:true,subtree:true});
})();
