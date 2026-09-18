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

function detectSessionCommand(message){
  const s=String(message||'').trim().toLowerCase();
  if(/انهي|انهِ|أنهي|انتهت|خلصنا|وقف الجلسة|إنهاء الجلسة|انهاء الجلسة/.test(s))
    return {action:'end'};
  if(/ابدأ جلسة|ابدأ|خلينا نسوي جلسة|خلينا نبدأ جلسة|جلسة تدريب|جلسة ممارسة|جلسة تمثيل|جلسة مراجعة/.test(s)){
    let type='coaching';
    if(/تمثيل|roleplay|عميل|متردد/.test(s)) type='roleplay';
    else if(/ممارسة|تطبيق/.test(s)) type='practice';
    else if(/مراجعة|راجع/.test(s)) type='review';
    const objective=s.replace(/.*?(جلسة تدريب|جلسة ممارسة|جلسة تمثيل|جلسة مراجعة|جلسة)/,'').trim();
    return {action:'start',session_type:type,objective:objective||null};
  }
  return null;
}

async function loadAgentSession(token){
  const r=await supabaseRpc('get_ai_agent_coaching_session',{p_token:token});
  if(!r.ok||!Array.isArray(r.data)||!r.data[0]) return null;
  const s=r.data[0];
  return {
    active:!!s.active,
    session_type:s.session_type||'coaching',
    objective:s.objective||null,
    phase:s.phase||'discover',
    turn_count:Number(s.turn_count||0),
    started_at:s.started_at||null
  };
}

async function saveAgentSession(token,session){
  if(!session) return null;
  const r=await supabaseRpc('upsert_ai_agent_coaching_session',{
    p_token:token,
    p_active:!!session.active,
    p_session_type:session.session_type||'coaching',
    p_objective:session.objective||null,
    p_phase:session.phase||'discover',
    p_turn_count:Number(session.turn_count||0),
    p_started_at:session.started_at||null
  });
  return r.ok ? true : false;
}

