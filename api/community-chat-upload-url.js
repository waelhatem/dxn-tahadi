const https=require('https');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const BUCKET='community-chat';
const MAX_BYTES=50*1024*1024;

function request(method,path,body,headers={}){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const payload=body==null?null:Buffer.from(JSON.stringify(body));
    const req=https.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||443,method,path,
      headers:{Accept:'application/json',...(payload?{'Content-Length':payload.length}:{}),...headers},timeout:15000
    },res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        const buf=Buffer.concat(chunks),text=buf.toString('utf8');let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة إنشاء رابط الرفع')));
    req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}

async function verifySession(token){
  if(!token)throw new Error('جلسة العضوية غير موجودة');
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await request('POST','/rest/v1/rpc/bootstrap',{p_token:token},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const d=r.data||{},role=String(d.role||'').trim().toLowerCase();
  const member=role==='member'&&Array.isArray(d.members)?d.members[0]:null;
  return {role,member_no:String(member&&member.member_no||'').trim()};
}

async function ensureBucket(){
  const check=await request('GET','/storage/v1/bucket/'+encodeURIComponent(BUCKET),null,{
    apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(check.ok){
    const current=check.data||{};
    if(Number(current.file_size_limit||0)<MAX_BYTES){
      const update=await request('PUT','/storage/v1/bucket/'+encodeURIComponent(BUCKET),{file_size_limit:MAX_BYTES,public:true},{
        'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
      });
      if(!update.ok)throw new Error('تعذر تحديث حد حجم المرفقات: '+((update.data&&(update.data.message||update.data.error||update.data.statusCode))||update.text||('HTTP '+update.status)));
    }
    return;
  }
  if(check.status!==404)throw new Error('تعذر التحقق من مساحة المرفقات: '+((check.data&&(check.data.message||check.data.error||check.data.statusCode))||check.text||('HTTP '+check.status)));
  const r=await request('POST','/storage/v1/bucket',{id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_BYTES},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok&&r.status!==409)throw new Error('تعذر إنشاء مساحة المرفقات: '+((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||('HTTP '+r.status)));
}

function safeName(name){
  const raw=decodeURIComponent(String(name||'مرفق')).normalize('NFKC');
  const ext=(raw.match(/\.[A-Za-z0-9]{1,10}$/)||[''])[0].toLowerCase();
  return (raw.replace(/\.[^/.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'file')+ext;
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-DXN-Session');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const body=req.body||{};
    const session=await verifySession(String(req.headers['x-dxn-session']||'').trim());
    const name=String(body.name||'مرفق');
    const type=String(body.type||'application/octet-stream').split(';')[0].trim();
    const size=Number(body.size||0);
    if(!size||size>MAX_BYTES)return res.status(400).json({error:'حجم المرفق يجب ألا يتجاوز 50 ميغابايت'});
    const allowed=/^(image|video|audio)\//i.test(type)||/^(application|text)\//i.test(type);
    if(!allowed)return res.status(400).json({error:'نوع الملف غير مدعوم: '+type});
    await ensureBucket();
    const owner=session.member_no||(session.role==='leader'?'leader':'member');
    const path=owner+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safeName(name);
    const storagePath=path.split('/').map(encodeURIComponent).join('/');
    const sign=await request('POST','/storage/v1/object/upload/sign/'+BUCKET+'/'+storagePath,{upsert:false},{
      'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
    });
    if(!sign.ok)throw new Error((sign.data&&(sign.data.message||sign.data.error||sign.data.statusCode))||sign.text||'تعذر إنشاء رابط رفع المرفق');
    const signed=sign.data||{};
    let uploadUrl=String(signed.signedUrl||signed.signedURL||signed.url||'').trim();
    if(uploadUrl&&!/^https?:\/\//i.test(uploadUrl))uploadUrl=SUPABASE_URL+'/storage/v1'+uploadUrl;
    if(!uploadUrl)throw new Error('لم يتم إرجاع رابط رفع صالح من Supabase');
    const publicUrl=SUPABASE_URL+'/storage/v1/object/public/'+storagePath;
    return res.status(200).json({ok:true,uploadUrl,path,name,type,size,publicUrl});
  }catch(error){
    console.error('community chat signed upload:',error);
    return res.status(400).json({error:String(error&&error.message||error)});
  }
};
