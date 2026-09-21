const https = require('https');

const DEFAULT_SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const configuredSupabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/[\r\n]/g,'').replace(/\/$/,'');
const SUPABASE_URL = /^https:\/\/ryqpstkzppaifpvhezzn\.supabase\.co$/i.test(configuredSupabaseUrl) ? configuredSupabaseUrl : DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh').trim().replace(/[\r\n]/g,'');
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function json(res,status,body){
  res.status(status).json(body);
}

function outputText(data){
  if(data && typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data && data.output) ? data.output : [])){
    for(const part of (Array.isArray(item && item.content) ? item.content : [])){
      if(part && part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function openaiResponses(payload){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(payload);
    const request=https.request('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${OPENAI_API_KEY}`,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body)
      },
      timeout:30000
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=null}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي')));
    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

function supabaseRpcRequest(fn,args,key,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const body=JSON.stringify(args||{});
    const request=https.request({
      protocol:base.protocol,
      hostname:base.hostname,
      port:base.port||443,
      method:'POST',
      path:`/rest/v1/rpc/${encodeURIComponent(fn)}`,
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        ...(key?{apikey:key,Authorization:`Bearer ${key}`}:{})
        ,'Content-Length':Buffer.byteLength(body)
      },
      timeout:timeoutMs||10000
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بخدمة Supabase')));
    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

async function supabaseSecretRpc(fn,args){
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const response=await supabaseRpcRequest(fn,args,SUPABASE_SECRET_KEY,12000);
  if(!response.ok) throw new Error((response.data&&(response.data.message||response.data.error||response.data.hint))||response.text||`Supabase HTTP ${response.status}`);
  return response.data;
}

async function supabaseStorageRequest(path,method,key,body,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const payload=body==null?'':JSON.stringify(body);
    const request=https.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||443,method,
      path,
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        ...(key?{apikey:key,Authorization:`Bearer ${key}`}:{}),
        ...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})
      },
      timeout:timeoutMs||15000
    },response=>{
      let text='';response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بتخزين Supabase')));
    request.on('error',reject);
    if(payload)request.write(payload);
    request.end();
  });
}
async function ensureRagwanBucket(){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await supabaseStorageRequest('/storage/v1/bucket','POST',SUPABASE_SECRET_KEY,{
    id:'ragwan-plan',name:'ragwan-plan',public:false,file_size_limit:52428800
  },15000);
  if(r.ok)return;
  const message=String((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||'').toLowerCase();
  if(r.status===409 || message.includes('already exists') || message.includes('resource already exists') || message.includes('already_exist'))return;
  throw new Error((r.data&&(r.data.message||r.data.error||r.data.statusCode))||r.text||'تعذر تجهيز مساحة الملفات');
}
async function ragwanPlanFiles(args){
  const token=String(args.p_token||'').trim();
  const action=String(args.action||'').trim();
  if(!token)throw new Error('انتهت الجلسة. سجّل الدخول من جديد.');
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const boot=await supabaseSecretRpc('bootstrap',{p_token:token});
  const role=String(boot&&boot.role||'');
  if(!['leader','member'].includes(role))throw new Error('غير مصرح.');
  const bucket='ragwan-plan';
  if(action==='sign_upload'){
    if(role!=='leader')throw new Error('رفع الملفات متاح للقائد فقط.');
    await ensureRagwanBucket();
    const name=String(args.name||'').trim();
    const type=String(args.content_type||'application/octet-stream').trim().slice(0,150);
    const size=Number(args.size||0);
    if(!name)throw new Error('اسم الملف مطلوب.');
    if(!Number.isFinite(size)||size<=0||size>50*1024*1024)throw new Error('حجم الملف يجب ألا يتجاوز 50 MB.');
    const safe=name.replace(/[^\p{L}\p{N}._()\- ]/gu,'_').replace(/\s+/g,' ').trim().slice(0,140)||'file';
    const path=`ragwan/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
    const signed=await supabaseStorageRequest('/storage/v1/object/upload/sign/'+bucket+'/'+encodeURIComponent(path),'POST',SUPABASE_SECRET_KEY,{upsert:false},15000);
    if(!signed.ok)throw new Error((signed.data&&(signed.data.message||signed.data.error))||signed.text||'تعذر إنشاء رابط الرفع.');
    return {path,name:safe,content_type:type,size,token:signed.data&&signed.data.token,signed_url:signed.data&&signed.data.signedURL};
  }
  if(action==='list'){
    const listed=await supabaseStorageRequest('/storage/v1/object/list/'+bucket,'POST',SUPABASE_SECRET_KEY,{prefix:'ragwan/',limit:100,offset:0},15000);
    if(!listed.ok)throw new Error((listed.data&&(listed.data.message||listed.data.error))||listed.text||'تعذر تحميل الملفات.');
    const items=Array.isArray(listed.data)?listed.data:[];
    const paths=items.map(x=>String(x.name||'')).filter(Boolean).map(n=>'ragwan/'+n);
    let signedMap={};
    if(paths.length){
      const sr=await supabaseStorageRequest('/storage/v1/object/sign/'+bucket,'POST',SUPABASE_SECRET_KEY,{expiresIn:3600,paths},15000);
      if(sr.ok){
        const rows=Array.isArray(sr.data)?sr.data:[];
        rows.forEach(x=>{if(x&&x.path)signedMap[x.path]=x.signedURL||x.signedUrl||''});
      }
    }
    return {files:items.map(x=>{const path='ragwan/'+String(x.name||'');return {name:x.name||'file',path,created_at:x.created_at||x.updated_at||null,size:Number(x.metadata&&x.metadata.size||0),mime:String(x.metadata&&x.metadata.mimetype||x.metadata&&x.metadata.contentType||''),url:signedMap[path]||''}})};
  }
  if(action==='delete'){
    if(role!=='leader')throw new Error('الحذف متاح للقائد فقط.');
    const path=String(args.path||'').trim();
    if(!path.startsWith('ragwan/'))throw new Error('مسار الملف غير صالح.');
    const d=await supabaseStorageRequest('/storage/v1/object/'+bucket,'DELETE',SUPABASE_SECRET_KEY,{prefixes:[path]},15000);
    if(!d.ok)throw new Error((d.data&&(d.data.message||d.data.error))||d.text||'تعذر حذف الملف.');
    return {deleted:true};
  }
  throw new Error('إجراء غير معروف.');
}

async function generateIdealTrainingAnswer(args){
  const token=String(args.p_token||'').trim();
  const questionId=String(args.p_question_id||'').trim();
  if(!token||!questionId) throw new Error('بيانات السؤال ناقصة');
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');

  const admin=await supabaseSecretRpc('training_questions_admin',{p_token:token});
  const questions=admin&&Array.isArray(admin.questions)?admin.questions:[];
  const question=questions.find(q=>String(q.id)===questionId);
  if(!question) throw new Error('السؤال غير موجود أو غير مصرح به');

  const payload={
    model:OPENAI_MODEL,
    instructions:[
      'أنت كاتب إجابات نموذجية لاختبارات متدربي مجتمع الصحة والثراء.',
      'اكتب جوابًا مثاليًا تعليميًا مباشرًا للسؤال المحدد، يصلح كمرجع لتقييم إجابات المتدربين.',
      'اعتمد على السؤال ومعيار التقييم المرفق فقط، ولا تخترع معلومات غير لازمة.',
      'اجعل الجواب واضحًا ومحددًا وقابلًا للفهم والتطبيق، من فقرة قصيرة أو نقاط عند الحاجة.',
      'لا تذكر أنك نموذج ذكاء اصطناعي، ولا تتحدث عن عملية التقييم أو القائد.',
      'عند وجود جانب صحي أو منتج، استخدم صياغة مهنية غير علاجية ولا تقدم وعودًا طبية أو نتائج مضمونة.'
    ].join('\n'),
    input:`التدريب: ${question.lesson_no}\nالسؤال: ${question.question}\n\nمعيار التقييم الحالي:\n${question.rubric||''}`,
    text:{format:{type:'json_schema',name:'ideal_training_answer',strict:true,schema:{type:'object',properties:{model_answer:{type:'string',minLength:10,maxLength:1200}},required:['model_answer'],additionalProperties:false}}},
    max_output_tokens:500
  };

  let ai;
  try{
    ai=await openaiResponses(payload);
  }catch(firstError){
    console.error('ideal-answer OpenAI transport retry:',firstError);
    ai=await openaiResponses({...payload,model:'gpt-5.6'});
  }
  if(!ai.ok){
    throw new Error((ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل توليد الجواب المثالي');
  }

  const out=outputText(ai.data);
  if(!out) throw new Error('لم يرجع الذكاء الاصطناعي جوابًا');
  let parsed;
  try{parsed=JSON.parse(out)}catch(_){throw new Error('نتيجة التوليد غير صالحة')}
  const ideal=String(parsed&&parsed.model_answer||'').trim();
  if(!ideal) throw new Error('الجواب المثالي فارغ');

  const saved=await supabaseSecretRpc('update_training_question',{
    p_token:token,
    p_question_id:questionId,
    p_question:question.question,
    p_model_answer:ideal,
    p_rubric:question.rubric||'',
    p_points:Number(question.points||100),
    p_active:question.active!==false
  });

  return saved&&saved.question ? saved.question : {...question,model_answer:ideal};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      supabase_configured: !!SUPABASE_URL,
      key_configured: !!SUPABASE_KEY
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(body.fn || '').trim();
    const args = body.args && typeof body.args === 'object' ? body.args : {};

    if (!/^[a-zA-Z0-9_]+$/.test(fn)) {
      return res.status(400).json({ error: 'Invalid RPC name' });
    }

    if (fn === 'ragwan_plan_files') {
      try {
        const result = await ragwanPlanFiles(args);
        return res.status(200).json({ok:true,...result});
      } catch (error) {
        console.error('ragwan_plan_files error:',error);
        return res.status(400).json({ok:false,error:String(error&&error.message||error)});
      }
    }

    if (fn === 'generate_training_answer') {
      try {
        const question = await generateIdealTrainingAnswer({
          p_token:args.p_token,
          p_question_id:args.p_question_id
        });
        return res.status(200).json({ok:true,question});
      } catch (error) {
        console.error('generate_training_answer RPC error:',error);
        return res.status(502).json({error:String(error&&error.message||error)});
      }
    }

    const privilegedTeamRpc = fn === 'get_dxn_team_intelligence' || fn === 'leader_sync_dxn_team_members';
    const response=await supabaseRpcRequest(fn,args,privilegedTeamRpc ? SUPABASE_SECRET_KEY : SUPABASE_KEY,10000);
    return res.status(response.status||500).json(response.data||{error:response.text||'Supabase request failed'});

  } catch (error) {
    return res.status(500).json({
      error: String(error.message || error)
    });
  }
};
