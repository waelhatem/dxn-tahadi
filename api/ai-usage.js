const https=require('https');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\\r\\n]/g,'');
const SUPABASE_PUBLISHABLE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'').trim().replace(/[\\r\\n]/g,'');

function callSupabase(path,method='GET',body=null,key=SUPABASE_SECRET_KEY){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const raw=body==null?'':JSON.stringify(body);
    const req=https.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||443,
      method,path,
      headers:{
        Accept:'application/json',
        ...(raw?{'Content-Type':'application/json'}:{}),
        apikey:key,
        // Publishable/anon keys are JWTs and work with both headers.
        // New sb_secret_* keys are API keys, so use only apikey for those.
        ...(/^sb_secret_/i.test(key)?{}:{Authorization:'Bearer '+key}),
        ...(raw?{'Content-Length':Buffer.byteLength(raw)}:{})
      },
      timeout:12000
    },res=>{
      let text='';res.setEncoding('utf8');
      res.on('data',c=>text+=c);
      res.on('end',()=>{
        let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بـ Supabase')));
    req.on('error',reject);
    if(raw)req.write(raw);
    req.end();
  });
}

function send(res,status,body){return res.status(status).json(body);}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  if(!SUPABASE_SECRET_KEY && !SUPABASE_PUBLISHABLE_KEY)return send(res,500,{error:'مفتاح Supabase غير مضبوط في Vercel'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    const days=Math.max(1,Math.min(Number(body.days||30),90));
    if(!token)return send(res,400,{error:'جلسة القائد مطلوبة'});

    // Use the same publishable/anon authentication path as the working /api/rpc endpoint.
    // The RPC validates the leader token itself, so no privileged key is needed for bootstrap.
    const bootKey=SUPABASE_PUBLISHABLE_KEY||SUPABASE_SECRET_KEY;
    const boot=await callSupabase('/rest/v1/rpc/bootstrap','POST',{p_token:token},bootKey);
    if(!boot.ok){
      return send(res,401,{error:(boot.data&&(boot.data.message||boot.data.error||boot.data.hint))||boot.text||'جلسة الدخول غير صالحة'});
    }
    const role=String(boot.data?.role||'').toLowerCase();
    if(role!=='leader')return send(res,403,{error:'هذا المؤشر متاح للقائد فقط'});

    // Use a leader-authenticated RPC so usage data is never exposed to public/anon callers.
    const summary=await callSupabase('/rest/v1/rpc/get_ai_agent_usage_summary_for_leader','POST',{p_token:token,p_days:days},bootKey);
    if(!summary.ok){
      return send(res,503,{
        error:'سجل استهلاك الذكاء الاصطناعي غير مفعّل في قاعدة البيانات بعد.',
        detail:(summary.data&&(summary.data.message||summary.data.error||summary.data.hint))||summary.text||null
      });
    }

    return send(res,200,{
      ok:true,
      days,
      rows:Array.isArray(summary.data)?summary.data:[]
    });
  }catch(e){
    console.error('[ai-usage]',e);
    return send(res,500,{error:String(e?.message||e||'تعذر تحميل إحصائيات الذكاء الاصطناعي')});
  }
};
