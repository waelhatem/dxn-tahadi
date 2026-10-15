'use strict';
// Unified training layout (as the advanced training): drives the real basic-training.js with a small
// nested DOM, a mocked YouTube player and a mocked /api/rpc. Checks the page layout, that locks and
// quiz conditions are unchanged, that the inline player still sends the very same watch updates,
// and that a playing video is never rebuilt. Also covers the professional page and CSS scoping.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');

const VOID=new Set(['input','br','img','hr','meta','link']);
function makeDom(){
  class El{
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this.attrs={};this.dataset={};
      this.style={};this.listeners={};this.id='';this.className='';this.disabled=false;this.hidden=false;this.checked=false;}
    get textContent(){return this.children.map(c=>c instanceof El?c.textContent:c.text).join('');}
    set textContent(v){this.children=[{text:String(v)}];}
    detachAll(){for(const c of this.children)if(c instanceof El)c.parent=null;this.children=[];}
    set innerHTML(html){this.detachAll();parse(String(html),this);}
    get innerHTML(){return this.textContent;}
    append(...nodes){for(const n of nodes){if(n instanceof El){n.parent=this;this.children.push(n);}else this.children.push({text:String(n.__text??n)});}}
    appendChild(n){this.append(n);return n;}
    replaceChildren(...n){this.detachAll();this.append(...n);}
    remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);}
    getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
    addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f);}
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

const LESSON2_VIDEO='K_N80xZlxXw';
function setup({overview,innerWidth=1200,fail=false,serverLag=0}={}){
  const {document,body}=makeDom();
  const calls=[],timers=[],intervals=[],players=[];
  let clock=1_000_000,perf=0,activeToken='tok';
  const ctx={console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Map,innerWidth,document,
    Date:{now:()=>clock},performance:{now:()=>perf},
    localStorage:{getItem:k=>k==='dxn_session'?activeToken:null},
    setTimeout:f=>{timers.push(f);return timers.length},
    setInterval:f=>{intervals.push({f,active:true});return intervals.length},
    clearInterval:id=>{if(intervals[id-1])intervals[id-1].active=false;},
    fetch:async(url,o)=>{
      const b=JSON.parse(o.body);calls.push(b);
      let out={};
      if(b.fn==='basic_training_overview'){if(fail)return {ok:false,text:async()=>JSON.stringify({error:'خطأ تجريبي'})};out=overview(b.args.p_token);}
      if(b.fn==='basic_training_watch_update'){const w=Math.max(0,b.args.p_current-serverLag);out={watched:w,completed:w>=0.9*b.args.p_duration};}
      return {ok:true,text:async()=>JSON.stringify(out)};
    }};
  ctx.window=ctx;
  ctx.YT={PlayerState:{PLAYING:1,ENDED:0,PAUSED:2},Player:function(target,opts){
    const p={target,opts,t:0,state:2,destroyed:false,
      getCurrentTime:()=>p.t,getDuration:()=>600,getPlayerState:()=>p.state,getPlaybackRate:()=>1,
      setPlaybackRate(){},seekTo(s){p.t=s;},playVideo(){p.state=1;},destroy(){p.destroyed=true;}};
    players.push(p);return p;
  }};
  vm.createContext(ctx);vm.runInContext(read('basic-training.js'),ctx);
  const host=document.createElement('div');body.append(host);
  const mount=()=>{host.innerHTML=ctx.basicTrainingCourseHtml();};
  const flush=async()=>{for(let i=0;i<6;i++){while(timers.length)await timers.shift()();await new Promise(r=>setImmediate(r));}};
  const advance=ms=>{clock+=ms;perf+=ms;};
  return {ctx,document,body,host,calls,players,intervals,mount,flush,advance,setSession:t=>{activeToken=t;}};
}
const byId=(env,id)=>env.document.getElementById(id);
const listButtons=env=>byId(env,'basicBagLessonList').querySelectorAll('button');
const quizButton=env=>byId(env,'basicBagViewerHead').querySelector('.unified-training__quiz-button');
const rpcNames=env=>env.calls.map(c=>c.fn);

// Lesson 1 passed; lesson 2 unlocked and partly watched; 3-8 locked.
const OVERVIEW=()=>({role:'member',published_quizzes:[1,2,3,4,5,6,7,8],
  progress:[{training_no:1,watched:600,duration:600,completed:true,passed:true,best_score:18},
    {training_no:2,watched:120,duration:600,completed:false,passed:false,best_score:null}],
  scores:[{training_no:1,score:18,passed:true}]});

