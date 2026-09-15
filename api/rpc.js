const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
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

    const response=await supabaseRpcRequest(fn,args,SUPABASE_KEY,10000);
    return res.status(response.status||500).json(response.data||{error:response.text||'Supabase request failed'});

  } catch (error) {
    return res.status(500).json({
      error: String(error.message || error)
    });
  }
};
