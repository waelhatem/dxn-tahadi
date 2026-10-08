'use strict';
const {
  KLING_MODEL,parseBody,methodGuard,assertSession,getFal,falResultData,cleanFalError
}=require('./_design-studio-common');

module.exports=async function handler(req,res){
  if(!methodGuard(req,res))return;
  try{
    const body=parseBody(req);
    await assertSession(body.token);
    const requestId=String(body.request_id||'').trim();
    if(!/^[a-zA-Z0-9_-]{8,200}$/.test(requestId))return res.status(400).json({ok:false,error:'معرّف مهمة الفيديو غير صالح.'});

    const fal=await getFal();
    const status=await fal.queue.status(KLING_MODEL,{requestId,logs:false});
    const state=String(status&&status.status||'UNKNOWN');

    if(state!=='COMPLETED')return res.status(200).json({ok:true,kind:'video',status:state,request_id:requestId});

    const result=await fal.queue.result(KLING_MODEL,{requestId});
    const payload=falResultData(result);
    const videoUrl=String(payload&&payload.video&&payload.video.url||'');
    if(!videoUrl)throw new Error('اكتملت المهمة لكن لم يصل ملف فيديو صالح.');
    return res.status(200).json({ok:true,kind:'video',status:'COMPLETED',request_id:requestId,video_url:videoUrl});
  }catch(error){
    console.error('[design-video-status]',error);
    return res.status(500).json({ok:false,error:cleanFalError(error)});
  }
};
