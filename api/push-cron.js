const webpush = require('web-push');
const https = require('https');

const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();

function httpJson(url,body,headers,timeout=20000){
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    const raw=JSON.stringify(body||{});
    const req=https.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port||443,
      method:'POST',
      path:target.pathname+target.search,
      headers:{'Content-Type':'application/json',Accept:'application/json',...(headers||{}),'Content-Length':Buffer.byteLength(raw)},
      timeout
    },res=>{
      let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{
        let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بـ Supabase')));
    req.on('error',reject);req.write(raw);req.end();
  });
}
function supabaseRpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  return httpJson(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(fn)}`,args||{},{
    apikey:SUPABASE_SECRET_KEY,
    Authorization:`Bearer ${SUPABASE_SECRET_KEY}`
  });
}
function configureWebPush(){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error('VAPID keys غير مضبوطة في Vercel');
  webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
}
function expiredStatus(status){
  return status===404||status===410;
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  try{
    if(!CRON_SECRET)return res.status(503).json({error:'CRON_SECRET غير مضبوط'});
    const auth=String(req.headers['authorization']||'');
    if(auth!==`Bearer ${CRON_SECRET}`)return res.status(401).json({error:'غير مصرح'});

    configureWebPush();

    const candidates=await supabaseRpc('list_ai_agent_push_candidates',{p_min_age_hours:6});
    if(!candidates.ok){
      return res.status(502).json({error:(candidates.data&&candidates.data.message)||candidates.text||'تعذر قراءة مشتركي Push'});
    }

    const rows=Array.isArray(candidates.data)?candidates.data:[];
    let sent=0,expired=0,failed=0;
    for(const row of rows){
      const subscription={
        endpoint:row.endpoint,
        keys:{p256dh:row.p256dh,auth:row.auth}
      };
      const body=row.session_type==='practice'
        ?'محمد يتابعك: لديك ممارسة تدريبية لم تكتمل بعد.'
        :row.session_type==='review'
          ?'محمد يتابعك: لديك مراجعة تدريبية لم تكتمل بعد.'
          :'محمد يتابعك: لديك جلسة تدريبية لم تكتمل بعد.';
      const objective=String(row.objective||'').trim();
      const payload={
        title:'🤖 محمد — متابعة التدريب',
        body:objective?body+' '+objective:body,
        icon:'/logo.png',
        badge:'/favicon.png',
        data:{url:'/app/index.html',source:'mohammed-coaching'}
      };

      try{
        await webpush.sendNotification(subscription,JSON.stringify(payload),{TTL:86400,urgency:'normal'});
        await supabaseRpc('mark_ai_agent_push_sent',{p_id:row.id}).catch(()=>null);
        sent++;
      }catch(e){
        const status=Number(e&&e.statusCode||0);
        if(expiredStatus(status)){
          await supabaseRpc('deactivate_ai_agent_push_subscription',{p_id:row.id}).catch(()=>null);
          expired++;
        }else{
          failed++;
        }
      }
    }

    return res.status(200).json({ok:true,checked:rows.length,sent,expired,failed});
  }catch(e){
    console.error('Push cron error:',e);
    return res.status(500).json({error:String(e&&e.message||e)});
  }
};
