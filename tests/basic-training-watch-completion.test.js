'use strict';
// Watch completion and quiz opening, end to end in the browser script, against a fake server that
// follows the real SQL rules of basic_training_watch_update / overview / get_quiz / submit_quiz:
// 90% is measured against the lesson's STORED duration, credit grows at most ~1 s per real second,
// a reported duration outside 85-115% of the stored one is rejected, and the score is out of 20.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');

const VOID=new Set(['input','br','img','hr','meta','link']);
function makeDom(){
  class El{
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this.attrs={};this.dataset={};
      this.style={};this.listeners={};this.id='';this.className='';this.disabled=false;this.hidden=false;this.checked=false;this.value='';}
    get textContent(){return this.children.map(c=>c instanceof El?c.textContent:c.text).join('');}
    set textContent(v){this.detachAll();this.children=[{text:String(v)}];}
    detachAll(){for(const c of this.children)if(c instanceof El)c.parent=null;this.children=[];}
    set innerHTML(html){this.detachAll();parse(String(html),this);}
    get innerHTML(){return this.textContent;}
    append(...nodes){for(const n of nodes){if(n instanceof El){n.remove();n.parent=this;this.children.push(n);}else this.children.push({text:String(n.__text??n)});}}
    appendChild(n){this.append(n);return n;}
    replaceChildren(...n){this.detachAll();this.append(...n);}
    replaceWith(n){const p=this.parent;if(!p)return;const i=p.children.indexOf(this);n.remove();p.children[i]=n;n.parent=p;this.parent=null;}
    remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);}
    getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
    addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f);}
    dispatch(t){for(const f of this.listeners[t]||[])f({preventDefault(){},target:this});if(typeof this['on'+t]==='function')this['on'+t]({target:this});}
    click(){if(!this.disabled)this.dispatch('click');}
    scrollIntoView(){} focus(){}
    get isConnected(){let n=this;while(n.parent)n=n.parent;return n===body;}
    els(){return this.children.filter(c=>c instanceof El).flatMap(c=>[c,...c.els()]);}
    matches(sel){
      if(sel.startsWith('#'))return this.id===sel.slice(1);
      if(sel.startsWith('.'))return this.className.split(/\s+/).includes(sel.slice(1));
      return this.tagName===sel.toUpperCase();
    }
    querySelector(sel){return this.els().find(e=>e.matches(sel))||null;}
    querySelectorAll(sel){return this.els().filter(e=>e.matches(sel));}
  }
  function parse(html,parent){
    const stack=[parent];
    for(const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)((?:"[^"]*"|[^>"])*)>|([^<]+)/g)){
      const top=stack[stack.length-1];
      if(m[4]!==undefined){top.children.push({text:m[4]});continue;}
      const tag=m[2].toLowerCase();
      if(m[1]){while(stack.length>1&&stack.pop().tagName!==tag.toUpperCase());continue;}
      const el=new El(tag);
      for(const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){
        const k=a[1],v=a[2]??'';el.attrs[k]=v;
        if(k==='id')el.id=v;else if(k==='class')el.className=v;else if(k==='disabled')el.disabled=true;
        else if(k==='style'){for(const d of v.split(';')){const [p,val]=d.split(':');if(p&&val!==undefined)el.style[p.trim()]=val.trim();}}
        else if(k.startsWith('data-'))el.dataset[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=v;
      }
      el.parent=top;top.children.push(el);
      if(!VOID.has(tag))stack.push(el);
    }
  }
  const body=new El('body');
  const document={body,head:new El('head'),createElement:t=>new El(t),createTextNode:t=>({__text:String(t)}),
    getElementById:id=>body.els().find(e=>e.id===id)||null,querySelectorAll:sel=>body.querySelectorAll(sel),
    addEventListener(){},removeEventListener(){}};
  return {document,body};
}

