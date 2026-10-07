'use strict';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').trim().replace(/[\r\n]/g,'');
const FAL_KEY=String(process.env.FAL_KEY||'').trim().replace(/[\r\n]/g,'');
const OPENAI_IMAGE_MODEL=String(process.env.DESIGN_IMAGE_MODEL||'gpt-image-2.5-sunburst').trim();
const KLING_MODEL=String(process.env.DESIGN_VIDEO_MODEL||'fal-ai/kling-video/v3/standard/image-to-video').trim();
const MAX_IMAGE_DATA_URL_CHARS=3250000;

function parseJson(value,fallback={}){
  if(value&&typeof value==='object')return value;
  try{return JSON.parse(String(value||''))}catch(_){return fallback}
}
function parseBody(req){return parseJson(req&&req.body,{})}
function setCors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Cache-Control','no-store');
}
function methodGuard(req,res){
  setCors(res);
  if(req.method==='OPTIONS'){res.status(200).end();return false}
  if(req.method!=='POST'){res.status(405).json({ok:false,error:'Method not allowed'});return false}
  return true;
}
async function postJson(url,body,headers={},timeoutMs=60000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json',...headers},
      body:JSON.stringify(body||{}),
      signal:controller.signal
    });
    const text=await response.text();
    return {ok:response.ok,status:response.status,data:parseJson(text,null),text};
  }catch(error){
    return {ok:false,status:0,data:null,text:String(error&&error.message||error||'network error')};
  }finally{clearTimeout(timer)}
}
async function assertSession(token){
  const sessionToken=String(token||'').trim();
  if(!sessionToken)throw new Error('جلسة الدخول مطلوبة.');
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel.');
  const response=await postJson(
    SUPABASE_URL+'/rest/v1/rpc/bootstrap',
    {p_token:sessionToken},
    {apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY},
    15000
  );
  if(!response.ok){
    const msg=response.data&&(response.data.message||response.data.error||response.data.hint);
    throw new Error(String(msg||response.text||'جلسة الدخول غير صالحة.'));
  }
  const role=String(response.data&&response.data.role||'').toLowerCase();
  if(role!=='member'&&role!=='leader')throw new Error('نوع الحساب غير مدعوم.');
  return {role,data:response.data};
}
function normalizeAspect(value){
  const v=String(value||'1:1');
  return ['1:1','4:5','9:16','16:9'].includes(v)?v:'1:1';
}
function openAiSize(aspect){
  return ({'1:1':'1024x1024','4:5':'1024x1280','9:16':'1024x1824','16:9':'1824x1024'})[normalizeAspect(aspect)];
}
function falProductAspect(aspect){
  return ({'1:1':'1:1','4:5':'3:4','9:16':'9:16','16:9':'16:9'})[normalizeAspect(aspect)];
}
function validateImageDataUrl(value,{required=true}={}){
  const raw=String(value||'');
  if(!raw&&required)throw new Error('ارفع صورة أولًا.');
  if(!raw&&!required)return '';
  if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(raw))throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.');
  if(raw.length>MAX_IMAGE_DATA_URL_CHARS)throw new Error('حجم الصورة بعد الضغط أكبر من الحد المسموح. اختر صورة أصغر.');
  return raw;
}
function sanitizePrompt(value,max=1800){
  return String(value||'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ').trim().slice(0,max);
}
function backgroundDescription(value){
  return ({
    premium:'a premium commercial studio environment with controlled soft lighting and realistic contact shadows',
    white:'a clean seamless white studio background with soft realistic shadows',
    lifestyle:'a realistic lifestyle scene appropriate to the product category, with natural depth and believable materials',
    natural:'a realistic natural environment with believable daylight and subtle depth of field',
    dark:'a premium dark studio scene with controlled rim lighting and elegant reflections',
    warm:'a warm welcoming commercial setting with natural golden light and realistic textures'
  })[String(value||'premium')]||'a premium commercial studio environment with controlled soft lighting and realistic contact shadows';
}
function buildImagePrompt({task,prompt,preserve,background}){
  const userPrompt=sanitizePrompt(prompt);
  const rules=[
    'Create a photorealistic, commercially polished marketing image.',
    preserve!==false
      ? 'Preserve the exact product identity as faithfully as possible: package geometry, proportions, logo, printed wording, brand colors, label placement, cap, seals, and distinctive physical details. Do not redesign or rewrite the packaging.'
      : 'Keep the source product recognizable while following the requested visual edit.',
    'Do not invent prices, discounts, certifications, awards, ingredients, health claims, medical claims, efficacy claims, or product benefits.',
    'Do not add marketing copy, badges, logos, watermarks, or labels unless the user explicitly supplied the exact text.',
    'Keep Arabic and Latin text already printed on the package unchanged whenever technically possible.',
    'Use physically believable lighting, contact shadows, reflections, perspective, and depth.'
  ];
  const taskRules={
    enhance:'Improve sharpness, exposure, white balance, dynamic range, local contrast, texture clarity, and overall product presentation. Keep the scene composition stable unless a subtle crop is needed.',
    lighting:'Improve only the lighting and tonal balance. Preserve objects, layout, background structure, and product geometry.',
    background:'Replace the surrounding environment with '+backgroundDescription(background)+'. Keep the product itself intact and blend it naturally into the new environment.',
    erase:'Remove only the unwanted object or distraction described by the user. Reconstruct the revealed area realistically. Do not remove or alter the product unless explicitly requested.',
    free:'Apply the user instruction precisely while maintaining photographic realism and product consistency.',
    ad:'Create a premium advertising-style composition using '+backgroundDescription(background)+'. Make the product the clear focal point and leave useful negative space for later copy, without adding copy yourself.',
    generate:'Create a new professional marketing visual from the user instruction. Avoid fabricating branded package text or claims unless explicitly supplied.'
  };
  rules.push(taskRules[task]||taskRules.free);
  if(userPrompt)rules.push('User instruction: '+userPrompt);
  rules.push('Return one finished image only.');
  return rules.join('\n');
}
async function callOpenAIImages(endpoint,payload,timeoutMs=70000){
  if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط في Vercel.');
  const response=await postJson(
    'https://api.openai.com/v1/images/'+endpoint,
    payload,
    {Authorization:'Bearer '+OPENAI_API_KEY},
    timeoutMs
  );
  if(!response.ok){
    const msg=response.data&&response.data.error&&response.data.error.message;
    throw new Error(String(msg||response.text||'تعذر إنشاء الصورة.'));
  }
  const item=Array.isArray(response.data&&response.data.data)?response.data.data[0]:null;
  const b64=String(item&&item.b64_json||'');
  const url=String(item&&item.url||'');
  if(!b64&&!url)throw new Error('لم يرجع محرك الصور نتيجة صالحة.');
  return b64?{image_data:'data:image/jpeg;base64,'+b64,url:''}:{image_data:'',url};
}
let falClientPromise=null;
async function getFal(){
  if(!FAL_KEY)throw new Error('FAL_KEY غير مضبوط في Vercel.');
  if(!falClientPromise){
    falClientPromise=import('@fal-ai/client').then(mod=>{
      const fal=mod.fal;
      fal.config({credentials:FAL_KEY});
      return fal;
    });
  }
  return falClientPromise;
}
function falResultData(result){return result&&result.data?result.data:result||{}}
function firstImageUrl(payload){
  if(payload&&payload.image&&payload.image.url)return String(payload.image.url);
  if(Array.isArray(payload&&payload.images)&&payload.images[0]&&payload.images[0].url)return String(payload.images[0].url);
  return '';
}
function cleanFalError(error){
  const message=error&&(error.message||(error.body&&error.body.detail)||(error.body&&error.body.message));
  return String(message||error||'تعذر تشغيل محرك التصميم.');
}
module.exports={
  OPENAI_IMAGE_MODEL,KLING_MODEL,parseBody,methodGuard,assertSession,normalizeAspect,
  openAiSize,falProductAspect,validateImageDataUrl,sanitizePrompt,backgroundDescription,
  buildImagePrompt,callOpenAIImages,getFal,falResultData,firstImageUrl,cleanFalError
};
