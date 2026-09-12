/* V86.45.9 — فتح إدارة أسئلة الاختبارات داخل مركز القيادة الذكي */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86459__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_CENTER_V86459__=true;

  function center(){return document.getElementById('leader-training-center')}
  function panel(){return document.getElementById('dxn-training-question-admin')}
  function isOpen(){var p=panel();return !!(p&&p.style.display!=='none')}

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
        moveIntoCenter();
        return true;
      }
      var result=original.apply(this,arguments);
      setTimeout(moveIntoCenter,0);
      return result;
    }
    wrapped.__dxnCenterWrapped=true;
    window.renderLeaderOverallTraining=wrapped;
    return true;
  }

  function run(){
    if(typeof role!=='undefined'&&role!=='leader')return;
    protectOverallRefresh();
    moveIntoCenter();
  }

  var n=0;
  var timer=setInterval(function(){
    run();
    if(++n>300)clearInterval(timer);
  },100);

  new MutationObserver(function(){
    run();
  }).observe(document.body,{childList:true,subtree:true});
})();
