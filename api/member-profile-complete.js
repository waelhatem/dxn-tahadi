const https=require('https');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const BUCKET='member-profiles';
const MAX_BYTES=10*1024*1024;
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
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة التحقق من الصورة')));
    req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}

async function verifySession(token){
  if(!token||!SUPABASE_SECRET_KEY)throw new Error('جلسة الدخول غير صالحة');
  const r=await request('POST','/rest/v1/rpc/bootstrap',{p_token:token},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const d=r.data||{},role=String(d.role||'').trim().toLowerCase();
  const own=role==='member'&&Array.isArray(d.members)?d.members[0]:null;
  return {role,memberId:String(own&&own.id||'').trim()};
}

async function objectInfo(path){
  const encoded=String(path||'').split('/').map(encodeURIComponent).join('/');
  return request('GET','/storage/v1/object/info/'+BUCKET+'/'+encoded,null,{
    apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-DXN-Session');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=String(req.headers['x-dxn-session']||'').trim();
    const session=await verifySession(token);
    const body=req.body||{};
    const memberId=String(body.member_id||'').trim();
    const path=String(body.path||'').trim();
    const publicUrl=String(body.public_url||'').trim();
    if(!memberId||!path||!publicUrl)throw new Error('بيانات الصورة ناقصة');
    if(session.role==='member'&&memberId!==session.memberId)throw new Error('لا يمكنك حفظ صورة عضو آخر');
    if(!path.startsWith(memberId+'/'))throw new Error('مسار الصورة غير صالح');
    const info=await objectInfo(path);
    if(!info.ok)throw new Error('تعذر التحقق من الصورة المرفوعة');
    const meta=info.data||{};
    const type=String(body.type||meta.mimetype||meta.contentType||'').split(';')[0].trim().toLowerCase();
    const size=Number(meta.size||meta.contentLength||body.size||0);
    if(!ALLOWED_MIME_TYPES.includes(type))throw new Error('نوع الصورة غير مدعوم');
    if(!size||size>MAX_BYTES)throw new Error('حجم الصورة يجب ألا يتجاوز 10 MB');
    const rpc=await request('POST','/rest/v1/rpc/save_member_profile_photo',{
      p_token:token,p_member:memberId,p_storage_path:path,p_public_url:publicUrl,p_mime_type:type,p_file_size:size
    },{
      'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
    });
    if(!rpc.ok)throw new Error((rpc.data&&(rpc.data.message||rpc.data.error||rpc.data.hint))||rpc.text||'تعذر حفظ صورة العضو');
    return res.status(200).json({ok:true,photo:rpc.data});
  }catch(error){
    console.error('member profile complete:',error);
    return res.status(400).json({error:String(error&&error.message||error)});
  }
};