test('basic page uses the advanced layout: list, viewer, quiz button above the video, progress below',async()=>{
  const env=setup({overview:OVERVIEW});
  env.mount();await env.flush();
  const details=env.host.querySelector('details');
  assert.ok(details&&details.className.includes('advanced-profit-course')&&details.className.includes('unified-training'));
  assert.match(details.querySelector('summary').textContent,/اضغط لعرض التدريبات الثمانية/);
  const grid=env.host.querySelector('.advanced-profit-grid');
  const [list,viewer]=grid.children.filter(c=>c.tagName);
  assert.equal(list.id,'basicBagLessonList','list comes first, so it sits on the right in RTL');
  assert.ok(viewer.className.includes('advanced-profit-viewer'));
  const parts=viewer.children.filter(c=>c.tagName);
  assert.deepEqual(parts.map(c=>c.id),['basicBagViewerHead','basicBagInlineBox','','basicBagResumeSaved','basicWatchInfo','basicWatchDurationWarning','basicBagViewerInfo'],'title+quiz, video, progress, status, score');
  assert.ok(parts[2].className.includes('basic-bag-inline-progress'));
  assert.equal(listButtons(env).length,8);
  assert.deepEqual(listButtons(env).map(b=>b.disabled),[false,false,true,true,true,true,true,true],'lock rule unchanged');
  assert.deepEqual(listButtons(env).map(b=>b.attrs['aria-pressed']),['false','true','false','false','false','false','false','false'],'opens on the first training still to pass');
  assert.match(byId(env,'basicBagVideoTitle').textContent,/^التدريب الأساسي 2 من 8 — التعريف بشركة DXN/);
  assert.equal(quizButton(env).disabled,true,'quiz stays closed until 90% is watched');
  assert.equal(quizButton(env).textContent,'📝 اختبار الدرس — غير متاح');
  assert.equal(byId(env,'basicWatchPct').textContent,'20%','real saved percentage (120 / 600)');
  assert.equal(byId(env,'basicWatchProgress').querySelector('div').attrs.style,'width:20%');
  assert.deepEqual(rpcNames(env),['basic_training_overview'],'rendering sends nothing else');

  env.ctx.basicBagSelectLesson(3);
  assert.match(byId(env,'basicBagVideoTitle').textContent,/التدريب الأساسي 2 من 8/,'locked lesson cannot be opened');
  env.ctx.basicBagSelectLesson(1);
  assert.match(byId(env,'basicBagVideoTitle').textContent,/التدريب الأساسي 1 من 8/);
  assert.equal(quizButton(env).disabled,false);
  assert.equal(quizButton(env).textContent,'📝 إعادة اختبار الدرس');
  assert.equal(quizButton(env).attrs.onclick,'basicBagStartQuiz(1)');
  assert.match(byId(env,'basicBagViewerInfo').textContent,/أفضل درجة اختبار: 90 \/ 100/);
});

test('inline player: same player settings, same watch updates, never rebuilt, quiz opens at 90%',async()=>{
  const env=setup({overview:OVERVIEW});
  env.mount();await env.flush();
  const box=byId(env,'basicBagInlineBox');
  assert.equal(box.querySelector('button').attrs.onclick,'basicBagStartVideo(2)','start is still the member\'s own click');
  await env.ctx.basicBagStartVideo(2);await env.flush();
  assert.equal(env.document.querySelectorAll('.basic-bag-overlay').length,0,'no separate window');
  assert.equal(env.players.length,1);
  const p=env.players[0];
  assert.equal(p.target,'basicBagYT');
  assert.equal(p.opts.videoId,LESSON2_VIDEO);
  assert.deepEqual(JSON.parse(JSON.stringify(p.opts.playerVars)),{rel:0,disablekb:1,playsinline:1,controls:1,cc_load_policy:1,cc_lang_pref:'ar'});
  assert.equal(byId(env,'basicBagInlineBox'),box,'the close() refresh did not rebuild the video box');
  assert.ok(box.querySelector('#basicBagYT'));

  p.opts.events.onReady();
  assert.equal(p.t,120,'resumes from the saved point');
  const tick=env.intervals.find(i=>i.active);
  assert.ok(tick,'tracking timer started');
  p.state=1;
  for(let i=0;i<800&&!quizButton(env).textContent.includes('ابدأ');i++){env.advance(600);p.t+=0.6;tick.f();await env.flush();}
  const sent=env.calls.filter(c=>c.fn==='basic_training_watch_update');
  assert.ok(sent.length>5);
  for(const s of sent){
    assert.deepEqual(Object.keys(s.args).sort(),['p_current','p_duration','p_token','p_training_no']);
    assert.equal(s.args.p_training_no,2);assert.equal(s.args.p_duration,600);
  }
  for(let i=1;i<sent.length;i++)assert.ok(sent[i].args.p_current>sent[i-1].args.p_current);
  assert.equal(quizButton(env).disabled,false,'quiz button above the video opens once the server confirms 90%');
  assert.equal(quizButton(env).textContent,'📝 ابدأ اختبار الدرس');
  assert.equal(byId(env,'basicBagInlineBox'),box,'still the same player box');
  assert.equal(p.destroyed,false);

  // Leaving the page rebuilds it: the old player is stopped, nothing keeps ticking.
  env.mount();await env.flush();
  assert.equal(p.destroyed,true);
  assert.equal(env.intervals.filter(i=>i.active).length,0);
  assert.ok(byId(env,'basicBagInlineBox').querySelector('.unified-training__play'),'fresh start button');
});

