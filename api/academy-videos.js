// V86.73 — «🎓 أكاديمية المنصة» videos (YouTube links).
//   POST {action:"list"}                                   → published videos, by sort_order
//   POST {action:"create", title, section, youtube_url}    → leader only
// The session token comes in the X-DXN-Session header (or p_token in the body).
// Both actions go through SECURITY DEFINER functions that check the session, and
// the leader role for "create", in SQL; they are executable by service_role only,
// so this handler uses the server-side secret key. Separate from api/rpc.js.
const https=require('https');
const {parseYouTubeId,canonicalYouTubeUrl}=require('./_academy-youtube');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/[\r\n]/g,'').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const TITLE_MAX=160;
const SECTION_MAX=80;
const TOKEN_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS=15000;

function httpError(status,message){
  const error=new Error(message);
  error.status=status;
  return error;
}

function request(url,body){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const payload=JSON.stringify(body||{});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,port:u.port||443,method:'POST',path:u.pathname+u.search,
      headers:{Accept:'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY},timeout:REQUEST_TIMEOUT_MS},
      res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});});});
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بقاعدة البيانات')));
    req.on('error',reject);
    req.write(payload);req.end();
  });
}

function supabaseRpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw httpError(500,'SUPABASE_SECRET_KEY غير مضبوط');
  return request(SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(fn),args);
}

// Maps the exceptions raised by the SQL functions to HTTP statuses.
function dbError(result){
  const message=String(result.data&&(result.data.message||result.data.error)||result.text||'تعذر الاتصال بقاعدة البيانات');
  if(/انتهت الجلسة/.test(message))return httpError(401,'انتهت الجلسة. أعد تسجيل الدخول.');
  if(/للقائد فقط/.test(message))return httpError(403,'إضافة فيديو للأكاديمية متاحة للقائد فقط');
  if(/YouTube|عنوان الفيديو|اسم القسم/.test(message))return httpError(400,message);
  return httpError(result.status>=500?502:400,message);
}

function sessionToken(req,body){
  const header=req.headers&&(req.headers['x-dxn-session']||req.headers['X-DXN-Session']);
  const token=String(header||body.p_token||'').trim();
  if(!TOKEN_PATTERN.test(token))throw httpError(401,'انتهت الجلسة. أعد تسجيل الدخول.');
  return token;
}

async function listVideos(token,rpc){
  const result=await rpc('list_academy_videos',{p_token:token});
  if(!result.ok)throw dbError(result);
  const rows=Array.isArray(result.data)?result.data:[];
  return {videos:rows.map(row=>({
    id:String(row.id),
    title:String(row.title||''),
    section:String(row.section||''),
    youtube_id:String(row.youtube_id||''),
    youtube_url:String(row.youtube_url||''),
    sort_order:Number(row.sort_order)||0
  }))};
}

async function createVideo(token,body,rpc){
  const title=String(body.title||'').trim();
  const section=String(body.section||'').trim();
  if(!title||title.length>TITLE_MAX)throw httpError(400,'عنوان الفيديو مطلوب ولا يتجاوز 160 حرفًا');
  if(section.length>SECTION_MAX)throw httpError(400,'اسم القسم لا يتجاوز 80 حرفًا');
  const youtubeId=parseYouTubeId(body.youtube_url);
  if(!youtubeId)throw httpError(400,'رابط YouTube غير صالح. استخدم رابطًا بصيغة youtube.com/watch?v=… أو youtu.be/…');
  const youtubeUrl=canonicalYouTubeUrl(youtubeId);
  const result=await rpc('create_academy_video',{p_token:token,p_title:title,p_section:section,p_youtube_url:youtubeUrl,p_youtube_id:youtubeId});
  if(!result.ok)throw dbError(result);
  return {id:String(result.data||''),youtube_id:youtubeId,youtube_url:youtubeUrl};
}

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

function createHandler({rpc=supabaseRpc}={}){
  return async function academyVideosHandler(req,res){
    if(req.method!=='POST')return send(res,405,{error:'Method Not Allowed'});
    try{
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const action=String(body.action||'list').toLowerCase();
      const token=sessionToken(req,body);
      if(action==='list')return send(res,200,await listVideos(token,rpc));
      if(action==='create')return send(res,201,await createVideo(token,body,rpc));
      return send(res,400,{error:'إجراء غير معروف'});
    }catch(error){
      const status=Number(error&&error.status)||500;
      if(status>=500)console.error('[academy-videos]',error);
      return send(res,status,{error:String(error&&error.message||error)});
    }
  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;
