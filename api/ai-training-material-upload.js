const https=require('https');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/[\r\n]/g,'').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const BUCKET='ai-training-materials';
const MAX_BYTES=200*1024*1024;
const ALLOWED=/^(application\/pdf|image\/.+|video\/.+)$/i;

function request(url,method,body,headers={},timeout=60000){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const payload=body==null?null:JSON.stringify(body);
    const req=https.request({protocol:u.protocol,hostname:u.hostname,port:u.port||443,method,
      path:u.pathname+u.search,headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...headers},timeout},
      res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text})})});
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال')));
    req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}
function rpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط');
  return request(SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(fn),'POST',args,{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY});
}
function safeName(name){
  const raw=decodeURIComponent(String(name||'material')).normalize('NFKC');
  const ext=(raw.match(/\.[A-Za-z0-9]{1,10}$/)||[''])[0].toLowerCase();
  return (raw.replace(/\.[^/.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80)||'material')+ext;
}
async function ensureBucket(){
  const r=await request(SUPABASE_URL+'/storage/v1/bucket/'+encodeURIComponent(BUCKET),'GET',null,{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY});
  if(r.ok)return;
  if(r.status!==404)throw new Error(r.data?.message||r.data?.error||r.text||'تعذر التحقق من مساحة المواد التدريبية');
  const c=await request(SUPABASE_URL+'/storage/v1/bucket','POST',{id:BUCKET,name:BUCKET,public:false,file_size_limit:MAX_BYTES,allowed_mime_types:['application/pdf','image/*','video/*']},{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY});
  if(!c.ok&&c.status!==409)throw new Error(c.data?.message||c.data?.error||c.text||'تعذر إنشاء مساحة المواد التدريبية');
}
async function prepare(body){
  const token=String(body.p_token||'').trim();
  const name=String(body.p_original_filename||'material').trim();
  const type=String(body.p_mime_type||'').split(';')[0].trim();
  const size=Number(body.p_file_size||0);
  if(!token)throw new Error('جلسة القائد غير موجودة');
  if(!ALLOWED.test(type))throw new Error('نوع المادة غير مدعوم');
  if(!size||size>MAX_BYTES)throw new Error('حجم المادة غير مدعوم');
  await ensureBucket();
  const path='leader/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'-'+safeName(name);
  const created=await rpc('create_ai_training_material',{
    p_token:token,p_title:String(body.p_title||name).slice(0,300),
    p_material_type:type==='application/pdf'?'pdf':type.startsWith('image/')?'image':'video',
    p_mime_type:type,p_original_filename:name,p_storage_bucket:BUCKET,p_storage_path:path,
    p_file_size:size,p_domain:String(body.p_domain||'general').slice(0,120),
    p_priority:Math.max(0,Math.min(100,Number(body.p_priority??80))),p_metadata:{source:'leader_training_ui'}
  });
  if(!created.ok)throw new Error(created.data?.message||created.data?.error||created.text||'تعذر تسجيل المادة');
  const materialId=String(created.data||'').trim();
  if(!materialId)throw new Error('لم يتم إنشاء رقم للمادة');
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  const sign=await request(SUPABASE_URL+'/storage/v1/object/upload/sign/'+encodeURIComponent(BUCKET)+'/'+encoded,'POST',{upsert:false},{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY});
  if(!sign.ok)throw new Error(sign.data?.message||sign.data?.error||sign.text||'تعذر إنشاء رابط رفع المادة');
  let signed=String(sign.data?.signedUrl||sign.data?.signedURL||sign.data?.url||'').trim();
  if(signed&&!/^https?:\/\//i.test(signed))signed=SUPABASE_URL+'/storage/v1'+(signed.startsWith('/')?signed:'/') ;
  if(!signed)throw new Error('لم يتم إنشاء رابط رفع صالح');
  return {material_id:materialId,signed_url:signed,storage_path:path};
}
async function complete(body){
  const r=await rpc('complete_ai_training_material_upload',{p_token:String(body.p_token||'').trim(),p_material_id:String(body.p_material_id||'').trim(),p_success:body.p_success!==false,p_error_message:body.p_error_message||null});
  if(!r.ok)throw new Error(r.data?.message||r.data?.error||r.text||'تعذر تسجيل اكتمال الرفع');
  return {ok:true};
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method Not Allowed'});
  try{
    const b=typeof req.body==='object'&&req.body?req.body:{};
    const action=String(b.action||'prepare').toLowerCase();
    const result=action==='complete'?await complete(b):await prepare(b);
    return res.status(200).json(result);
  }catch(e){
    console.error('[ai-training-material-upload]',e);
    return res.status(400).json({error:String(e?.message||e)});
  }
};
