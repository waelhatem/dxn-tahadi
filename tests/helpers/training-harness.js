'use strict';
// Shared test harness for the unified training engine: a small nested DOM, a fake YouTube player and a
// fake server that follows the SQL rules of supabase/pending-review/20261015200000_unified_training_engine.sql
// (watch attempts from 0 s, credit <= elapsed time (max 8 s per report, none under 3 s), idle expiry,
// sequence by completed+passed, 90% of the stored duration, quiz out of 20 with a pass at 16).
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..','..',f),'utf8').replace(/\r\n/g,'\n');

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
    get isConnected(){let n=this;while(n.parent)n=n.parent;return n===body;}
    append(...nodes){for(const n of nodes){if(n instanceof El){n.remove();n.parent=this;this.children.push(n);}else this.children.push({text:String(n&&n.__text!==undefined?n.__text:n)});}}
    prepend(...nodes){const keep=this.children;this.children=[];this.append(...nodes);this.children.push(...keep);}
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
    els(){return this.children.filter(c=>c instanceof El).flatMap(c=>[c,...c.els()]);}
    matchesOne(sel){
      const m=sel.match(/^([a-z0-9]*)(#[\w-]+)?((?:\.[\w-]+)*)(\[([\w-]+)(?:="([^"]*)")?\])?$/i);
      if(!m)return false;
      if(m[1]&&this.tagName!==m[1].toUpperCase())return false;
      if(m[2]&&this.id!==m[2].slice(1))return false;
      if(m[3]){const cls=this.className.split(/\s+/);for(const c of m[3].split('.').filter(Boolean))if(!cls.includes(c))return false;}
      if(m[4]){if(!(m[5] in this.attrs))return false;if(m[6]!==undefined&&this.attrs[m[5]]!==m[6])return false;}
      return true;
    }
    matches(sel){
      const parts=sel.trim().split(/\s+/);
      if(!this.matchesOne(parts.at(-1)))return false;
      let node=this.parent,i=parts.length-2;
      while(i>=0&&node){if(node.matchesOne&&node.matchesOne(parts[i]))i--;node=node.parent;}
      return i<0;
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
        else if(k==='style'){for(const d of v.split(';')){const i=d.indexOf(':');if(i>0)el.style[d.slice(0,i).trim()]=d.slice(i+1).trim();}}
        else if(k.startsWith('data-'))el.dataset[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=v;
      }
      el.parent=top;top.children.push(el);
      if(!VOID.has(tag))stack.push(el);
    }
  }
  const body=new El('body');
  const document={body,head:new El('head'),createElement:t=>new El(t),createTextNode:t=>({__text:String(t)}),
    getElementById:id=>body.els().find(e=>e.id===id)||null,querySelector:sel=>body.querySelector(sel),
    querySelectorAll:sel=>body.querySelectorAll(sel),addEventListener(){},removeEventListener(){}};
  return {document,body};
}

const KEY3=Array.from({length:20},(_,i)=>i%3), KEY4=Array.from({length:20},(_,i)=>i%4);
const BASIC_VIDEOS=['lxhnkUov9sE','K_N80xZlxXw','n7W9LoCMdPo','AMKtcQt8ltc','Wa_Kp2U7x0E','G09ztpXOBBM','kYJjJu2JQFI','v4gYSL-KuHQ'];
const BASIC_SECONDS=[503,439,1363,707,851,1474,450,993];

