    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بـ Supabase')));
    req.on('error',reject);
    if(raw)req.write(raw);
    req.end();
  });
}

function configureWebPush(){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error('VAPID keys غير مضبوطة في Vercel');
  webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
}

function expiredStatus(status){return status===404||status===410;}

module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  try{
    if(!CRON_SECRET)return res.status(503).json({error:'CRON_SECRET غير مضبوط'});
    const auth=String(req.headers['authorization']||'');
    if(auth!==`Bearer ${CRON_SECRET}`)return res.status(401).json({error:'غير مصرح'});

    configureWebPush();

    const candidates=await supabaseRpc('list_ai_agent_push_candidates',{p_min_age_hours:6});
    if(!candidates.ok){
      return res.status(502).json({
        error:(candidates.data&&candidates.data.message)||candidates.text||'تعذر قراءة مشتركي Push'
      });
    }

    const rows=Array.isArray(candidates.data)?candidates.data:[];
    let sent=0,expired=0,failed=0,checked=0;

    for(const row of rows){
      checked++;

      const subscription={
        endpoint:row.endpoint,
        keys:{p256dh:row.p256dh,auth:row.auth}
      };

      const baseBody=row.session_type==='practice'
        ?'محمد يتابعك: لديك ممارسة تدريبية لم تكتمل بعد.'
        :row.session_type==='review'
          ?'محمد يتابعك: لديك مراجعة تدريبية لم تكتمل بعد.'
          :'محمد يتابعك: لديك جلسة تدريبية لم تكتمل بعد.';

      const objective=String(row.objective||'').trim();
      const payload={
        title:'🤖 محمد — متابعة التدريب',
        body:objective?baseBody+' '+objective:baseBody,
        icon:'/logo.png',