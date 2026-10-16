/* V86.95 — Three expandable result categories in member and leader profiles.
 * Presentation-only; source grades remain in existing authorized RPC responses.
 */
(function(){
 'use strict';
 if(window.trainingResultsMemberHtml)return;
 const tracks=[
  {id:'basic',label:'نتائج التدريبات الأساسية',icon:'📘'},
  {id:'professional',label:'نتائج التدريبات الاحترافية',icon:'🎓'},
  {id:'advanced',label:'نتائج التدريب المتقدم',icon:'🚀'}
 ];
 const panels={
  member:{basic:'memberTrainingResultsPanelBasic',professional:'memberTrainingResultsPanelProfessional',advanced:'memberTrainingResultsPanelAdvanced'},
  leader:{basic:'leaderTrainingResultsPanelBasic',professional:'leaderTrainingResultsPanelProfessional',advanced:'leaderTrainingResultsPanelAdvanced'}
 };
 function shell(scope,contents){
  const nav='<div class="training-results-buttons" role="tablist" aria-label="أنواع نتائج التدريبات">'+
   tracks.map(t=>'<button type="button" class="training-results-button" role="tab" id="'+scope+'ResultsTab-'+t.id+
    '" aria-controls="'+panels[scope][t.id]+'" aria-expanded="false" aria-selected="false" data-training-result="'+t.id+
    '" onclick="trainingResultsChoose(\''+scope+'\',\''+t.id+'\')">'+t.icon+' '+t.label+' <span aria-hidden="true">⌄</span></button>').join('')+'</div>';
  return '<section class="training-results-switcher" id="'+scope+'TrainingResultsSwitcher" dir="rtl">'+
   '<h2 class="training-results-title">📊 نتائج الملف التدريبي</h2>'+
   '<p class="muted">اختر نوع التدريب لعرض نتائجه ودرجات الاختبارات الخاصة به.</p>'+nav+
   tracks.map(t=>'<div class="training-results-panel" role="tabpanel" id="'+panels[scope][t.id]+
    '" aria-labelledby="'+scope+'ResultsTab-'+t.id+'" hidden>'+
    (contents[t.id]||'')+'</div>').join('')+'</section>';
 }
 window.trainingResultsChoose=function(scope,track){
  if(!panels[scope]||!panels[scope][track])return;
  const root=document.getElementById(scope+'TrainingResultsSwitcher');
  if(!root)return;
  const selected=root.querySelector('[data-training-result="'+track+'"]');
  if(!selected)return;
  const expanding=selected.getAttribute('aria-selected')!=='true';
  tracks.forEach(t=>{
   const active=expanding&&track===t.id;
   const button=root.querySelector('[data-training-result="'+t.id+'"]');
   const panel=document.getElementById(panels[scope][t.id]);
   if(button){button.setAttribute('aria-selected',String(active));button.setAttribute('aria-expanded',String(active));}
   if(panel)panel.hidden=!active;
  });
 };
 window.trainingResultsMemberHtml=function(){
  return shell('member',{
   basic:window.basicTrainingMemberPage?.()||'',
   professional:window.professionalTrainingMemberProfile?.()||'',
   advanced:window.advancedFinancialMemberProfile?.()||''
  });
 };
 window.trainingResultsLeaderInit=function(modal){
  if(!modal||modal.querySelector('#leaderTrainingResultsSwitcher'))return;
  const parent=modal.querySelector('.evidence-modal')||modal;
  const wrapper=document.createElement('div');
  wrapper.innerHTML=shell('leader',{});
  const node=wrapper.firstElementChild||wrapper.children[0];
  if(!node)return;
  const actions=parent.querySelector('.command-actions');
  if(actions&&actions.parentElement)actions.insertAdjacentElement('beforebegin',node);
  else parent.appendChild(node);
 };
})();
