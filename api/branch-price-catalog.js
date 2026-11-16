'use strict';
const https=require('https');
const crypto=require('crypto');

const ROOT=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').trim().replace(/\/$/,'');
const SECRET=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const BUCKET='dxn-price-lists';
const MAX_PDF=15*1024*1024;
const BAD_REQUEST=400;

function send(res,code,data){return res.status(code).json(data);}
function pick(v,n){return String(v==null?'':v).trim().slice(0,n);}
function requireText(v,min,max,label){const t=pick(v,max+1);if(t.length<min||t.length>max)throw Object.assign(new Error('حقل '+label+' غير صالح'),{status:BAD_REQUEST});return t;}
function validId(v){const x=Number(v);if(!Number.isSafeInteger(x)||x<=0)throw Object.assign(new Error('معرّف السجل غير صالح'),{status:400});return x;}
function mustOk(r,message){if(!r.ok){const err=r.data?.message||r.data?.error||r.data?.msg||r.text||message;throw Object.assign(new Error(String(err).slice(0,300)),{status:r.status>=400&&r.status<500?r.status:502});}return r.data;}

function request(method,path,body,headers={}){
 return new Promise((resolve,reject)=>{
  const url=new URL(ROOT+path),payload=body===undefined?null:Buffer.from(JSON.stringify(body));
  const h={apikey:SECRET,Authorization:'Bearer '+SECRET,Accept:'application/json',...headers};
  if(payload){h['Content-Type']='application/json';h['Content-Length']=payload.length;}
  const req=https.request(url,{method,headers:h,timeout:16000},resp=>{
   let text='';resp.setEncoding('utf8');resp.on('data',chunk=>{if(text.length<1e6)text+=chunk;});
   resp.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null;}catch(_){data=text;}resolve({ok:resp.statusCode>=200&&resp.statusCode<300,status:resp.statusCode||0,data,text});});
  });
  req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بقاعدة البيانات')));
  req.on('error',reject);if(payload)req.write(payload);req.end();
 });
}