function fakeServer(clockRef){
  const tracks={
    basic:{key:KEY3,lessons:Object.fromEntries(BASIC_SECONDS.map((d,i)=>[i+1,{duration:d,video:BASIC_VIDEOS[i],ready:true,published:true}]))},
    advanced:{key:KEY4,lessons:Object.fromEntries(Array.from({length:3},(_,i)=>[i+1,{duration:600,video:'ANiPxicO7lM',ready:true,published:true,title:'متقدم '+(i+1)}]))},
    professional:{key:KEY3,lessons:{1:{duration:1164,video:'zO3U8yj0Sig',ready:true,published:true,title:'احترافي 1',instructor:'م. محمود المصري'},
      2:{duration:157,video:'tVim2H5Elck',ready:true,published:true,title:'احترافي 2',instructor:'م. محمود المصري'},
      3:{duration:2718,video:'HOtDbw8-P3w',ready:true,published:false,title:'احترافي 3',instructor:'م. محمود المصري'}}}
  };
  const progress={},attempts={};let seq=0;const idle=600;
  const row=(tok,t,n)=>{const k=tok+'|'+t+'|'+n;return progress[k]||(progress[k]={completed:false,passed:false,best:null});};
  const peek=(tok,t,n)=>progress[tok+'|'+t+'|'+n];
  const unlocked=(tok,t,n)=>n===1||!!(peek(tok,t,n-1)&&peek(tok,t,n-1).completed&&peek(tok,t,n-1).passed);
  const err=m=>({ok:false,body:{error:m}});
  const now=()=>clockRef.now;
  function begin(tok,t,n){
    if(!tracks[t])return err('مسار التدريب غير معروف');
    const L=tracks[t].lessons[n];
    if(!L||!L.ready)return err('التدريب غير موجود');
    if(t==='professional'&&!L.published)return err('اختبار هذا الدرس قيد الاعتماد');
    if(!unlocked(tok,t,n))return err('الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا');
    for(const a of Object.values(attempts))if(a.tok===tok&&a.track===t&&a.n===n&&!a.ended){a.ended=true;a.reason='replaced';}
    const id='att-'+(++seq);attempts[id]={id,tok,track:t,n,expected:L.duration,watched:0,last:now(),ended:false,reason:null,completed:false};
    return {ok:true,body:{attempt_id:id,track:t,lesson_no:n,duration:L.duration,watched:0,percent:0,attempt_completed:false,expired:false,
      watch_completed:!!(peek(tok,t,n)&&peek(tok,t,n).completed),idle_timeout_seconds:idle,watch_requirement:90}};
  }
  function report(tok,id,cur,dur){
    const a=attempts[id];if(!a||a.tok!==tok)return err('جلسة المشاهدة غير صالحة');
    const out=extra=>({ok:true,body:{attempt_id:a.id,track:a.track,lesson_no:a.n,watched:a.watched,duration:a.expected,
      percent:Math.floor(100*a.watched/a.expected),watch_completed:!!(peek(tok,a.track,a.n)&&peek(tok,a.track,a.n).completed),...extra}});
    if(a.ended)return out({attempt_completed:a.completed,expired:!a.completed,reason:a.reason});
    const gap=(now()-a.last)/1000;
    if(gap>idle){a.ended=true;a.reason='idle';return out({attempt_completed:false,expired:true,reason:'idle'});}
    if(!unlocked(tok,a.track,a.n))return err('الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا');
    if(cur<0||dur<a.expected*0.85||dur>a.expected*1.15||cur>dur+3)return err('مدة الفيديو أو التقدم غير صحيح');
    const budget=gap<3?0:Math.min(8,Math.floor(gap)+1);
    a.watched=Math.min(a.expected,a.watched+Math.min(Math.max(cur-a.watched,0),budget));a.last=now();
    const done=a.watched*100>=a.expected*90;
    if(done){a.completed=true;a.ended=true;a.reason='completed';row(tok,a.track,a.n).completed=true;}
    return out({attempt_completed:done,expired:false,watch_completed:done||!!(peek(tok,a.track,a.n)&&peek(tok,a.track,a.n).completed)});
  }
  function quiz(tok,t,n){
    const L=tracks[t].lessons[n];if(!L)return err('التدريب غير موجود');
    if(!unlocked(tok,t,n))return err('الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا');
    if(!(peek(tok,t,n)&&peek(tok,t,n).completed))return err('أكمل مشاهدة 90% من الفيديو أولًا');
    if(!L.published)return err('اختبار هذا الدرس قيد الاعتماد');
    const opts=tracks[t].key===KEY4?['أ','ب','ج','د']:['أ','ب','ج'];
    return {ok:true,body:{revision:1,questions:tracks[t].key.map((_,i)=>({no:i+1,question:'سؤال '+(i+1),options:opts}))}};
  }
  function submit(tok,t,n,answers){
    const q=quiz(tok,t,n);if(!q.ok)return q;
    if(!Array.isArray(answers)||answers.length!==20)return err('يجب إجابة جميع الأسئلة العشرين');
    const score=answers.filter((x,i)=>x===tracks[t].key[i]).length,passed=score>=16,r=row(tok,t,n);
    r.best=Math.max(r.best??0,score);r.passed=r.passed||passed;
    return {ok:true,body:{score,out_of:20,passed,best_score:r.best,required:16,revision:1}};
  }
  function handle(fn,a){
    const tok=a.p_token;
    switch(fn){
      case 'training_watch_begin':return begin(tok,a.p_track,a.p_lesson_no);
      case 'training_watch_report':return report(tok,a.p_attempt_id,a.p_current,a.p_duration);
      case 'basic_training_watch_update':case 'advanced_financial_watch_update':return err('تم تحديث نظام المشاهدة؛ حدّث الصفحة لبدء مشاهدة جديدة');
      case 'basic_training_overview':return {ok:true,body:{role:'member',published_quizzes:[1,2,3,4,5,6,7,8],watch_requirement:90,pass_requirement:16,
        progress:Object.entries(tracks.basic.lessons).map(([n,L])=>{const r=peek(tok,'basic',+n)||{};return {training_no:+n,watched:0,duration:L.duration,completed:!!r.completed,passed:!!r.passed,best_score:r.best??null};}),
        scores:Object.keys(tracks.basic.lessons).map(Number).filter(n=>peek(tok,'basic',n)&&peek(tok,'basic',n).best!=null).map(n=>({training_no:n,score:peek(tok,'basic',n).best,passed:peek(tok,'basic',n).passed}))}};
      case 'advanced_financial_overview':return {ok:true,body:{role:'member',watch_requirement:90,pass_requirement:16,
        lessons:Object.entries(tracks.advanced.lessons).map(([n,L])=>{const r=peek(tok,'advanced',+n)||{};return {lesson_no:+n,title:L.title,video_id:L.video,duration:L.duration,active:true,published:true,watched:0,completed:!!r.completed,best_score:r.best??null,passed:!!r.passed};})}};
      case 'professional_training_overview':return {ok:true,body:{role:'member',watch_requirement:90,pass_requirement:16,
        lessons:Object.entries(tracks.professional.lessons).map(([n,L])=>{const r=peek(tok,'professional',+n)||{};return {lesson_no:+n,title:L.title,instructor:L.instructor,video_id:L.video,duration:L.duration,active:true,published:L.published,completed:!!r.completed,best_score:r.best??null,passed:!!r.passed};})}};
      case 'basic_training_get_quiz':return quiz(tok,'basic',a.p_training_no);
      case 'advanced_financial_get_quiz':return quiz(tok,'advanced',a.p_lesson_no);
      case 'professional_training_get_quiz':return quiz(tok,'professional',a.p_lesson_no);
      case 'basic_training_submit_quiz':return submit(tok,'basic',a.p_training_no,a.p_answers);
      case 'advanced_financial_submit_quiz':return submit(tok,'advanced',a.p_lesson_no,a.p_answers);
      case 'professional_training_submit_quiz':return submit(tok,'professional',a.p_lesson_no,a.p_answers);
      default:return {ok:true,body:{}};
    }
  }
  return {handle,tracks,attempts,peek,row};
}

