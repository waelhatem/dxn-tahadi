const https = require('https');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/\/$/,'');
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BUCKET = 'community-chat';
const MAX_BYTES = 4 * 1024 * 1024;

function request(method, path, body, headers={}){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const payload=body==null?null:(Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body)));
    const req=https.request({
      protocol:base.protocol, hostname:base.hostname, port:base.port||443,
      method, path,
      headers:{Accept:'application/json',...(payload?{'Content-Length':payload.length}:{}),...headers},
      timeout:30000
    },res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        const buf=Buffer.concat(chunks), text=buf.toString('utf8');
        let data=null; try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة رفع المرفق')));
    req.on('error',reject);
    if(payload)req.write(payload);
    req.end();
  });
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[]; let size=0, settled=false;
    req.on('data',chunk=>{
      if(settled)return;
      size+=chunk.length;
      if(size>MAX_BYTES){
        settled=true; reject(new Error('حجم المرفق يتجاوز 4 ميغابايت'));
        try{req.destroy()}catch(_){}
        return;
      }
      chunks.push(chunk);
    });
    req.on('end',()=>{if(!settled)resolve(Buffer.concat(chunks))});
    req.on('error',err=>{if(!settled)reject(err)});
  });
}

async function verifySession(token){
  if(!token) throw new Error('جلسة العضوية غير موجودة');
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await request('POST','/rest/v1/rpc/bootstrap',{p_token:token},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok) throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const d=r.data||{}, role=String(d.role||'').trim().toLowerCase();
  const member=role==='member'&&Array.isArray(d.members)?d.members[0]:null;
  const leader=d.leader||d.user||d.profile||d.account||{};
  return {
    role,
    member_no:String(member&&member.member_no||'').trim(),
    name:String((member&&(member.member_name||member.name))||d.leader_name||leader.name||leader.full_name||leader.display_name||'').trim()
  };
}

async function ensureBucket(){
  const r=await request('POST','/storage/v1/bucket',{id:BUCKET,name:BUCKET,public:true,file_size_limit:MAX_BYTES},{
    'Content-Type':'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
  });
  if(!r.ok && r.status!==409) throw new Error((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||'تعذر تجهيز مساحة المرفقات');
}

function safeName(name){
  const raw=decodeURIComponent(String(name||'مرفق')).normalize('NFKC');
  const ext=(raw.match(/\.[A-Za-z0-9]{1,10}$/)||[''])[0].toLowerCase();
  return (raw.replace(/\.[^/.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'file')+ext;
}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-DXN-Session, X-DXN-File-Name');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  try{
    const session=await verifySession(String(req.headers['x-dxn-session']||'').trim());
    const contentType=String(req.headers['content-type']||'application/octet-stream').split(';')[0].trim()||'application/octet-stream';
    const originalName=decodeURIComponent(String(req.headers['x-dxn-file-name']||'مرفق'));
    const body=await readBody(req);
    if(!body.length) return res.status(400).json({error:'المرفق فارغ'});

    const allowed=/^(image|video|audio)\//i.test(contentType) ||
      /^(application\/pdf|text\/plain|application\/zip|application\/msword|application\/vnd\.(ms-|openxmlformats-)|application\/octet-stream)$/i.test(contentType);
    if(!allowed) return res.status(400).json({error:'نوع الملف غير مدعوم'});

    await ensureBucket();
    const owner=session.member_no || (session.role==='leader'?'leader':'member');
    const path=owner+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safeName(originalName);

    const upload=await request('POST','/storage/v1/object/'+BUCKET+'/'+path,body,{
      'Content-Type':contentType,'Cache-Control':'31536000','x-upsert':'false',
      apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY
    });
    if(!upload.ok) throw new Error((upload.data&&(upload.data.message||upload.data.error||upload.data.statusCode))||upload.text||'تعذر رفع المرفق');

    const url=SUPABASE_URL+'/storage/v1/object/public/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
    return res.status(200).json({ok:true,url,path,name:originalName,type:contentType,size:body.length});
  }catch(error){
    console.error('community chat upload:',error);
    return res.status(400).json({error:String(error&&error.message||error)});
  }
};

module.exports.config={api:{bodyParser:false}};
