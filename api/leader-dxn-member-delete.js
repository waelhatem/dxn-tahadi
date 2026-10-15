const https=require('https');
const BASE=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/,'');
const KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
function call(method,path,body){return new Promise((resolve,reject)=>{const url=new URL(BASE+path),payload=body==null?null:Buffer.from(JSON.stringify(body));const req=https.request(url,{method,headers:{apikey:KEY,Authorization:'Bearer '+KEY,Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{})},timeout:15000},res=>{let txt='';res.on('data',x=>txt+=x);res.on('end',()=>{let data;try{data=JSON.parse(txt)}catch{data=txt}resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data})})});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الطلب')));if(payload)req.write(payload);req.end()})}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, X-DXN-Session');
 if(req.method==='OPTIONS')return res.status(200).end();
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  if(!KEY)throw Error('إعدادات الخدمة غير مكتملة');
  const token=String(req.headers['x-dxn-session']||'').trim();
  if(!token)return res.status(401).json({error:'يرجى تسجيل الدخول'});
  const session=await call('POST','/rest/v1/rpc/bootstrap',{p_token:token});
  if(!session.ok||String(session.data?.role||'').toLowerCase()!=='leader')return res.status(403).json({error:'الحذف متاح للقائد فقط'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const memberNo=String(body.member_no||'').trim();
  if(!/^\d{9}$/.test(memberNo)||String(body.confirm_member_no||'').trim()!==memberNo)return res.status(400).json({error:'رقم العضوية أو التأكيد غير صحيح'});
  const filter=encodeURIComponent(memberNo);
  const row=await call('GET','/rest/v1/dxn_team_members?member_no=eq.'+filter+'&select=member_no,member_name,source');
  if(!row.ok||!Array.isArray(row.data))throw Error('تعذر التحقق من السجل');
  if(row.data.length!==1)return res.status(409).json({error:'السجل غير موجود أو غير محدد'});
  if(String(row.data[0].source||'').toLowerCase()!=='manual')return res.status(409).json({error:'الحذف متاح للسجلات المضافة يدويًا فقط'});
  const checks=[
   ['/rest/v1/dxn_team_members?sponsor_member_no=eq.'+filter+'&select=member_no&limit=1','العضو مرتبط بأعضاء آخرين في الفريق'],
   ['/rest/v1/members?member_no=eq.'+filter+'&select=id&limit=1','العضو له ملف في المجتمع'],
   ['/rest/v1/app_users?login_no=eq.'+filter+'&select=id&limit=1','العضو لديه حساب دخول']
  ];
  for(const [url,error] of checks){const check=await call('GET',url);if(!check.ok||!Array.isArray(check.data))throw Error('تعذر التحقق من ارتباطات العضو');if(check.data.length)return res.status(409).json({error})}
  // Exact primary-key and source filter prevents deleting any other member record.
  const deletion=await call('DELETE','/rest/v1/dxn_team_members?member_no=eq.'+filter+'&source=eq.manual');
  if(!deletion.ok)throw Error('تعذر حذف السجل');
  return res.status(200).json({ok:true,member_no:memberNo});
 }catch(e){console.error('leader-dxn-member-delete:',e);return res.status(400).json({error:String(e.message||e)})}
};