const VIDEO={1:'lxhnkUov9sE',2:'K_N80xZlxXw'};
const KEY=Array.from({length:20},(_,i)=>i%3);
function fakeServer({stored}){
  const users={};let now=0;
  const user=tok=>users[tok]||(users[tok]={});
  const row=(tok,no)=>user(tok)[no]||(user(tok)[no]={watch:0,completed:false,passed:false,best:null,last:null});
  const fail=msg=>({ok:false,body:{error:msg}});
  return {
    users,setNow:t=>{now=t;},
    seed(tok,no,data){Object.assign(row(tok,no),data);},
    handle(fn,a){
      const tok=a.p_token,E=stored[a.p_training_no];
      if(fn==='basic_training_overview'){
        const u=user(tok);
        return {ok:true,body:{role:'member',published_quizzes:[1,2,3,4,5,6,7,8],watch_requirement:90,pass_requirement:16,
          progress:[1,2,3,4,5,6,7,8].map(n=>({training_no:n,watched:u[n]?.watch||0,duration:stored[n],completed:!!u[n]?.completed,
            passed:!!u[n]?.passed,best_score:u[n]?.best??null})),
          scores:Object.entries(u).filter(([,r])=>r.best!=null).map(([n,r])=>({training_no:+n,score:r.best,passed:r.passed}))}};
      }
      if(fn==='basic_training_watch_update'){
        const no=a.p_training_no,prev=user(tok)[no-1];
        if(no>1&&!(prev&&prev.passed&&prev.completed))return fail('أكمل التدريب السابق واجتز اختباره أولًا');
        if(a.p_current<0||a.p_duration<E*0.85||a.p_duration>E*1.15||a.p_current>a.p_duration+3)return fail('مدة الفيديو أو التقدم غير صحيح');
        const r=row(tok,no),gap=r.last==null?5:(now-r.last)/1000;
        const budget=r.last==null?5:gap<3?0:Math.min(8,Math.floor(gap)+1);
        const v=Math.min(E,r.watch+Math.min(Math.max(a.p_current-r.watch,0),budget));
        const done=v*100>=E*90;
        Object.assign(r,{watch:v,completed:r.completed||done,last:now});
        return {ok:true,body:{training_no:no,watched:v,duration:E,completed:done,percent:Math.round(1000*v/E)/10}};
      }
      if(fn==='basic_training_get_quiz'){
        if(!row(tok,a.p_training_no).completed)return fail('أكمل مشاهدة 90% من الفيديو أولًا');
        return {ok:true,body:{revision:1,questions:KEY.map((_,i)=>({no:i+1,question:'سؤال '+(i+1),options:['أ','ب','ج']}))}};
      }
      if(fn==='basic_training_submit_quiz'){
        const r=row(tok,a.p_training_no);
        if(!r.completed)return fail('أكمل مشاهدة 90% من الفيديو أولًا');
        if(!Array.isArray(a.p_answers)||a.p_answers.length!==20)return fail('أجب عن جميع الأسئلة');
        const score=a.p_answers.filter((x,i)=>x===KEY[i]).length,passed=score>=16;
        r.best=Math.max(r.best??0,score);r.passed=r.passed||passed;
        return {ok:true,body:{score,out_of:20,passed,best_score:r.best,required:16,revision:1}};
      }
      return {ok:true,body:{}};
    }
  };
}