// Loads the real browser scripts into one context with the fake server, DOM and YouTube player.
function setup({token='member-a',scripts=['training-engine.js','basic-training.js','advanced-financial-training.js','professional-training-course.js'],realSeconds={},hold=null}={}){
  const {document,body}=makeDom();
  const clockRef={now:1_000_000};let perf=0,activeToken=token;
  const server=fakeServer(clockRef);
  const calls=[],timers=[],intervals=[],players=[],held=[];
  const ctx={console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Map,innerWidth:1200,document,
    Date:{now:()=>clockRef.now},performance:{now:()=>perf},
    localStorage:{getItem:k=>k==='dxn_session'?activeToken:null},
    setTimeout:f=>{timers.push(f);return timers.length},
    setInterval:f=>{intervals.push({f,active:true});return intervals.length},
    clearInterval:id=>{if(intervals[id-1])intervals[id-1].active=false;},
    alert(){},
    fetch:(url,o)=>{
      const b=JSON.parse(o.body);calls.push(b);
      const answer=()=>{const r=server.handle(b.fn,b.args);return {ok:r.ok,json:async()=>r.body,text:async()=>JSON.stringify(r.body)};};
      if(hold&&hold(b.fn))return new Promise(res=>held.push(()=>res(answer())));
      return Promise.resolve(answer());
    }};
  ctx.window=ctx;
  const lengths={...Object.fromEntries(BASIC_VIDEOS.map((v,i)=>[v,BASIC_SECONDS[i]])),ANiPxicO7lM:600,zO3U8yj0Sig:1164,tVim2H5Elck:157,'HOtDbw8-P3w':2718,...realSeconds};
  ctx.YT={PlayerState:{PLAYING:1,ENDED:0,PAUSED:2},Player:function(target,opts){
    const p={target,opts,t:0,state:2,destroyed:false,rate:1,length:lengths[opts.videoId]||600,
      getCurrentTime:()=>p.t,getDuration:()=>p.length,getPlayerState:()=>p.state,getPlaybackRate:()=>p.rate,
      setPlaybackRate(r){p.rate=r;},seekTo(s){p.t=s;},playVideo(){p.state=1;},pauseVideo(){if(p.state===1)p.state=2;},destroy(){p.destroyed=true;}};
    players.push(p);return p;
  }};
  vm.createContext(ctx);
  for(const s of scripts)vm.runInContext(read(s),ctx,{filename:s});
  const host=document.createElement('div');body.append(host);
  const env={ctx,document,body,host,server,calls,players,intervals,timers,held,clockRef,
    async flush(){for(let i=0;i<8;i++){while(timers.length)await timers.shift()();await new Promise(r=>setImmediate(r));}},
    advance(ms){clockRef.now+=ms;perf+=ms;},
    setSession(t){activeToken=t;},
    byId:id=>document.getElementById(id),
    rpcs:fn=>calls.filter(c=>c.fn===fn),
    activeTick:()=>intervals.filter(i=>i.active).at(-1),
    // Plays the newest player at 1x from its position to `to` seconds (default: the end).
    async play(to,{player=players.at(-1),step=0.6}={}){
      const tick=env.activeTick();if(!tick)throw Error('no running watch');
      player.state=1;
      tick.f();await env.flush();          // the first tick starts the attempt (and rewinds to 0 if new)
      const end=to??player.length;
      while(player.t<end){env.advance(step*1000);player.t=Math.min(end,player.t+step);tick.f();await env.flush();}
    },
    async pause(ms,{player=players.at(-1)}={}){
      player.state=2;const tick=env.activeTick();const n=Math.ceil(ms/600);
      for(let i=0;i<n;i++){env.advance(600);if(tick)tick.f();await env.flush();}
    },
    async end({player=players.at(-1),seconds=12}={}){
      player.state=0;player.opts.events.onStateChange({data:0});await env.flush();
      const tick=env.activeTick();for(let i=0;i<seconds/0.6;i++){env.advance(600);if(tick)tick.f();await env.flush();}
    }};
  return env;
}
// Answers the 20 questions of an open quiz form, then presses finish.
async function answerQuiz(env,form,answers){
  const sections=form.querySelectorAll('fieldset');
  const pager=form.querySelector('.basic-bag-pager');
  const [,,next,finish]=pager.children.filter(c=>c.tagName);
  sections.forEach((s,i)=>{const r=s.querySelectorAll('input')[answers[i]];r.checked=true;r.dispatch('change');if(i<sections.length-1)next.click();});
  finish.click();await env.flush();
  return sections.length;
}
const answersWith=(key,correct)=>{const n=Math.max(...key)+1;return key.map((k,i)=>i<correct?k:(k+1)%n);};
module.exports={setup,makeDom,fakeServer,answerQuiz,answersWith,KEY3,KEY4,read};
