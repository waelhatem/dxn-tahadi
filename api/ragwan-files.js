const https = require('https');

const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');

function supabaseRpcRequest(fn,args,key,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const body=JSON.stringify(args||{});
    const request=https.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||443,
      path:`/rest/v1/rpc/${encodeURIComponent(fn)}`,method:'POST',
      headers:{
        'Content-Type':'application/json',Accept:'application/json',
        ...(key?{apikey:key,Authorization:`Bearer ${key}`}:{}),
        'Content-Length':Buffer.byteLength(body)
      },timeout:timeoutMs||10000
    },response=>{
      let text='';response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بخدمة Supabase')));
    request.on('error',reject);request.write(body);request.end();
  });
}
async function supabaseSecretRpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await supabaseRpcRequest(fn,args,SUPABASE_SECRET_KEY,12000);
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||`Supabase HTTP ${r.status}`);
  return r.data;
}
async function supabaseStorageRequest(path,method,key,body,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL),payload=body==null?'':JSON.stringify(body);
    const request=https.request({protocol:base.protocol,hostname:base.hostname,port:base.port||443,method,path,
      headers:{'Content-Type':'application/json',Accept:'application/json',...(key?{apikey:key,Authorization:`Bearer ${key}`}:{}),...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})},
      timeout:timeoutMs||15000
    },response=>{
      let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بتخزين Supabase')));
    request.on('error',reject);if(payload)request.write(payload);request.end();
  });
}
function absoluteSupabaseStorageUrl(value){
  const raw=String(value||'').trim();if(!raw)return '';
  if(/^https?:\/\//i.test(raw))return raw;
  const path=raw.startsWith('/')?raw:'/'+raw;
  return SUPABASE_URL+(path.startsWith('/storage/v1/')?path:'/storage/v1'+path);
}
async function ensureRagwanBucket(){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await supabaseStorageRequest('/storage/v1/bucket','POST',SUPABASE_SECRET_KEY,
    {id:'ragwan-plan',name:'ragwan-plan',public:false,file_size_limit:52428800},15000);
  if(r.ok)return;
  const message=String((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||'').toLowerCase();
  if(r.status===409||message.includes('already exists')||message.includes('resource already exists')||message.includes('already_exist'))return;
  throw new Error((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||'تعذر تجهيز مساحة الملفات');
}
async function ragwanPlanFiles(args){
  const token=String(args.p_token||'').trim(),action=String(args.action||'').trim();
  if(!token)throw new Error('انتهت الجلسة. سجّل الدخول من جديد.');
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const boot=await supabaseSecretRpc('bootstrap',{p_token:token}),role=String(boot&&boot.role||'');
  if(!['leader','member'].includes(role))throw new Error('غير مصرح.');
  const bucket='ragwan-plan';
  if(action==='sign_upload'){
    if(role!=='leader')throw new Error('رفع الملفات متاح للقائد فقط.');
    await ensureRagwanBucket();
    const name=String(args.name||'').trim(),type=String(args.content_type||'application/octet-stream').trim().slice(0,150),size=Number(args.size||0);
    if(!name)throw new Error('اسم الملف مطلوب.');
    if(!Number.isFinite(size)||size<=0||size>50*1024*1024)throw new Error('حجم الملف يجب ألا يتجاوز 50 MB.');
    const safe=name.replace(/[^\p{L}\p{N}._()\- ]/gu,'_').replace(/\s+/g,' ').trim().slice(0,140)||'file';
    const path=`ragwan/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
    const signed=await supabaseStorageRequest('/storage/v1/object/upload/sign/'+bucket+'/'+encodeURIComponent(path),'POST',SUPABASE_SECRET_KEY,{upsert:false},15000);
    if(!signed.ok)throw new Error((signed.data&&(signed.data.message||signed.data.error))||signed.text||'تعذر إنشاء رابط الرفع.');
    return {path,name:safe,content_type:type,size,token:signed.data&&signed.data.token,signed_url:absoluteSupabaseStorageUrl(signed.data&&signed.data.signedURL)};
  }
  if(action==='sign_evidence_upload'){
    if(role!=='member')throw new Error('إثباتات الخطوات متاحة للأعضاء فقط.');
    await ensureRagwanBucket();
    const step=Math.max(1,Math.min(10,Number(args.step)||0));
    if(!step)throw new Error('رقم الخطوة غير صالح.');
    const name=String(args.name||'voice-evidence.webm').trim();
    const type=String(args.content_type||'audio/webm').trim().slice(0,150);
    const size=Number(args.size||0);
    if(!Number.isFinite(size)||size<=0||size>25*1024*1024)throw new Error('حجم إثبات الصوت يجب ألا يتجاوز 25 MB.');
    const memberKey=String(boot.member_no||boot.membership_no||boot.membership_number||boot.username||'member').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80)||'member';
    const safe=name.replace(/[^\p{L}\p{N}._()\- ]/gu,'_').replace(/\s+/g,' ').trim().slice(0,100)||'evidence.webm';
    const path=`evidence/${memberKey}/step-${step}-${Date.now()}-${safe}`;
    const signed=await supabaseStorageRequest('/storage/v1/object/upload/sign/'+bucket+'/'+encodeURIComponent(path),'POST',SUPABASE_SECRET_KEY,{upsert:false},15000);
    if(!signed.ok)throw new Error((signed.data&&(signed.data.message||signed.data.error))||signed.text||'تعذر إنشاء رابط رفع الإثبات.');
    return {path,name:safe,content_type:type,size,step,member_no:boot.member_no||boot.membership_no||null,token:signed.data&&signed.data.token,signed_url:absoluteSupabaseStorageUrl(signed.data&&signed.data.signedURL)};
  }
  if(action==='evidence_list'){
    const memberKey=String(boot.member_no||boot.membership_no||boot.membership_number||boot.username||'member').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80)||'member';
    const prefix=role==='leader'?'evidence/':`evidence/${memberKey}/`;
    const listed=await supabaseStorageRequest('/storage/v1/object/list/'+bucket,'POST',SUPABASE_SECRET_KEY,{prefix,limit:500,offset:0},15000);
    if(!listed.ok)throw new Error((listed.data&&(listed.data.message||listed.data.error))||listed.text||'تعذر تحميل إثباتات الخطوات.');
    const items=Array.isArray(listed.data)?listed.data:[],paths=items.map(x=>String(x.name||'')).filter(Boolean).map(n=>prefix.endsWith('/')?prefix+n:n);
    let signedMap={};
    if(paths.length){
      const sr=await supabaseStorageRequest('/storage/v1/object/sign/'+bucket,'POST',SUPABASE_SECRET_KEY,{expiresIn:3600,paths},15000);
      if(sr.ok){const rows=Array.isArray(sr.data)?sr.data:[];rows.forEach(x=>{if(x&&x.path)signedMap[x.path]=absoluteSupabaseStorageUrl(x.signedURL||x.signedUrl||'')});}
    }
    return {files:items.map(x=>{
      const raw=String(x.name||''),path=prefix.endsWith('/')?prefix+raw:raw;
      const match=raw.match(/step-(\d+)-/i);
      return {name:raw,path,step:match?Number(match[1]):null,created_at:x.created_at||x.updated_at||null,size:Number(x.metadata&&x.metadata.size||0),mime:String(x.metadata&&x.metadata.mimetype||x.metadata&&x.metadata.contentType||''),url:signedMap[path]||''};
    })};
  }
  if(action==='list'){
    const listed=await supabaseStorageRequest('/storage/v1/object/list/'+bucket,'POST',SUPABASE_SECRET_KEY,{prefix:'ragwan/',limit:100,offset:0},15000);
    if(!listed.ok)throw new Error((listed.data&&(listed.data.message||listed.data.error))||listed.text||'تعذر تحميل الملفات.');
    const items=Array.isArray(listed.data)?listed.data:[],paths=items.map(x=>String(x.name||'')).filter(Boolean).map(n=>'ragwan/'+n);
    let signedMap={};
    if(paths.length){
      const sr=await supabaseStorageRequest('/storage/v1/object/sign/'+bucket,'POST',SUPABASE_SECRET_KEY,{expiresIn:3600,paths},15000);
      if(sr.ok){const rows=Array.isArray(sr.data)?sr.data:[];rows.forEach(x=>{if(x&&x.path)signedMap[x.path]=absoluteSupabaseStorageUrl(x.signedURL||x.signedUrl||'')});}
    }
    return {files:items.map(x=>{const path='ragwan/'+String(x.name||'');return {name:x.name||'file',path,created_at:x.created_at||x.updated_at||null,size:Number(x.metadata&&x.metadata.size||0),mime:String(x.metadata&&x.metadata.mimetype||x.metadata&&x.metadata.contentType||''),url:signedMap[path]||''}})};
  }
  if(action==='delete'){
    if(role!=='leader')throw new Error('الحذف متاح للقائد فقط.');
    const path=String(args.path||'').trim();
    if(!path.startsWith('ragwan/'))throw new Error('مسار الملف غير صالح.');
    const d=await supabaseStorageRequest('/storage/v1/object/'+bucket,'DELETE',SUPABASE_SECRET_KEY,{prefixes:[path]},15000);
    if(!d.ok)throw new Error((d.data&&(d.data.message||d.data.error))||d.text||'تعذر حذف الملف.');
    return {deleted:true};
  }
  throw new Error('إجراء غير معروف.');
}
module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, apikey, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const result=await ragwanPlanFiles(body.args&&typeof body.args==='object'?body.args:{});
    return res.status(200).json({ok:true,...result});
  }catch(error){
    console.error('ragwan-files error:',error);
    return res.status(400).json({ok:false,error:String(error&&error.message||error)});
  }
};
