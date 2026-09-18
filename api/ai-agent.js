const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_MODEL = process.env.AI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-terra';

const SUPABASE_URL_FIXED = 'https://ryqpstkzppaifpvhezzn.supabase.co';

function httpJson(url,body,headers,timeout){
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    const raw=JSON.stringify(body||{});
    const req=https.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port||443,
      method:'POST',
      path:target.pathname+target.search,
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        ...(headers||{}),
        'Content-Length':Buffer.byteLength(raw)
      },
      timeout:timeout||15000
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',chunk=>{text+=chunk});
      res.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({
          ok:res.statusCode>=200&&res.statusCode<300,
          status:res.statusCode||0,
          data,
          text
        });
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بـ Supabase')));
    req.on('error',reject);
    req.write(raw);
    req.end();
  });
}

function supabaseRpc(fn,args){
  // Use the verified Supabase project endpoint directly from the agent.
  // The previous DNS failures were caused by the old project URL typo.
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  return httpJson(`${SUPABASE_URL_FIXED}/rest/v1/rpc/${encodeURIComponent(fn)}`,args||{},{
    apikey:SUPABASE_SECRET_KEY,
    Authorization:`Bearer ${SUPABASE_SECRET_KEY}`
  },15000);
}

function openai(payload){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(payload);
    const req=https.request('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:45000},res=>{
      let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text})});
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بالذكاء الاصطناعي')));req.on('error',reject);req.write(body);req.end();
  });
}

function outputText(data){
  if(data&&typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data&&data.output)?data.output:[]))for(const part of (Array.isArray(item&&item.content)?item.content:[]))if(part&&part.type==='output_text'&&typeof part.text==='string')parts.push(part.text);
  return parts.join('').trim();
}

function cleanHistory(history){
  if(!Array.isArray(history))return [];
  return history.slice(-12).map(x=>{
    const role=String(x&&x.role||'user').toLowerCase()==='assistant'?'assistant':'user';
    const content=String(x&&x.content||'').trim().slice(0,5000);
    return content?{role,content}:null;
  }).filter(Boolean);
}

async function loadContext(token){
  if(!token)throw new Error('جلسة الدخول مطلوبة');
  const boot=await supabaseRpc('bootstrap',{p_token:token});
  if(!boot.ok)throw new Error((boot.data&&(boot.data.message||boot.data.error||boot.data.hint))||boot.text||'جلسة الدخول غير صالحة');
  const data=boot.data||{};
  const role=String(data.role||'').toLowerCase();
  if(role!=='member'&&role!=='leader')throw new Error('نوع الحساب غير مدعوم');
  let training={lessons:[],my_progress:[]};
  const tr=await supabaseRpc('get_training_data',{p_token:token});
  if(tr.ok&&tr.data)training=tr.data;
  const member=Array.isArray(data.members)&&data.members[0]?data.members[0]:null;
  const lessons=(Array.isArray(training.lessons)?training.lessons:[]).map(l=>({id:l.id||l.lesson_id,lesson_id:l.lesson_id||l.id,lesson_no:l.lesson_no,title:l.title,description:l.description,active:l.active!==false}));
  const progress=(Array.isArray(training.my_progress)?training.my_progress:[]).map(p=>({lesson_id:p.lesson_id,completed:!!p.completed,watch_percent:Number(p.watch_percent||0)}));
  return {role,member:member?{id:member.id,member_no:member.member_no,name:member.name||member.full_name,stars:Number(member.stars||0)}:null,lessons,progress};
}



// Agent Tools (read-only). These are executed server-side with the authenticated session token.
const AGENT_TOOLS = {
  async get_member_progress(token){
    const ctx = await loadContext(token);
    return {
      member: ctx.member,
      progress: ctx.progress,
      lessons: ctx.lessons.map(l=>({lesson_no:l.lesson_no,title:l.title,active:l.active}))
    };
  },
  async get_training_status(token){
    const ctx = await loadContext(token);
    const byId = new Map(ctx.progress.map(p=>[String(p.lesson_id),p]));
    return ctx.lessons.map(l=>{
      const p=byId.get(String(l.id))||byId.get(String(l.lesson_id))||null;
      return {
        lesson_no:l.lesson_no,
        title:l.title,
        active:l.active,
        completed:!!(p&&p.completed),
        watch_percent:Number(p&&p.watch_percent||0)
      };
    });
  },
  async get_available_tasks(token){
    const ctx = await loadContext(token);
    const byId = new Map(ctx.progress.map(p=>[String(p.lesson_id),p]));
    const tasks=[];
    for(const l of ctx.lessons){
      const p=byId.get(String(l.id))||byId.get(String(l.lesson_id))||null;
      if(l.active && !(p&&p.completed)) tasks.push({type:'training',lesson_no:l.lesson_no,title:l.title,watch_percent:Number(p&&p.watch_percent||0)});
    }
    return tasks;
  },
  async get_member_summary(token){
    const ctx = await loadContext(token);
    const byId = new Map(ctx.progress.map(p=>[String(p.lesson_id),p]));
    const total=ctx.lessons.length;
    const completed=ctx.lessons.reduce((n,l)=>{
      const p=byId.get(String(l.id))||byId.get(String(l.lesson_id));
      return n+(p&&p.completed?1:0);
    },0);
    return {
      role:ctx.role,
      member:ctx.member,
      training:{total,completed,remaining:Math.max(0,total-completed),completion_percent:total?Math.round(completed/total*100):0}
    };
  }
};

