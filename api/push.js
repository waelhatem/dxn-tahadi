const webpush = require('web-push');
const https = require('https');

const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();

function supabaseRequest(method,path,body){
  return new Promise((resolve,reject)=>{
    if(!SUPABASE_SECRET_KEY) return reject(new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel'));
    const target=new URL(SUPABASE_URL);
    const raw=body===undefined?'':JSON.stringify(body);
    const req=https.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port||443,
      method,
      path,
      headers:{
        Accept:'application/json',
        ...(raw?{'Content-Type':'application/json'}:{}),
        apikey:SUPABASE_SECRET_KEY,
        Authorization:`Bearer ${SUPABASE_SECRET_KEY}`,
        ...(raw?{'Content-Length':Buffer.byteLength(raw)}:{})
      },
      timeout:15000
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',c=>text+=c);
      res.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بـ Supabase')));
    req.on('error',reject);
    if(raw)req.write(raw);
    req.end();
  });
}

async function supabaseRpc(fn,args){
  const response=await supabaseRequest('POST',`/rest/v1/rpc/${encodeURIComponent(fn)}`,args||{});
  return response;
}

async function verifyToken(token){
  const r=await supabaseRpc('bootstrap',{p_token:token});
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const d=r.data||{};
  const member=Array.isArray(d.members)&&d.members[0]?d.members[0]:null;
  const userId=String(member?.id||'').trim();
  if(!userId)throw new Error('تعذر تحديد حساب المستخدم');
  return {data:d,userId};
}

function configureWebPush(){
  if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)throw new Error('VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY يجب ضبطهما في Vercel');
  webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
}

function validSubscription(x){
  return !!(
    x &&
    typeof x.endpoint==='string' &&
    x.endpoint.startsWith('https://') &&
    x.keys &&
    typeof x.keys.p256dh==='string' &&
    typeof x.keys.auth==='string'
  );
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'').trim();
    const token=String(body.token||'').trim();

    if(action==='public_key'){
      if(!VAPID_PUBLIC_KEY)return res.status(503).json({error:'VAPID_PUBLIC_KEY غير مضبوط'});
      return res.status(200).json({ok:true,publicKey:VAPID_PUBLIC_KEY});
    }

    if(!token)return res.status(401).json({error:'جلسة الدخول مطلوبة'});

    if(action==='subscribe'){
      const sub=body.subscription;
      if(!validSubscription(sub))return res.status(400).json({error:'بيانات الاشتراك غير صالحة'});

      await verifyToken(token);

      const upsert=await supabaseRpc('upsert_ai_agent_push_subscription',{
        p_token:token,
        p_endpoint:sub.endpoint,
        p_p256dh:sub.keys.p256dh,
        p_auth:sub.keys.auth,
        p_user_agent:String(body.userAgent||'').slice(0,500)
      });

      if(!upsert.ok){
        return res.status(400).json({
          error:(upsert.data&&upsert.data.message)||upsert.text||'تعذر حفظ اشتراك الإشعارات'
        });
      }

      return res.status(200).json({
        ok:true,
        id:Array.isArray(upsert.data)?upsert.data[0]||null:upsert.data||null
      });
    }

    if(action==='unsubscribe'){
      const endpoint=String(body.endpoint||'').trim();
      if(!endpoint)return res.status(400).json({error:'عنوان الاشتراك مطلوب'});

      const r=await supabaseRpc('remove_ai_agent_push_subscription',{
        p_token:token,
        p_endpoint:endpoint
      });

      if(!r.ok)return res.status(400).json({error:(r.data&&r.data.message)||r.text||'تعذر إلغاء الاشتراك'});
      return res.status(200).json({ok:true});
    }

    if(action==='test_followup'){
      const sub=body.subscription;
      if(!validSubscription(sub))return res.status(400).json({error:'بيانات الاشتراك غير صالحة'});
      configureWebPush();

      const verified=await verifyToken(token);

      const path=
        `/rest/v1/ai_agent_coaching_sessions?user_id=eq.${encodeURIComponent(verified.userId)}&active=eq.true&select=objective,session_type,updated_at&order=updated_at.asc&limit=1`;

      const sessions=await supabaseRequest('GET',path);
      if(!sessions.ok){
        return res.status(400).json({error:(sessions.data&&sessions.data.message)||sessions.text||'تعذر قراءة جلسة محمد'});
      }

      const session=Array.isArray(sessions.data)?sessions.data[0]:null;

      // زر اختبار المتابعة يجب أن يختبر قناة Push حتى لو لم تكن هناك
      // جلسة تدريب نشطة حاليًا. لا ننشئ جلسة وهمية ولا نغيّر حالة العضو.
      const sessionType=session?.session_type||'coaching';
      const baseBody=sessionType==='practice'
        ?'محمد يتابعك: لديك ممارسة تدريبية لم تكتمل بعد.'
        :sessionType==='review'
          ?'محمد يتابعك: لديك مراجعة تدريبية لم تكتمل بعد.'
          :session
            ?'محمد يتابعك: لديك جلسة تدريبية لم تكتمل بعد.'
            :'محمد يتابعك: هذه رسالة اختبار للمتابعة الخلفية.';

      const objective=String(session?.objective||'').trim();

      await webpush.sendNotification(sub,JSON.stringify({
        title:'🤖 محمد — اختبار المتابعة',
        body:objective?baseBody+' '+objective:baseBody,
        icon:'/logo.png',
        badge:'/favicon.png',
        data:{url:'/app/index.html',source:'mohammed-followup-test'}
      }),{TTL:300,urgency:'normal'});

      return res.status(200).json({
        ok:true,
        message:session
          ?'تم إرسال اختبار المتابعة بنجاح.'
          :'تم إرسال اختبار المتابعة بنجاح. لا توجد جلسة نشطة حاليًا، لذلك أُرسلت رسالة اختبار عامة دون إنشاء جلسة.',
        session_type:sessionType,
        objective:objective||null
      });
    }

    if(action==='test'){
      const sub=body.subscription;
      if(!validSubscription(sub))return res.status(400).json({error:'بيانات الاشتراك غير صالحة'});
      configureWebPush();
      await verifyToken(token);

      await webpush.sendNotification(sub,JSON.stringify({
        title:'محمد — الإشعارات تعمل ✅',
        body:'تم تفعيل الإشعارات الدائمة بنجاح.',
        icon:'/logo.png',
        badge:'/favicon.png',
        data:{url:'/app/index.html'}
      }),{TTL:300,urgency:'normal'});

      return res.status(200).json({ok:true});
    }

    return res.status(400).json({error:'الإجراء غير معروف'});
  }catch(e){
    console.error('Push API error:',e);
    return res.status(500).json({error:String(e&&e.message||e)});
  }
};