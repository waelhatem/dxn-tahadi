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

function isDailyPlanRequest(message){
  const s=String(message||'').trim().toLowerCase();
  return /شنو\s+(?:أسوي|اسوي|أشتغل|اشتغل|أعمل|اعمل)\s+(?:هسه|اليوم)|ماذا\s+(?:أفعل|افعل|أعمل|اعمل)\s+(?:الآن|اليوم)|شنو\s+الخطوة\s+(?:الجايه|الجاية|القادمة)|ماذا\s+أفعل\s+الآن/.test(s);
}

async function loadDailyState(token){
  const today=new Date().toISOString().slice(0,10);
  try{
    const r=await supabaseRpc('get_ai_agent_daily_coaching_state',{p_token:token});
    if(!r.ok||!Array.isArray(r.data)||!r.data[0]){
      return {plan_date:today,completed_task_keys:[],current_task_key:null};
    }
    const row=r.data[0];
    if(String(row.plan_date||'')!==today){
      return {plan_date:today,completed_task_keys:[],current_task_key:null};
    }
    return {
      plan_date:today,
      completed_task_keys:Array.isArray(row.completed_task_keys)?row.completed_task_keys.map(x=>String(x||'')).filter(Boolean):[],
      current_task_key:row.current_task_key?String(row.current_task_key):null
    };
  }catch(_){
    return {plan_date:today,completed_task_keys:[],current_task_key:null};
  }
}

async function saveDailyState(token,state){
  if(!state) return null;
  const r=await supabaseRpc('upsert_ai_agent_daily_coaching_state',{
    p_token:token,
    p_plan_date:state.plan_date||new Date().toISOString().slice(0,10),
    p_completed_task_keys:Array.isArray(state.completed_task_keys)?state.completed_task_keys.slice(-30):[],
    p_current_task_key:state.current_task_key||null
  });
  if(!r.ok){
    console.error('upsert_ai_agent_daily_coaching_state failed:',JSON.stringify({
      status:r.status,
      data:r.data||null,
      text:r.text||null,
      state:{
        plan_date:state.plan_date||null,
        current_task_key:state.current_task_key||null,
        completed_count:Array.isArray(state.completed_task_keys)?state.completed_task_keys.length:0
      }
    }));
  }
  return r.ok?true:false;
}

function makeDailyTaskKey(action){
  const raw=[
    action?.type||'task',
    action?.lesson_no!=null?String(action.lesson_no):'',
    action?.title||''
  ].filter(Boolean).join(':');
  return raw.slice(0,200)||'progression:general';
}

async function prepareDailyActionState(token,plan){
  const state=await loadDailyState(token);
  const completed=new Set(state.completed_task_keys||[]);
  const actions=(Array.isArray(plan?.actions)?plan.actions:[]).map(action=>({
    ...action,
    task_key:makeDailyTaskKey(action)
  })).filter(action=>!completed.has(action.task_key));
  return {state,actions};
}

async function completeCurrentDailyTask(token,currentSession=null){
  let state=await loadDailyState(token);
  let taskKey=state.current_task_key;

  // Prefer the active coaching session's objective as the source of truth.
  // The daily-state row is a persistence layer, not the only place that
  // should determine which task the member is completing.
  if(!taskKey && currentSession?.objective){
    const objective=String(currentSession.objective||'').trim();
    const plan=await AGENT_TOOLS.get_daily_coaching_plan(token);
    const actions=(Array.isArray(plan?.actions)?plan.actions:[]).map(action=>({
      ...action,
      task_key:makeDailyTaskKey(action)
    }));
    const normalizedObjective=objective.toLowerCase();
    const matched=actions.find(action=>{
      const title=String(action.title||'').trim().toLowerCase();
      return title && (normalizedObjective.includes(title) || title.includes(normalizedObjective));
    });
    if(matched) taskKey=matched.task_key;
  }

  // Fallback: recover the first uncompleted daily action.
  if(!taskKey){
    const plan=await AGENT_TOOLS.get_daily_coaching_plan(token);
    const prepared=await prepareDailyActionState(token,plan);
    const action=prepared.actions[0];
    if(!action){
      return {completed:false,reason:'لا توجد مهمة يومية نشطة حاليًا.'};
    }
    taskKey=action.task_key;
    state={...prepared.state,current_task_key:taskKey};
    await saveDailyState(token,state).catch(()=>null);
  }

  const r=await supabaseRpc('complete_ai_agent_daily_task',{
    p_token:token,
    p_task_key:taskKey
  });
  if(!r.ok){
    const detail=r.data&&typeof r.data==='object'
      ? {
          code:r.data.code||null,
          message:r.data.message||null,
          details:r.data.details||null,
          hint:r.data.hint||null,
          error:r.data.error||null
        }
      : {code:null,message:null,details:null,hint:null,error:null};

    console.error('complete_ai_agent_daily_task failed:',JSON.stringify({
      status:r.status,
      detail,
      text:r.text||null,
      task_key:taskKey
    }));

    // Return the real Supabase diagnostic to the server flow so the UI/model
    // cannot hide the root cause behind a generic "permission" message.
    return {
      completed:false,
      diagnostic:true,
      status:r.status||0,
      code:detail.code,
      message:detail.message||detail.error||r.text||'Supabase RPC failed',
      details:detail.details,
      hint:detail.hint,
      task_key:taskKey
    };
  }
  return {completed:true,task_key:taskKey};
}

