'use strict';
// Runs the real basic-training browser scripts in a vm with a minimal DOM and a mocked /api/rpc,
// to check page state that survives re-renders and reloads.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function makeContext({role='member',me={id:'m-1'},overview,previewMode=false}){
  const timers=[],calls=[],elements={};
  const el=id=>({id,innerHTML:'',textContent:'',style:{},dataset:{},isConnected:true,querySelector:()=>null});
  const ctx={
    console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Date,URLSearchParams,
    location:previewMode?{hostname:'dxn-tahadi-git-preview-basic-lesson2-20261022-waeldxn11-2298.vercel.app',search:'?basic2_preview=new'}:{hostname:'localhost',search:''},
    role,me,innerWidth:1200,
    localStorage:{getItem:k=>k==='dxn_session'?'tok':null},
    setTimeout:f=>{timers.push(f);return timers.length},
    document:{getElementById:id=>elements[id]||null,createElement:()=>el(''),body:{appendChild(){}},
      head:{appendChild(){}},addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]},
    fetch:async(url,o)=>{
      const b=JSON.parse(o.body);calls.push(b.fn);
      const out=b.fn==='basic_training_overview'?overview()
        :b.fn==='basic_training_admin_revision'?{training_no:b.args.p_training_no,revision:1,status:'published',title:'t',video_id:'abcdefghijk',expected_duration_seconds:600,questions:[]}
        :{};
      const ok=!out.__fail;
      return {ok,json:async()=>out,text:async()=>JSON.stringify(out)};
    }
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  // Queued timers fire back to back before any network answer arrives, as in the browser.
  const runTimers=async()=>{while(timers.length){const due=timers.splice(0);await Promise.all(due.map(f=>f()));}await new Promise(r=>setImmediate(r));};
  const mount=(html)=>{for(const m of html.matchAll(/id="([^"]+)"/g))elements[m[1]]=el(m[1]);
    const n=html.match(/id="basicBagNotice"[^>]*>([^<]*)</);if(n)elements.basicBagNotice.textContent=n[1];};
  return {ctx,calls,elements,runTimers,mount};
}
const OVERVIEW={role:'member',progress:[],published_quizzes:[1],scores:[]};

test('basic page notice follows the saved-progress state on every re-render',async()=>{
  const env=makeContext({overview:()=>OVERVIEW});
  vm.runInContext(read('training-engine.js'),env.ctx);vm.runInContext(read('basic-training.js'),env.ctx);
  const first=env.ctx.basicTrainingCourseHtml();
  assert.match(first,/جارٍ التحقق من حفظ التقدم/);
  assert.doesNotMatch(first,/لا يوجد حفظ للدرجات|للمعاينة فقط/);
  env.mount(first);
  await env.runTimers();
  assert.match(env.elements.basicBagNotice.textContent,/✅ حفظ النتائج مفعل/);
  // Leave and come back: the page is rebuilt without reloading the overview.
  const again=env.ctx.basicTrainingCourseHtml();
  assert.match(again,/✅ حفظ النتائج مفعل/);
  assert.equal(env.calls.filter(f=>f==='basic_training_overview').length,1);
});

test('basic page notice explains when saving is unavailable',async()=>{
  const env=makeContext({overview:()=>({__fail:true,error:'خطأ تجريبي'})});
  vm.runInContext(read('training-engine.js'),env.ctx);vm.runInContext(read('basic-training.js'),env.ctx);
  env.mount(env.ctx.basicTrainingCourseHtml());
  await env.runTimers();
  assert.match(env.ctx.basicTrainingCourseHtml(),/حفظ التقدم والاختبارات يحتاج تفعيل/);
});

test('leader editor tab restored after reload loads the selected training once',async()=>{
  const env=makeContext({role:'leader',me:null,overview:()=>OVERVIEW});
  vm.runInContext(read('basic-training-admin.js'),env.ctx);
  const html=env.ctx.basicTrainingAdminPage();
  assert.match(html,/<option value="1" selected>/);
  env.mount(html);
  env.ctx.setTimeout(()=>env.ctx.basicTrainingAdminLoad(1)); // switchTab's own request
  await env.runTimers();
  assert.equal(env.calls.filter(f=>f==='basic_training_admin_revision').length,1);
  // Choosing another training is remembered by the next render.
  await env.ctx.basicTrainingAdminLoad(3);
  assert.match(env.ctx.basicTrainingAdminPage(),/<option value="3" selected>/);
});

test('member training record loads by itself when the tab is restored after reload',async()=>{
  const env=makeContext({overview:()=>OVERVIEW});
  vm.runInContext(read('basic-training-member-profile.js'),env.ctx);
  env.mount(env.ctx.basicTrainingMemberPage()); // render() only; switchTab is not called on reload
  await env.runTimers();
  assert.equal(env.calls.filter(f=>f==='basic_training_overview').length,1);
  assert.match(env.elements.basicTrainingMemberBody.innerHTML,/التدريب الأساسي 1/);
});

