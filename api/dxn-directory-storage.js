'use strict';
const {randomUUID}=require('node:crypto');
const PROJECT_URL='https://ryqpstkzppaifpvhezzn.supabase.co';
const BUCKET='dxn-directory-pdfs';
const MAX_PDF=20*1024*1024;
const TOKEN=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function settings(){
  return {
    publicKey:String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh').trim(),
    secret:String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()
  };
}
async function request(path,key,method='GET',body){
  const result=await fetch(PROJECT_URL+path,{
    method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    cache:'no-store',signal:AbortSignal.timeout(16000)
  });
  const raw=await result.text();let value;
  try{value=JSON.parse(raw)}catch{value=null}
  if(!result.ok)throw Object.assign(new Error(String(value?.message||value?.error||'خطأ في التخزين')),{status:result.status});
  return value;
}
async function userFromToken(token,publicKey){
  const user=await request('/rest/v1/rpc/bootstrap',publicKey,'POST',{p_token:token});
  return user&&TOKEN.test(String(user.user_id||''))&&['leader','member'].includes(user.role)?user:null;
}
function signedUrl(path){
  if(typeof path!=='string'||!path.startsWith('/'))return null;
  return PROJECT_URL+(path.startsWith('/storage/v1/')?'':'/storage/v1')+path;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const token=String(body.p_token||'').trim();
  if(!TOKEN.test(token))return res.status(401).json({error:'سجل الدخول إلى المجتمع أولاً'});
  const action=String(body.action||'');
  if(!['prepare','view'].includes(action))return res.status(400).json({error:'إجراء غير صالح'});
  try{
    const {publicKey,secret}=settings();
    if(!secret)return res.status(503).json({error:'خدمة حفظ ملفات PDF غير مهيأة'});
    const user=await userFromToken(token,publicKey);
    if(!user)return res.status(401).json({error:'انتهت جلسة الدخول'});
    if(action==='prepare'){
      if(user.role!=='leader')return res.status(403).json({error:'رفع القوائم متاح للقائد فقط'});
      const size=Number(body.file_size);
      if(!Number.isSafeInteger(size)||size<1||size>MAX_PDF)
        return res.status(400).json({error:'حجم ملف PDF يجب ألا يتجاوز 20 ميغابايت'});
      if(String(body.content_type||'')!=='application/pdf')
        return res.status(400).json({error:'الملفات المسموحة هي PDF فقط'});
      const path='leader/'+user.user_id+'/'+randomUUID()+'.pdf';
      const signed=await request('/storage/v1/object/upload/sign/'+BUCKET+'/'+path,secret,'POST',{upsert:false});
      const uploadToken=String(signed?.token||signed?.data?.token||'');
      if(!uploadToken)throw new Error('لم يصدر رمز الرفع الآمن');
      return res.status(200).json({ok:true,path,bucket:BUCKET,upload_token:uploadToken});
    }
    const id=String(body.price_id||'');
    if(!TOKEN.test(id))return res.status(400).json({error:'القائمة غير صالحة'});
    const list=await request('/rest/v1/rpc/dxn_directory_list',publicKey,'POST',{p_token:token});
    if(!Array.isArray(list?.prices)||!list.prices.some(x=>x.id===id))
      return res.status(404).json({error:'القائمة غير متاحة لهذا الحساب'});
    const row=await request('/rest/v1/dxn_directory_prices?select=object_path&id=eq.'+id+'&limit=1',secret);
    const path=String(row?.[0]?.object_path||'');
    if(!/^leader\/[a-f0-9-]+\/[a-f0-9-]+\.pdf$/i.test(path))
      return res.status(404).json({error:'تعذر العثور على الملف'});
    const signed=await request('/storage/v1/object/sign/'+BUCKET+'/'+path,secret,'POST',{expiresIn:900});
    const url=signedUrl(signed?.signedURL||signed?.signedUrl);
    if(!url)return res.status(502).json({error:'تعذر إصدار رابط الملف'});
    return res.status(200).json({ok:true,url,expires_in:900});
  }catch(error){
    console.error('[dxn-directory]',String(error?.message||error));
    return res.status(error?.status===404?404:502).json({error:'تعذر إتمام العملية. تحقق من قاعدة البيانات واتصال التخزين.'});
  }
};
module.exports.__test={signedUrl,MAX_PDF};
