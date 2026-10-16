'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'training-results-switcher.js'),'utf8');
const css=fs.readFileSync(path.join(root,'training-results-switcher.css'),'utf8');
const page=fs.readFileSync(path.join(root,'app/index.html'),'utf8');

function setup(){
 const keys=['basic','professional','advanced'];
 const panels={},buttons={};
 for(const scope of ['member','leader']){
  for(const k of keys){
   const attrs={'aria-selected':'false','aria-expanded':'false'};
   buttons[scope+'-'+k]={
    attrs,getAttribute:n=>attrs[n],
    setAttribute:(n,v)=>{attrs[n]=v;}
   };
   panels[scope+'TrainingResultsPanel'+k[0].toUpperCase()+k.slice(1)]={hidden:true};
  }
 }
 const roots={};
 for(const scope of ['member','leader']){
  roots[scope+'TrainingResultsSwitcher']={
   querySelector:sel=>{
    const m=sel.match(/\[data-training-result="(\w+)"\]/);
    return m?buttons[scope+'-'+m[1]]:null;
   }
  };
 }
 const ctx={window:{
  basicTrainingMemberPage:()=>'<article>MEMBER_BASIC</article>',
  professionalTrainingMemberProfile:()=>'<article>MEMBER_PRO</article>',
  advancedFinancialMemberProfile:()=>'<article>MEMBER_ADV</article>'
 },document:{getElementById:id=>roots[id]||panels[id]||null},console};
 vm.runInNewContext(script,ctx,{filename:'training-results-switcher.js'});
 return {ctx,buttons,panels};
}
test('training file shows exactly three labeled result buttons with no long list initially displayed',()=>{
 const {ctx}=setup(),html=ctx.window.trainingResultsMemberHtml();
 for(const label of ['نتائج التدريبات الأساسية','نتائج التدريبات الاحترافية','نتائج التدريب المتقدم'])
  assert.match(html,new RegExp(label));
 assert.equal((html.match(/role="tab"/g)||[]).length,3);
 assert.equal((html.match(/role="tabpanel"/g)||[]).length,3);
 assert.equal((html.match(/hidden>/g)||[]).length,3);
 assert.ok(html.indexOf('MEMBER_BASIC')<html.indexOf('MEMBER_PRO')&&html.indexOf('MEMBER_PRO')<html.indexOf('MEMBER_ADV'));
 assert.doesNotMatch(html,/نتائج.*خطة DXN المالية/);
});
test('opening one result type hides the others; clicking it again closes all',()=>{
 const {ctx,buttons,panels}=setup();
 ctx.window.trainingResultsChoose('member','professional');
 assert.equal(panels.memberTrainingResultsPanelProfessional.hidden,false);
 assert.equal(panels.memberTrainingResultsPanelBasic.hidden,true);
 assert.equal(panels.memberTrainingResultsPanelAdvanced.hidden,true);
 assert.equal(buttons['member-professional'].attrs['aria-selected'],'true');
 ctx.window.trainingResultsChoose('member','advanced');
 assert.equal(panels.memberTrainingResultsPanelProfessional.hidden,true);
 assert.equal(panels.memberTrainingResultsPanelAdvanced.hidden,false);
 ctx.window.trainingResultsChoose('member','advanced');
 assert.equal(panels.memberTrainingResultsPanelAdvanced.hidden,true);
 for(const k of ['basic','professional','advanced'])
  assert.equal(buttons['member-'+k].attrs['aria-selected'],'false');
});
test('leader result controls never expose member results to member context',()=>{
 const {ctx,panels}=setup();
 ctx.window.trainingResultsChoose('leader','basic');
 assert.equal(panels.leaderTrainingResultsPanelBasic.hidden,false);
 assert.equal(panels.memberTrainingResultsPanelBasic.hidden,true);
 assert.match(script,/trainingResultsLeaderInit/);
 assert.match(page,/trainingResultsLeaderInit\?\.\(modal\)/);
});
test('three training quizzes are directly below the video/progress rather than the title row',()=>{
 for(const filename of ['basic-training.js','professional-training-course.js','advanced-financial-training.js']){
  const src=fs.readFileSync(path.join(root,filename),'utf8');
  new vm.Script(src,{filename});
  const video=src.indexOf(filename==='basic-training.js'?"id=\"basicBagInlineBox\"":filename==='professional-training-course.js'?"id=\"professionalInlineBox\"":"id=\"advancedFinancialInlineBox\"");
  const location=src.indexOf(filename==='basic-training.js'?"id=\"basicViewerQuizAction\"":filename==='professional-training-course.js'?"id=\"professionalViewerQuizAction\"":"class=\"advanced-financial-quiz-location\"");
  assert.ok(video>=0&&location>video,filename+' quiz must be after video');
 }
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:1fr/);
});