function setup({stored={1:503,2:503,3:1353,4:706,5:842,6:838,7:1175,8:994},real={1:503,2:439},token='member-a',holdWatch=false}={}){
  const {document,body}=makeDom();
  const server=fakeServer({stored});
  const calls=[],timers=[],intervals=[],players=[],held=[];
  let clock=1_000_000,perf=0,activeToken=token;
  const ctx={console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Map,innerWidth:1200,document,
    Date:{now:()=>clock},performance:{now:()=>perf},
    localStorage:{getItem:k=>k==='dxn_session'?activeToken:null},
    setTimeout:f=>{timers.push(f);return timers.length},
    setInterval:f=>{intervals.push({f,active:true});return intervals.length},
    clearInterval:id=>{if(intervals[id-1])intervals[id-1].active=false;},
    fetch:(url,o)=>{
      const b=JSON.parse(o.body);calls.push(b);
      const answer=()=>{server.setNow(clock);const r=server.handle(b.fn,b.args);return {ok:r.ok,text:async()=>JSON.stringify(r.body)};};
      if(holdWatch&&b.fn==='basic_training_watch_update')return new Promise(res=>held.push(()=>res(answer())));
      return Promise.resolve(answer());
    }};
  ctx.window=ctx;
  ctx.YT={PlayerState:{PLAYING:1,ENDED:0,PAUSED:2},Player:function(target,opts){
    const no=+Object.keys(VIDEO).find(k=>VIDEO[k]===opts.videoId);
    const p={target,opts,t:0,state:2,destroyed:false,length:real[no]||stored[no],
      getCurrentTime:()=>p.t,getDuration:()=>p.length,getPlayerState:()=>p.state,getPlaybackRate:()=>1,
      setPlaybackRate(){},seekTo(s){p.t=s;},playVideo(){p.state=1;},destroy(){p.destroyed=true;}};
    players.push(p);return p;
  }};
  vm.createContext(ctx);vm.runInContext(read('basic-training.js'),ctx);
  const host=document.createElement('div');body.append(host);
  return {ctx,document,server,calls,players,intervals,held,
    mount(){host.innerHTML=ctx.basicTrainingCourseHtml();},
    async flush(){for(let i=0;i<8;i++){while(timers.length)await timers.shift()();await new Promise(r=>setImmediate(r));}},
    advance(ms){clock+=ms;perf+=ms;},
    setSession(t){activeToken=t;},
    byId:id=>document.getElementById(id)};
}
const quiz=env=>env.byId('basicBagViewerHead').querySelector('.unified-training__quiz-button');
const pct=env=>env.byId('basicWatchPct').textContent;
const info=env=>env.byId('basicWatchInfo').textContent;
const watchCalls=env=>env.calls.filter(c=>c.fn==='basic_training_watch_update');

// Start lesson `no` inline and play at 1x from the saved point to `until` seconds (default: the end).
async function start(env,no){
  await env.ctx.basicBagStartVideo(no);await env.flush();
  const p=env.players.at(-1);p.opts.events.onReady();
  return {p,tick:env.intervals.filter(i=>i.active).at(-1)};
}
async function playTo(env,run,end){
  const {p,tick}=run;p.state=1;end=end??p.length;
  while(p.t<end){env.advance(600);p.t=Math.min(end,p.t+0.6);tick.f();await env.flush();}
  return run;
}
async function endVideo(env,{p,tick},seconds=12){
  p.state=0;p.opts.events.onStateChange({data:0});await env.flush();
  for(let i=0;i<seconds/0.6;i++){env.advance(600);tick.f();await env.flush();}
}
const passLesson1=env=>env.server.seed('member-a',1,{watch:503,completed:true,passed:true,best:18});

test('stored duration longer than the real video: saved 87% shown as 87%, quiz closed, cause explained',async()=>{
  const env=setup();
  passLesson1(env);
  env.mount();await env.flush();
  const run=await playTo(env,await start(env,2));
  await endVideo(env,run);
  const u=env.server.users['member-a'][2];
  assert.equal(u.watch,439,'server credited the whole real video');
  assert.equal(u.completed,false,'439 of 503 s is below the server 90% rule');
  assert.equal(pct(env),'87%','the saved percentage, not the player\'s 100%');
  assert.equal(quiz(env).disabled,true,'quiz stays closed below the server 90%');
  assert.equal(env.byId('basicBagResumeSaved').style.display,'none','replaying cannot reach 90% here, so it is not offered');
  assert.match(info(env),/شاهدت الفيديو كاملًا \(7:19\).*8:23.*87%/);
  const warning=env.byId('basicWatchDurationWarning');
  assert.equal(warning.style.display,'block','mismatch warning stays after saves');
  assert.match(warning.textContent,/مدة YouTube 7:19.*8:23/);
  const sent=watchCalls(env).length;
  for(let i=0;i<50;i++){env.advance(600);run.tick.f();await env.flush();}
  assert.equal(watchCalls(env).length,sent,'no request flood after the server caught up');
});

