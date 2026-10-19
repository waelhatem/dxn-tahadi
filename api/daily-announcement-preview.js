'use strict';

const {generateDailyDraft,__test:{baghdadDate,topicFor}}=require('./daily-announcement-cron');

const SUPABASE_URL='https://ryqpstkzppaifpvhezzn.supabase.co';
// The app already uses this publishable key with its documented bootstrap RPC.
const SUPABASE_PUBLIC_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh').trim();
const SESSION_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recentCalls=new Map();

async function checkLeader(token){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/bootstrap',{
    method:'POST',
    headers:{
      apikey:SUPABASE_PUBLIC_KEY,
      Authorization:'Bearer '+SUPABASE_PUBLIC_KEY,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify({p_token:token}),
    signal:AbortSignal.timeout(15000)
  });
  if(!r.ok){
    if(r.status===400||r.status===401||r.status===403)return false;
    throw new Error('leader_verification_http_'+r.status);
  }
  const user=await r.json();
  return user?.role==='leader' && typeof user?.user_id==='string' && user.user_id.length>0;
}

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const token=String(req.body?.p_token||'').trim();
  if(!SESSION_RE.test(token))return res.status(401).json({error:'سجّل الدخول بحساب القائد أولاً.'});
  try{
    // Verify server-side, never trust any client-side role or button visibility.
    if(!(await checkLeader(token)))return res.status(403).json({error:'هذه التجربة مخصصة للقائد فقط.'});
    if(!String(process.env.OPENAI_API_KEY||'').trim())return res.status(503).json({error:'خدمة التوليد غير مفعّلة في المعاينة. يجب إضافة OPENAI_API_KEY إلى متغيرات Preview على Vercel.',code:'OPENAI_KEY_MISSING'});

    // Best-effort per-session throttle against accidental repeated clicks.
    const now=Date.now();
    const recent=recentCalls.get(token)||0;
    if(now-recent<15000)return res.status(429).json({error:'يمكنك إعادة التجربة بعد بضع ثوانٍ.'});
    recentCalls.set(token,now);
    if(recentCalls.size>100)for(const [k,t] of recentCalls)if(now-t>60000)recentCalls.delete(k);

    const day=baghdadDate();
    const draft=await generateDailyDraft(day,topicFor(day),[]);
    return res.status(200).json({
      ok:true,preview:true,
      title:'🌅 صباح الصحة والثراء | '+day+' — '+draft.title,
      body:draft.body,
      announcement_type:'announcement'
    });
  }catch(e){
    console.error('[daily-announcement-preview]',String(e?.message||e));
    return res.status(502).json({
      error:String(e?.message||'').startsWith('leader_verification_')
        ?'تعذر التحقق من حساب القائد مؤقتاً. حاول مجدداً.'
        :'فشل توليد الرسالة من خدمة الذكاء الاصطناعي. يُرجى فحص مفتاح OpenAI وصلاحية النموذج في Vercel.',
      code:String(e?.message||'').startsWith('leader_verification_')?'AUTH_SERVICE_ERROR':'AI_GENERATION_FAILED'
    });
  }
}

module.exports=handler;
module.exports.__test={checkLeader};
