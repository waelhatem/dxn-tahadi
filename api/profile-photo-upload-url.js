const https=require('https');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const BUCKET='profile-photos';
const MAX_BYTES=5*1024*1024;
const ALLOWED_MIME_TYPES=['image/jpeg','image/png','image/webp'];

function request(method,path,body,headers={}){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const payload=body==null?null:Buffer.from(JSON.stringify(body));
    const req=https.request({protocol:base.protocol,hostname:base.hostname,port:base.port||443,method,path,
      headers:{Accept:'application/json',...(payload?{'Content-Length':payload.length}:{}),...headers},timeout:15000},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        const buf=Buffer.concat(chunks),text=buf.toString('utf8');let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة إنشاء رابط رفع الصورة')));
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

async function memberExists(memberNo){
  const r=await request('GET','/rest/v1/members?select=id,member_no&member_no=eq.'+encodeURIComponent(memberNo)+'&active=eq.true&limit=1',null,{
    apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok)throw new Error('تعذر التحقق من العضو');
  return Array.isArray(r.data)&&r.data[0]||null;
}

async function ensureBucket(){
  const check=await request('GET','/storage/v1/bucket/'+BUCKET,null,{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY});
  if(check.ok)return;
  if(check.status!==404)throw new Error('تعذر التحقق من مساحة صور الأعضاء');
  const r=await request('POST','/storage/v1/bucket',{id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_BYTES,allowed_mime_types:ALLOWED_MIME_TYPES},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok&&r.status!==409)throw new Error('تعذر إنشاء مساحة صور الأعضاء: '+((r.data&&(r.data.message||r.data.error))||r.text));
}

function safeExt(type){return type==='image/png'?'.png':type==='image/webp'?'.webp':'.jpg';}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-DXN-Session');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const session=await verifySession(String(req.headers['x-dxn-session']||'').trim());
    const body=req.body||{};
    const target=String(body.member_no||session.member_no||'').trim();
    const type=String(body.type||'').split(';')[0].trim().toLowerCase();
    const size=Number(body.size||0);
    if(!/^\\d{9}$/.test(target))return res.status(400).json({error:'رقم العضوية غير صالح'});
    if(session.role==='member'&&target!==session.member_no)return res.status(403).json({error:'يمكنك رفع صورتك الشخصية فقط'});
    if(session.role!=='member'&&session.role!=='leader')return res.status(403).json({error:'غير مصرح'});
    if(!ALLOWED_MIME_TYPES.includes(type))return res.status(400).json({error:'الصورة يجب أن تكون JPG أو PNG أو WebP'});
    if(!size||size>MAX_BYTES)return res.status(400).json({error:'حجم الصورة يجب ألا يتجاوز 5 ميغابايت'});
    const member=await memberExists(target);
    if(!member)return res.status(404).json({error:'العضو غير موجود'});
    await ensureBucket();
    const path=target+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+safeExt(type);
    const storagePath=path.split('/').map(encodeURIComponent).join('/');
    const sign=await request('POST','/storage/v1/object/upload/sign/'+BUCKET+'/'+storagePath,{upsert:false},{
      'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
    });
    if(!sign.ok)throw new Error((sign.data&&(sign.data.message||sign.data.error||sign.data.statusCode))||sign.text||'تعذر إنشاء رابط الرفع');
    let uploadUrl=String((sign.data||{}).signedUrl||(sign.data||{}).signedURL||(sign.data||{}).url||'').trim();
    if(uploadUrl&&!/^https?:\\/\\//i.test(uploadUrl))uploadUrl=SUPABASE_URL+'/storage/v1'+uploadUrl;
    if(!uploadUrl)throw new Error('لم يتم إرجاع رابط رفع صالح');
    const publicUrl=SUPABASE_URL+'/storage/v1/object/public/'+storagePath;
    return res.status(200).json({ok:true,uploadUrl,path,publicUrl,type,size});
  }catch(e){
    console.error('profile photo upload url:',e);
    return res.status(400).json({error:String(e&&e.message||e)});
  }
};
