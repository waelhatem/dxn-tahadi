'use strict';
const {randomUUID}=require('node:crypto');

const PROJECT_URL='https://ryqpstkzppaifpvhezzn.supabase.co';
const BUCKET='platform-academy';
// The project is currently Supabase Free: max 50 MB. 100 MB is only enabled
// after a paid-plan upgrade AND raising Supabase Storage global limit.
const MAX_VIDEO=100*1024*1024;
const FREE_MAX_VIDEO=50*1024*1024;
function effectiveMaxVideo(){
  return process.env.ACADEMY_VIDEO_100MB_ENABLED==='true'?MAX_VIDEO:FREE_MAX_VIDEO;
}
const TOKEN_RE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TYPES={'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','video/x-m4v':'m4v','video/3gpp':'3gp'};

function credentials(){
  return {
    publicKey:String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh').trim(),
    secret:String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()
  };
}
async function jsonRequest(url,opts){
  const result=await fetch(url,{...opts,signal:AbortSignal.timeout(18000),cache:'no-store'});
  const body=await result.text();
  let data=null;
  try{data=body?JSON.parse(body):null}catch(e){}
  if(!result.ok){
    console.error('[academy-video-storage]',new URL(url).pathname,result.status);
    throw Object.assign(new Error('storage_http_'+result.status),{status:result.status});
  }
  if(data==null)throw new Error('Empty storage response');
  return data;
}
function headers(key){
  return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
}
async function verify(token){
  const key=credentials().publicKey;
  const user=await jsonRequest(PROJECT_URL+'/rest/v1/rpc/bootstrap',{
    method:'POST',headers:headers(key),body:JSON.stringify({p_token:token})
  });
  if(!user||!TOKEN_RE.test(String(user.user_id||''))||!['leader','member'].includes(user.role))return null;
  return user;
}
function signedDownloadUrl(path){
  if(typeof path!=='string'||!path)return '';
  if(/^https:\/\/ryqpstkzppaifpvhezzn\.supabase\.co\/storage\/v1\//.test(path))return path;
  if(!path.startsWith('/'))return '';
  return PROJECT_URL+(path.startsWith('/storage/v1/')?'':'/storage/v1')+path;
}

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const action=String(req.body?.action||'');
  const token=String(req.body?.p_token||'').trim();
  if(!TOKEN_RE.test(token))return res.status(401).json({error:'يرجى تسجيل الدخول أولاً'});
  if(!['prepare','play','limits'].includes(action))return res.status(400).json({error:'طلب غير صالح'});
  try{
    const user=await verify(token);
    if(!user)return res.status(401).json({error:'انتهت الجلسة، يرجى تسجيل الدخول'});
    const {secret}=credentials();
    if(action==='limits'){
      if(user.role!=='leader')return res.status(403).json({error:'الإعدادات متاحة للقائد فقط'});
      return res.status(200).json({ok:true,max_bytes:effectiveMaxVideo(),upgrade_required:effectiveMaxVideo()===FREE_MAX_VIDEO});
    }
    if(action==='prepare'){
      if(user.role!=='leader')return res.status(403).json({error:'رفع الفيديوهات متاح للقائد فقط'});
      const size=Number(req.body?.file_size);
      const mime=String(req.body?.content_type||'').toLowerCase();
      if(!Number.isSafeInteger(size)||size<1||size>effectiveMaxVideo())
        return res.status(400).json({error:effectiveMaxVideo()===FREE_MAX_VIDEO
          ? 'حساب Supabase الحالي مجاني ويحد الفيديو إلى 50 ميغابايت. ارفع ملفاً أصغر، أو رقِّ خطة التخزين قبل رفع 100 ميغابايت.'
          : 'حجم الفيديو يجب ألا يتجاوز 100 ميغابايت.'});
      if(!Object.hasOwn(TYPES,mime))return res.status(400).json({error:'صيغة الفيديو غير مدعومة. استخدم MP4 أو MOV أو WebM.'});
      if(!secret)return res.status(503).json({error:'مفتاح التخزين الآمن غير مُعدّ في بيئة المعاينة'});
      const path='leader/'+user.user_id+'/'+randomUUID()+'.'+TYPES[mime];
      const response=await jsonRequest(PROJECT_URL+'/storage/v1/object/upload/sign/'+BUCKET+'/'+path,{
        method:'POST',headers:headers(secret),body:JSON.stringify({upsert:false})
      });
      const uploadToken=String(response?.token||response?.data?.token||'');
      if(!uploadToken)throw new Error('storage_upload_token_missing');
      return res.status(200).json({ok:true,bucket:BUCKET,path,upload_token:uploadToken,max_bytes:effectiveMaxVideo()});
    }
    if(!TOKEN_RE.test(String(req.body?.video_id||'')))return res.status(400).json({error:'معرّف الفيديو غير صالح'});
    if(!secret)return res.status(503).json({error:'خدمة تشغيل الفيديوهات غير مُعدة في بيئة المعاينة'});
    const id=String(req.body.video_id);
    const rows=await jsonRequest(PROJECT_URL+'/rest/v1/academy_leader_videos?select=object_path&id=eq.'+id+'&status=eq.published&limit=1',{
      method:'GET',headers:headers(secret)
    });
    if(!Array.isArray(rows)||!rows[0]?.object_path)return res.status(404).json({error:'الفيديو غير موجود'});
    const objectPath=String(rows[0].object_path);
    if(!/^leader\/[a-f0-9/-]+\.(mp4|mov|webm|m4v|3gp)$/i.test(objectPath))throw new Error('stored_video_path_invalid');
    const signed=await jsonRequest(PROJECT_URL+'/storage/v1/object/sign/'+BUCKET+'/'+objectPath,{
      method:'POST',headers:headers(secret),body:JSON.stringify({expiresIn:3600})
    });
    const url=signedDownloadUrl(signed?.signedURL||signed?.signedUrl||'');
    if(!url)throw new Error('storage_signed_playback_missing');
    return res.status(200).json({ok:true,url,expires_in:3600});
  }catch(error){
    console.error('[academy-video-storage]',String(error?.message||error));
    return res.status(502).json({error:'تعذر إكمال العملية مع مخزن الفيديوهات. تحقق من الاتصال أو إعداد التخزين الآمن.'});
  }
}
module.exports=handler;
module.exports.__test={signedDownloadUrl,TYPES,MAX_VIDEO,FREE_MAX_VIDEO,effectiveMaxVideo};
