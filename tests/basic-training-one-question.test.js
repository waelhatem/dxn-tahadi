'use strict';
// Drives the real basic-training.js quiz UI with a minimal DOM: one question at a time,
// previous/next, kept answers, answered count, no auto-submit, the unanswered warning,
// and an unchanged submission to basic_training_submit_quiz for all eight trainings.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'..','basic-training.js'),'utf8');

function makeDom(){
  class El{
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.parent=null;
      this.id='';this.className='';this.hidden=false;this.disabled=false;this.checked=false;this.value='';
      this.type='';this.name='';this.style={};this.dataset={};this.attrs={};this._text='';}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this.children=[];this._text=String(v);}
    set innerHTML(html){this.children=[];this._text='';
      for(const m of String(html).matchAll(/<(\w+)([^>]*)>/g)){const el=new El(m[1]);const id=m[2].match(/id="([^"]+)"/);if(id)el.id=id[1];this.append(el);}}
    get innerHTML(){return this.textContent;}
    append(...nodes){for(const n of nodes){if(n&&n.__text!==undefined){this.children.push({textContent:n.__text});continue;}n.parent=this;this.children.push(n);}}
    appendChild(n){this.append(n);return n;}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    replaceWith(n){const p=this.parent;p.children[p.children.indexOf(this)]=n;n.parent=p;this.parent=null;}
    remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f);}
    dispatch(t){for(const f of this.listeners[t]||[])f({preventDefault(){},target:this});}
    click(){if(!this.disabled)this.dispatch('click');}
    scrollIntoView(){} focus(){}
    get isConnected(){let n=this;while(n.parent)n=n.parent;return n===body;}
    descendants(){return this.children.filter(c=>c instanceof El).flatMap(c=>[c,...c.descendants()]);}
    matches(sel){if(sel.startsWith('#'))return this.id===sel.slice(1);if(sel.startsWith('.'))return this.className.split(' ').includes(sel.slice(1));return this.tagName===sel.toUpperCase();}
    querySelector(sel){return this.descendants().find(e=>e.matches(sel))||null;}
    querySelectorAll(sel){return this.descendants().filter(e=>e.matches(sel));}
  }
  const body=new El('body');
  const document={body,head:new El('head'),
    createElement:t=>new El(t),createTextNode:t=>({__text:String(t)}),
    getElementById:id=>body.descendants().find(e=>e.id===id)||null,
    querySelectorAll:sel=>body.querySelectorAll(sel),
    addEventListener(){},removeEventListener(){}};
  return {document};
}

const QUESTIONS=Array.from({length:20},(_,i)=>({no:i+1,question:'سؤال تجريبي '+(i+1),options:['خيار 1','خيار 2','خيار 3']}));
function setup({role='member',innerWidth=1200}={}){
  const {document}=makeDom();
  const calls=[];const timers=[];
  const ctx={console,Math,Number,String,Array,Object,JSON,Error,Promise,Set,Date,innerWidth,
    performance:{now:()=>0},localStorage:{getItem:()=> 'tok'},document,
    setTimeout:f=>{timers.push(f);return timers.length},clearInterval(){},setInterval(){return 1},
    fetch:async(url,o)=>{
      const b=JSON.parse(o.body);calls.push(b);
      let out={};
      if(b.fn==='basic_training_overview')out={role,published_quizzes:[1,2,3,4,5,6,7,8],
        progress:Array.from({length:8},(_,i)=>({training_no:i+1,watched:600,duration:600,completed:true,passed:true,best_score:18})),
        scores:Array.from({length:8},(_,i)=>({training_no:i+1,score:18,passed:true}))};
      if(b.fn==='basic_training_get_quiz')out={revision:1,questions:QUESTIONS};
      if(b.fn==='basic_training_submit_quiz')out={score:17,out_of:20,passed:true,best_score:18,required:16,revision:1};
      if(b.fn==='basic_training_admin_revision')out={status:'published',revision:1,active_revision:1,
        questions:QUESTIONS.map((q,i)=>({...q,correct_index:i%3}))};
      return {ok:true,text:async()=>JSON.stringify(out)};
    }};
  ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(SRC,ctx);
  const flush=async()=>{for(let i=0;i<5;i++){while(timers.length)await timers.shift()();await new Promise(r=>setImmediate(r));}};
  return {ctx,document,calls,flush};
}
function quizParts(document){
  const form=document.getElementById('basicBagModalBody').querySelector('form');
  const sections=form.querySelectorAll('fieldset');
  const pager=form.querySelector('.basic-bag-pager');
  const [status,back,next,finish]=pager.children;
  return {form,sections,status,back,next,finish,warning:form.querySelector('.basic-bag-unanswered')};
}
const visible=sections=>sections.map((s,i)=>s.hidden?null:i).filter(i=>i!==null);
function choose(section,k){const r=section.querySelectorAll('input')[k];r.checked=true;r.dispatch('change');}

