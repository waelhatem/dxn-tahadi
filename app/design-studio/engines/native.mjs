/* المحول المدمج للمحركات الحقيقية الموجودة أصلًا في المشروع: OpenAI للصور و fal.ai للصور/الفيديو.
   لا مفاتيح في المتصفح؛ كل الطلبات تمر عبر Vercel API وتتحقق من جلسة المستخدم. */
import { getCapabilities, MESSAGES } from '../config.mjs';

const OPENAI_IMAGE_TOOLS = new Set(['enhance','lighting','removeObject','addObject','productMarketing','freeEdit','ad','generate']);
const FAL_IMAGE_TOOLS = new Set(['product','removeBg','changeBg','upscale']);
const TASK_MAP = Object.freeze({
  enhance:'enhance',
  lighting:'lighting',
  removeObject:'erase',
  addObject:'free',
  productMarketing:'ad',
  freeEdit:'free',
  ad:'ad',
  generate:'generate',
  product:'product',
  removeBg:'remove_bg',
  changeBg:'background',
  upscale:'upscale'
});

function sessionToken(){ try{return localStorage.getItem('dxn_session')||'';}catch(_){return '';} }
function sleep(ms,signal){return new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);if(signal)signal.addEventListener('abort',()=>{clearTimeout(t);reject(new Error(MESSAGES.cancelled));},{once:true});});}
async function postJson(path,body,signal){
  let r;
  try{
    r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal});
  }catch(err){
    if(signal&&signal.aborted)throw new Error(MESSAGES.cancelled);
    throw new Error(MESSAGES.network);
  }
  let data=null; try{data=await r.json();}catch(_){}
  if(!r.ok||!data||data.ok===false)throw new Error((data&&data.error)||MESSAGES.processingFailed);
  return data;
}

async function shrinkDataUrl(source,maxChars=3000000){
  const raw=String(source||'');
  if(!raw||raw.length<=maxChars)return raw;
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=raw;});
  let maxSide=1600,quality=.86,out=raw;
  for(let attempt=0;attempt<4;attempt++){
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    const scale=Math.min(1,maxSide/Math.max(w,h));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
    const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(img,0,0,c.width,c.height);
    out=c.toDataURL('image/jpeg',quality);
    if(out.length<=maxChars)return out;
    maxSide=Math.round(maxSide*.8);quality=Math.max(.68,quality-.06);
  }
  if(out.length>3250000)throw new Error('الصورة كبيرة جدًا للمعالجة بالذكاء الاصطناعي. اختر صورة أصغر.');
  return out;
}

function backgroundKey(value){
  return ({studio:'premium',white:'white',luxury:'dark',wood:'warm',kitchen:'lifestyle',office:'lifestyle',nature:'natural',lifestyle:'lifestyle',social:'premium',minimal:'white',cinematic:'dark'})[value]||'premium';
}
function imageSize(src){
  return new Promise(resolve=>{
    if(!src)return resolve({width:0,height:0});
    const img=new Image();
    img.onload=()=>resolve({width:img.naturalWidth||img.width||0,height:img.naturalHeight||img.height||0});
    img.onerror=()=>resolve({width:0,height:0});
    img.src=src;
  });
}

export function nativeImageSupports(tool){
  const caps=getCapabilities();
  if(OPENAI_IMAGE_TOOLS.has(tool))return !!(caps.image&&caps.image.openai);
  if(FAL_IMAGE_TOOLS.has(tool))return !!(caps.image&&caps.image.fal);
  return false;
}

export class NativeImageAdapter{
  supports(tool){return nativeImageSupports(tool);}
  async process({tool,source,options={}},{progress,signal}){
    const task=TASK_MAP[tool];
    if(!task||!this.supports(tool))throw new Error(MESSAGES.engineUnavailable);
    progress(12,'جاري تجهيز الصورة...');
    const image=tool==='generate'?'':await shrinkDataUrl(source);
    progress(28,'تم تجهيز الملف...');
    const prompt=String(options.prompt||options.instruction||options.headline||'').trim();
    const sourceSize=await imageSize(source);
    const data=await postJson('/api/design-image',{
      token:sessionToken(),
      task,
      image_data:image,
      aspect:options.aspect||'1:1',
      prompt,
      background:backgroundKey(options.background),
      preserve:options.preserveProduct!==false
    },signal);
    progress(92,'جاري تجهيز النتيجة...');
    const resultSrc=String(data.image_data||data.url||'');
    if(!resultSrc)throw new Error(MESSAGES.processingFailed);
    const resultSize=await imageSize(resultSrc);
    const mime=resultSrc.startsWith('data:image/png')?'image/png':'image/jpeg';
    return {
      resultSrc,
      mime,
      sample:false,
      provider:data.provider||'native',
      sourceWidth:sourceSize.width,
      sourceHeight:sourceSize.height,
      width:resultSize.width,
      height:resultSize.height
    };
  }
}

export class NativeVideoAdapter{
  available(){const caps=getCapabilities();return !!(caps.video&&caps.video.fal);}
  async imageToVideo({source,prompt='',duration=5,generateAudio=false},{progress,signal}){
    if(!this.available())throw new Error(MESSAGES.engineUnavailable);
    progress(10,'جاري تجهيز الصورة...');
    const image=await shrinkDataUrl(source);
    const submitted=await postJson('/api/design-video',{
      token:sessionToken(),
      image_data:image,
      prompt:String(prompt||'').trim(),
      duration:Number(duration)||5,
      generate_audio:generateAudio===true
    },signal);
    const requestId=String(submitted.request_id||'');
    if(!requestId)throw new Error(MESSAGES.processingFailed);
    progress(18,'تم إرسال مهمة الفيديو...');
    let tick=18;
    for(;;){
      if(signal&&signal.aborted)throw new Error(MESSAGES.cancelled);
      await sleep(2200,signal);
      const s=await postJson('/api/design-video-status',{token:sessionToken(),request_id:requestId},signal);
      const status=String(s.status||'').toUpperCase();
      if(status==='COMPLETED'){
        progress(98,'تم إنشاء الفيديو.');
        if(!s.video_url)throw new Error(MESSAGES.processingFailed);
        return {url:String(s.video_url),mime:'video/mp4',remote:true,sample:false,requestId};
      }
      if(status==='FAILED'||status==='CANCELLED')throw new Error(s.error||MESSAGES.processingFailed);
      tick=Math.min(92,tick+5);
      progress(tick,status==='IN_QUEUE'?'في قائمة الانتظار...':'جاري إنشاء الفيديو...');
    }
  }
}
