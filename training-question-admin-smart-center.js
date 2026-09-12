/* V86.46.11 — keep training question editor inside the actual Smart Center */
(function(){
  if(window.__DXN_TRAINING_QUESTION_ADMIN_SMART_CENTER_V864611__)return;
  window.__DXN_TRAINING_QUESTION_ADMIN_SMART_CENTER_V864611__=true;

  function isLeader(){
    try{return String(localStorage.getItem('dxn_role')||'').toLowerCase()==='leader'}catch(e){return false}
  }
  function smartCenter(){
    var direct=document.getElementById('leader-training-center');
    if(direct)return direct;
    var ids=['leader-smart-center','smart-center','leaderSmartCenter','dxn-smart-center','smartCenter'];
    for(var i=0;i<ids.length;i++){
      var x=document.getElementById(ids[i]);
      if(x)return x.closest&&x.closest('.card,section')||x;
    }
    var nodes=document.querySelectorAll('.card,section,.title,h2,h3,button,.tab,[role="tab"]');
    for(var j=0;j<nodes.length;j++){
      var txt=String(nodes[j].textContent||'').replace(/\s+/g,' ').trim();
      if(txt.indexOf('المركز الذكي')!==-1||txt.toLowerCase().indexOf('smart center')!==-1){
        var host=nodes[j].closest&&nodes[j].closest('.card,section');
        if(host)return host;
      }
    }
    return null;
  }
  function move(){
    if(!isLeader())return false;
    var c=smartCenter();if(!c)return false;
    var b=document.getElementById('dxn-training-question-admin-center-button');
    if(b){
      var a=c.querySelector('.overall-actions,.actions,.admin-toolbar');
      if(a){if(b.parentElement!==a)a.insertBefore(b,a.firstChild)}
      else if(b.parentElement!==c)c.insertBefore(b,c.firstChild);
    }
    var p=document.getElementById('dxn-training-question-admin')||document.getElementById('dxn-training-question-admin-direct-panel');
    if(p&&p.parentElement!==c){c.appendChild(p);p.style.width='100%';p.style.boxSizing='border-box';p.style.margin='14px 0 0'}
    return !!b||!!p;
  }
  function open(){
    var fn=window.openTrainingQuestionAdmin;
    if(typeof fn==='function'){try{fn();setTimeout(move,150);setTimeout(move,500);return true}catch(e){}}
    return false;
  }
  window.__DXN_OPEN_TRAINING_QUESTION_ADMIN_SMART_CENTER__=open;
  var timer=setInterval(function(){move();if(window.__DXN_TRAINING_QUESTION_ADMIN_SMART_CENTER_V864611__){}},100);
  if(document.body)new MutationObserver(function(){move()}).observe(document.body,{childList:true,subtree:true});
})();
