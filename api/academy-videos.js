// V86.74 — Academy videos backed by Cloudflare R2.
// Browser -> short-lived signed PUT -> R2. The server performs HEAD before publish.
const https=require('https');
const crypto=require('node:crypto');
const {presignPut,headObject}=require('./_academy-r2');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/[\r\n]/g,'').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const TOKEN_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX=160,SECTION_MAX=80,MAX_FILE_SIZE=2147483648;
const ALLOWED_TYPES=new Set(['video/mp4','video/webm','video/quicktime']);
const REQUEST_TIMEOUT_MS=15000;

function httpError(status,message){const e=new Error(message);e.status=status;return e;}
function request(url,body){
  return new Promise((resolve,reject)=>{
    const u=new URL(url),payload=JSON.stringify(body||{});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,port:u.port||443,method:'POST',path:u.pathname+u.search,
      headers:{Accept:'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY},timeout:REQUEST_TIMEOUT_MS},
      res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});});});
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بقاعدة البيانات')));req.on('error',reject);req.write(payload);req.end();
  });
}
function supabaseRpc(fn,args){if(!SUPABASE_SECRET_KEY)throw httpError(500,'SUPABASE_SECRET_KEY غير مضبوط');return request(SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(fn),args);}
function dbError(result){
  const message=String(result.data&&(result.data.message||result.data.error)||result.text||'تعذر الاتصال بقاعدة البيانات');
  if(/انتهت الجلسة/.test(message))return httpError(401,'انتهت الجلسة. أعد تسجيل الدخول.');
  if(/للقائد فقط|إدارة فيديوهات/.test(message))return httpError(403,message);
  return httpError(result.status>=500?502:400,message);
}
function sessionToken(req,body){
  const token=String((req.headers&&(req.headers['x-dxn-session']||req.headers['X-DXN-Session']))||body.p_token||'').trim();
  if(!TOKEN_PATTERN.test(token))throw httpError(401,'انتهت الجلسة. أعد تسجيل الدخول.');
  return token;
}
function normalizeType(v){return String(v||'').trim().toLowerCase();}
function fileSize(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<=0||n>MAX_FILE_SIZE)throw httpError(400,'حجم الفيديو يجب أن يكون أكبر من صفر ولا يتجاوز 2 GB');return n;}
function contentType(v){const t=normalizeType(v);if(!ALLOWED_TYPES.has(t))throw httpError(400,'نوع الفيديو غير مدعوم. استخدم MP4 أو WebM أو MOV.');return t;}
function objectKey(){return 'academy-videos/'+crypto.randomUUID();}
function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

async function listVideos(token,rpc){
  const r=await rpc('list_academy_videos',{p_token:token});if(!r.ok)throw dbError(r);
  return {videos:(Array.isArray(r.data)?r.data:[]).map(v=>({id:String(v.id),title:String(v.title||''),section:String(v.section||''),file_url:String(v.file_url||''),file_size:Number(v.file_size)||0,content_type:String(v.content_type||''),sort_order:Number(v.sort_order)||0}))};
}
async function prepareUpload(token,body,rpc,presigner){
  const title=String(body.title||'').trim(),section=String(body.section||'').trim();
  if(!title||title.length>TITLE_MAX)throw httpError(400,'عنوان الفيديو مطلوب ولا يتجاوز 160 حرفًا');
  if(section.length>SECTION_MAX)throw httpError(400,'اسم القسم لا يتجاوز 80 حرفًا');
  const size=fileSize(body.file_size),type=contentType(body.content_type),key=objectKey(),signed=presigner(key,type,900);
  const r=await rpc('prepare_academy_video_upload',{p_token:token,p_title:title,p_section:section,p_file_size:size,p_content_type:type,p_object_key:key,p_file_url:signed.publicUrl});
  if(!r.ok)throw dbError(r);
  return {id:String(r.data||''),upload_url:signed.url,object_key:key,content_type:type,file_size:size,expires_in:signed.expiresIn};
}
async function completeUpload(token,body,rpc,head){
  const id=String(body.id||'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))throw httpError(400,'معرّف الفيديو غير صالح');
  const size=fileSize(body.file_size),type=contentType(body.content_type);
  const lookup=await rpc('get_academy_video_upload',{p_token:token,p_video_id:id});if(!lookup.ok)throw dbError(lookup);
  const row=Array.isArray(lookup.data)?lookup.data[0]:lookup.data;
  if(!row||!row.object_key)throw httpError(404,'ملف الفيديو المسجل غير موجود');
  if(Number(row.file_size)!==size||normalizeType(row.content_type)!==type)throw httpError(400,'بيانات الملف لا تطابق التسجيل');
  const remote=await head(String(row.object_key));
  if(!remote.ok)throw httpError(400,'لم يصل الفيديو إلى التخزين بعد');
  if(remote.size!==size)throw httpError(400,'حجم الفيديو المرفوع لا يطابق الحجم المسجل');
  if(remote.contentType&&remote.contentType!==type)throw httpError(400,'نوع الفيديو المرفوع لا يطابق النوع المسجل');
  const r=await rpc('complete_academy_video_upload',{p_token:token,p_video_id:id,p_file_size:size,p_content_type:type});if(!r.ok)throw dbError(r);
  const v=Array.isArray(r.data)?r.data[0]:r.data;
  return {video:{id:String(v.id),title:String(v.title||''),section:String(v.section||''),file_url:String(v.file_url||''),file_size:Number(v.file_size)||size,content_type:String(v.content_type||type),sort_order:Number(v.sort_order)||0}};
}
function createHandler({rpc=supabaseRpc,presigner=presignPut,head=headObject}={}){
  return async function handler(req,res){
    if(req.method!=='POST')return send(res,405,{error:'Method Not Allowed'});
    try{
      const body=req.body&&typeof req.body==='object'?req.body:{},action=String(body.action||'list').toLowerCase(),token=sessionToken(req,body);
      if(action==='list')return send(res,200,await listVideos(token,rpc));
      if(action==='prepare')return send(res,200,await prepareUpload(token,body,rpc,presigner));
      if(action==='complete')return send(res,200,await completeUpload(token,body,rpc,head));
      return send(res,400,{error:'إجراء غير معروف'});
    }catch(e){const status=Number(e&&e.status)||500;if(status>=500)console.error('[academy-videos]',e);return send(res,status,{error:String(e&&e.message||e)});}
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports._internals={fileSize,contentType,objectKey};
