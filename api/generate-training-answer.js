const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

async function supabaseRpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:SUPABASE_SECRET_KEY,Authorization:`Bearer ${SUPABASE_SECRET_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args||{})});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
  if(!r.ok)throw new Error((data&&(data.message||data.error||data.hint))||text||`Supabase HTTP ${r.status}`);
  return data;
}

function json(res,status,body){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function outputText(data){
  if(data&&typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  var parts=[];
  for(const item of (Array.isArray(data&&data.output)?data.output:[])){
    for(const part of (Array.isArray(item&&item.content)?item.content:[])){
      if(part&&part.type==='output_text'&&typeof part.text==='string')parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function openaiResponses(payload){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(payload);
    const req=https.request('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${OPENAI_API_KEY}`,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body)
      },
      timeout:30000
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',chunk=>{text+=chunk});
      res.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=null}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي')));
    req.on('error',err=>reject(err));
    req.write(body);
    req.end();
  });
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY غير مضبوط في Vercel'});
  if(!SUPABASE_SECRET_KEY)return json(res,503,{error:'SUPABASE_SECRET_KEY غير مضبوط في Vercel'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    const questionId=String(body.question_id||'').trim();
    if(!token||!questionId)return json(res,400,{error:'بيانات السؤال ناقصة'});

    const admin=await supabaseRpc('training_questions_admin',{p_token:token});
    const questions=admin&&Array.isArray(admin.questions)?admin.questions:[];
    const q=questions.find(x=>String(x.id)===questionId);
    if(!q)return json(res,404,{error:'السؤال غير موجود أو غير مصرح به'});

    const aiPayload={
      model:OPENAI_MODEL,
      instructions:[
        'أنت كاتب إجابات نموذجية لاختبارات متدربي مجتمع الصحة والثراء.',
        'اكتب جوابًا مثاليًا تعليميًا مباشرًا للسؤال المحدد، يصلح كمرجع لتقييم إجابات المتدربين.',
        'اعتمد على السؤال ومعيار التقييم المرفق فقط، ولا تخترع معلومات غير لازمة.',
        'اجعل الجواب واضحًا ومحددًا وقابلًا للفهم والتطبيق، من فقرة قصيرة أو نقاط عند الحاجة.',
        'لا تذكر أنك نموذج ذكاء اصطناعي، ولا تتحدث عن عملية التقييم أو القائد.',
        'عند وجود جانب صحي أو منتج، استخدم صياغة مهنية غير علاجية ولا تقدم وعودًا طبية أو نتائج مضمونة.'
      ].join('\n'),
      input:`التدريب: ${q.lesson_no}\nالسؤال: ${q.question}\n\nمعيار التقييم الحالي:\n${q.rubric||''}`,
      text:{format:{type:'json_schema',name:'ideal_training_answer',strict:true,schema:{type:'object',properties:{model_answer:{type:'string',minLength:10,maxLength:1200}},required:['model_answer'],additionalProperties:false}}},
      max_output_tokens:500
    };

    let ai;
    try{
      ai=await openaiResponses(aiPayload);
    }catch(firstError){
      console.error('generate-training-answer OpenAI transport retry:',firstError);
      try{ai=await openaiResponses({...aiPayload,model:'gpt-5.6'});}catch(secondError){
        return json(res,502,{error:`تعذر الاتصال بخدمة الذكاء الاصطناعي: ${String(secondError&&secondError.message||secondError)}`});
      }
    }

    if(!ai.ok){
      const apiMessage=(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل توليد الجواب المثالي';
      return json(res,502,{error:apiMessage,status:ai.status});
    }

    const out=outputText(ai.data);
    if(!out)return json(res,502,{error:'لم يرجع الذكاء الاصطناعي جوابًا'});
    let parsed;
    try{parsed=JSON.parse(out)}catch(_){return json(res,502,{error:'نتيجة التوليد غير صالحة'});}
    const ideal=String(parsed&&parsed.model_answer||'').trim();
    if(!ideal)return json(res,502,{error:'الجواب المثالي فارغ'});

    const saved=await supabaseRpc('update_training_question',{p_token:token,p_question_id:questionId,p_question:q.question,p_model_answer:ideal,p_rubric:q.rubric||'',p_points:Number(q.points||100),p_active:q.active!==false});
    return json(res,200,{ok:true,question:saved&&saved.question?saved.question:{...q,model_answer:ideal}});
  }catch(e){
    console.error('generate-training-answer error:',e);
    return json(res,500,{error:String(e&&e.message||e)});
  }
};