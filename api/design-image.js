const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').trim().replace(/[\r\n]/g,'');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const DESIGN_IMAGE_MODEL=String(process.env.DESIGN_IMAGE_MODEL||'gpt-image-2.5-sunburst').trim();
const MAX_IMAGE_BYTES=2.6*1024*1024;

function jsonBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string')return JSON.parse(req.body||'{}');
  return {};
}

async function validateSession(token){
  if(!token)throw new Error('جلسة الدخول غير موجودة.');
  if(!SUPABASE_SECRET_KEY)throw new Error('مفتاح Supabase السري غير مضبوط في Vercel.');
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/bootstrap',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_SECRET_KEY,
      Authorization:'Bearer '+SUPABASE_SECRET_KEY
    },
    body:JSON.stringify({p_token:token})
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch(_){}
  if(!r.ok||!data)throw new Error('جلسة الدخول غير صالحة. أعد تسجيل الدخول.');
  const role=String(data.role||'').toLowerCase();
  if(role!=='member'&&role!=='leader')throw new Error('الحساب غير مصرح له باستخدام استوديو التصميم.');
  return {role};
}

function parseImageDataUrl(value){
  const s=String(value||'');
  const m=s.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!m)throw new Error('صيغة الصورة غير مدعومة.');
  const mime=m[1].toLowerCase();
  const buffer=Buffer.from(m[2].replace(/\s/g,''),'base64');
  if(!buffer.length)throw new Error('الصورة فارغة.');
  if(buffer.length>MAX_IMAGE_BYTES)throw new Error('الصورة ما زالت كبيرة بعد التحضير. اختر صورة أصغر.');
  return {mime,buffer};
}

function safeText(v,max=1600){
  return String(v||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);
}

function sizeForAspect(aspect){
  return ({
    '1:1':'1024x1024',
    '4:5':'1024x1280',
    '9:16':'720x1280',
    '16:9':'1280x720'
  })[String(aspect||'1:1')]||'1024x1024';
}

function buildPrompt(mode,userPrompt,preserve){
  const base={
    enhance:'Enhance this product photograph professionally: improve lighting, exposure, white balance, sharpness, clarity, natural contrast and overall commercial polish. Remove visual distractions only when that does not change the product itself.',
    background:'Create a clean premium marketing background and environment around this product. Keep the product as the clear visual hero, with realistic lighting, shadows and perspective.',
    ad:'Turn this product photo into a premium advertising hero image suitable for social media marketing. Use strong composition, realistic commercial lighting and visual hierarchy. Do not add promotional claims, prices or new written copy unless the user explicitly asks for them.',
    free:'Edit the supplied image according to the user instructions while keeping the result realistic and professionally finished.'
  }[mode]||'Professionally edit the supplied product image.';

  const preserveRule=preserve
    ? 'CRITICAL PRODUCT FIDELITY: Treat the photographed product as a locked reference. Preserve the exact package shape, logo, brand marks, printed label text, typography, product colors, cap/seal, proportions and visible product details. Do not redraw, replace, invent, translate, correct or restyle any text or branding on the package. Only change the surrounding scene, lighting, photographic quality or explicitly requested non-product elements.'
    : 'Keep the original product recognizable and do not invent misleading product claims or attributes.';

  const extra=userPrompt
    ? 'User instructions: '+userPrompt
    : 'No additional user instructions were provided.';

  return [
    base,
    preserveRule,
    extra,
    'Produce a photorealistic, commercially usable image. Avoid watermarks and avoid adding unrelated objects that compete with the product.'
  ].join('\n\n');
}

async function callImageEdit({image,mime,prompt,size,model}){
  const form=new FormData();
  form.append('model',model);
  form.append('image',new Blob([image],{type:mime}),'product.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'));
  form.append('prompt',prompt);
  form.append('size',size);
  form.append('quality','medium');
  form.append('output_format','webp');
  form.append('output_compression','82');

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),115000);
  try{
    const r=await fetch('https://api.openai.com/v1/images/edits',{
      method:'POST',
      headers:{Authorization:'Bearer '+OPENAI_API_KEY},
      body:form,
      signal:controller.signal
    });
    const text=await r.text();
    let data=null;try{data=text?JSON.parse(text):null}catch(_){}
    if(!r.ok){
      const msg=String(data?.error?.message||data?.message||text||('HTTP '+r.status)).slice(0,800);
      const err=new Error(msg);
      err.status=r.status;
      throw err;
    }
    const b64=String(data?.data?.[0]?.b64_json||'');
    if(!b64)throw new Error('لم يعُد محرك الصور بصورة صالحة.');
    return {b64,model,usage:data?.usage||null};
  }finally{
    clearTimeout(timer);
  }
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }
  try{
    if(!OPENAI_API_KEY)return res.status(503).json({ok:false,error:'OPENAI_API_KEY غير مضبوط في Vercel.'});
    const body=jsonBody(req);
    const token=safeText(body.token,500);
    await validateSession(token);

    const mode=['enhance','background','ad','free'].includes(body.mode)?body.mode:'enhance';
    const aspect=['1:1','4:5','9:16','16:9'].includes(body.aspect)?body.aspect:'1:1';
    const preserve=body.preserve!==false;
    const userPrompt=safeText(body.prompt,1400);
    const parsed=parseImageDataUrl(body.image_data);
    const prompt=buildPrompt(mode,userPrompt,preserve);
    const result=await callImageEdit({
      image:parsed.buffer,
      mime:parsed.mime,
      prompt,
      size:sizeForAspect(aspect),
      model:DESIGN_IMAGE_MODEL
    });

    return res.status(200).json({
      ok:true,
      image_data:'data:image/webp;base64,'+result.b64,
      mime:'image/webp',
      model:result.model,
      aspect,
      mode
    });
  }catch(error){
    const aborted=error&&error.name==='AbortError';
    const message=aborted
      ? 'استغرق إنشاء الصورة وقتًا أطول من المسموح. أعد المحاولة.'
      : String(error&&error.message||error||'تعذر إنشاء الصورة.').slice(0,900);
    console.error('[design-image]',message);
    const status=Number(error&&error.status)||(/جلسة|مصرح|صيغة|كبيرة|فارغة/.test(message)?400:502);
    return res.status(status).json({ok:false,error:message});
  }
};
