'use strict';
// Runs the real basic-training browser scripts in a vm with a minimal DOM and a mocked /api/rpc,
// to check page state that survives re-renders and reloads.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function makeContext({role='member',me={id:'m-1'},overview}){
  const timers=[],calls=[],elements={};
  const el=id=>({id,innerHTML:'',textContent:'',style:{},dataset:{},isConnected:true,querySelector:()=>null});
  const ctx={
    console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Date,
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
