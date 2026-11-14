'use strict';
// Server-only encrypted membership vault storage.
// The leader's vault is encrypted in the browser. This handler never receives
// a master password, derived key or any plaintext member record.
const https = require('https');
const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SECRET = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g, '');
const TABLE_PATH = '/rest/v1/membership_keys_vaults';
const MAX_ENVELOPE_BYTES = 3950000;
const TIMEOUT_MS = 15000;

function reply(res,status,data) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(data);
}
function sb(method,path,body,prefer) {
  return new Promise((resolve,reject)=>{
    const data=body===undefined?null:JSON.stringify(body);
    const req=https.request(new URL(SUPABASE_URL+path),{
      method, timeout:TIMEOUT_MS,
      headers:{
        apikey:SECRET, Authorization:'Bearer '+SECRET,
        Accept:'application/json',
        ...(data!==null?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),
        ...(prefer?{Prefer:prefer}:{})
      }
    },response=>{
      let content='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{
        content+=chunk;
        if(content.length>MAX_ENVELOPE_BYTES+20000)req.destroy(new Error('oversized-response'));
      });
      response.on('end',()=>{
        let parsed=null;
        try{parsed=content?JSON.parse(content):null;}catch{parsed=null;}
        resolve({status:response.statusCode,ok:response.statusCode>=200&&response.statusCode<300,data:parsed});
      });
    });
    req.on('error',reject);
    req.on('timeout',()=>req.destroy(new Error('storage-timeout')));
    if(data!==null)req.write(data);
    req.end();
  });
}
function validEnvelope(env) {
  if(!env||typeof env!=='object'||Array.isArray(env))return false;
  if(env.format!=='mafatih-dxn'||env.version!==1||env.iterations!==600000)return false;
  if(!['salt','iv','data'].every(k=>typeof env[k]==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(env[k])))return false;
  if(env.salt.length!==24 || env.iv.length!==16 || env.data.length<20)return false;
  return Buffer.byteLength(JSON.stringify(env),'utf8')<=MAX_ENVELOPE_BYTES;
}
module.exports=async function handler(req,res) {
  if(req.method!=='POST')return reply(res,405,{error:'method-not-allowed'});
  if(!SECRET)return reply(res,503,{error:'خدمة التخزين المشفر غير مهيأة'});
  try {
    const origin=String(req.headers.origin||'');
    if(origin && new URL(origin).host!==String(req.headers.host||'')){
      return reply(res,403,{error:'طلب من مصدر غير مسموح'});
    }
    const body=req.body && typeof req.body==='object' ?req.body:{};
    const session=String(body.token||'').trim();
    if(session.length<8||session.length>1000)return reply(res,401,{error:'جلسة دخول مطلوبة'});
    const boot=await sb('POST','/rest/v1/rpc/bootstrap',{p_token:session});
    if(!boot.ok)return reply(res,401,{error:'جلسة الدخول غير صالحة'});
    if(String(boot.data?.role||'').toLowerCase()!=='leader'){
      return reply(res,403,{error:'الخزنة مخصصة للقائد فقط'});
    }
    if(body.action==='load') {
      const found=await sb('GET',TABLE_PATH+'?select=encrypted_envelope,revision&vault_id=eq.leader&limit=1');
      if(!found.ok)return reply(res,503,{error:'تعذر قراءة الخزنة المشفرة من قاعدة البيانات'});
      const row=Array.isArray(found.data)?found.data[0]:null;
      if(!row)return reply(res,200,{exists:false,revision:0,envelope:null});
      if(!validEnvelope(row.encrypted_envelope))return reply(res,503,{error:'سجل الخزنة على الخادم غير صالح. لا تنشئ خزنة جديدة'});
      return reply(res,200,{exists:true,revision:Number(row.revision),envelope:row.encrypted_envelope});
    }
    if(body.action==='save'){
      const env=body.envelope;
      if(!validEnvelope(env))return reply(res,400,{error:'ملف التشفير غير صالح أو يتجاوز حد التخزين الآمن'});
      const revision=body.baseRevision;
      if(!Number.isSafeInteger(revision)||revision<0)return reply(res,400,{error:'إصدار المزامنة غير صالح'});
      if(revision===0){
        const inserted=await sb('POST',TABLE_PATH,{
          vault_id:'leader',encrypted_envelope:env,revision:1
        },'return=representation');
        if(inserted.status===409)return reply(res,409,{error:'خزنة القائد موجودة على الخادم؛ لن نستبدلها'});
        if(!inserted.ok)return reply(res,503,{error:'تعذر حفظ الخزنة المشفرة'});
        return reply(res,200,{saved:true,revision:1});
      }
      const updated=await sb('PATCH',TABLE_PATH+'?vault_id=eq.leader&revision=eq.'+revision,{
        encrypted_envelope:env,revision:revision+1,updated_at:new Date().toISOString()
      },'return=representation');
      if(!updated.ok)return reply(res,503,{error:'تعذر تحديث الخزنة المشفرة'});
      if(!Array.isArray(updated.data)||updated.data.length!==1){
        return reply(res,409,{error:'تغيرت الخزنة على جهاز آخر؛ لم تُستبدل البيانات الموجودة'});
      }
      return reply(res,200,{saved:true,revision:revision+1});
    }
    return reply(res,400,{error:'إجراء غير معروف'});
  }catch(error){
    // Avoid reporting Supabase response details or any request secrets.
    return reply(res,503,{error:'تعذر الاتصال بالتخزين المشفر. لم يُحفظ أي تعديل'});
  }
};