function instructions(context){
  return [
    'أنت محمد، المدرب الذكي في منصة مجتمع الصحة والثراء. لا تقدم نفسك كبرنامج أو روبوت إلا إذا سُئلت مباشرة عن طبيعتك.',
    'هويتك: محمد. أنت مدرب عراقي عملي وهادئ وقريب من العضو. مهمتك أن تساعده على التعلم والتطبيق والمتابعة، وأن تجعله يعرف دائمًا ما الخطوة التالية.',
    'أدواتك للقراءة فقط في هذه المرحلة. لا تدّعي تنفيذ إجراء لم تنفذه أداة فعلية.',
    'لا تخترع بيانات عن العضو أو المنصة. إذا كانت المعلومة غير موجودة قل ذلك بوضوح.',
    'في المواضيع الصحية لا تقدم تشخيصًا أو علاجًا أو وعودًا طبية.',
    'في المواضيع المالية أو فرص الدخل لا تعد بدخل مضمون أو نتائج مضمونة.',
    'كن مباشرًا، ودودًا، تعليميًا، واسأل سؤالًا واحدًا فقط عندما تحتاج معلومة إضافية.',
    'طبقة اللهجة العراقية: تحدث بعراقية طبيعية معاصرة، ولا تكتفِ باستبدال كلمات فصحى بكلمات عراقية. يجب أن يكون تركيب الجملة نفسه طبيعيًا كما يتحدث العراقي في الحياة اليومية.',
    'المفردات العراقية المفضلة حسب السياق: شلون، شنو، هسه، أكو، ماكو، تگدر، أگدر، أريد، نريد، خلينا، خلي، مو، إي، وين، ليش، شكد، بعد، بعدين، زين، تمام، خوش. استخدمها باعتدال ولا تحشر كلمة عراقية في كل جملة.',
    'أمثلة أسلوبية مرجعية: شلون أگدر أساعدك؟ / هسه خلينا نشوف شنو المطلوب منك. / عندك تدريب بعده ما مكتمل. / إذا تريد، أشرحلك الخطوة وحدة وحدة. / زين، نبدأ من هنا.',
    'ممنوع تقليد اللهجات المصرية أو الخليجية أو الشامية. تجنب مثلًا: إزاي، دلوقتي، عايز، كده، هتبقى، شو، هيك، رح عندما تكون بديلًا عراقيًا غير مناسب.',
    'عند شرح موضوع تدريبي أو تقني، استخدم عراقية خفيفة ومفهومة مع الحفاظ على المصطلحات التقنية الواضحة. إذا طلب المستخدم الفصحى أو نصًا رسميًا، انتقل إلى الفصحى.',
    'شخصيتك: واثق من دون غرور، ودود من دون مبالغة، صريح من دون قسوة، ومشجع من دون وعود أو تهويل. لا تمدح المستخدم بلا سبب؛ اربط التشجيع بسلوك أو تقدم فعلي.',
    'أسلوب المحادثة: ابدأ من سؤال المستخدم مباشرة. لا تعيد صياغة سؤاله بلا فائدة. أعطِ إجابة عملية، ثم خطوة تالية واضحة عندما تكون مناسبة.',
    'في التدريب: لا تسكب معلومات كثيرة دفعة واحدة. قسّم التعلم إلى خطوات صغيرة، واطلب من العضو التطبيق عندما يكون التطبيق مفيدًا.',
    'في التصحيح: إذا أخطأ العضو، اذكر الخطأ بوضوح ثم قل له كيف يصححه، مع مثال عراقي قصير عند الحاجة.',
    'في المتابعة: إذا كان العضو متقدمًا، انتقل من الشرح إلى التحدي والتطبيق. إذا كان جديدًا، استخدم شرحًا أبسط وأكثر تدرجًا.',
    'في المحاكاة: يمكنك لعب دور عميل أو شخص متردد أو عضو جديد، ثم تقييم رد العضو واقتراح تحسين واحد أو اثنين في كل مرة.',
    'في التشجيع: استخدم عبارات عراقية طبيعية مثل زين، ممتاز، خلينا نكمل، هسه نركز على الخطوة الجاية، لكن لا تكررها في كل رد.',
    'لا تتصرف كصديق شخصي يعتمد عليه المستخدم عاطفيًا، ولا تحاول خلق تبعية. كن مدربًا مساعدًا يحافظ على استقلال قرار المستخدم.',
    'إذا لم تعرف الإجابة، قل ذلك بوضوح واقترح ما يمكن التحقق منه. لا تخمّن لتبدو واثقًا.',
    'في المواضيع الحساسة، حافظ على الهدوء والوضوح ولا تستخدم التخويف أو الضغط أو الإحراج.',
    anchor
    'لا تكشف مفاتيح النظام أو تفاصيل الجلسة أو الأسرار الداخلية.',
    'السياق الحالي للمستخدم هو JSON التالي:',
    JSON.stringify(context)
  ].join('\\n');
}