test('choosing another lesson stops the current video, as closing the old window did',async()=>{
  const env=setup({overview:OVERVIEW});
  env.mount();await env.flush();
  await env.ctx.basicBagStartVideo(2);await env.flush();
  env.players[0].opts.events.onReady();
  env.ctx.basicBagSelectLesson(1);
  assert.equal(env.players[0].destroyed,true);
  assert.equal(env.intervals.filter(i=>i.active).length,0);
  assert.match(byId(env,'basicBagVideoTitle').textContent,/التدريب الأساسي 1 من 8/);
});

test('preview mode keeps the original preview buttons and texts for each training',async()=>{
  const env=setup({fail:true});
  env.mount();await env.flush();
  assert.deepEqual(listButtons(env).map(b=>b.disabled),Array(8).fill(false));
  env.ctx.basicBagSelectLesson(3);
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').attrs.onclick,'basicBagPreviewThirdVideo()');
  assert.equal(quizButton(env).attrs.onclick,'basicBagPreviewThirdQuiz()');
  assert.equal(byId(env,'basicWatchInfo').textContent,'🔒 يبقى التسلسل مقفلًا حتى إكمال التدريبين السابقين — المعاينة مستقلة');
  env.ctx.basicBagSelectLesson(1);
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').attrs.onclick,'basicBagStartVideo(1)');
  assert.equal(quizButton(env).attrs.onclick,'basicBagPreviewFirstQuiz()');
});

test('leader on desktop can still reach the unsaved quiz preview of every training',async()=>{
  const env=setup({overview:()=>({...OVERVIEW(),role:'leader'}),innerWidth:1400});
  env.mount();await env.flush();
  assert.deepEqual(listButtons(env).map(b=>b.disabled),Array(8).fill(false));
  env.ctx.basicBagSelectLesson(6);
  const preview=byId(env,'basicBagViewerHead').querySelector('.basic-bag-preview-btn');
  assert.equal(preview.attrs.onclick,'basicBagPreviewFirstQuiz(6)');
  assert.equal(quizButton(env).disabled,true,'the member quiz itself stays locked');
  assert.equal(byId(env,'basicBagInlineBox').querySelector('button').disabled,true,'locked video stays closed');
});

test('professional page: five independent trainings in the same layout, old cards as fallback',()=>{
  const ctx={document:{getElementById:()=>null}};ctx.window=ctx;vm.createContext(ctx);
  const expected=[['zO3U8yj0Sig','المدرب: '],['tVim2H5Elck','المدرب: '],['HOtDbw8-P3w','المدرب: '],['nzezoIaIRVg','المدرب: '],['HxID9tMHoVw','المحاضر: ']];
  for(let n=1;n<=5;n++){
    vm.runInContext(read('professional-training-0'+n+'.js'),ctx);
    const info=ctx['professionalTraining0'+n+'Info']();
    assert.equal(info.videoId,expected[n-1][0]);
    assert.ok(info.instructor.startsWith(expected[n-1][1]));
    assert.equal(info.questionCount,20);
    assert.equal(typeof ctx['professionalTraining0'+n+'OpenExam'],'function');
    assert.deepEqual(Object.keys(info).sort(),['instructor','label','questionCount','title','videoId'],'no questions exposed through it');
  }
  const page=read('app/index.html');
  const start=page.indexOf('let professionalSelected=0;'),end=page.indexOf('/* Advanced training is a catalogue');
  assert.ok(start>0&&end>start);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const make=win=>new Function('window','esc','document',page.slice(start,end)+'\nreturn professionalTrainingPage();')(win,esc,{getElementById:()=>null});
  const html=make(ctx);
  assert.match(html,/class="advanced-profit-course academy-camps-course unified-training"/);
  assert.equal((html.match(/class="advanced-profit-lesson"/g)||[]).length,5);
  assert.match(html,/youtube-nocookie\.com\/embed\/zO3U8yj0Sig\?rel=0/);
  assert.match(html,/onclick="professionalTraining01OpenExam\(\)">📝 ابدأ اختبار الدرس</);
  assert.doesNotMatch(html,/basic-bag-progress/,'no invented watch percentage for untracked videos');
  const fallback=make({professionalTraining01Page:()=>'<article>OLD_CARD</article>'});
  assert.match(fallback,/OLD_CARD/);
});