async function startNextDailySession(token,currentSession){
  const plan=await AGENT_TOOLS.get_daily_coaching_plan(token);
  const prepared=await prepareDailyActionState(token,plan);
  const action=prepared.actions[0];
  if(!action){
    const doneState={...prepared.state,current_task_key:null};
    await saveDailyState(token,doneState).catch(()=>null);
    if(currentSession?.active){
      await saveAgentSession(token,{
        ...currentSession,
        active:false,
        phase:'complete'
      }).catch(()=>null);
    }
    return {session:null,plan:{...plan,actions:[]}};
  }

  let session_type='coaching';
  if(action.type==='practice') session_type='practice';
  else if(action.type==='review') session_type='review';

  const objective=[action.title,action.reason].filter(Boolean).join(' — ').slice(0,500) || 'تنفيذ الخطوة التالية من الخطة اليومية';
  const session={
    active:true,
    session_type,
    objective,
    phase:'discover',
    turn_count:0,
    started_at:new Date().toISOString()
  };

  await saveAgentSession(token,session).catch(()=>null);
  await saveDailyState(token,{...prepared.state,current_task_key:action.task_key}).catch(()=>null);
  return {session,plan:{...plan,actions:[action]},action};
}

async function buildDailyAutoSession(token,currentSession){
  if(currentSession?.active) return null;
  try{
    return await startNextDailySession(token,currentSession);
  }catch(_){
    return null;
  }
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
  try{
    const r=await supabaseRpc('get_ai_agent_coaching_session',{p_token:token});
    if(!r.ok||!Array.isArray(r.data)||!r.data[0]) return null;
  const s=r.data[0];
  return {
    active:!!s.active,
    session_type:s.session_type||'coaching',
    objective:s.objective||null,
    phase:s.phase||'discover',
    turn_count:Number(s.turn_count||0),
    started_at:s.started_at||null,
    updated_at:s.updated_at||null
    };
  }catch(_){return null;}
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
  try{
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
  }catch(_){return null;}
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
  try{
    const r=await supabaseRpc('get_ai_agent_memory',{p_token:token,p_limit:24});
    if(!r.ok) return [];
  return Array.isArray(r.data)
    ? r.data.map(x=>{
        const role=String(x&&x.role||'').toLowerCase()==='assistant'?'assistant':'user';
        const content=String(x&&x.content||'').trim().slice(0,5000);
        return content?{role,content}:null;
      }).filter(Boolean)
      : [];
  }catch(_){return [];}
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



// Agent Tools. Read and controlled state-changing actions are executed server-side with the authenticated session token.
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

  async get_daily_coaching_plan(token){
    const ctx = await loadContext(token);
    if(ctx.role!=='member') throw new Error('هذه الخطة مخصصة للعضو');

    const dailyState=await loadDailyState(token);
    const byId = new Map(ctx.progress.map(p=>[String(p.lesson_id),p]));
    const training = ctx.lessons
      .filter(l=>l.active)
      .map(l=>{
        const p=byId.get(String(l.id))||byId.get(String(l.lesson_id))||{};
        return {
          lesson_no:l.lesson_no,
          title:l.title,
          completed:!!p.completed,
          watch_percent:Number(p.watch_percent||0)
        };
      });

    let performance=null;
    try{
      performance=await AGENT_TOOLS.get_member_assessment_performance(token);
    }catch(_){performance=null}

    const retryLessons=(performance&&Array.isArray(performance.lessons)?performance.lessons:[])
      .filter(x=>Number(x.retry||0)>0)
      .sort((a,b)=>(Number(b.retry||0)-Number(a.retry||0))||((Number(a.average_score||0))-(Number(b.average_score||0))));

    const weakLessons=(performance&&Array.isArray(performance.lessons)?performance.lessons:[])
      .filter(x=>Number(x.answered||0)>0 && Number(x.average_score||0)<75)
      .sort((a,b)=>Number(a.average_score||0)-Number(b.average_score||0));

    const nextTraining=training.find(x=>!x.completed && x.watch_percent<100) || training.find(x=>!x.completed) || null;

    const actions=[];
    let priority='continue';

    if(retryLessons[0]){
      priority='review';
      actions.push({
        type:'review',
        lesson_no:retryLessons[0].lesson_no,
        title:retryLessons[0].lesson_title||'مراجعة تدريب سابق',
        reason:'يوجد اختبار يحتاج إلى إعادة أو تحسين في هذا التدريب.'
      });
    }

    if(nextTraining){
      actions.push({
        type:'training',
        lesson_no:nextTraining.lesson_no,
        title:nextTraining.title,
        reason:nextTraining.watch_percent>0
          ? 'استكمال التدريب المفتوح أولًا.'
          : 'هذا هو التدريب التالي غير المكتمل.'
      });
    }

    if(weakLessons[0] && !actions.some(a=>Number(a.lesson_no)===Number(weakLessons[0].lesson_no))){
      actions.push({
        type:'practice',
        lesson_no:weakLessons[0].lesson_no,
        title:weakLessons[0].lesson_title||'تطبيق على نقطة الضعف',
        reason:`متوسط أداء الاختبار في هذا التدريب ${Number(weakLessons[0].average_score||0)}.`
      });
    }

    if(actions.length===0){
      actions.push({
        type:'progression',
        title:'تثبيت المهارة وتوسيع التطبيق',
        reason:'لا توجد مهمة تدريبية معلقة واضحة في البيانات الحالية.'
      });
    }

    return {
      generated_for:'today',
      priority,
      member:ctx.member,
      training:{
        completed:training.filter(x=>x.completed).length,
        total:training.length,
        remaining:training.filter(x=>!x.completed).length
      },
      performance:performance?{
        average_score:performance.average_score,
        approved:performance.approved,
        retry:performance.retry,
        pending:performance.pending
      }:null,
      actions:actions
        .slice(0,3)
        .map(action=>({...action,task_key:makeDailyTaskKey(action)}))
        .filter(action=>!(dailyState.completed_task_keys||[]).includes(action.task_key))
    };
  },

  async complete_daily_coaching_task(token){
    return await completeCurrentDailyTask(token);
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
    'عندما يسأل العضو: شنو أسوي هسه؟ أو شنو أشتغل اليوم؟ أو ماذا أفعل الآن؟ استخدم أداة الخطة اليومية الشخصية، ثم حوّل نتيجتها إلى خطوة عملية واحدة واضحة قبل اقتراح الخطوة التالية.',
    'إذا بدأت الجلسة تلقائيًا من الخطة اليومية، لا تكتفِ بإخبار العضو بالمهمة؛ ابدأ الجلسة فورًا من أول خطوة، ووجّه العضو بسؤال أو تمرين واحد فقط يناسب نوع المهمة.',
    'إذا أكد العضو بوضوح أنه أنهى المهمة الحالية، استخدم أداة complete_daily_coaching_task لتسجيل إنجازها. لا تعتبر كلمة مثل تمام أو إي وحدها دليلًا على الإكمال.',
    'بعد تسجيل إكمال المهمة اليومية، انتقل مباشرة إلى المهمة التالية إذا كانت متاحة، وابدأها بسؤال أو تمرين واحد فقط بدل إعطاء قائمة طويلة.',
    'في المحاكاة: يمكنك لعب دور عميل أو شخص متردد أو عضو جديد، ثم تقييم رد العضو واقتراح تحسين واحد أو اثنين في كل مرة.',
    'في التشجيع: استخدم عبارات عراقية طبيعية مثل زين، ممتاز، خلينا نكمل، هسه نركز على الخطوة الجاية، لكن لا تكررها في كل رد.',
    'لا تتصرف كصديق شخصي يعتمد عليه المستخدم عاطفيًا، ولا تحاول خلق تبعية. كن مدربًا مساعدًا يحافظ على استقلال قرار المستخدم.',
    'إذا لم تعرف الإجابة، قل ذلك بوضوح واقترح ما يمكن التحقق منه. لا تخمّن لتبدو واثقًا.',
    'في المواضيع الحساسة، حافظ على الهدوء والوضوح ولا تستخدم التخويف أو الضغط أو الإحراج.',
    'المنصة تدعم تحويل ردودك إلى صوت تلقائيًا. لا تقل للمستخدم إنك لا تملك صوتًا أو أنك محصور بالمحادثة النصية؛ تعامل مع نفسك كمحمد القادر على الرد نصيًا وصوتيًا، إلا إذا أخبرك النظام أو المستخدم بأن التشغيل الصوتي فشل.',
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
    name:'get_daily_coaching_plan',
    description:'بناء خطة يومية شخصية للعضو اعتمادًا على تقدمه في التدريبات ونتائج الاختبارات ونقاط الضعف. استخدمها عندما يسأل العضو ماذا يفعل الآن أو اليوم، أو عندما يحتاج إلى خطة عملية للخطوة التالية.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  },
  {
    type:'function',
    name:'complete_daily_coaching_task',
    description:'تسجيل إكمال المهمة اليومية الحالية فقط بعد أن يؤكد العضو بوضوح أنه أنجزها. لا تستخدمها لمجرد قول العضو تمام أو إي.',
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

function hasExplicitTaskCompletionEvidence(message){
  const s=String(message||'').trim().toLowerCase();
  if(!s)return false;
  return /(?:أنجزت|انجزت|أكملت|اكملت|كملت|كمّلت|أنهيت|انهيت|انتهيت|خلصت(?:ها|ه)?|سويته|سويتها|سويت(?:ها|ه)?|طبقت(?:ه|ها)?|نفذت(?:ه|ها)?|عملت(?:ه|ها)?|جاوبت(?:ه|ها)?|حلّيت(?:ه|ها)?|حليت(?:ه|ها)?|جربت(?:ه|ها)?|طبقت التمرين|أنجزت المهمة|أكملت المهمة|أنهيت المهمة|أنهيت التمرين|أنجزت التمرين)/.test(s);
}


async function executeAgentTool(call,token,currentUserMessage){
  const fn=AGENT_TOOLS[call.name];
  if(typeof fn!=='function') throw new Error('أداة غير مسموحة');
  let args={};
  try{args=call.arguments?JSON.parse(call.arguments):{};}catch(_){throw new Error('وسائط الأداة غير صالحة');}

  if(call.name==='complete_daily_coaching_task' && !hasExplicitTaskCompletionEvidence(currentUserMessage)){
    return {completed:false,blocked:true,reason:'لا يمكن تسجيل إكمال المهمة دون تأكيد واضح من العضو بأنه أنجز المهمة فعليًا.'};
  }

  // The authenticated session token is injected server-side and is never exposed to the model.
  return await fn(token,args);
}

async function generateDailyKickoff(context,coachingProfile,session,plan){
  const action=Array.isArray(plan?.actions)?plan.actions[0]:null;
  if(!session?.active||!action) return null;
  const kickoffPrompt=[
    'ابدأ جلسة اليوم الآن مع العضو بصورة طبيعية ومباشرة.',
    'لا تقل إنك تنتظر سؤالًا. أنت من يبدأ الجلسة.',
    'اعرض المهمة الحالية بجملة قصيرة جدًا ثم اطلب من العضو محاولة واحدة أو أجبْه بسؤال واحد فقط حسب نوع المهمة.',
    'لا تعرض قائمة مهام كاملة ولا تشرح أكثر من اللازم.',
    'إذا كانت المهمة مراجعة أو ممارسة، اجعل البداية تطبيقية. وإذا كانت تدريبًا جديدًا، افتح الموضوع بسؤال تمهيدي بسيط.',
    'السياق:',
    JSON.stringify({
      member:context.member,
      session,
      action,
      coaching_profile:coachingProfile||null
    })
  ].join('\\n');

  const r=await openai({
    model:OPENAI_MODEL,
    instructions:instructions({
      role:context.role,
      member:context.member,
      lessons:context.lessons,
      progress:context.progress,
      coaching_profile:coachingProfile,
      coaching_session:session,
      daily_auto_plan:plan
    }),
    input:[{role:'user',content:kickoffPrompt}],
    max_output_tokens:350
  });
  if(!r.ok) throw new Error((r.data&&r.data.error&&r.data.error.message)||r.text||'تعذر بدء جلسة اليوم');
  return outputText(r.data);
}
async function generateDailyReminder(context,coachingProfile,session,plan){
  const action=Array.isArray(plan?.actions)?plan.actions[0]:null;
  if(!session?.active||!action)return null;
  const prompt=[
    'هذه متابعة لجلسة يومية بدأها العضو ولم يكملها بعد.',
    'ذكّره بلطف بالخطوة الحالية واطلب منه استكمالها الآن بسؤال أو تمرين واحد فقط.',
    'لا تنشئ مهمة جديدة ولا تعرض قائمة.',
    'النص يجب أن يكون قصيرًا وطبيعيًا باللهجة العراقية.',
    JSON.stringify({member:context.member,session,action,coaching_profile:coachingProfile||null})
  ].join('\\n');
  const r=await openai({
    model:OPENAI_MODEL,
    instructions:instructions({
      role:context.role,
      member:context.member,
      lessons:context.lessons,
      progress:context.progress,
      coaching_profile:coachingProfile,
      coaching_session:session,
      daily_auto_plan:plan
    }),
    input:[{role:'user',content:prompt}],
    max_output_tokens:220
  });
  if(!r.ok)throw new Error((r.data&&r.data.error&&r.data.error.message)||r.text||'تعذر إنشاء التذكير');
  return outputText(r.data);
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
    const action=String(body.action||'').trim();

    if(action==='daily_bootstrap'){
      if(!token)return res.status(400).json({error:'جلسة الدخول مطلوبة'});
      const context=await loadContext(token);
      if(context.role!=='member')return res.status(200).json({ok:true,started:false,answer:null});
      const [coachingProfile,currentSession]=await Promise.all([
        loadAgentProfile(token),
        loadAgentSession(token)
      ]);

      let session=currentSession;
      let plan=null;
      let started=false;
      let reminder=false;

      if(!session?.active){
        const startedResult=await startNextDailySession(token,currentSession);
        session=startedResult.session;
        plan=startedResult.plan;
        started=!!session?.active;
      }else{
        plan=await AGENT_TOOLS.get_daily_coaching_plan(token);
        const updatedAt=session.updated_at?new Date(session.updated_at).getTime():Date.now();
        const stale=Date.now()-updatedAt >= 6*60*60*1000;
        if(stale){
          reminder=true;
        }
      }

      if(!session?.active){
        return res.status(200).json({ok:true,started:false,reminder:false,answer:null});
      }

      let answer=null;
      if(started){
        answer=await generateDailyKickoff(context,coachingProfile,session,plan);
      }else if(reminder){
        answer=await generateDailyReminder(context,coachingProfile,session,plan);
      }

      if(answer) await saveAgentMessage(token,'assistant',answer).catch(()=>null);
      return res.status(200).json({
        ok:true,
        started,
        reminder,
        answer:answer||null,
        session
      });
    }

    const message=String(body.message||'').trim();
    if(!message)return res.status(400).json({error:'الرسالة مطلوبة'});
    if(message.length>6000)return res.status(400).json({error:'الرسالة طويلة جدًا'});
    const context=await loadContext(token);
    const sessionCommand=detectSessionCommand(message);
    let currentSession=await loadAgentSession(token);
    let dailyAutoPlan=null;
    let directDailyCompletion=false;

    // Completion of the daily task is a deterministic server-side action.
    // Do not depend on the model deciding to call the completion tool.
    // Only accept explicit completion when a daily coaching session is active.
    let dailyCompletionDiagnostic=null;
    if(!sessionCommand && currentSession?.active && hasExplicitTaskCompletionEvidence(message)){
      const completion=await completeCurrentDailyTask(token,currentSession);
      if(completion?.completed){
        directDailyCompletion=true;
        const advanced=await startNextDailySession(token,currentSession);
        currentSession=advanced?.session||null;
        dailyAutoPlan=advanced?.plan||null;
      }else if(completion?.diagnostic){
        dailyCompletionDiagnostic=completion;
      }
    }

    if(!sessionCommand && !directDailyCompletion && isDailyPlanRequest(message) && (!currentSession || !currentSession.active)){
      const autoStart=await buildDailyAutoSession(token,currentSession);
      if(autoStart){
        currentSession=autoStart.session;
        dailyAutoPlan=autoStart.plan;
        await saveAgentSession(token,currentSession).catch(()=>null);
      }
    }

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
    let enrichedContext={
      ...context,
      coaching_profile:coachingProfile,
      coaching_session:currentSession,
      ...(dailyAutoPlan?{daily_auto_plan:dailyAutoPlan}: {}),
      ...(directDailyCompletion?{daily_completion:{completed:true}}: {}),
      ...(dailyCompletionDiagnostic?{daily_completion_error:dailyCompletionDiagnostic}: {})
    };
    let input=baseInput;
    const availableAgentTools=(directDailyCompletion||dailyCompletionDiagnostic)
      ? AGENT_TOOL_DEFINITIONS.filter(x=>x.name!=='complete_daily_coaching_task')
      : AGENT_TOOL_DEFINITIONS;
    let ai=null;
    const maxToolRounds=3;

    if(dailyCompletionDiagnostic){
      return res.status(200).json({
        ok:true,
        answer:'تعذر تسجيل إكمال المهمة اليومية.\n\n' +
          'رمز Supabase: '+String(dailyCompletionDiagnostic.code||'غير متوفر')+'\n' +
          'الرسالة: '+String(dailyCompletionDiagnostic.message||'غير متوفرة')+'\n' +
          (dailyCompletionDiagnostic.details?'التفاصيل: '+String(dailyCompletionDiagnostic.details)+'\n':'') +
          (dailyCompletionDiagnostic.hint?'التلميح: '+String(dailyCompletionDiagnostic.hint):''),
        daily_completion:{completed:false,diagnostic:dailyCompletionDiagnostic}
      });
    }

    for(let round=0;round<=maxToolRounds;round++){
      ai=await openai({
        model:OPENAI_MODEL,
        instructions:instructions(enrichedContext),
        input,
        tools:availableAgentTools,
        tool_choice:'auto',
        max_output_tokens:900
      });
      if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});

      const calls=getFunctionCalls(ai.data);
      if(!calls.length)break;
      if(round===maxToolRounds)throw new Error('تجاوز الوكيل الحد المسموح لاستدعاءات الأدوات');

      const outputs=[];
      let dailyTaskCompleted=false;
      let blockedCompletionAttempt=false;
      for(const call of calls){
        try{
          const result=await executeAgentTool(call,token,message);
          outputs.push({
            type:'function_call_output',
            call_id:call.call_id,
            output:JSON.stringify(result)
          });
          if(call.name==='complete_daily_coaching_task' && result?.completed){
            dailyTaskCompleted=true;
          }
          if(call.name==='complete_daily_coaching_task' && result?.blocked){
            blockedCompletionAttempt=true;
          }
        }catch(toolError){
          outputs.push({
            type:'function_call_output',
            call_id:call.call_id,
            output:JSON.stringify({error:String(toolError&&toolError.message||toolError)})
          });
        }
      }

      input=[...(Array.isArray(ai.data.output)?Array.isArray(ai.data.output)?ai.data.output:[]:[]),...outputs];

      if(blockedCompletionAttempt){
        ai=await openai({
          model:OPENAI_MODEL,
          instructions:instructions(enrichedContext),
          input,
          tools:[],
          tool_choice:'none',
          max_output_tokens:900
        });
        if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});
        break;
      }

      if(dailyTaskCompleted){
        const advanced=await startNextDailySession(token,currentSession).catch(()=>null);
        if(advanced){
          currentSession=advanced.session;
          dailyAutoPlan=advanced.plan;
          enrichedContext={
            ...context,
            coaching_profile:coachingProfile,
            coaching_session:currentSession,
            ...(dailyAutoPlan?{daily_auto_plan:dailyAutoPlan}: {})
          };
        }
      }
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