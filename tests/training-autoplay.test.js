'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const auto=read('training-auto-play.js');
const basic=read('basic-training.js');
const professional=read('professional-training-course.js');
const advanced=read('advanced-financial-training.js');
const page=read('app/index.html');

test('the five-second autoplay helper loads before all three separate course scripts',()=>{
 new vm.Script(auto);
 for(const src of [basic,professional,advanced])new vm.Script(src);
 assert.match(page,/training-auto-play\.js\?v=20261020-basic2-fix1/);
 assert.ok(page.indexOf('training-auto-play.js')<page.indexOf('training-engine.js'));
 const names=['training-engine.js','basic-training.js','professional-training-course.js','advanced-financial-training.js'];
 for(const n of names)assert.ok(page.includes(n+'?v=20261020-basic2-fix1'),n);
});

test('initial lesson and following passed quiz schedule five-second video without changing 90% or grades',()=>{
 assert.match(basic,/function scheduleBasicFirst\(\)/);
 assert.match(basic,/function scheduleBasicNext\(no,result\)/);
 assert.match(basic,/if\(graded\.passed&&currentLesson\(e\.no\+1\)&&lessonUnlock\(e\.no\+1\)\)/);
 assert.match(professional,/function scheduleProfessionalFirst\(\)/);
 assert.match(professional,/function scheduleProfessionalNext\(no,result\)/);
 assert.match(professional,/if\(g\.passed&&lesson\(e\.no\+1\)&&unlocked\(e\.no\+1\)\)/);
 assert.match(advanced,/function scheduleAdvancedFirst\(\)/);
 assert.match(advanced,/function scheduleAdvancedNext\(n,result\)/);
 assert.match(advanced,/if\(result\.passed&&data\.some\(l=>l\.lesson_no===e\.no\+1\)\)/);
 for(const src of [basic,professional,advanced]){
  assert.match(src,/DXNTrainingAutoPlay\?\.cancel/);
  assert.doesNotMatch(src,/localStorage\.setItem\(['"]training/);
 }
 assert.match(advanced,/data-watch/);
 assert.match(advanced,/تشغيل الفيديو \/ إعادة المشاهدة/);
});

function makeEnvironment(){
 const timeouts=[],intervals=[];
 let serial=0;
 function element(tag){
  return {tag,isConnected:true,children:[],className:'',textContent:'',attributes:{},listeners:{},
   setAttribute(k,v){this.attributes[k]=v},
   append(...els){this.children.push(...els);for(const x of els)x.parent=this},
   appendChild(el){this.append(el);return el},
   addEventListener(k,fn){this.listeners[k]=fn},
   remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)},
   querySelector(s){return this.children.find(x=>x.className===s.slice(1))||null},
   click(){this.listeners.click?.()}};
 }
 const head=element('head'),ctx={console,Map,Math,document:{createElement:element,head},setTimeout(fn,ms){const item={id:++serial,fn,ms,active:true};timeouts.push(item);return item.id},
  clearTimeout(id){const item=timeouts.find(x=>x.id===id);if(item)item.active=false},
  setInterval(fn,ms){const item={id:++serial,fn,ms,active:true};intervals.push(item);return item.id},
  clearInterval(id){const item=intervals.find(x=>x.id===id);if(item)item.active=false}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(auto,ctx);
 const trigger=(collection,ms)=>{for(const item of [...collection])if(item.active&&item.ms===ms)item.fn()};
 return {ctx,element,timeouts,intervals,trigger};
}

test('timer runs at five seconds, can be skipped or cancelled and prevents stale launches',()=>{
 const e=makeEnvironment();
 const ctrl=e.ctx.DXNTrainingAutoPlay;
 const box=e.element('div');let calls=0,allowed=true;
 assert.equal(ctrl.schedule({track:'basic',container:box,valid:()=>allowed,start:()=>calls++}),true);
 assert.match(box.children[0].children[0].textContent,/5 ثوان/);
 e.trigger(e.timeouts,5000);
 assert.equal(calls,1);
 e.trigger(e.timeouts,5000);
 assert.equal(calls,1,'plays once only');
 ctrl.schedule({track:'professional',container:box,valid:()=>allowed,start:()=>calls++});
 const prompt=box.children[0],buttons=prompt.children[1].children;
 buttons[1].click();
 e.trigger(e.timeouts,5000);
 assert.equal(calls,1,'cancel means no autoplay');
 ctrl.schedule({track:'advanced',container:box,valid:()=>allowed,start:()=>calls++});
 allowed=false;e.trigger(e.timeouts,5000);
 assert.equal(calls,1,'lesson lock/session change prevents autoplay');
 allowed=true;ctrl.schedule({track:'basic',container:box,valid:()=>true,start:()=>calls++});
 box.children[0].children[1].children[0].click();
 assert.equal(calls,2,'immediate watch button works');
});

test('autoplay blocked by mobile browser gets an explicit sound-on play button',()=>{
 const e=makeEnvironment(),box=e.element('div');
 const player={getPlayerState:()=>2,playVideo(){player.started=true}};
 e.ctx.DXNTrainingAutoPlay.ensurePlaying(player,box);
 e.trigger(e.timeouts,2500);
 const button=box.querySelector('.training-auto-manual');
 assert.ok(button);
 assert.match(button.textContent,/بالصوت/);
 button.click();
 assert.equal(player.started,true);
 assert.equal(button.isConnected,false);
});

test('basic lesson two always provides a manual play action and a useful YouTube error code',async()=>{
 const {setup}=require('./helpers/training-harness');
 const env=setup();
 Object.assign(env.server.row('member-a','basic',1),{completed:true,passed:true,best:18});
 env.host.innerHTML=env.ctx.basicTrainingCourseHtml();
 await env.flush();
 assert.match(env.byId('basicBagVideoTitle').textContent,/التدريب الأساسي 2 من 8/);
 await env.ctx.basicBagStartVideo(2);
 await env.flush();
 const box=env.byId('basicBagInlineBox');
 const assist=box.querySelector('.basic-video-2-assist');
 assert.ok(assist,'lesson 2 manual recovery is present even if YouTube never becomes ready');
 const button=assist.querySelector('button');
 assert.match(button.textContent,/تشغيل فيديو التدريب الثاني بالصوت/);
 const player=env.players.at(-1);
 player.opts.events.onReady();
 player.opts.events.onStateChange({data:1});
 assert.equal(assist.hidden,true,'no overlay on top of a playing video');
 player.opts.events.onStateChange({data:2});
 assert.equal(assist.hidden,false,'manual play reappears when playback is paused or blocked');
 button.click();
 assert.equal(player.state,1,'manual gesture calls YouTube playVideo');
 player.opts.events.onError({data:150});
 assert.match(assist.textContent,/YouTube|التدريب الثاني/);
 assert.equal(assist.querySelector('a').hidden,false,'external diagnostic visible on embed error');
 assert.match(assist.querySelector('a').textContent,/لا تُحتسب/);
 env.ctx.basicBagSelectLesson(1);
 assert.equal(assist.isConnected,false,'recovery UI is removed on lesson change');
});