test('87% on a correctly stored video: quiz closed, continuing the watch opens it',async()=>{
  const env=setup({real:{1:503,2:503}});
  passLesson1(env);
  env.server.seed('member-a',2,{watch:438});
  env.mount();await env.flush();
  assert.equal(pct(env),'87%');
  assert.equal(quiz(env).disabled,true);
  assert.match(info(env),/87% — يُفتح الاختبار عند 90%/);
  const run=await start(env,2);
  assert.equal(run.p.t,438,'resumes from the saved point');
  await playTo(env,run,449);
  assert.equal(quiz(env).disabled,true,'still closed below 90% saved');
  await playTo(env,run,470);
  assert.equal(env.server.users['member-a'][2].completed,true);
  assert.equal(quiz(env).disabled,false,'continuing the watch opened the quiz');
});

test('server confirms 90%: quiz opens at once without a reload, never earlier',async()=>{
  const env=setup({real:{1:503,2:503}});
  passLesson1(env);
  env.mount();await env.flush();
  const run=await start(env,2);run.p.state=1;
  const overviews=env.calls.filter(c=>c.fn==='basic_training_overview').length;
  let sawEightyNine=false;
  while(!env.server.users['member-a'][2]?.completed){
    env.advance(600);run.p.t+=0.6;run.tick.f();await env.flush();
    const shown=parseInt(pct(env),10);
    if(shown===89)sawEightyNine=true;
    if(!env.server.users['member-a'][2]?.completed)assert.equal(quiz(env).disabled,true,'closed at '+shown+'%');
    if(shown>=90)assert.equal(env.server.users['member-a'][2]?.completed,true,'shows '+shown+'% only once the server has completed the watch');
  }
  assert.ok(sawEightyNine,'89.x% is shown as 89%, not rounded up to 90% while still closed');
  assert.equal(pct(env),'90%');
  assert.equal(quiz(env).disabled,false,'opened as soon as the server said completed');
  assert.equal(quiz(env).textContent,'📝 ابدأ اختبار الدرس');
  assert.equal(env.calls.filter(c=>c.fn==='basic_training_overview').length,overviews,'no page reload needed');
});

test('video ends while the last save is still in flight: late confirmation still opens the quiz',async()=>{
  const env=setup({real:{1:503,2:503},holdWatch:true});
  passLesson1(env);
  env.server.seed('member-a',2,{watch:440});
  env.mount();await env.flush();
  const run=await start(env,2);run.p.state=1;
  // Answer each save only when the next one is about to go, i.e. always one save behind.
  for(let i=0;i<120;i++){env.advance(600);run.p.t=Math.min(503,run.p.t+0.6);run.tick.f();await env.flush();
    if(env.held.length>1){env.held.shift()();await env.flush();}}
  run.p.state=0;run.p.opts.events.onStateChange({data:0});await env.flush();
  for(let i=0;i<60&&!env.server.users['member-a'][2].completed;i++){
    env.advance(600);run.tick.f();await env.flush();
    if(env.held.length){env.held.shift()();await env.flush();}
  }
  while(env.held.length){env.held.shift()();await env.flush();}
  assert.equal(env.server.users['member-a'][2].completed,true,'server reached 90%');
  assert.equal(quiz(env).disabled,false,'late confirmation opened the quiz');
  assert.ok(watchCalls(env).length<40,'saves stay throttled ('+watchCalls(env).length+')');
});

