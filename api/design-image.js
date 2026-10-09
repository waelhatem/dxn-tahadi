'use strict';
const {
  OPENAI_IMAGE_MODEL,parseBody,methodGuard,assertSession,normalizeAspect,openAiSize,
  falProductAspect,validateImageDataUrl,sanitizePrompt,backgroundDescription,buildImagePrompt,
  callOpenAIImages,getFal,falResultData,firstImageUrl,cleanFalError
}=require('./_design-studio-common');

const OPENAI_EDIT_TASKS=new Set(['enhance','lighting','erase','free','ad']);

async function runFalImage(task,{image,aspect,prompt,background}){
  const fal=await getFal();
  let model,input;
  if(task==='product'){
    model='fal-ai/image-apps-v2/product-photography';
    input={
      product_image_url:image,
      aspect_ratio:{ratio:falProductAspect(aspect)},
      prompt:sanitizePrompt(prompt)||'Premium photorealistic commercial product photography with clean professional lighting.'
    };
  }else if(task==='remove_bg'){
    model='fal-ai/bria/background/remove';
    input={image_url:image};
  }else if(task==='background'){
    model='bria/replace-background';
    input={
      image_url:image,
      prompt:sanitizePrompt(prompt)||backgroundDescription(background)
    };
  }else if(task==='upscale'){
    model='fal-ai/seedvr/upscale/image';
    input={image_url:image,upscale_mode:'factor',upscale_factor:2,output_format:'jpg'};
  }else{
    throw new Error('المهمة غير مدعومة.');
  }
  const result=await fal.subscribe(model,{input,logs:false});
  const payload=falResultData(result);
  const url=firstImageUrl(payload);
  if(!url)throw new Error('لم يصل ملف صورة صالح من محرك التصميم.');
  return {url,provider:'fal'};
}

module.exports=async function handler(req,res){
  if(!methodGuard(req,res))return;
  try{
    const body=parseBody(req);
    await assertSession(body.token);

    const task=String(body.task||'enhance').toLowerCase();
    const supported=new Set(['enhance','product','remove_bg','background','lighting','erase','free','upscale','ad','generate']);
    if(!supported.has(task))return res.status(400).json({ok:false,error:'نوع التصميم غير مدعوم.'});

    const aspect=normalizeAspect(body.aspect);
    const preserve=body.preserve!==false;
    const prompt=sanitizePrompt(body.prompt);
    const background=String(body.background||'premium');
    const image=validateImageDataUrl(body.image_data,{required:task!=='generate'});

    if(task==='generate'&&!prompt)return res.status(400).json({ok:false,error:'اكتب وصف الصورة التي تريد إنشاءها.'});
    if(task==='erase'&&!prompt)return res.status(400).json({ok:false,error:'اكتب اسم العنصر الذي تريد حذفه من الصورة.'});

    if(OPENAI_EDIT_TASKS.has(task)){
      const output=await callOpenAIImages('edits',{
        model:OPENAI_IMAGE_MODEL,
        images:[{image_url:image}],
        prompt:buildImagePrompt({task,prompt,preserve,background}),
        size:openAiSize(aspect),
        quality:'medium',
        output_format:'jpeg',
        output_compression:88,
        background:'opaque',
        n:1
      });
      return res.status(200).json({ok:true,kind:'image',task,...output,provider:'openai'});
    }

    if(task==='generate'){
      const output=await callOpenAIImages('generations',{
        model:OPENAI_IMAGE_MODEL,
        prompt:buildImagePrompt({task,prompt,preserve:false,background}),
        size:openAiSize(aspect),
        quality:'medium',
        output_format:'jpeg',
        output_compression:88,
        background:'opaque',
        n:1
      });
      return res.status(200).json({ok:true,kind:'image',task,...output,provider:'openai'});
    }

    const output=await runFalImage(task,{image,aspect,prompt,background});
    return res.status(200).json({ok:true,kind:'image',task,url:output.url,image_data:'',provider:output.provider});
  }catch(error){
    console.error('[design-image]',error);
    const msg=String(error&&error.message||error||'تعذر تشغيل استوديو التصميم.');
    return res.status(500).json({ok:false,error:msg});
  }
};
