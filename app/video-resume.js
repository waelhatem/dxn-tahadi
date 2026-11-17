/* DXN: resume positions for informational HTML5/YouTube videos.
 * Assessment tracks use training-engine.js and the server-authoritative watch RPC
 * instead. This helper never grants completion/quiz access.
 */
(function(){
 'use strict';
 if(window.DXNVideoResume)return;
 const PREFIX='dxn_video_resume_v1', TTL=180*24*3600*1000, MAX=8*3600;
 const nativePlayers=new WeakSet(),youtubeFrames=new WeakSet();
 let youtubePromise=null;

 function userKey(){
  try{
   const member=String(localStorage.getItem('dxn_login_no')||'').trim();
   const token=String(localStorage.getItem('dxn_session')||'').trim();
   return token&&/^[0-9]{5,15}$/.test(member)?member:null;
  }catch(_){return null;}
 }
 function storageKey(user,kind,id){
  const part=v=>encodeURIComponent(String(v||'').trim().slice(0,300));
  return PREFIX+':'+part(user)+':'+part(kind)+':'+part(id);
 }
 function read(kind,id){
  const user=userKey();
  if(!user||!kind||!id)return null;
  try{
   const raw=localStorage.getItem(storageKey(user,kind,id));
   if(!raw)return null;
   const p=JSON.parse(raw);
   if(!p||!Number.isFinite(p.seconds)||p.seconds<0||p.seconds>MAX||
     !Number.isFinite(p.savedAt)||Date.now()-p.savedAt>TTL||p.savedAt>Date.now()+3600000)return null;
   return {seconds:p.seconds,duration:p.duration,user};
  }catch(_){return null;}
 }
 function erase(kind,id,user){
  const owner=user||userKey();if(!owner||!kind||!id)return;
  try{localStorage.removeItem(storageKey(owner,kind,id));}catch(_){}
 }
 function put(kind,id,seconds,duration,user){
  const owner=user||userKey();
  if(!owner||owner!==userKey()||!kind||!id||!Number.isFinite(seconds)||seconds<0)return;
  if(!Number.isFinite(duration)||duration<1||duration>MAX)return;
  if(seconds>=duration-3){erase(kind,id,owner);return;}
  if(seconds<3)return;
  try{localStorage.setItem(storageKey(owner,kind,id),JSON.stringify({
   seconds:Math.min(Math.floor(seconds),MAX),duration:Math.floor(duration),savedAt:Date.now()
  }));}catch(_){}
 }
 function resumeSeconds(kind,id,duration){
  const p=read(kind,id);if(!p)return 0;
  const d=Number(duration)||Number(p.duration)||0;
  if(d<=0||p.seconds>=d-3||Math.abs(Number(p.duration)-d)>Math.max(8,d*0.03))return 0;
  return Math.max(0,Math.floor(p.seconds));
 }
 function attachNative(video,kind,id){
  if(!video||typeof video.addEventListener!=='function'||nativePlayers.has(video))return;
  const owner=userKey();if(!owner||!String(id||'').trim())return;
  nativePlayers.add(video);
  let ready=false,lastSave=0;
  const restore=()=>{
   const d=Number(video.duration);
   if(!Number.isFinite(d)||d<1||ready)return;
   ready=true;
   const pos=resumeSeconds(kind,id,d);
   if(pos>0)try{video.currentTime=pos;}catch(_){}
  };
  const save=force=>{
   if(!ready||owner!==userKey()||video.ended)return;
   const now=Date.now();
   if(force!==true&&now-lastSave<2500)return;
   lastSave=now;put(kind,id,Number(video.currentTime),Number(video.duration),owner);
  };
  video.addEventListener('loadedmetadata',restore);
  video.addEventListener('durationchange',restore);
  video.addEventListener('timeupdate',()=>save(false));
  video.addEventListener('pause',()=>save(true));
  video.addEventListener('seeked',()=>save(true));
  video.addEventListener('ended',()=>{ready=false;erase(kind,id,owner);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);});
  window.addEventListener('pagehide',()=>save(true));
  if(video.readyState>=1)restore();
 }
 function youtubeStart(kind,id){return resumeSeconds(kind,id);}
 function youtubeApi(){
  if(window.YT&&typeof window.YT.Player==='function')return Promise.resolve();
  if(youtubePromise)return youtubePromise;
  youtubePromise=new Promise((resolve,reject)=>{
   const previous=window.onYouTubeIframeAPIReady;
   window.onYouTubeIframeAPIReady=function(){
    if(typeof previous==='function')try{previous()}catch(_){}
    resolve();
   };
   const script=document.createElement('script');
   script.src='https://www.youtube.com/iframe_api';
   script.async=true;
   script.onerror=()=>reject(Error('تعذر تحميل مشغل YouTube'));
   if(!document.querySelector('script[src*="youtube.com/iframe_api"]'))document.head.appendChild(script);
   else if(window.YT&&window.YT.Player)resolve();
  }).catch(error=>{youtubePromise=null;throw error;});
  return youtubePromise;
 }
 function attachYouTube(frame,kind,id,options){
  if(!frame||youtubeFrames.has(frame)||!String(id||'').trim())return;
  const owner=userKey();if(!owner)return;
  youtubeFrames.add(frame);
  youtubeApi().then(()=>{
   if(!frame.isConnected||owner!==userKey())return;
   let player=null,lastSave=0,finished=false;
   const save=force=>{
    if(!player||finished||owner!==userKey())return;
    const now=Date.now();
    if(!force&&now-lastSave<2500)return;
    try{
     const duration=Number(player.getDuration()),seconds=Number(player.getCurrentTime());
     if(Number.isFinite(seconds)&&Number.isFinite(duration)&&duration>0){
      lastSave=now;put(kind,id,seconds,duration,owner);
     }
    }catch(_){}
   };
   function poll(){
    if(!frame.isConnected){
     clearInterval(timer);save(true);try{player.destroy()}catch(_){}return;
    }
    try{
     if(player.getPlayerState()===1)save(false);
    }catch(_){}
   }
   const timer=setInterval(poll,2000);
   player=new window.YT.Player(frame,{
    events:{
     onStateChange:function(e){
      if(e.data===0){
       finished=true;erase(kind,id,owner);
       if(options&&typeof options.onEnded==='function')options.onEnded();
      }else if(e.data===2)save(true);
     }
    }
   });
   document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);});
   window.addEventListener('pagehide',()=>save(true));
  }).catch(()=>{});
 }
 window.DXNVideoResume={read,resumeSeconds,attachNative,youtubeStart,attachYouTube,clear:erase};
})();