test('reopening a completed training: quiz open, saved value shown, no new watch saves',async()=>{
  const env=setup({real:{1:503,2:503}});
  passLesson1(env);
  env.server.seed('member-a',2,{watch:453,completed:true});
  env.mount();await env.flush();
  assert.equal(pct(env),'90%');
  assert.equal(quiz(env).disabled,false);
  await playTo(env,await start(env,2),470);
  assert.equal(watchCalls(env).length,0,'a completed watch is not re-reported');
  assert.equal(quiz(env).disabled,false);
});

test('switching to another member never shows or saves the previous member\'s progress',async()=>{
  const env=setup({real:{1:503,2:503}});
  passLesson1(env);
  env.server.seed('member-a',2,{watch:453,completed:true});
  env.mount();await env.flush();
  assert.equal(pct(env),'90%');
  env.setSession('member-b');env.mount();await env.flush();
  assert.match(env.byId('basicBagVideoTitle').textContent,/التدريب الأساسي 1 من 8/,'member B starts at training 1');
  assert.equal(pct(env),'0%');
  assert.equal(quiz(env).disabled,true);
  assert.equal(env.calls.filter(c=>c.fn==='basic_training_overview').at(-1).args.p_token,'member-b');
  await playTo(env,await start(env,1),30);
  assert.ok(watchCalls(env).length>0&&watchCalls(env).every(c=>c.args.p_token==='member-b'),'saves go to member B only');
  assert.equal(env.server.users['member-a'][2].watch,453,'member A untouched');
});

test('training 1 then training 2 in order, 20-question quiz saved and shown out of 100',async()=>{
  const env=setup({real:{1:503,2:503}});
  env.mount();await env.flush();
  assert.equal(env.byId('basicBagLessonList').querySelectorAll('button')[1].disabled,true,'training 2 locked at first');
  const run=await playTo(env,await start(env,1));
  await endVideo(env,run);
  assert.equal(env.server.users['member-a'][1].completed,true);
  assert.equal(quiz(env).disabled,false);
  await env.ctx.basicBagStartQuiz(1);await env.flush();
  const form=env.byId('basicBagModalBody').querySelector('form');
  const sections=form.querySelectorAll('fieldset');
  assert.equal(sections.length,20);
  const answers=KEY.map((k,i)=>i<17?k:(k+1)%3);
  const [,,next,finish]=form.querySelector('.basic-bag-pager').children;
  sections.forEach((s,i)=>{const r=s.querySelectorAll('input')[answers[i]];r.checked=true;r.dispatch('change');if(i<19)next.click();});
  finish.click();await env.flush();
  const sent=env.calls.filter(c=>c.fn==='basic_training_submit_quiz');
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].args.p_answers,answers);
  assert.equal(sent[0].args.p_training_no,1);
  assert.equal(env.byId('basicBagModalBody').querySelector('h2').textContent,'درجة الاختبار: 85 / 100');
  assert.equal(env.server.users['member-a'][1].passed,true);
  env.byId('basicBagClose').click();await env.flush();
  assert.equal(env.byId('basicBagLessonList').querySelectorAll('button')[1].disabled,false,'training 2 unlocked after passing');
  env.ctx.basicBagSelectLesson(2);await env.flush();
  await endVideo(env,await playTo(env,await start(env,2)));
  assert.equal(env.server.users['member-a'][2].completed,true);
  assert.equal(quiz(env).disabled,false);
});

test('89.86% saved (452 of 503 s) shows 89% with the quiz closed, never a misleading 90%',async()=>{
  const env=setup({real:{1:503,2:503}});
  passLesson1(env);
  env.server.seed('member-a',2,{watch:452});
  env.mount();await env.flush();
  assert.equal(pct(env),'89%');
  assert.equal(quiz(env).disabled,true);
  assert.match(info(env),/89% — يُفتح الاختبار عند 90%/);
});