async function extractSessionUpdate(message,answer,currentSession){
  if(!currentSession?.active) return null;
  const prompt=[
    'حلل دور محمد في جلسة تدريبية مستمرة، واستخرج الحالة الجديدة للجلسة فقط.',
    'لا تخترع هدفًا غير مذكور. لا تحفظ معلومات حساسة.',
    'phase يجب أن تكون واحدة من discover,explain,practice,feedback,next_step,complete.',
    'إذا كان محمد يشرح مفهومًا فاختر explain. إذا كان العضو يطبق أو يؤدي تمرينًا فاختر practice. إذا كان محمد يقيم أو يصحح فاختر feedback. إذا انتقلا للخطوة التالية فاختر next_step. إذا اكتملت الجلسة فاختر complete.',
    'أعد JSON فقط بالمفاتيح: phase, objective.',
    'الحالة الحالية:',
    JSON.stringify(currentSession),
    'رسالة العضو:',
    String(message).slice(0,5000),
    'رد محمد:',
    String(answer).slice(0,5000)
  ].join('\\n');
  try{
    const r=await openai({
      model:OPENAI_MODEL,
      instructions:'أنت محلل حالة جلسة تدريبية. أعد JSON فقط.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:180
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start) return null;
    const p=JSON.parse(text.slice(start,end+1));
    const phases=['discover','explain','practice','feedback','next_step','complete'];
    return {
      phase:phases.includes(p.phase)?p.phase:currentSession.phase,
      objective:p.objective||currentSession.objective||null
    };
  }catch(_){return null;}
}

async function loadAgentProfile(token){
  const r=await supabaseRpc('get_ai_agent_coaching_profile',{p_token:token});
  if(!r.ok||!Array.isArray(r.data)||!r.data[0]) return null;
  const p=r.data[0];
  return {
    goal:p.goal||null,
    experience_level:p.experience_level||'unknown',
    focus_area:p.focus_area||null,
    strengths:Array.isArray(p.strengths)?p.strengths.slice(0,8):[],
    gaps:Array.isArray(p.gaps)?p.gaps.slice(0,8):[],
    current_next_step:p.current_next_step||null
  };
}

async function saveAgentProfile(token,profile){
  if(!profile) return null;
  const strengths=Array.isArray(profile.strengths)?profile.strengths.map(x=>String(x||'').trim()).filter(Boolean).slice(0,8):[];
  const gaps=Array.isArray(profile.gaps)?profile.gaps.map(x=>String(x||'').trim()).filter(Boolean).slice(0,8):[];
  const r=await supabaseRpc('upsert_ai_agent_coaching_profile',{
    p_token:token,
    p_goal:profile.goal||null,
    p_experience_level:profile.experience_level||'unknown',
    p_focus_area:profile.focus_area||null,
    p_strengths:strengths,
    p_gaps:gaps,
    p_current_next_step:profile.current_next_step||null
  });
  return r.ok ? true : false;
}

function profileUpdateLikely(message){
  const s=String(message||'').toLowerCase();
  return /هدفي|هدفي هو|اريد|أريد|أحتاج|احتاج|أطمح|اطمح|خبرتي|مبتدئ|متوسط|متقدم|أواجه|اواجه|ضعيف|قوي|أطور|اطور|تركيزي|مجالي|الخطوة الجاية|الخطوة القادمة|أريد أتعلم/.test(s);
}

async function extractProfileUpdate(message,answer,currentProfile){
  if(!profileUpdateLikely(message)) return null;
  const prompt=[
    'استخرج من الرسالة التالية معلومات coaching صريحة فقط لتحديث ملف المتدرب.',
    'ممنوع التخمين أو استنتاج معلومات شخصية غير مذكورة.',
    'لا تحفظ معلومات صحية أو سياسية أو أسرارًا أو أرقامًا حساسة.',
    'أعد JSON صالحًا فقط بالمفاتيح: goal, experience_level, focus_area, strengths, gaps, current_next_step.',
    'لكل قيمة غير مؤكدة استخدم null أو []، وexperience_level واحدة من unknown,beginner,intermediate,advanced.',
    'اجعل القوائم قصيرة ومحددة.',
    'الملف الحالي:',
    JSON.stringify(currentProfile||{}),
    'رسالة العضو:',
    String(message).slice(0,5000),
    'رد محمد:',
    String(answer).slice(0,5000)
  ].join('\\n');
  try{
    const r=await openai({
      model:OPENAI_MODEL,
      instructions:'أنت محلل ذاكرة تدريبية. لا تضف أي معلومة غير موجودة صراحة في النص. أعد JSON فقط.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:450
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    if(!text) return null;
    const start=text.indexOf('{'), end=text.lastIndexOf('}');
    if(start<0||end<=start) return null;
    const p=JSON.parse(text.slice(start,end+1));
    const allowed=['unknown','beginner','intermediate','advanced'];
    return {
      goal:p.goal||null,
      experience_level:allowed.includes(p.experience_level)?p.experience_level:'unknown',
      focus_area:p.focus_area||null,
      strengths:Array.isArray(p.strengths)?p.strengths:[],
      gaps:Array.isArray(p.gaps)?p.gaps:[],
      current_next_step:p.current_next_step||null
    };
  }catch(_){return null;}
}

async function loadAgentMemory(token){
  const r=await supabaseRpc('get_ai_agent_memory',{p_token:token,p_limit:24});
  if(!r.ok) return [];
  return Array.isArray(r.data)
    ? r.data.map(x=>{
        const role=String(x&&x.role||'').toLowerCase()==='assistant'?'assistant':'user';
        const content=String(x&&x.content||'').trim().slice(0,5000);
        return content?{role,content}:null;
      }).filter(Boolean)
    : [];
}

async function saveAgentMessage(token,role,content){
  const text=String(content||'').trim();
  if(!text) return null;
  const r=await supabaseRpc('save_ai_agent_message',{
    p_token:token,
    p_role:role,
    p_content:text.slice(0,6000)
  });
  return r.ok ? r.data : null;
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
  async get_member_assessment_performance(token){
    const ctx = await loadContext(token);
    if(ctx.role!=='member') throw new Error('هذه الأداة مخصصة للعضو');
    const r = await supabaseRpc('training_assessment_bootstrap',{p_token:token});
    if(!r.ok) throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'تعذر قراءة نتائج الاختبارات');
    const d = r.data||{};
    const answers = Array.isArray(d.my_answers)?d.my_answers:[];
    const latest = new Map();
    for(const a of answers){
      const key=String(a.question_id||'');
      const prev=latest.get(key);
      if(!prev || Number(a.attempt_no||0)>Number(prev.attempt_no||0) || (Number(a.attempt_no||0)===Number(prev.attempt_no||0) && String(a.created_at||'')>String(prev.created_at||''))){
        latest.set(key,a);
      }
    }
    const byLesson=new Map();
    for(const a of latest.values()){
      // Match question -> lesson through assessment bootstrap questions.
      const questionId=String(a.question_id||'');
      let lessonNo=null,lessonTitle=null;
      for(const lesson of (Array.isArray(d.assessments)?d.assessments:[])){
        const q=(Array.isArray(lesson.questions)?lesson.questions:[]).find(x=>String(x.id||'')===questionId);
        if(q){lessonNo=lesson.lesson_no;lessonTitle=lesson.lesson_title;break;}
      }
      const key=String(lessonNo||'unknown');
      if(!byLesson.has(key)) byLesson.set(key,{lesson_no:lessonNo,lesson_title:lessonTitle,answered:0,total_score:0,approved:0,retry:0,pending:0});
      const row=byLesson.get(key);
      row.answered++;
      row.total_score+=Number(a.score||0);
      const st=String(a.status||'pending');
      if(st==='approved') row.approved++;
      else if(st==='retry') row.retry++;
      else row.pending++;
    }
    const lessons=[...byLesson.values()].map(x=>({
      ...x,
      average_score:x.answered?Math.round(x.total_score/x.answered):0
    }));
    return {
      total_answered:[...latest.values()].length,
      approved:[...latest.values()].filter(x=>x.status==='approved').length,
      retry:[...latest.values()].filter(x=>x.status==='retry').length,
      pending:[...latest.values()].filter(x=>!x.status||x.status==='pending').length,
      average_score:[...latest.values()].length
        ? Math.round([...latest.values()].reduce((n,x)=>n+Number(x.score||0),0)/[...latest.values()].length)
        : 0,
      lessons
    };
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
    'عند الحاجة إلى تحليل مستوى العضو أو نقاط قوته وضعفه في الاختبارات، استخدم أداة أداء الاختبارات بدل الاعتماد على الانطباع من المحادثة فقط.',
    'في المحاكاة: يمكنك لعب دور عميل أو شخص متردد أو عضو جديد، ثم تقييم رد العضو واقتراح تحسين واحد أو اثنين في كل مرة.',
    'في التشجيع: استخدم عبارات عراقية طبيعية مثل زين، ممتاز، خلينا نكمل، هسه نركز على الخطوة الجاية، لكن لا تكررها في كل رد.',
    'لا تتصرف كصديق شخصي يعتمد عليه المستخدم عاطفيًا، ولا تحاول خلق تبعية. كن مدربًا مساعدًا يحافظ على استقلال قرار المستخدم.',
    'إذا لم تعرف الإجابة، قل ذلك بوضوح واقترح ما يمكن التحقق منه. لا تخمّن لتبدو واثقًا.',
    'في المواضيع الحساسة، حافظ على الهدوء والوضوح ولا تستخدم التخويف أو الضغط أو الإحراج.',
    'إذا كانت هناك جلسة تدريبية نشطة، تصرف كمدرب جلسة لا كمجيب عادي: التزم بمرحلتها الحالية، اسأل سؤالًا واحدًا في كل مرة عند الحاجة، واطلب من العضو التطبيق قبل الانتقال إلى التقييم أو الخطوة التالية.',
    'في جلسة roleplay، مثّل الشخصية المطلوبة بصورة واقعية ولا تعطِ الإجابة النموذجية قبل أن يحاول العضو، ثم قدّم ملاحظات محددة بعد المحاولة.',
    'في جلسة practice، اجعل التفاعل عمليًا: سؤال، محاولة من العضو، تصحيح، ثم محاولة محسنة.',
    'إذا بدأ المستخدم جلسة جديدة، رحّب به باختصار وحدد الهدف والمرحلة الأولى. إذا طلب إنهاء الجلسة، أنهِها بخلاصة قصيرة وخطوة تالية.',
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
    name:'get_member_assessment_performance',
    description:'قراءة أداء العضو في اختبارات التدريبات الفعلية، بما في ذلك الدرجات وحالات approved/retry ومتوسط الأداء لكل تدريب. استخدمها عند تحليل نقاط القوة والضعف أو اقتراح مراجعة.',
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
    const sessionCommand=detectSessionCommand(message);
    let currentSession=await loadAgentSession(token);
    if(sessionCommand?.action==='end'){
      currentSession={...(currentSession||{}),active:false,session_type:currentSession?.session_type||'coaching',objective:currentSession?.objective||null,phase:'complete',turn_count:currentSession?.turn_count||0,started_at:currentSession?.started_at||null};
      await saveAgentSession(token,currentSession).catch(()=>null);
    }else if(sessionCommand?.action==='start'){
      currentSession={active:true,session_type:sessionCommand.session_type||'coaching',objective:sessionCommand.objective||null,phase:'discover',turn_count:0,started_at:new Date().toISOString()};
      await saveAgentSession(token,currentSession).catch(()=>null);
    }
    const [persistentMemory,coachingProfile]=await Promise.all([
      loadAgentMemory(token),
      loadAgentProfile(token)
    ]);
    const fallbackHistory=cleanHistory(body.history);
    const history=(persistentMemory.length?persistentMemory:fallbackHistory).slice(-24);
    const baseInput=[...history,{role:'user',content:message}];
    const enrichedContext={...context,coaching_profile:coachingProfile,coaching_session:currentSession};
    let input=baseInput;
    let ai=null;
    const maxToolRounds=3;

    for(let round=0;round<=maxToolRounds;round++){
      ai=await openai({
        model:OPENAI_MODEL,
        instructions:instructions(enrichedContext),
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

    // Persist the successful turn so محمد can continue naturally across future sessions.
    await saveAgentMessage(token,'user',message).catch(()=>null);
    await saveAgentMessage(token,'assistant',answer).catch(()=>null);

    if(currentSession?.active){
      const sessionUpdate=await extractSessionUpdate(message,answer,currentSession);
      const nextSession={
        ...currentSession,
        ...(sessionUpdate||{}),
        turn_count:Number(currentSession.turn_count||0)+1
      };
      await saveAgentSession(token,nextSession).catch(()=>null);
      currentSession=nextSession;
    }

    const profileUpdate=await extractProfileUpdate(message,answer,coachingProfile);
    if(profileUpdate){
      const merged={
        ...(coachingProfile||{}),
        ...profileUpdate,
        goal:profileUpdate.goal||coachingProfile?.goal||null,
        focus_area:profileUpdate.focus_area||coachingProfile?.focus_area||null,
        current_next_step:profileUpdate.current_next_step||coachingProfile?.current_next_step||null,
        experience_level:profileUpdate.experience_level==='unknown'?(coachingProfile?.experience_level||'unknown'):profileUpdate.experience_level,
        strengths:Array.from(new Set([...(coachingProfile?.strengths||[]),...(profileUpdate.strengths||[])])).slice(-8),
        gaps:Array.from(new Set([...(coachingProfile?.gaps||[]),...(profileUpdate.gaps||[])])).slice(-8)
      };
      await saveAgentProfile(token,merged).catch(()=>null);
    }

    return res.status(200).json({ok:true,answer,model:OPENAI_MODEL,role:context.role});
  }catch(e){
    console.error('AI agent error:',e);
    return res.status(500).json({error:String(e&&e.message||e)});
  }
};