async function authenticate(req){
 if(!SECRET)throw Object.assign(new Error('مفتاح قاعدة البيانات غير مضبوط على الخادم'),{status:503});
 const token=pick(req.headers['x-dxn-session'],1500);
 if(!token)throw Object.assign(new Error('سجّل الدخول لعرض الفروع والأسعار'),{status:401});
 const result=await request('POST','/rest/v1/rpc/bootstrap',{p_token:token});
 if(!result.ok)throw Object.assign(new Error('انتهت جلسة الدخول؛ يرجى تسجيل الدخول مجددًا'),{status:401});
 const role=String(result.data?.role||'').toLowerCase();
 if(role!=='member'&&role!=='leader')throw Object.assign(new Error('لا توجد صلاحية للوصول إلى هذا القسم'),{status:403});
 return role;
}
function leaderOnly(role){if(role!=='leader')throw Object.assign(new Error('إدارة الفروع والأسعار متاحة للقائد فقط'),{status:403});}
function objectPath(path){return path.split('/').map(encodeURIComponent).join('/');}
async function getList(){
 const [b,p]=await Promise.all([
  request('GET','/rest/v1/dxn_branch_locations?select=id,name,country,city,street_address,latitude,longitude,updated_at&order=country.asc,city.asc,name.asc&limit=1500'),
  request('GET','/rest/v1/dxn_price_lists?select=id,title,country,branch_id,file_name,effective_on,updated_at&order=updated_at.desc&limit=1500')
 ]);
 return {branches:mustOk(b,'تعذر تحميل الفروع')||[],prices:mustOk(p,'تعذر تحميل قوائم الأسعار')||[]};
}
async function byId(table,id){
 const r=await request('GET','/rest/v1/'+table+'?id=eq.'+id+'&select=*&limit=1');
 const rows=mustOk(r,'تعذر قراءة السجل');
 if(!Array.isArray(rows)||!rows.length)throw Object.assign(new Error('السجل غير موجود'),{status:404});
 return rows[0];
}
async function signedPriceUrl(id){
 const row=await byId('dxn_price_lists',id);
 const path=objectPath(row.storage_path);
 const result=await request('POST','/storage/v1/object/sign/'+BUCKET+'/'+path,{expiresIn:900});
 const signed=mustOk(result,'تعذر فتح ملف PDF');
 const relative=String(signed.signedURL||signed.signedUrl||signed.url||'');
 if(!relative)throw new Error('لم يتم إنشاء رابط عرض الملف');
 return /^https?:\/\//i.test(relative)?relative:ROOT+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;
}
async function prepareUpload(body){
 const filename=requireText(body.file_name,5,250,'اسم الملف');
 const size=Number(body.size);
 if(!/\.pdf$/i.test(filename))throw Object.assign(new Error('يُسمح فقط بملفات PDF'),{status:400});
 if(!Number.isFinite(size)||size<=0||size>MAX_PDF)throw Object.assign(new Error('حجم ملف PDF يجب ألا يتجاوز 15 ميغابايت'),{status:400});
 const path='catalog/'+Date.now()+'-'+crypto.randomBytes(12).toString('hex')+'.pdf';
 const r=await request('POST','/storage/v1/object/upload/sign/'+BUCKET+'/'+objectPath(path),{upsert:false});
 const d=mustOk(r,'تعذر إنشاء رابط رفع PDF');
 const u=String(d.signedUrl||d.signedURL||d.url||'');
 if(!u)throw new Error('لم يتم إنشاء رابط رفع الملف');
 const uploadUrl=/^https?:\/\//i.test(u)?u:ROOT+'/storage/v1'+(u.startsWith('/')?'':'/')+u;
 return {upload_url:uploadUrl,storage_path:path,max_bytes:MAX_PDF};
}
async function saveBranch(body){
 const name=requireText(body.name,2,140,'اسم الفرع');
 const country=requireText(body.country,2,90,'الدولة');
 const city=requireText(body.city,2,90,'المدينة');
 const street_address=requireText(body.street_address,4,500,'العنوان');
 const latRaw=String(body.latitude??'').trim(),lonRaw=String(body.longitude??'').trim();
 const latitude=Number(latRaw),longitude=Number(lonRaw);
 if(!latRaw||!lonRaw||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)
   throw Object.assign(new Error('أدخل إحداثيات GPS صحيحة لفتح الملاحة بدقة'),{status:400});
 const data={name,country,city,street_address,latitude,longitude,updated_at:new Date().toISOString()};
 let response;
 if(body.id)response=await request('PATCH','/rest/v1/dxn_branch_locations?id=eq.'+validId(body.id),data,{Prefer:'return=representation'});
 else response=await request('POST','/rest/v1/dxn_branch_locations',data,{Prefer:'return=representation'});
 return {branch:mustOk(response,'تعذر حفظ الفرع')?.[0]};
}
async function savePrice(body){
 const id=body.id?validId(body.id):null;
 const prior=id?await byId('dxn_price_lists',id):null;
 const title=requireText(body.title,2,160,'عنوان القائمة');
 const country=requireText(body.country,2,90,'الدولة');
 const file_name=requireText(body.file_name||prior?.file_name,5,250,'اسم ملف PDF');
 const storage_path=pick(body.storage_path||prior?.storage_path,200);
 if(!/^catalog\/\d{13}-[a-f0-9]{24}\.pdf$/.test(storage_path)||!/\.pdf$/i.test(file_name))
   throw Object.assign(new Error('يرجى رفع ملف PDF صالح قبل الحفظ'),{status:400});
 const date=pick(body.effective_on,12);
 if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Object.assign(new Error('تاريخ سريان الأسعار غير صالح'),{status:400});
 let branch_id=null;
 if(body.branch_id){branch_id=validId(body.branch_id);const b=await byId('dxn_branch_locations',branch_id);if(b.country!==country)throw Object.assign(new Error('الدولة لا تتطابق مع دولة الفرع'),{status:400});}
 // Confirm uploaded PDF exists before making it available in the directory.
 const info=await request('GET','/storage/v1/object/info/'+BUCKET+'/'+objectPath(storage_path));
 mustOk(info,'ملف PDF لم يكتمل رفعه');
 const row={title,country,branch_id,file_name,storage_path,effective_on:date||null,updated_at:new Date().toISOString()};
 const r=id
   ?await request('PATCH','/rest/v1/dxn_price_lists?id=eq.'+id,row,{Prefer:'return=representation'})
   :await request('POST','/rest/v1/dxn_price_lists',row,{Prefer:'return=representation'});
 const saved=mustOk(r,'تعذر حفظ قائمة الأسعار');
 return {price:saved?.[0]};
}
async function removeRow(table,id){const result=await request('DELETE','/rest/v1/'+table+'?id=eq.'+id);mustOk(result,'تعذر حذف السجل');}
async function deletePrice(id){const row=await byId('dxn_price_lists',id);await removeRow('dxn_price_lists',id);try{await request('DELETE','/storage/v1/object/'+BUCKET+'/'+objectPath(row.storage_path));}catch(e){console.error('DXN PDF file cleanup',e.message);}return {ok:true};}

module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET'&&req.method!=='POST')return send(res,405,{error:'طريقة الطلب غير مدعومة'});
 try{
  const role=await authenticate(req);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const action=String(req.method==='GET'?req.query?.action||'list':body.action||'');
  if(req.method==='GET'){
   if(action==='list')return send(res,200,{ok:true,...await getList(),can_edit:role==='leader'});
   if(action==='open_pdf')return send(res,200,{ok:true,url:await signedPriceUrl(validId(req.query?.id))});
   return send(res,400,{error:'الإجراء غير معروف'});
  }
  leaderOnly(role);
  if(action==='save_branch')return send(res,200,{ok:true,...await saveBranch(body)});
  if(action==='delete_branch'){await byId('dxn_branch_locations',validId(body.id));await removeRow('dxn_branch_locations',validId(body.id));return send(res,200,{ok:true});}
  if(action==='prepare_pdf')return send(res,200,{ok:true,...await prepareUpload(body)});
  if(action==='save_price')return send(res,200,{ok:true,...await savePrice(body)});
  if(action==='delete_price')return send(res,200,{ok:true,...await deletePrice(validId(body.id))});
  return send(res,400,{error:'الإجراء غير معروف'});
 }catch(err){
  const code=Number(err.status)||500;
  console.error('branch-price-catalog',String(err.message||err));
  return send(res,code>=400&&code<=599?code:500,{error:String(err.message||err).slice(0,320)});
 }
};
