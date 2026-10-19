'use strict';

const {generateDailyDraft,__test:{baghdadDate,topicFor}}=require('./daily-announcement-cron');

const SUPABASE_URL='https://ryqpstkzppaifpvhezzn.supabase.co';
const SESSION_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recentCalls=new Map();

async function checkLeader(token){
  const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key)throw new Error('supabase_key_missing');
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/current_role',{
    method:'POST',
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify({p_token:token}),
    signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw new Error('leader_verification_failed');
  return (await r.json())==='leader';
}

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const token=String(req.body?.p_token||'').trim();
  if(!SESSION_RE.test(token))return res.status(401).json({error:'سجّل الدخول بحساب القائد أولاً.'});
  try{
    // Verify server-side, never trust any client-side role or button visibility.
    if(!(await checkLeader(token)))return res.status(403).json({error:'هذه التجربة مخصصة للقائد فقط.'});
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'مفتاح خدمة الذكاء الاصطناعي غير مُعدّ في بيئة المعاينة.'});

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
      error:'تعذر توليد الرسالة الآن. تحقق من مفاتيح Supabase وOpenAI في بيئة المعاينة.'
    });
  }
}

module.exports=handler;
module.exports.__test={checkLeader};
