/* Five-second, cancellable transition into the next authorised training video.
 * Watching credit continues to be handled exclusively by DXNTrainingEngine.
 * Browser autoplay-with-audio restrictions are handled by a prominent manual
 * action, never by muting the lecture. */
(function(){
 'use strict';
 if(window.DXNTrainingAutoPlay)return;
 const active=new Map();
 const LABEL='سيبدأ الفيديو تلقائياً خلال ';
 function cancel(track){
  const task=active.get(track);
  if(!task)return;
  active.delete(track);
  clearInterval(task.interval);clearTimeout(task.timeout);
  task.panel.remove();
 }
 function schedule({track,container,valid,start,seconds=5}){
  cancel(track);
  if(!container||!container.isConnected||typeof valid!=='function'||!valid())return false;
  const panel=document.createElement('div');
  panel.className='training-auto-next';
  panel.setAttribute('role','status');
  panel.setAttribute('aria-live','polite');
  const counter=document.createElement('strong');
  const actions=document.createElement('div');
  const now=document.createElement('button');
  now.type='button';now.textContent='▶ تشغيل الفيديو الآن';
  const skip=document.createElement('button');
  skip.type='button';skip.textContent='إلغاء التشغيل التلقائي';
  actions.append(now,skip);panel.append(counter,actions);
  container.appendChild(panel);
  let remaining=seconds;
  const task={panel,interval:null,timeout:null};
  active.set(track,task);
  function text(){counter.textContent=LABEL+remaining+' ثوانٍ';}
  function run(){
   if(active.get(track)!==task)return;
   const okay=valid()&&container.isConnected;
   cancel(track);
   if(!okay)return;
   try{const result=start();if(result&&typeof result.catch==='function')result.catch(e=>console.warn('Training auto-play failed',e));}
   catch(e){console.warn('Training auto-play failed',e);}
  }
  now.addEventListener('click',run);
  skip.addEventListener('click',()=>cancel(track));
  task.interval=setInterval(()=>{
    if(active.get(track)!==task||!container.isConnected||!valid()){cancel(track);return;}
    remaining=Math.max(1,remaining-1);text();
  },1000);
  task.timeout=setTimeout(run,seconds*1000);
  text();return true;
 }
 function ensurePlaying(player,box){
  if(!player||!box||!box.isConnected)return;
  setTimeout(()=>{
   if(!box.isConnected)return;
   let state=1;
   try{state=player.getPlayerState();}catch(_){return;}
   if(state===1||state===3)return;
   if(box.querySelector('.training-auto-manual'))return;
   const prompt=document.createElement('button');
   prompt.type='button';prompt.className='training-auto-manual';
   prompt.textContent='▶ اضغط هنا لتشغيل الفيديو بالصوت';
   prompt.addEventListener('click',()=>{
    prompt.remove();
    try{player.playVideo();}catch(_){}
   });
   box.appendChild(prompt);
  },2500);
 }
 function playing(box){box?.querySelector('.training-auto-manual')?.remove();}
 const css=document.createElement('style');
 css.textContent=[
 '.training-auto-next{position:relative;z-index:5;display:grid;justify-items:center;gap:12px;text-align:center;padding:20px 12px;border:2px solid #d5bd73;border-radius:13px;background:#103f32;color:#fff9e6;font-weight:900;line-height:1.7;box-shadow:0 5px 20px #0002}',
 '.training-auto-next strong{font-size:clamp(17px,4vw,22px)}',
 '.training-auto-next div{display:flex;flex-wrap:wrap;justify-content:center;gap:9px}',
 '.training-auto-next button,.training-auto-manual{font:inherit;font-weight:900;border-radius:10px;border:1px solid #d3b96d;padding:11px 15px;min-height:44px;background:#edcf80;color:#103f32;cursor:pointer}',
 '.training-auto-next button:last-child{background:#e7f3e9;border-color:#b6d7bd}',
 '.training-auto-manual{position:absolute;inset:auto 12px 12px;z-index:8;width:calc(100% - 24px);box-shadow:0 4px 18px #0005}',
 '#basicBagInlineBox,#professionalInlineBox,#advancedFinancialInlineBox{position:relative}'
 ].join('');
 document.head.appendChild(css);
 window.DXNTrainingAutoPlay={schedule,cancel,ensurePlaying,playing};
})();