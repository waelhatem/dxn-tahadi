/* V86.46.47 — remove the duplicate standalone question-edit UI and its empty container. */
(function(){
  if(window.__DXN_TRAINING_QUESTION_CENTER_CLEANUP_V864647__)return;
  window.__DXN_TRAINING_QUESTION_CENTER_CLEANUP_V864647__=true;
  function isQuestionButton(el){
    var t=String(el&&el.textContent||'').replace(/\s+/g,' ').trim();
    return t.indexOf('تعديل أسئلة الاختبارات')!==-1;
  }
  function cleanup(){
    ['dxn-training-question-admin-center-button','dxn-qadmin-page-bottom','dxn-training-question-admin-direct-panel','dxn-training-question-admin-tab','dxn-training-question-admin-subtabs','dxn-training-question-force-subtabs','dxn-training-question-single-nav'].forEach(function(id){var el=document.getElementById(id);if(el)el.remove()});
    document.querySelectorAll('button,[role="tab"],.tab').forEach(function(el){if(isQuestionButton(el))el.remove()});
    var training=document.getElementById('section-training');
    if(training){Array.from(training.children).forEach(function(el){var text=String(el.textContent||'').replace(/\s+/g,'').trim();if(!text&&!el.querySelector('iframe,video,details,button,input,textarea,select,a'))el.remove()})}
  }
  cleanup();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanup,{once:true});
  if(document.body){var timer=0;new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(cleanup,80)}).observe(document.body,{childList:true,subtree:true})}
})();