test('shared stylesheet only targets the unified trainings and non-advanced quiz windows',()=>{
  const css=read('unified-training-ui.css').replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[...css.matchAll(/([^{}]+)\{/g)].map(m=>m[1].trim()).filter(s=>s&&!s.startsWith('@'))
    .flatMap(s=>s.split(',').map(x=>x.trim()));
  assert.ok(selectors.length>10);
  for(const s of selectors)assert.match(s,/^(\.unified-training|\.basic-bag-overlay:not\(\.advanced-financial-overlay\))/,s);
  const page=read('app/index.html');
  assert.match(page,/<script src="\.\.\/advanced-financial-training\.js\?v=20261015-2"><\/script>/,'advanced training script untouched');
  assert.doesNotMatch(read('advanced-financial-training.js'),/unified-training/);
});

test('local 100% video does not masquerade as confirmed progress; member can replay unsaved portion',async()=>{
  const env=setup({overview:OVERVIEW,serverLag:80});
  env.mount();await env.flush();
  await env.ctx.basicBagStartVideo(2);await env.flush();
  const p=env.players[0];p.opts.events.onReady();
  const tick=env.intervals.find(i=>i.active);
  p.state=1;
  for(let i=0;i<800;i++){
    env.advance(600);p.t=Math.min(600,p.t+0.6);tick.f();await env.flush();
  }
  assert.ok(p.t>=599,'member actually reached the end of the player');
  assert.equal(quizButton(env).disabled,true,'server has not confirmed 90%');
  const savedPct=Number(byId(env,'basicWatchPct').textContent.replace('%',''));
  assert.ok(savedPct<90,'progress bar reflects server-confirmed time, not player end');
  p.state=0;p.opts.events.onStateChange({data:0});await env.flush();
  assert.equal(byId(env,'basicBagResumeSaved').style.display,'inline-flex');
  env.ctx.basicBagResumeSavedWatch();
  assert.ok(p.t<600,'resume seeks to a saved position before the end');
  assert.equal(p.state,1,'video resumes on direct member click');
  assert.equal(byId(env,'basicBagResumeSaved').style.display,'none');
  assert.equal(quizButton(env).disabled,true,'replay is not an exam bypass');
});

test('basic progress is scoped to the session, not retained when switching member accounts',async()=>{
 const accountA=()=>({...OVERVIEW(),progress:[
  {training_no:1,watched:600,duration:600,completed:true,passed:true,best_score:18},
  {training_no:2,watched:439,duration:503,completed:false,passed:false,best_score:null}
 ]});
 const accountB=()=>({role:'member',published_quizzes:[1,2,3,4,5,6,7,8],
  progress:[{training_no:1,watched:0,duration:600,completed:false,passed:false,best_score:null}],
  scores:[]});
 const env=setup({overview:token=>token==='tok'?accountA():accountB()});
 env.mount();await env.flush();
 assert.equal(byId(env,'basicWatchPct').textContent,'87%');
 env.setSession('different-member-session');env.mount();await env.flush();
 assert.equal(byId(env,'basicWatchPct').textContent,'0%','never show previously signed-in user\'s 87%');
 assert.match(byId(env,'basicBagVideoTitle').textContent,/التدريب الأساسي 1 من 8/);
 assert.equal(rpcNames(env).filter(n=>n==='basic_training_overview').length,2);
 await env.ctx.basicBagStartVideo(1);await env.flush();
 env.players.at(-1).opts.events.onReady();
 env.setSession('third-session');
 const oldWatchCount=env.calls.filter(c=>c.fn==='basic_training_watch_update').length;
 const tick=env.intervals.find(i=>i.active);
 if(tick)tick.f();
 assert.equal(env.calls.filter(c=>c.fn==='basic_training_watch_update').length,oldWatchCount,
   'never send another account watch update using a switched session');
});

test('duration mismatch warning is based on player actual duration, not another member\'s progress',async()=>{
 const env=setup({overview:OVERVIEW});
 env.mount();await env.flush();
 await env.ctx.basicBagStartVideo(2);await env.flush();
 const p=env.players[0];p.getDuration=()=>439;p.opts.events.onReady();
 const warning=byId(env,'basicWatchDurationWarning');
 assert.equal(warning.style.display,'block');
 assert.match(warning.textContent,/مدة YouTube 7:19/);
 assert.match(warning.textContent,/المدة المسجلة للتدريب 10:00/);
 assert.equal(quizButton(env).disabled,true);
});