for(let no=1;no<=8;no++){
  test('basic training '+no+': one question at a time, navigation keeps answers, explicit submit only',async()=>{
    const {ctx,document,calls,flush}=setup();
    ctx.basicTrainingCourseHtml();await flush();
    await ctx.basicBagStartQuiz(no);await flush();
    const q=quizParts(document);
    assert.equal(q.sections.length,20);
    assert.deepEqual(visible(q.sections),[0],'only the first question is shown');
    assert.equal(q.sections[0].querySelectorAll('input').length,3,'three options under the question');
    assert.equal(q.status.textContent,'السؤال 1 من 20 — تمت الإجابة عن 0 من 20');
    assert.equal(q.back.disabled,true);assert.equal(q.next.hidden,false);assert.equal(q.finish.hidden,true);

    choose(q.sections[0],2);
    assert.match(q.status.textContent,/تمت الإجابة عن 1 من 20/);
    q.next.click();
    assert.deepEqual(visible(q.sections),[1]);
    assert.match(q.status.textContent,/^السؤال 2 من 20/);
    q.back.click();
    assert.deepEqual(visible(q.sections),[0]);
    assert.equal(q.sections[0].querySelectorAll('input')[2].checked,true,'answer kept after moving back');

    // Answer all but question 5, walking forward with "next".
    for(let i=0;i<20;i++){if(i!==4&&i!==0)choose(q.sections[i],i%3);if(i<19)q.next.click();}
    assert.deepEqual(visible(q.sections),[19]);
    assert.equal(q.next.hidden,true);assert.equal(q.finish.hidden,false);
    assert.equal(q.finish.textContent,'إنهاء الاختبار وإرسال الإجابات');
    assert.match(q.status.textContent,/^السؤال 20 من 20 — تمت الإجابة عن 19 من 20$/);
    assert.equal(calls.filter(c=>c.fn==='basic_training_submit_quiz').length,0,'answering the last question never submits');

    q.finish.click();
    assert.equal(calls.filter(c=>c.fn==='basic_training_submit_quiz').length,0,'incomplete sheet is not sent');
    assert.equal(q.warning.hidden,false);
    assert.match(q.warning.textContent,/لم تُجب عن 1 من الأسئلة \(رقم 5\)/);
    const [goBack]=q.warning.querySelectorAll('button');
    goBack.click();
    assert.deepEqual(visible(q.sections),[4],'warning returns to the first unanswered question');
    assert.equal(q.warning.hidden,true);
    choose(q.sections[4],1);
    for(let i=4;i<19;i++)q.next.click();
    q.finish.click();await flush();

    const sent=calls.filter(c=>c.fn==='basic_training_submit_quiz');
    assert.equal(sent.length,1);
    const expected=Array.from({length:20},(_,i)=>i===0?2:i===4?1:i%3);
    assert.deepEqual(sent[0].args,{p_token:'tok',p_training_no:no,p_answers:expected,p_revision:1});
    const result=document.getElementById('basicBagModalBody').querySelector('h2');
    assert.equal(result.textContent,'درجة الاختبار: 85 / 100','score display unchanged (17/20 → 85/100)');
  });
}

test('leader preview uses the same one-question navigation and grades locally only',async()=>{
  const {ctx,document,calls,flush}=setup({role:'leader'});
  ctx.basicTrainingCourseHtml();await flush();
  await ctx.basicBagPreviewFirstQuiz(3);await flush();
  const q=quizParts(document);
  assert.deepEqual(visible(q.sections),[0]);
  for(let i=0;i<20;i++){choose(q.sections[i],i%3);if(i<19)q.next.click();}
  assert.equal(q.finish.textContent,'إنهاء الاختبار والتصحيح التجريبي');
  q.finish.click();await flush();
  assert.equal(calls.filter(c=>c.fn==='basic_training_submit_quiz').length,0,'preview never saves a result');
  assert.equal(document.getElementById('basicBagModalBody').querySelector('h2').textContent,'درجة الاختبار: 100 / 100');
});
