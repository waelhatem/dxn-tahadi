/* DXN Academy: direct-to-Supabase resumable TUS uploads, leader-only signed path.
 * The server signs new upload paths after validating the leader's app session.
 * Only signed x-signature tokens reach the browser, never service-role keys.
 */
(function(){
 'use strict';
 if(window.__DXN_ACADEMY_RESUMABLE__)return;
 const KEY='dxn_academy_pending_tus_v1';
 const SIGNED_ENDPOINT='https://ryqpstkzppaifpvhezzn.storage.supabase.co/storage/v1/upload/resumable/sign';
 const PUBLISHABLE='sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh';
 const MAX_DRAFT_AGE_MS=90*60*1000; // prepared upload signatures expire
 let active=null;
 const fileKey=file=>[file.name,file.size,file.lastModified].join(':');
 function loadDraft(file){
   try{
     const draft=JSON.parse(sessionStorage.getItem(KEY)||'null');
     if(!draft||draft.key!==fileKey(file)||Date.now()-draft.time>MAX_DRAFT_AGE_MS)return null;
     if(!/^leader\/[0-9a-f/-]+\.(mp4|mov|webm|m4v|3gp)$/i.test(draft.path))return null;
     if(!draft.upload_token||!draft.path||!draft.content_type)return null;
     return draft;
   }catch(_){return null}
 }
 function storeDraft(draft){
   try{sessionStorage.setItem(KEY,JSON.stringify(draft))}catch(e){console.warn('Could not store resumable upload state',e)}
 }
 function clearDraft(){
   try{sessionStorage.removeItem(KEY)}catch(_){}
 }
 function unsupported(){
   return !window.tus||typeof window.tus.Upload!=='function'
 }
 async function prepare(file,contentType,p_token,request){
   const old=loadDraft(file);
   if(old&&old.content_type===contentType)return old;
   clearDraft();
   const res=await request('/api/academy-video-storage',{
     action:'prepare',p_token,content_type:contentType,file_size:file.size
   });
   if(!res||!res.upload_token||!res.path)throw Error('تعذر تجهيز رابط رفع الفيديو.');
   const draft={
     key:fileKey(file),time:Date.now(),path:res.path,upload_token:res.upload_token,
     content_type:contentType,completed:false
   };
   storeDraft(draft);
   return draft;
 }
 async function upload(file,options){
   if(unsupported())throw Error('مكوّن رفع الفيديو المتتابع لم يُحمّل. حدّث الصفحة وجرب مرة ثانية.');
   if(active)throw Error('يوجد فيديو قيد الرفع. انتظر اكتماله.');
   const draft=await prepare(file,options.contentType,options.p_token,options.request);
   if(draft.completed){
     options.onProgress?.(100,file.size,file.size);
     options.onState?.('uploaded');
     return {path:draft.path,content_type:draft.content_type,file_size:file.size};
   }
   return new Promise((resolve,reject)=>{
     let finished=false;
     const finish=(err,result)=>{
       if(finished)return;
       finished=true;
       active=null;
       if(err)reject(err);else resolve(result);
     };
     const task=new window.tus.Upload(file,{
       endpoint:SIGNED_ENDPOINT,
       headers:{'x-signature':draft.upload_token,apikey:PUBLISHABLE},
       metadata:{
         bucketName:'platform-academy',
         objectName:draft.path,
         contentType:options.contentType,
         cacheControl:'3600'
       },
       uploadDataDuringCreation:true,
       chunkSize:6*1024*1024,
       retryDelays:[0,3000,5000,10000,20000],
       removeFingerprintOnSuccess:true,
       onProgress(bytesUploaded,bytesTotal){
         const ratio=bytesTotal?Math.min(100,Math.round(bytesUploaded/bytesTotal*100)):0;
         options.onProgress?.(ratio,bytesUploaded,bytesTotal);
       },
       onError(error){
         options.onState?.('retry-needed');
         finish(new Error('تعذر رفع الفيديو. تحقق من الاتصال، ثم اضغط نشر مرة أخرى لاستكمال الرفع. '+(error?.message||'')));
       },
       onSuccess(){
         draft.completed=true;
         storeDraft(draft);
         options.onProgress?.(100,file.size,file.size);
         options.onState?.('uploaded');
         finish(null,{path:draft.path,content_type:draft.content_type,file_size:file.size});
       }
     });
     active={task,paused:false,notify:options.onState};
     options.onState?.('uploading');
     task.findPreviousUploads().then(previous=>{
       if(finished)return;
       if(previous.length){
         task.resumeFromPreviousUpload(previous[0]);
         options.onState?.('resuming');
       }
       task.start();
     }).catch(err=>finish(new Error('تعذر استئناف الرفع السابق. '+(err?.message||''))));
   });
 }
 async function togglePause(){
   const state=active;
   if(!state)return false;
   if(state.paused){
     state.paused=false;
     state.notify?.('resuming');
     state.task.start();
     return true;
   }
   await state.task.abort(false);
   if(active!==state)return false;
   state.paused=true;
   state.notify?.('paused');
   return true;
 }
 window.__DXN_ACADEMY_RESUMABLE__={upload,togglePause,clearDraft,getDraft:loadDraft,hasActive:()=>!!active};
})();