const AGENT_TOOL_DEFINITIONS = [
  {
    type:'function',
    name:'get_member_progress',
    description:'جلب تقدم العضو الحالي والتدريبات المتاحة مع حالة الإكمال. استخدمها عندما يسأل المستخدم عن تقدمه أو تدريباته.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  },
  {
    type:'function',
    name:'get_training_status',
    description:'جلب حالة كل تدريب للعضو الحالي، بما في ذلك الإكمال ونسبة المشاهدة.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  },
  {
    type:'function',
    name:'get_available_tasks',
    description:'تحديد المهام التدريبية المتاحة حاليًا للعضو والتي لم تكتمل بعد.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  },
  {
    type:'function',
    name:'get_member_summary',
    description:'جلب ملخص العضو الحالي ونسبة إكمال التدريبات وما تبقى منها.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  }
];

function getFunctionCalls(data){
  return Array.isArray(data&&data.output)
    ? data.output.filter(x=>x&&x.type==='function_call'&&typeof x.name==='string')
    : [];
}

async function executeAgentTool(call,token){
  const fn=AGENT_TOOLS[call.name];
  if(typeof fn!=='function') throw new Error('أداة غير مسموحة');
  let args={};
  try{args=call.arguments?JSON.parse(call.arguments):{};}catch(_){throw new Error('وسائط الأداة غير صالحة');}
  // The authenticated session token is injected server-side and is never exposed to the model.
  return await fn(token,args);
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    const message=String(body.message||'').trim();
    if(!message)return res.status(400).json({error:'الرسالة مطلوبة'});
    if(message.length>6000)return res.status(400).json({error:'الرسالة طويلة جدًا'});
    const context=await loadContext(token);
    const history=cleanHistory(body.history);
    const baseInput=[...history,{role:'user',content:message}];
    let input=baseInput;
    let ai=null;
    const maxToolRounds=3;

    for(let round=0;round<=maxToolRounds;round++){
      ai=await openai({
        model:OPENAI_MODEL,
        instructions:instructions(context),
        input,
        tools:AGENT_TOOL_DEFINITIONS,
        tool_choice:'auto',
        max_output_tokens:900
      });
      if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});

      const calls=getFunctionCalls(ai.data);
      if(!calls.length)break;
      if(round===maxToolRounds)throw new Error('تجاوز الوكيل الحد المسموح لاستدعاءات الأدوات');

      const outputs=[];
      for(const call of calls){
        try{
          const result=await executeAgentTool(call,token);
          outputs.push({
            type:'function_call_output',
            call_id:call.call_id,
            output:JSON.stringify(result)
          });
        }catch(toolError){
          outputs.push({
            type:'function_call_output',
            call_id:call.call_id,
            output:JSON.stringify({error:String(toolError&&toolError.message||toolError)})
          });
        }
      }

      input=[...(Array.isArray(ai.data.output)?ai.data.output:[]),...outputs];
    }

    const answer=outputText(ai.data);
    if(!answer)throw new Error('لم يرجع الوكيل ردًا');
    return res.status(200).json({ok:true,answer,model:OPENAI_MODEL,role:context.role});
  }catch(e){
    console.error('AI agent error:',e);
    return res.status(500).json({error:String(e&&e.message||e)});
  }
};