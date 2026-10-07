'use strict';
const {
  KLING_MODEL,parseBody,methodGuard,assertSession,validateImageDataUrl,sanitizePrompt,getFal,cleanFalError
}=require('./_design-studio-common');

module.exports=async function handler(req,res){
  if(!methodGuard(req,res))return;
  try{
    const body=parseBody(req);
    await assertSession(body.token);
    const image=validateImageDataUrl(body.image_data);
    const prompt=sanitizePrompt(body.prompt,1500)||'Create a premium, realistic commercial product video with subtle cinematic camera movement. Preserve the product packaging, logo, printed text, colors, proportions, and identity. Do not invent claims or marketing text.';
    const requested=Number(body.duration||5);
    const duration=String([3,4,5,6,7,8,9,10,11,12,13,14,15].includes(requested)?requested:5);
    const generateAudio=body.generate_audio===true;

    const fal=await getFal();
    const input={
      start_image_url:image,
      prompt,
      duration,
      generate_audio:generateAudio,
      negative_prompt:'distorted packaging, changed logo, misspelled text, warped product, duplicate product, fake labels, extra text, watermark'
    };
    const submitted=await fal.queue.submit(KLING_MODEL,{input});
    const requestId=String(submitted&&submitted.request_id||'');
    if(!requestId)throw new Error('تعذر إنشاء مهمة الفيديو.');
    return res.status(202).json({ok:true,kind:'video',status:'IN_QUEUE',request_id:requestId});
  }catch(error){
    console.error('[design-video]',error);
    return res.status(500).json({ok:false,error:cleanFalError(error)});
  }
};