test('opening the member tab sends one request even though switchTab also asks to load',async()=>{
  const env=makeContext({overview:()=>OVERVIEW});
  vm.runInContext(read('basic-training-member-profile.js'),env.ctx);
  env.mount(env.ctx.basicTrainingMemberPage());
  env.ctx.setTimeout(()=>env.ctx.basicTrainingLoadMemberPage()); // switchTab's own request
  await env.runTimers();
  assert.equal(env.calls.filter(f=>f==='basic_training_overview').length,1);
});

test('newcomer sees revision-2 lesson title from server metadata after passing lesson 1',async()=>{
  const overview=()=>({role:'member',
    progress:[{training_no:1,watched:503,duration:503,completed:true,passed:true,best_score:20}],
    published_quizzes:[1,2,3],scores:[{training_no:1,score:20,passed:true}],
    lesson_metadata:[{training_no:2,title:'خطوات العمل وكيف تبدأ مع DXN',video_id:'Ii4uTWezANs'}]});
  const env=makeContext({overview});
  vm.runInContext(read('training-engine.js'),env.ctx);vm.runInContext(read('basic-training.js'),env.ctx);
  env.mount(env.ctx.basicTrainingCourseHtml());await env.runTimers();
  const html=env.elements.basicBagCards.innerHTML;
  assert.match(html,/التدريب 2: خطوات العمل وكيف تبدأ مع DXN/);
  assert.match(html,/التدريب الأساسي 2 من 8/);
});

test('legacy learner keeps original second video title and prior score',async()=>{
  const overview=()=>({role:'member',
    progress:[{training_no:1,watched:503,duration:503,completed:true,passed:true,best_score:20},
      {training_no:2,watched:439,duration:439,completed:true,passed:true,best_score:17}],
    published_quizzes:[1,2,3],
    scores:[{training_no:1,score:20,passed:true},{training_no:2,score:17,passed:true}],
    lesson_metadata:[{training_no:2,title:'التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح',video_id:'K_N80xZlxXw'}]});
  const env=makeContext({overview});
  vm.runInContext(read('training-engine.js'),env.ctx);vm.runInContext(read('basic-training.js'),env.ctx);
  env.mount(env.ctx.basicTrainingCourseHtml());await env.runTimers();
  const html=env.elements.basicBagCards.innerHTML;
  assert.match(html,/التدريب 2: التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح/);
  assert.match(html,/التدريب 3:/);
  assert.match(read('basic-training.js'),/videoId:item.video/);
});

test('the academy preview URL shows new second lesson even to an already-graded account, without altering its grade',async()=>{
 const historic=()=>({role:'member',
   progress:[{training_no:1,watched:503,duration:503,completed:true,passed:true,best_score:20},
     {training_no:2,watched:439,duration:439,completed:true,passed:true,best_score:17}],
   scores:[{training_no:1,score:20,passed:true},{training_no:2,score:17,passed:true}],
   published_quizzes:[1,2,3],
   lesson_metadata:[{training_no:2,title:'التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح',video_id:'K_N80xZlxXw'}]});
 const e=makeContext({overview:historic,previewMode:true});
 vm.runInContext(read('training-engine.js'),e.ctx);
 vm.runInContext(read('basic-training.js'),e.ctx);
 const first=e.ctx.basicTrainingCourseHtml();
 assert.match(first,/معاينة التدريب الثاني الجديد/);
 e.mount(first);await e.runTimers();
 const display=e.elements.basicBagCards.innerHTML;
 assert.match(display,/التدريب 2: خطوات العمل وكيف تبدأ مع DXN/);
 assert.match(display,/تشغيل الفيديو الجديد/);
 assert.match(display,/معاينة الأسئلة الجديدة/);
 assert.doesNotMatch(display,/التدريب 2: التعريف بشركة DXN ومنتجاتها/);
 assert.equal(e.calls.filter(x=>x!=='basic_training_overview').length,0,'preview must be read-only');
 const source=read('basic-training.js');
 assert.ok(source.indexOf('if(basic2VisualPreview&&Number(no)===2)',source.indexOf('window.basicBagStartVideo='))<
   source.indexOf('createWatch({track:',source.indexOf('window.basicBagStartVideo=')),
   'preview video bypasses recording a watch attempt');
 assert.ok(source.indexOf('if(basic2VisualPreview&&Number(no)===2)',source.indexOf('window.basicBagStartQuiz='))<
   source.indexOf("rpc('basic_training_get_quiz'",source.indexOf('window.basicBagStartQuiz=')),
   'preview quiz bypasses the production question-scoring RPC');
});

test('the preview parameter cannot enable the new lesson on a non-preview hostname',async()=>{
 const e=makeContext({overview:()=>({role:'member',progress:[],scores:[],published_quizzes:[1,2]})});
 e.ctx.location.search='?basic2_preview=new';
 vm.runInContext(read('training-engine.js'),e.ctx);vm.runInContext(read('basic-training.js'),e.ctx);
 e.mount(e.ctx.basicTrainingCourseHtml());await e.runTimers();
 assert.doesNotMatch(e.elements.basicBagCards.innerHTML,/معاينة الأسئلة الجديدة/);
});
