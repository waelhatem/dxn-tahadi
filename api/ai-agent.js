const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_MODEL = process.env.AI_AGENT_MODEL || 'gpt-5.6-luna';
const OPENAI_HELPER_MODEL = process.env.AI_AGENT_HELPER_MODEL || 'gpt-5-nano';

const LOCAL_KNOWLEDGE_SOURCES=[
  require('./knowledge/objections_mmahmoud.json'),
  require('./knowledge/offer_fusha.json'),
  require('./knowledge/dxn_financial_plan.json'),
  require('./knowledge/direct_selling_dxn.json'),
  require('./knowledge/build_effective_team.json'),
  require('./knowledge/go_pro_arabic.json'),
  require('./knowledge/training_bag_qna.json')
];

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

function estimateOpenAICost(model,usage){
  const input=Number(usage?.input_tokens||0);
  const cached=Number(usage?.input_tokens_details?.cached_tokens||0);
  const output=Number(usage?.output_tokens||0);
  const rates={
    'gpt-5.6-luna':{input:0.20,cached:0.02,output:1.20},
    'gpt-5-nano':{input:0.05,cached:0.005,output:0.40}
  };
  const rate=rates[String(model||'').toLowerCase()];
  if(!rate) return 0;
  const uncached=Math.max(input-cached,0);
  return ((uncached*rate.input)+(cached*rate.cached)+(output*rate.output))/1000000;
}

async function recordOpenAIUsage(model,usage){
  if(!usage||!model)return null;
  const input=Number(usage.input_tokens||0);
  const cached=Number(usage.input_tokens_details?.cached_tokens||0);
  const output=Number(usage.output_tokens||0);
  const total=Number(usage.total_tokens||input+output);
  const estimatedCost=estimateOpenAICost(model,usage);
  if(!input&&!output&&!total)return null;

  const requestKind=String(model).toLowerCase()==='gpt-5.6-luna'?'main':'helper';
  try{
    return await supabaseRpc('log_ai_agent_usage',{
      p_model:String(model),
      p_input_tokens:input,
      p_cached_input_tokens:cached,
      p_output_tokens:output,
      p_total_tokens:total,
      p_estimated_cost_usd:estimatedCost,
      p_request_kind:requestKind,
      p_metadata:{source:'ai-agent'}
    });
  }catch(error){
    console.error('[ai-agent] usage logging failed',String(error?.message||error));
    return null;
  }
}

function openai(payload){
  return new Promise((resolve,reject)=>{
    const model=String(payload?.model||'');
    const cacheableGpt56=/^gpt-5\\.6(?:-|$)/i.test(model);
    const requestPayload=cacheableGpt56
      ? {
          ...payload,
          // Keep the large stable trainer prefix cacheable for repeated turns.
          // GPT-5.6 uses implicit prompt caching with a 30-minute minimum TTL.
          prompt_cache_options:{mode:'implicit',ttl:'30m'}
        }
      : payload;
    const body=JSON.stringify(requestPayload);
    const req=https.request('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:45000},res=>{
      let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',async()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=null}
        const result={ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text};
        if(result.ok&&data?.usage){
          await recordOpenAIUsage(model,data.usage);
        }
        resolve(result);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بالذكاء الاصطناعي')));
    req.on('error',error=>resolve({ok:false,status:0,data:null,text:String(error?.message||error)}));
    req.write(body);
    req.end();
  });
}

let objectionsKnowledgeSeededAt=0;
const OBJECTIONS_KNOWLEDGE_SEED_TTL_MS=30*60*1000;

const OBJECTIONS_KNOWLEDGE_PACK=[
  {
    category:'objections_training',
    title:'رد الاعتراضات — الرؤية الأساسية',
    content:'المصدر: ملف «الاعتراضات — رؤية شاملة ومعالجة فاعلة» للم. محمود المصري، 50 صفحة. الاعتراض فرصة للتعرف على ما يدور في ذهن الشريك المحتمل، وقد يكون أقوى فرصة للاقتراب منه. الاعتراضات أسئلة تحتاج إقناعًا، والتعامل معها يحتاج فهمًا وتدريبًا. مكونات الاعتراض: المعترض، الاعتراض عليه، ونوع الاعتراض.'
  },
  {
    category:'objections_training',
    title:'أسباب الاعتراضات وأنواعها',
    content:'وفق المادة: من أسباب الاعتراضات اختلاف الشريك مع أسلوب طرح فرصة العمل أو عدم فهمه. ومن الأنواع المذكورة: الاعتراض الحقيقي، الاعتراض غير الحقيقي، الاعتراض المعلّق، والاعتراض غير المعلنة/الصامتة؛ ويجب التمييز بين أنواع الاعتراضات وفهم ما وراء الاعتراض بدل التعامل معه كرفض نهائي.'
  },
  {
    category:'objections_training',
    title:'مواجهة الاعتراضات — المبدأ',
    content:'تؤكد المادة على عدم الدخول في عقل الشخص بالقوة، وأن أكبر خطأ هو مواجهة الاعتراض بعناد. من أساسيات المواجهة: التسليح بالمعرفة الجيدة حول شركتك، والتأثير على الناس وجذبهم بالإحسان، والاهتمام بهم، والاستماع الجيد.'
  },
  {
    category:'objections_training',
    title:'الأسرار العشرة لجاذبية التواصل',
    content:'تورد المادة عشرة مفاتيح لجاذبية التواصل: كن خلوقًا تنل ذكرًا جميلًا، أظهر اهتمامك بالآخرين، التفاؤل والحماس، تواضع لكل الناس، لا تغضب أبدًا، تعلم السحر الحلال (الابتسامة)، لا تنس تقديم الهدايا، اهتم بشكلك ومظهرك، أتقن فن الاستماع والإصغاء، وأتقن فن الكلام.'
  },
  {
    category:'objections_training',
    title:'تسعة مفاتيح لمعالجة أي اعتراض',
    content:'تسلسل المفاتيح الوارد في المادة: أولًا تجاهل الإساءة ولا تجعل الاستفزاز يشتتك؛ ثانيًا استمع جيدًا للسؤال وافهمه؛ ثالثًا لتكن ردودك لينة؛ رابعًا استوعب الاعتراض بسؤال؛ خامسًا حاصر الاعتراض برفق واجعله الأخير؛ سادسًا ساير المدعو واجعله مرتاحًا؛ سابعًا أشعره أن اعتراضه له قيمة لكن لا توافقه عليه؛ ثامنًا جاوب عن السؤال بأمانة ولا تكذب أو تبالغ؛ تاسعًا تعلّم متى تنسحب بدل تحويل الحوار إلى صراع.'
  },
  {
    category:'objections_training',
    title:'أمثلة اعتراضات الوقت والمال والاهتمام والخبرة',
    content:'من الاعتراضات التي تعالجها المادة: «ليس لدي وقت»، «ليس لدي مال»، «لست مهتمًا بهذا العمل»، «النجاح مستحيل»، «لا أحب المبيعات»، «سمعت أن هذا التسويق حرام»، «لماذا منتجاتكم قوية؟»، «لماذا لا تباع المنتجات في الأسواق؟»، «أغلب الناس يشتركون من أجل المال فقط؟»، «الناس لا تقتنع بالمكملات والوقاية»، «هذا التسويق هرمي»، «لقد جربت وحاولت ولم أنجح»، «صاحب الشركة ليس مسلمًا»، «لماذا شرط المئة نقطة؟»، و«كسب سهل بدون مجهود».'
  },
  {
    category:'objections_training',
    title:'اعتراض «ليس لدي وقت»',
    content:'تعرض المادة الرد على «ليس لدي وقت لعملي الأساسي» من خلال طلب النظر في العمل باعتباره فرصة قد تساعد على توفير دخل واستثمار الوقت، مع التأكيد على فهم واقع الشخص بدل الضغط عليه.'
  },
  {
    category:'objections_training',
    title:'اعتراض «ليس لدي مال»',
    content:'تعرض المادة سؤالًا تمهيديًا عن امتلاك بعض المال والتفكير فيه جيدًا، ثم طرح العمل باعتباره وسيلة قد تساعد على توفير المال الذي يسعد الشخص ويغطي التزاماته. يجب تقديم هذا كصياغة تدريبية واردة في المصدر، لا كوعد بنتيجة مالية.'
  },
  {
    category:'objections_training',
    title:'اعتراض «لست مهتمًا بهذا العمل»',
    content:'ترد المادة بصيغة مفادها: أتفهم أن معلوماتك غير كافية، ولذلك الهدف من عرض العمل هو إعطاء معلومات تساعد الشخص على اتخاذ قرار مبني على معرفة كافية، دون افتراض أن الرفض النهائي حصل قبل الفهم.'
  },
  {
    category:'objections_training',
    title:'اعتراض «النجاح مستحيل» و«لا أحب المبيعات»',
    content:'في المادة: عند «النجاح مستحيل» يُشار إلى أن أي عمل يمكن أن ينجح بطريقة صحيحة أو خاطئة، وأن الصديق يمكنه تجربة العمل بالطريقة الصحيحة. وعند «لا أحب المبيعات/ليست لدي خبرة» يُعاد التركيز على طبيعة العمل وشرح أن المطلوب ليس افتراض امتلاك خبرة سابقة.'
  },
  {
    category:'objections_training',
    title:'الاعتراضات الشرعية والتسويقية',
    content:'المادة تتناول اعتراض «سمعت أن هذا التسويق حرام» وتطلب السؤال عن مصدر المعلومة، ثم تعرض نقاشًا شرعيًا داخل المادة. كما تشرح الفرق الذي تراه بين التسويق متعدد المستويات والتسويق الهرمي، وتعرض معايير قانونية لشركات البيع المباشر. عند استخدام هذه المادة مع الأعضاء يجب نسب الآراء الشرعية والقانونية إلى المصدر وعدم تقديمها كفتوى أو استشارة قانونية مستقلة.'
  },
  {
    category:'objections_training',
    title:'الاعتراضات المتعلقة بمنتجات DXN والسوق',
    content:'تطرح المادة أسئلة مثل: لماذا منتجاتكم قوية؟ ولماذا لا تباع المنتجات في الأسواق؟ وتعرض تفسيرًا يعتمد على التسويق المباشر والدعاية الشفهية والثقة، وعلى وجود أعضاء مستهلكين. كما تعرض أسئلة عن السعر مقارنة بالسوق، وتحث على مقارنة المنتجات وفوائدها واستخدامها وفهم النظام التسويقي.'
  },
  {
    category:'objections_training',
    title:'إرشادات ومحاذير التغلب على الاعتراضات',
    content:'في خاتمة المادة: عندما ترد على الاعتراض كن واثقًا جدًا، لا تدافع بانفعال بل افهم ما يريد السائل أن يعرفه أكثر، استمع جيدًا، أجب عن السؤال بسؤال، وعند الرد على الاعتراضات تذكر «3 اعتبارات» بحسب المادة، لا تتحدث عن العمل قبل الإلمام بالحد الأدنى من المعلومات، واختر الزمان والمكان المناسبين. الهدف هو تحويل الاعتراض من مواجهة إلى فرصة لفهم الشخص.'
  },
  {
    category:'objections_training',
    title:'حدود استخدام مادة رد الاعتراضات',
    content:'هذه المعرفة مشتقة من ملف تدريبي واحد للم. محمود المصري. يجب على المدرب وائل حاتم تمييز ما هو نص/منهج المصدر عن الحقائق المحدثة الخاصة بـDXN أو القوانين أو الأحكام الشرعية. لا يخترع المدرب معلومات غير موجودة في المصدر، ولا يحول الأمثلة التدريبية إلى وعود مالية أو طبية أو قانونية.'
  }
];

async function ensureObjectionsKnowledgePack(){
  if(Date.now()-objectionsKnowledgeSeededAt<OBJECTIONS_KNOWLEDGE_SEED_TTL_MS)return;
  if(!SUPABASE_SECRET_KEY)return;
  try{
    for(const item of OBJECTIONS_KNOWLEDGE_PACK){
      const title=encodeURIComponent(item.title);
      const check=await new Promise((resolve,reject)=>{
        const target=new URL(SUPABASE_URL_FIXED);
        const req=https.request({
          protocol:target.protocol,hostname:target.hostname,port:target.port||443,method:'GET',
          path:'/rest/v1/ai_agent_knowledge?select=id&scope=eq.global&category=eq.'+encodeURIComponent(item.category)+'&title=eq.'+title+'&limit=1',
          headers:{Accept:'application/json',apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY},
          timeout:10000
        },res=>{let t='';res.setEncoding('utf8');res.on('data',c=>t+=c);res.on('end',()=>{let d=[];try{d=t?JSON.parse(t):[]}catch(_){d=[]}resolve({ok:res.statusCode>=200&&res.statusCode<300,data:d});});});
        req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('timeout')));req.end();
      });
      if(check.ok&&Array.isArray(check.data)&&check.data.length)continue;
      await httpJson(SUPABASE_URL_FIXED+'/rest/v1/ai_agent_knowledge',{
        scope:'global',category:item.category,title:item.title,content:item.content,priority:110,active:true,source:'pdf_objections_vision_mmahmoud'
      },{apikey:SUPABASE_SECRET_KEY,Authorization:'Bearer '+SUPABASE_SECRET_KEY,Prefer:'return=minimal'},15000);
    }
  }catch(e){console.error('[ai-agent] objections knowledge seed failed',String(e.message||e));return;}
  objectionsKnowledgeSeededAt=Date.now();
}

function outputText(data){
  if(data&&typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data&&data.output)?data.output:[]))for(const part of (Array.isArray(item&&item.content)?item.content:[]))if(part&&part.type==='output_text'&&typeof part.text==='string')parts.push(part.text);
  return parts.join('').trim();
}

function cleanHistory(history){
  if(!Array.isArray(history))return [];
  return history.slice(-24).map(x=>{
    const role=String(x&&x.role||'user').toLowerCase()==='assistant'?'assistant':'user';
    const content=String(x&&x.content||'').trim().slice(0,5000);
    return content?{role,content}:null;
  }).filter(Boolean);
}

function isTeamIntelligenceRequest(message){
  const s=String(message||'').trim().toLowerCase();
  return /ملخص\s+(?:فريقي|الفريق)|فريقي\s+في\s+dxn|فريق\s+dxn|الـ?downline|downline|الاجيال|الأجيال|الخطوط\s+(?:المباشرة|التحتية)|توزيع\s+(?:الرتب|الأعضاء)|pv\s+(?:الفريق|فريقي)/i.test(s);
}

function isRankKnowledgeRequest(message){
  const s=String(message||'').trim().toLowerCase();
  return /(?:رتب(?:ة|ات)?|الرتب|سلم الرتب|مستويات الشركة|مستويات dxn|رتبة الشركة|رتب dxn|وكيل نجم|نجم ياقوتي|نجم ماسي|نجم ماسى|السفير|qsa|qsd|\bsa\b|\bsr\b|dgpv|pgpv|شروط التأهل|شروط التأهل للرتبة|كيف أصير.*(?:نجم|وكيل|سفير)|شلون أصير.*(?:نجم|وكيل|سفير))/i.test(s);
}

function isSourceKnowledgeRequest(message){
  const s=String(message||'').trim().toLowerCase();
  return /(?:خطة\s*dxn|الخطة\s*المالية|الخطة\s*التسويقية|مراتب|رتب|رتبة|مستويات الشركة|وكيل نجم|نجم ياقوتي|النجم الماسي|السفير|qsa|qsd|sa|sr|sd|esd|ssd|essd|dd|edd|td|etd|gd|egd|cd|ecd|scd|escd|dcd|edcd|tcd|etcd|gcd|egcd|ca|عمولة|علاوة|حوافز|pv|sv|ppv|psv|pgpv|pgsv|dgpv|dgsv)/i.test(s);
}

function isDailyPlanRequest(message){
  const s=String(message||'').trim().toLowerCase();
  return /شنو\s+(?:أسوي|اسوي|أشتغل|اشتغل|أعمل|اعمل)\s+(?:هسه|اليوم)|ماذا\s+(?:أفعل|افعل|أعمل|اعمل)\s+(?:الآن|اليوم)|شنو\s+الخطوة\s+(?:الجايه|الجاية|القادمة)|ماذا\s+أفعل\s+الآن/.test(s);
}

function selectRelevantAgentTools(message,cognitiveState,currentSession){
  const s=String(message||'').toLowerCase();
  const names=new Set();
  const add=(...xs)=>xs.forEach(x=>names.add(x));

  const teamRequest=isTeamIntelligenceRequest(message);
  const dailyRequest=isDailyPlanRequest(message);
  const completion=hasExplicitTaskCompletionEvidence(message);

  if(teamRequest){
    add('get_member_sponsor_link','get_dxn_team_intelligence','search_dxn_team_members','get_member_summary');
  }else if(dailyRequest){
    add('get_daily_coaching_plan','get_member_progress','get_member_assessment_performance','get_available_tasks','complete_daily_coaching_task');
  }else if(
    currentSession?.active ||
    /تدريب|التدريبات|اختبار|الاختبارات|تقدم|المشاهدة|شاهدت|نسبة|إكمال|اكتمال|جلسة تدريب/i.test(s)
  ){
    add('get_member_progress','get_training_status','get_member_assessment_performance','get_available_tasks','get_member_summary','complete_daily_coaching_task');
  }else if(completion){
    add('complete_daily_coaching_task','get_daily_coaching_plan');
  }else if(/عضويتي|رقم العضوية|ملخص العضو|بياناتي|تقدمي/i.test(s)){
    add('get_member_summary','get_member_progress');
  }

  const defs=Array.isArray(AGENT_TOOL_DEFINITIONS)?AGENT_TOOL_DEFINITIONS:[];
  return defs.filter(x=>names.has(x.name));
}

function backgroundMemoryValueLikely(message,cognitiveState,currentSession,conversationState,causalMemory){
  if(isLowInformationChatMessage(message)) return false;
  if(currentSession?.active) return true;
  if(hasExplicitTaskCompletionEvidence(message)) return true;
  if(conversationState?.pending_question||conversationState?.pending_member_action||conversationState?.open_loop) return true;

  const intent=String(cognitiveState?.user_intent||'').toLowerCase();
  if(['report_obstacle','report_attempt','report_task_completion'].includes(intent)) return true;

  if(profileUpdateLikely(message)) return true;
  if(durableLearningLikely(message,'member')) return true;
  if(causalMemoryLikely(message,cognitiveState,causalMemory)) return true;

  const s=String(message||'').trim();
  return s.length>=100 && /(?:أنا|اني|عندي|هدفي|تجربتي|واجهت|مشكلة|أتعلم|اتعلم|أريد|اريد|أحتاج|احتاج|نجحت|فشلت|رفض|وافق)/i.test(s);
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

function detectTrainingConsent(message,conversationState){
  const s=String(message||'').trim().toLowerCase();
  if(!s) return false;

  // Explicit training intent is enough by itself.
  if(/(?:ننتقل|ننتقلوا|نروح|نبدأ|ابدأ|خلينا|يلا|جاهز|مستعد|موافق).{0,30}(?:التدريب|تدريب اليوم|جلسة التدريب|الجلسة)/.test(s)) return true;
  if(/(?:التدريب|تدريب اليوم|جلسة التدريب).{0,30}(?:نبدأ|ابدأ|خلينا|يلا|ننتقل|موافق|جاهز)/.test(s)) return true;

  // A short affirmative such as "إي" or "نعم" only counts when the
  // conversation state shows that Muhammad was explicitly waiting for the
  // member's answer about moving to training. Silence or a generic reply
  // must never start a session on its own.
  const affirmative=/^(?:إي|اي|نعم|أيوه|ايوه|تمام|زين|موافق|خلينا|يلا|اوكي|ok|حاضر|جاهز|جاهزة)(?:[.!؟?،\\s]*)$/i.test(s);
  if(!affirmative) return false;
  const pending=[
    conversationState?.pending_question,
    conversationState?.open_loop,
    conversationState?.pending_member_action
  ].filter(Boolean).join(' ').toLowerCase();
  const trainingPending=/(?:تدريب|التدريب|جلسة تدريب|تدريب اليوم|ننتقل)/.test(pending);
  return trainingPending && (affirmative || affirmativeStart);
}

function isLowInformationChatMessage(message){
  const s=String(message||'').trim().toLowerCase().replace(/[،,!.؟?]+$/,'').trim();
  if(!s) return false;
  return /^(?:هلا|هلا والله|هلا بيك|اهلا|أهلا|أهلًا|مرحبا|مرحبًا|السلام عليكم|السلام عليكم ورحمة الله|صباح الخير|مساء الخير|شلونك|شخبارك|كيفك|يعطيك العافية|يعافيك|شكرا|شكرًا|مشكور|مشكورة|ممتاز|تمام|زين|حلو|اوكي|أوكي|ok|thanks|thank you)$/i.test(s);
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
    'حلل دور المدرب وائل حاتم في جلسة تدريبية مستمرة، واستخرج الحالة الجديدة للجلسة فقط.',
    'لا تخترع هدفًا غير مذكور. لا تحفظ معلومات حساسة.',
    'phase يجب أن تكون واحدة من discover,explain,practice,feedback,next_step,complete.',
    'إذا كان المدرب وائل حاتم يشرح مفهومًا فاختر explain. إذا كان العضو يطبق أو يؤدي تمرينًا فاختر practice. إذا كان المدرب وائل حاتم يقيم أو يصحح فاختر feedback. إذا انتقلا للخطوة التالية فاختر next_step. إذا اكتملت الجلسة فاختر complete.',
    'أعد JSON فقط بالمفاتيح: phase, objective.',
    'الحالة الحالية:',
    JSON.stringify(currentSession),
    'رسالة العضو:',
    String(message).slice(0,5000),
    'لا تستخدم رد المدرب وائل حاتم كمصدر لاستخراج حقيقة عن العضو. المصدر الوحيد للذاكرة هو كلام العضو نفسه.'
  ].join('\\n');
  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
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
  return /هدفي|هدفي هو|اريد|أريد|أحتاج|احتاج|أطمح|اطمح|خبرتي|مبتدئ|متوسط|متقدم|أواجه|اواجه|مشكلتي|نقطة قوتي|نقطة ضعفي|ضعفي|قوتي|ضعيف|قوي|أطور|اطور|تركيزي|مجالي|أركز على|ارّكز على|الخطوة الجاية|الخطوة القادمة|أريد أتعلم|تعلمت|نجحت في|فشلت في/.test(s);
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
    'رد المدرب وائل حاتم:',
    String(answer).slice(0,5000)
  ].join('\\n');
  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
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

async function loadConversationState(token){
  try{
    const r=await supabaseRpc('get_ai_agent_conversation_state',{p_token:token});
    if(!r.ok||!Array.isArray(r.data)||!r.data[0]) return null;
    const s=r.data[0];
    return {
      current_topic:s.current_topic||null,
      open_loop:s.open_loop||null,
      pending_question:s.pending_question||null,
      pending_member_action:s.pending_member_action||null,
      state_status:s.state_status||'open',
      interaction_signal:s.interaction_signal||null,
      interaction_confidence:s.interaction_confidence==null?null:Number(s.interaction_confidence),
      last_member_message_at:s.last_member_message_at||null,
      updated_at:s.updated_at||null
    };
  }catch(_){return null;}
}

async function saveConversationState(token,state){
  if(!state) return null;
  try{
    const r=await supabaseRpc('upsert_ai_agent_conversation_state',{
      p_token:token,
      p_current_topic:state.current_topic||null,
      p_open_loop:state.open_loop||null,
      p_pending_question:state.pending_question||null,
      p_pending_member_action:state.pending_member_action||null,
      p_state_status:state.state_status||'open',
      p_last_member_message_at:state.last_member_message_at||new Date().toISOString(),
      p_interaction_signal:state.interaction_signal||null,
      p_interaction_confidence:state.interaction_confidence==null?null:Number(state.interaction_confidence)
    });
    // During deployment, tolerate the old RPC signature until the migration
    // has been executed in Supabase.
    if(!r.ok){
      const legacy=await supabaseRpc('upsert_ai_agent_conversation_state',{
        p_token:token,
        p_current_topic:state.current_topic||null,
        p_open_loop:state.open_loop||null,
        p_pending_question:state.pending_question||null,
        p_pending_member_action:state.pending_member_action||null,
        p_state_status:state.state_status||'open',
        p_last_member_message_at:state.last_member_message_at||new Date().toISOString()
      });
      return legacy.ok;
    }
    return r.ok;
  }catch(_){return false;}
}

async function extractConversationState(message,answer,currentState){
  const prompt=[
    'استخرج حالة الحوار القصيرة لالمدرب وائل حاتم من رسالة العضو الحالية وسياق الحالة السابق.',
    'الهدف هو حفظ ما يزال مفتوحًا في الحوار، وليس تلخيص كل المحادثة.',
    'اعتمد على كلام العضو كالمصدر الأساسي. لا تعتبر كلام المدرب وائل حاتم حقيقة عن العضو.',
    'current_topic: الموضوع الذي يتحدث عنه العضو الآن بصياغة قصيرة.',
    'open_loop: شيء طرحه العضو ولم يُغلق بعد أو نتيجة ما زال المدرب وائل حاتم ينتظرها. إذا لا يوجد استخدم null.',
    'pending_question: سؤال طرحه المدرب وائل حاتم وما زال ينتظر إجابة العضو عليه. إذا لا يوجد استخدم null.',
    'pending_member_action: تجربة أو خطوة طلبها المدرب وائل حاتم من العضو ولم يقدم نتيجتها بعد. إذا لا يوجد استخدم null.',
    'state_status: open إذا الحوار مستمر، waiting_member إذا المدرب وائل حاتم ينتظر إجابة/نتيجة محددة من العضو، closed فقط إذا انتهى الموضوع بوضوح.',
    'interaction_signal: إشارة خفيفة للحالة الحالية في هذه الرسالة فقط، وليست تشخيصًا نفسيًا ولا صفة ثابتة للعضو. القيم المسموحة: neutral, positive, hesitant, confused, frustrated, rushed.',
    'اختر interaction_signal فقط إذا كانت هناك قرائن واضحة في كلام العضو نفسه. لا تستنتجها من الصمت أو طول الرسالة وحده.',
    'neutral عندما لا توجد إشارة واضحة. positive عندما يظهر ارتياح أو حماس واضح. hesitant عند التردد أو عدم الحسم. confused عند طلب التوضيح أو ظهور عدم فهم واضح. frustrated عند التعبير الصريح عن الانزعاج من المشكلة أو المحاولة. rushed عندما يذكر العضو الاستعجال أو ضيق الوقت صراحة.',
    'interaction_confidence رقم بين 0 و1 يعكس قوة الدليل من رسالة العضو الحالية فقط. إذا لم توجد إشارة واضحة استخدم neutral مع ثقة منخفضة أو متوسطة.',
    'هذه الإشارة لا تعني تشخيص القلق أو الاكتئاب أو أي حالة صحية/نفسية، ولا يجوز لالمدرب وائل حاتم ذكر تشخيصات بناءً عليها.',
    'لا تعتبر الصمت أو مرور الوقت انتهاءً للموضوع.',
    'لا تخترع أي شيء غير موجود.',
    'أعد JSON فقط بالمفاتيح السبعة: current_topic, open_loop, pending_question, pending_member_action, state_status, interaction_signal, interaction_confidence.',
    'الحالة السابقة:',
    JSON.stringify(currentState||{}),
    'رسالة العضو:',
    String(message||'').slice(0,5000),
    'رد المدرب وائل حاتم:',
    String(answer||'').slice(0,5000)
  ].join('\\n');
  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'أنت محلل حالة حوار قصيرة. أعد JSON فقط ولا تضف معلومات غير موجودة.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:320
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start)return null;
    const p=JSON.parse(text.slice(start,end+1));
    const statuses=['open','waiting_member','closed'];
    return {
      current_topic:p.current_topic?String(p.current_topic).slice(0,500):null,
      open_loop:p.open_loop?String(p.open_loop).slice(0,1000):null,
      pending_question:p.pending_question?String(p.pending_question).slice(0,700):null,
      pending_member_action:p.pending_member_action?String(p.pending_member_action).slice(0,700):null,
      state_status:statuses.includes(p.state_status)?p.state_status:'open',
      interaction_signal:['neutral','positive','hesitant','confused','frustrated','rushed'].includes(p.interaction_signal)?p.interaction_signal:'neutral',
      interaction_confidence:Number.isFinite(Number(p.interaction_confidence))
        ? Math.max(0,Math.min(1,Number(p.interaction_confidence)))
        : 0.35,
      last_member_message_at:new Date().toISOString()
    };
  }catch(_){return null;}
}


function causalMemoryLikely(message,cognitiveState,causalMemory){
  const s=String(message||'').toLowerCase();
  const intent=String(cognitiveState?.intent||'').toLowerCase();
  const signal=String(cognitiveState?.signal||'').toLowerCase();

  if(/جربت|حاولت|سويت|سويتها|طبقت|طبقتها|نفذت|نفذتها|سويت تجربة|جربنا|حاولنا|اشتغلت|ما اشتغلت|نجحت|نجح|فشلت|فشل|ما ضبط|ما نفع|نفع|استجاب|ما استجاب|رد علي|ما رد|رفض|وافق|اعترض|النتيجة|طلع|صار|صارلي|بسبب|لأن|لان|علشان|حتى بعد|المشكلة/.test(s)) return true;

  // Follow-up explanations can complete the causal chain even when the
  // member does not repeat words such as "جربت" or "النتيجة".
  const hasExistingCausalMemory=Array.isArray(causalMemory)&&causalMemory.length>0;
  const explanatoryFollowup=/(?:السبب|لأن|لان|كانت|كان|من البداية|مباشرة|عرضت|قدمت|قلت لهم|رسالة|افتتاحية|أسلوبي|طريقتي|يمكن لأن|أعتقد أن|أظن أن|اتوقع أن|أتوقع أن)/.test(s);
  if(hasExistingCausalMemory && explanatoryFollowup) return true;

  return ['report_attempt','report_obstacle'].includes(intent)
    || ['positive','frustrated','hesitant'].includes(signal);
}

async function loadLearningPatterns(token){
  try{
    const r=await supabaseRpc('get_ai_agent_learning_patterns',{p_token:token,p_limit:8});
    if(!r.ok||!Array.isArray(r.data)) return [];
    return r.data.map(x=>({
      id:x.id||null,
      topic:x.topic||null,
      pattern:x.pattern||null,
      evidence_summary:x.evidence_summary||null,
      working_lesson:x.working_lesson||null,
      next_test:x.next_test||null,
      evidence_count:Number(x.evidence_count||0),
      confidence:x.confidence==null?null:Number(x.confidence),
      status:x.status||'testing',
      source_event_ids:Array.isArray(x.source_event_ids)?x.source_event_ids:[],
      created_at:x.created_at||null,
      updated_at:x.updated_at||null
    }));
  }catch(_){return [];}
}

async function saveLearningPattern(token,pattern){
  if(!pattern) return null;
  try{
    const r=await supabaseRpc('save_ai_agent_learning_pattern',{
      p_token:token,
      p_topic:pattern.topic||null,
      p_pattern:pattern.pattern||null,
      p_evidence_summary:pattern.evidence_summary||null,
      p_working_lesson:pattern.working_lesson||null,
      p_next_test:pattern.next_test||null,
      p_evidence_count:Number(pattern.evidence_count||0),
      p_confidence:pattern.confidence==null?null:Number(pattern.confidence),
      p_status:pattern.status||'testing',
      p_source_event_ids:Array.isArray(pattern.source_event_ids)?pattern.source_event_ids:[]
    });
    return r.ok ? r.data : null;
  }catch(_){return null;}
}

function learningLoopLikely(causalMemory,learningPatterns){
  return Array.isArray(causalMemory) && causalMemory.length>=2;
}

async function extractLearningPattern(currentCausalMemory,currentLearningPatterns){
  const events=Array.isArray(currentCausalMemory)?currentCausalMemory.slice(0,12):[];
  if(events.length<2) return null;

  const prompt=[
    'حلل آخر تجارب العضو لبناء درس عملي مؤقت واحد فقط إذا وجدت نمطًا مدعومًا بتجربتين أو أكثر.',
    'لا تبحث عن تشابه لغوي فقط؛ ابحث عن علاقة بين التغيير في الأسلوب والنتيجة المعلنة من العضو.',
    'إذا لم توجد أدلة كافية، أعد {"save":false}.',
    'هذا ليس استنتاجًا عن شخصية العضو. الدرس يخص طريقة/تجربة محددة فقط.',
    'pattern: صياغة قصيرة للنمط الذي ظهر عبر أكثر من تجربة.',
    'evidence_summary: لخص الأدلة الفعلية دون اختراع أرقام أو نتائج.',
    'working_lesson: درس مؤقت قابل للاختبار، وليس حقيقة نهائية.',
    'next_test: تجربة واحدة محددة يمكن أن تؤكد أو تضعف الدرس.',
    'evidence_count: عدد التجارب ذات الصلة فعلًا.',
    'confidence: بين 0 و1. لا ترفع الثقة لمجرد تشابه التجارب.',
    'status: testing إذا ما زال يحتاج اختبارًا، supported إذا كانت الأدلة المتكررة والمتسقة تدعم النمط، rejected إذا كانت تجربة جديدة موثوقة تناقض النمط السابق، superseded إذا ظهر درس أحدث يفسر النتائج بصورة أفضل.',
    'مراجعة الدرس: قارن أحدث تجربة مع الدرس السابق. إذا كان الدرس السابق يقول إن الأسلوب A أفضل، ثم ظهرت تجربة موثقة يظهر فيها الأسلوب B نجاحًا واضحًا في ظرف مشابه، لا تتجاهل التعارض. خفّض الثقة أو اجعل status=rejected، وحدد أن الدرس السابق لم يعد كافيًا.',
    'إذا كانت التجارب مختلفة بسبب اختلاف السياق، لا تعتبرها تناقضًا تلقائيًا؛ سجّل أن النتيجة قد تعتمد على السياق وحدد ذلك في evidence_summary وnext_test.',
    'إذا كانت التجربة الجديدة تؤكد الدرس السابق، حدّث الأدلة بدل إنشاء قاعدة جديدة.',
    'source_event_ids: أعد معرفات التجارب التي دعمت الحكم الحالي، سواء بالتأكيد أو بالتعارض.',
    'إذا كان هناك درس سابق قريب من نفس الموضوع، حدّثه بدل اختراع درس متضارب.',
    'لا تعتبر hypothesis في causal_memory حقيقة؛ هي مجرد سبب محتمل.',
    'أعد JSON فقط بالمفاتيح: save, topic, pattern, evidence_summary, working_lesson, next_test, evidence_count, confidence, status, source_event_ids.',
    'الخبرات الأخيرة:',
    JSON.stringify(events),
    'الدروس السابقة:',
    JSON.stringify(Array.isArray(currentLearningPatterns)?currentLearningPatterns.slice(0,8):[])
  ].join('\\n');

  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'أنت محلل حلقة تعلم. أعد JSON فقط، ولا تحول فرضية إلى حقيقة.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:520
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start)return null;
    const p=JSON.parse(text.slice(start,end+1));
    if(p.save!==true) return null;

    const statuses=['testing','supported','rejected','superseded'];
    const ids=Array.isArray(p.source_event_ids)
      ? p.source_event_ids.map(x=>String(x||'')).filter(x=>events.some(e=>String(e.id||'')===x)).slice(0,12)
      : [];

    if(ids.length<2) return null;

    const conf=Number(p.confidence);
    return {
      topic:p.topic?String(p.topic).trim().slice(0,500):null,
      pattern:p.pattern?String(p.pattern).trim().slice(0,1200):null,
      evidence_summary:p.evidence_summary?String(p.evidence_summary).trim().slice(0,1600):null,
      working_lesson:p.working_lesson?String(p.working_lesson).trim().slice(0,1200):null,
      next_test:p.next_test?String(p.next_test).trim().slice(0,1000):null,
      evidence_count:Math.max(2,Math.min(12,Number(p.evidence_count)||ids.length)),
      confidence:Number.isFinite(conf)?Math.max(0,Math.min(1,conf)):0.35,
      status:statuses.includes(p.status)?p.status:'testing',
      source_event_ids:ids
    };
  }catch(_){return null;}
}

async function loadCausalMemory(token){
  try{
    const r=await supabaseRpc('get_ai_agent_causal_memory',{p_token:token,p_limit:12});
    if(!r.ok||!Array.isArray(r.data)) return [];
    return r.data.map(x=>({
      id:x.id||null,
      topic:x.topic||null,
      attempt:x.attempt||null,
      result:x.result||null,
      observation:x.observation||null,
      hypothesis:x.hypothesis||null,
      adjustment:x.adjustment||null,
      status:x.status||'open',
      created_at:x.created_at||null,
      updated_at:x.updated_at||null
    }));
  }catch(_){return [];}
}

async function saveCausalMemory(token,event){
  if(!event) return null;
  try{
    const r=await supabaseRpc('save_ai_agent_causal_memory',{
      p_token:token,
      p_topic:event.topic||null,
      p_attempt:event.attempt||null,
      p_result:event.result||null,
      p_observation:event.observation||null,
      p_hypothesis:event.hypothesis||null,
      p_adjustment:event.adjustment||null,
      p_status:event.status||'open'
    });
    return r.ok ? r.data : null;
  }catch(_){return null;}
}

async function extractCausalMemoryEvent(message,answer,currentCausalMemory){
  const prompt=[
    'استخرج خبرة سبب/نتيجة واحدة فقط من رسالة العضو الحالية إذا كانت تحتوي على محاولة أو نتيجة أو عائق قابل للتعلم.',
    'إذا لم توجد محاولة أو نتيجة أو عائق واضح، أعد {"save":false}.',
    'هذه الذاكرة ليست تلخيصًا عامًا. الهدف هو ربط: المحاولة -> النتيجة -> الملاحظة -> السبب المحتمل -> التعديل القادم.',
    'اعتمد على كلام العضو كمصدر الحقيقة. لا تعتبر كلام المدرب وائل حاتم حقيقة عن العضو.',
    'attempt: ما الذي قال العضو إنه فعله أو حاول فعله فعلًا.',
    'result: ما النتيجة التي قال العضو إنها حدثت فعلًا.',
    'observation: ملاحظة مباشرة يمكن دعمها من كلام العضو، بدون تفسير زائد.',
    'hypothesis: سبب محتمل فقط إذا ذكره العضو صراحة أو كان مستندًا مباشرة إلى وصفه. إذا كان مجرد تخمين من المحلل استخدم null.',
    'adjustment: خطوة أو تغيير مقترح للمحاولة القادمة. إذا ورد فقط في رد المدرب وائل حاتم، صنّفه كاقتراح وليس كحقيقة.',
    'topic: موضوع الخبرة باختصار.',
    'status: open إذا ما زال التفسير/التجربة القادمة مفتوحًا، learned إذا صرّح العضو بدرس أو سبب/تعديل تعلمه، superseded فقط إذا قال إن التجربة السابقة لم تعد صالحة أو استُبدلت.',
    'لا تحفظ معلومات صحية أو سياسية أو أسرارًا أو أرقامًا حساسة.',
    'لا تستنتج صفات ثابتة من تجربة واحدة.',
    'أعد JSON فقط بالمفاتيح: save, topic, attempt, result, observation, hypothesis, adjustment, status.',
    'إذا كان save=false فلا حاجة لملء باقي الحقول.',
    'الخبرات السابقة القريبة:',
    JSON.stringify(Array.isArray(currentCausalMemory)?currentCausalMemory.slice(0,8):[]),
    'رسالة العضو:',
    String(message||'').slice(0,5000),
    'رد المدرب وائل حاتم:',
    String(answer||'').slice(0,5000)
  ].join('\\n');

  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'أنت محلل تعلم من التجارب. أعد JSON فقط، ولا تخترع سببًا غير مذكور.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:420
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start) return null;
    const p=JSON.parse(text.slice(start,end+1));
    if(p.save!==true) return null;

    const statuses=['open','learned','superseded'];
    const clean=v=>v?String(v).trim().slice(0,1000):null;

    const event={
      topic:clean(p.topic)?.slice(0,500)||null,
      attempt:clean(p.attempt),
      result:clean(p.result),
      observation:clean(p.observation),
      hypothesis:clean(p.hypothesis),
      adjustment:clean(p.adjustment),
      status:statuses.includes(p.status)?p.status:'open'
    };

    if(!event.attempt && !event.result && !event.adjustment) return null;
    return event;
  }catch(_){return null;}
}

async function loadLearnedFacts(token){
  try{
    const r=await supabaseRpc('get_ai_agent_learned_facts',{p_token:token,p_limit:120});
    if(!r.ok||!Array.isArray(r.data)) return [];
    return r.data.map(x=>({
      id:x.id||null,
      scope:x.scope||'member',
      fact:String(x.fact||'').trim().slice(0,4000),
      source:x.source||'conversation',
      source_entity_type:x.source_entity_type||null,
      source_entity_id:x.source_entity_id||null,
      supersedes_id:x.supersedes_id||null,
      created_at:x.created_at||null
    })).filter(x=>x.fact);
  }catch(_){return [];}
}

function durableLearningLikely(message,role){
  const s=String(message||'').trim().toLowerCase();
  if(!s) return false;
  if(/(?:تذكر|لاتنسى|لا تنسى|احفظ|ثبت|خليها بذاكرتك|خليها ثابتة|اعتبرها قاعدة|من اليوم|المعلومة الصحيحة|تصحيح|صحح|تعلمت|تعلمنا|أريدك تعرف|اريدك تعرف|أريدك تتذكر|اريدك تتذكر|احتفظ بها|خزنها|سجلها)/.test(s)) return true;
  if(role==='member' && /(?:جربت|طبقت|نفذت|نجحت|فشلت|النتيجة|السبب|التعديل القادم|تعلمت)/.test(s)) return true;
  return false;
}

async function extractDurableLearnedFacts(message,answer,role,currentFacts,permanentMemory){
  if(!durableLearningLikely(message,role)) return [];
  const current=(Array.isArray(currentFacts)?currentFacts:[]).slice(0,60);
  const prompt=[
    'استخرج فقط المعلومات التي تستحق أن يتذكرها المدرب وائل حاتم على المدى الطويل.',
    'احفظ معلومة جديدة فقط إذا كانت صريحة ومفيدة لاحقًا في التدريب أو إدارة المنصة أو فهم تجربة العضو.',
    'لا تحفظ المجاملات أو التحية أو التفاصيل العابرة أو النصوص التي لا قيمة لها لاحقًا.',
    'لا تحوّل رأيًا عابرًا إلى حقيقة ثابتة. عند وجود تصحيح أو تحديث، أنشئ سجلًا جديدًا ولا تعدّل السجل القديم.',
    'إذا لم توجد معلومة دائمة، أعد {"facts":[]}.',
    'scope: global لمعلومة قواعد المنصة/المشروع التي ينبغي أن يعرفها المدرب مع الجميع، leader لمعلومة تخص القائد، member لمعلومة تخص هذا العضو فقط.',
    'المعلومة العامة لا تُحفظ كـglobal إلا إذا كانت الرسالة واضحة بأنها قاعدة أو معرفة تخص المنصة/المدرب، أو كان المرسل قائدًا ويطلب تثبيتها.',
    'أعد JSON فقط بهذا الشكل: {"facts":[{"scope":"global|leader|member","fact":"...","supersedes_id":null}]}',
    'المعلومات الحالية القريبة:',
    JSON.stringify(current),
    'السجل الدائم المرتبط بالسياق:',
    JSON.stringify((Array.isArray(permanentMemory)?permanentMemory.slice(0,30):[])),
    'رسالة العضو/القائد:',
    String(message||'').slice(0,6000),
    'رد المدرب:',
    String(answer||'').slice(0,5000)
  ].join('\n');

  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'أنت أمين ذاكرة للمدرب. لا تخترع معلومات. احفظ فقط ما يستحق الاستمرار.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:500
    });
    if(!r.ok) return [];
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start) return [];
    const parsed=JSON.parse(text.slice(start,end+1));
    if(!Array.isArray(parsed.facts)) return [];
    return parsed.facts.map(f=>({
      scope:['global','leader','member'].includes(f.scope)?f.scope:'member',
      fact:String(f.fact||'').trim().slice(0,4000),
      supersedes_id:f.supersedes_id||null
    })).filter(f=>f.fact).slice(0,8);
  }catch(_){return [];}
}

async function saveLearnedFacts(token,facts,message){
  if(!Array.isArray(facts)||!facts.length) return [];
  const saved=[];
  for(const fact of facts){
    try{
      const r=await supabaseRpc('append_ai_agent_learned_fact',{
        p_token:token,
        p_scope:fact.scope||'member',
        p_fact:fact.fact,
        p_source:'conversation_learning',
        p_source_entity_type:'ai_agent_message',
        p_source_entity_id:null,
        p_supersedes_id:fact.supersedes_id||null
      });
      if(r.ok) saved.push(r.data);
    }catch(_){}
  }
  return saved;
}

async function loadMemberTrainingMemory(token){
  try{
    const r=await supabaseRpc('get_ai_agent_member_training_memory',{p_token:token,p_limit:80});
    if(!r.ok||!Array.isArray(r.data)) return [];
    return r.data.map(x=>({
      id:x.id||null,
      training_session_id:x.training_session_id||null,
      session_type:x.session_type||'coaching',
      topic:x.topic||null,
      objective:x.objective||null,
      phase:x.phase||null,
      member_statement:String(x.member_statement||'').trim().slice(0,1800),
      coach_action:String(x.coach_action||'').trim().slice(0,1800),
      outcome:String(x.outcome||'').trim().slice(0,900),
      lesson:String(x.lesson||'').trim().slice(0,1400),
      next_step:String(x.next_step||'').trim().slice(0,900),
      member_facts:Array.isArray(x.member_facts)?x.member_facts.slice(0,8):[],
      created_at:x.created_at||null
    })).filter(x=>x.topic||x.lesson||x.outcome||x.next_step||x.member_facts.length);
  }catch(_){return [];}
}

async function extractBackgroundMemoryBundle({
  message,
  answer,
  context,
  currentSession,
  conversationState,
  recentTraining,
  learnedFacts,
  permanentMemory,
  causalMemory,
  learningPatterns,
  doPersonalTraining,
  doDurableFacts,
  doConversationState,
  doCausalMemory,
  doLearningPattern
}){
  if(!doPersonalTraining&&!doDurableFacts&&!doConversationState&&!doCausalMemory&&!doLearningPattern) return null;

  const prompt=[
    'أنت محلل خلفي واحد للمدرب وائل حاتم. مهمتك استخراج عدة طبقات من الذاكرة في استدعاء واحد فقط.',
    'لا تخترع معلومات. المصدر الأساسي لحقائق العضو هو كلام العضو نفسه، ورد المدرب يستخدم فقط لتوثيق الإجراء التدريبي أو سياق الجلسة.',
    'أعد JSON فقط. أي قسم غير مطلوب أو لا توجد له معلومة مفيدة يجب أن يبقى null/فارغًا.',
    'لا تحفظ معلومات صحية أو سياسية أو أسرارًا أو بيانات شديدة الحساسية.',
    'لا تجعل التحية أو الشكر أو التفاصيل العابرة ذاكرة.',
    'personal_training: احفظ محاولة/نتيجة/تصحيح/درس/هدف/عقبة/تقدم/خطوة تالية واضحة، مع member_facts للمعلومات الثابتة التي صرح بها العضو.',
    'durable_facts: احفظ فقط المعلومات التي تستحق الاستمرار طويلًا. scope أحد global أو leader أو member.',
    'conversation_state: احفظ موضوع الحوار المفتوح والسؤال أو الإجراء الذي ما زال ينتظر العضو، مع interaction_signal محصورًا في neutral,positive,hesitant,confused,frustrated,rushed ودون أي تشخيص.',
    'causal_event: استخرج محاولة -> نتيجة -> ملاحظة -> سبب محتمل -> تعديل فقط إذا كانت هناك تجربة أو عائق واضح. hypothesis ليس حقيقة.',
    'learning_pattern: لا تنشئه إلا إذا أصبح لدينا دليل من تجربتين أو أكثر. استخدم CURRENT_EVENT عندما يكون الحدث الحالي نفسه جزءًا من الدليل.',
    'إذا لم توجد معلومة كافية في أي قسم، أعد القسم فارغًا بدل التخمين.',
    'صيغة JSON المطلوبة:',
    JSON.stringify({
      personal_training:{training:null,member_facts:[]},
      durable_facts:[],
      conversation_state:null,
      causal_event:null,
      learning_pattern:null
    }),
    'تعريف training عند الحاجة:',
    JSON.stringify({topic:null,objective:null,phase:null,member_statement:null,coach_action:null,outcome:null,lesson:null,next_step:null}),
    'تعريف durable_facts عند الحاجة:',
    JSON.stringify([{scope:'member',fact:'',supersedes_id:null}]),
    'تعريف conversation_state عند الحاجة:',
    JSON.stringify({current_topic:null,open_loop:null,pending_question:null,pending_member_action:null,state_status:'open',interaction_signal:'neutral',interaction_confidence:0.35}),
    'تعريف causal_event عند الحاجة:',
    JSON.stringify({topic:null,attempt:null,result:null,observation:null,hypothesis:null,adjustment:null,status:'open'}),
    'تعريف learning_pattern عند الحاجة:',
    JSON.stringify({save:false,topic:null,pattern:null,evidence_summary:null,working_lesson:null,next_test:null,evidence_count:0,confidence:null,status:'testing',source_event_ids:[]}),
    'الأقسام المطلوبة:',
    JSON.stringify({
      doPersonalTraining:!!doPersonalTraining,
      doDurableFacts:!!doDurableFacts,
      doConversationState:!!doConversationState,
      doCausalMemory:!!doCausalMemory,
      doLearningPattern:!!doLearningPattern
    }),
    'سياق العضو:',
    JSON.stringify(context.member||{}),
    'الجلسة الحالية:',
    JSON.stringify(currentSession||{}),
    'حالة الحوار السابقة:',
    JSON.stringify(conversationState||{}),
    'آخر سجل تدريبي:',
    JSON.stringify((Array.isArray(recentTraining)?recentTraining.slice(0,6):[])),
    'الحقائق الحالية:',
    JSON.stringify((Array.isArray(learnedFacts)?learnedFacts.slice(0,12):[])),
    'الذاكرة الدائمة الحالية:',
    JSON.stringify((Array.isArray(permanentMemory)?permanentMemory.slice(0,10):[])),
    'الخبرات السببية السابقة:',
    JSON.stringify((Array.isArray(causalMemory)?causalMemory.slice(0,4):[])),
    'دروس التعلم السابقة:',
    JSON.stringify((Array.isArray(learningPatterns)?learningPatterns.slice(0,4):[])),
    'رسالة العضو:',
    String(message||'').slice(0,3000),
    'رد المدرب:',
    String(answer||'').slice(0,3000)
  ].join('\\n');

  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'أنت محلل ذاكرة خلفي موحد. أعد JSON فقط. لا تخترع.',
      input:[{role:'user',content:prompt}],
      reasoning:{effort:'none'},
      max_output_tokens:420
    });
    if(!r.ok)return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start)return null;
    const p=JSON.parse(text.slice(start,end+1));
    const phases=['discover','explain','practice','feedback','next_step','complete'];
    const states=['open','waiting_member','closed'];
    const signals=['neutral','positive','hesitant','confused','frustrated','rushed'];
    const causalStatuses=['open','learned','superseded'];
    const patternStatuses=['testing','supported','rejected','superseded'];

    const training=p.personal_training&&p.personal_training.training&&typeof p.personal_training.training==='object'
      ? p.personal_training.training : null;
    const facts=Array.isArray(p.personal_training?.member_facts)
      ? p.personal_training.member_facts.map(f=>({
          fact:String(f?.fact||'').trim().slice(0,4000),
          supersedes_id:f?.supersedes_id||null
        })).filter(f=>f.fact).slice(0,8) : [];

    const personalTraining=training||facts.length
      ? {training:{
          topic:String(training?.topic||'').trim().slice(0,500)||null,
          objective:String(training?.objective||'').trim().slice(0,500)||null,
          phase:phases.includes(training?.phase)?training.phase:null,
          member_statement:String(training?.member_statement||'').trim().slice(0,3000)||null,
          coach_action:String(training?.coach_action||'').trim().slice(0,3000)||null,
          outcome:String(training?.outcome||'').trim().slice(0,1200)||null,
          lesson:String(training?.lesson||'').trim().slice(0,1400)||null,
          next_step:String(training?.next_step||'').trim().slice(0,900)||null
        },member_facts:facts}
      : {training:null,member_facts:[]};

    const durableFacts=Array.isArray(p.durable_facts)
      ? p.durable_facts.map(f=>({
          scope:['global','leader','member'].includes(f?.scope)?f.scope:'member',
          fact:String(f?.fact||'').trim().slice(0,4000),
          supersedes_id:f?.supersedes_id||null
        })).filter(f=>f.fact).slice(0,8) : [];

    const s=p.conversation_state&&typeof p.conversation_state==='object'?p.conversation_state:null;
    const conversation=s?{
      current_topic:s.current_topic?String(s.current_topic).slice(0,500):null,
      open_loop:s.open_loop?String(s.open_loop).slice(0,1000):null,
      pending_question:s.pending_question?String(s.pending_question).slice(0,700):null,
      pending_member_action:s.pending_member_action?String(s.pending_member_action).slice(0,700):null,
      state_status:states.includes(s.state_status)?s.state_status:'open',
      interaction_signal:signals.includes(s.interaction_signal)?s.interaction_signal:'neutral',
      interaction_confidence:Number.isFinite(Number(s.interaction_confidence))
        ? Math.max(0,Math.min(1,Number(s.interaction_confidence))) : 0.35,
      last_member_message_at:new Date().toISOString()
    }:null;

    const c=p.causal_event&&typeof p.causal_event==='object'?p.causal_event:null;
    const causal=c?{
      topic:c.topic?String(c.topic).trim().slice(0,500):null,
      attempt:c.attempt?String(c.attempt).trim().slice(0,1000):null,
      result:c.result?String(c.result).trim().slice(0,1000):null,
      observation:c.observation?String(c.observation).trim().slice(0,1000):null,
      hypothesis:c.hypothesis?String(c.hypothesis).trim().slice(0,1000):null,
      adjustment:c.adjustment?String(c.adjustment).trim().slice(0,1000):null,
      status:causalStatuses.includes(c.status)?c.status:'open'
    }:{
      topic:null,attempt:null,result:null,observation:null,hypothesis:null,adjustment:null,status:'open'
    };

    const lp=p.learning_pattern&&typeof p.learning_pattern==='object'?p.learning_pattern:null;
    const learning=lp?{
      save:lp.save===true,
      topic:lp.topic?String(lp.topic).trim().slice(0,500):null,
      pattern:lp.pattern?String(lp.pattern).trim().slice(0,1000):null,
      evidence_summary:lp.evidence_summary?String(lp.evidence_summary).trim().slice(0,1500):null,
      working_lesson:lp.working_lesson?String(lp.working_lesson).trim().slice(0,1200):null,
      next_test:lp.next_test?String(lp.next_test).trim().slice(0,1000):null,
      evidence_count:Math.max(0,Math.min(20,Number(lp.evidence_count||0))),
      confidence:lp.confidence==null?null:Math.max(0,Math.min(1,Number(lp.confidence))),
      status:patternStatuses.includes(lp.status)?lp.status:'testing',
      source_event_ids:Array.isArray(lp.source_event_ids)?lp.source_event_ids.map(x=>String(x||'')).filter(Boolean).slice(0,12):[]
    }:null;

    return {
      personal_training:personalTraining,
      durable_facts:durableFacts,
      conversation_state:conversation,
      causal_event:causal,
      learning_pattern:learning
    };
  }catch(_){
    return null;
  }
}

async function extractPersonalTrainingMemory(message,answer,context,currentSession,recentTraining,learnedFacts){
  const prompt=[
    'أنت أمين سجل التدريب الشخصي للمدرب وائل حاتم.',
    'كل محادثة مع العضو جزء من مسار تدريبه الشخصي، لكن لا تحفظ المجاملات أو التحيات أو التفاصيل العابرة.',
    'استخرج فقط ما يفيد لاحقًا في تدريب هذا العضو وفهم تقدمه.',
    'المصدر الأساسي لحقائق العضو هو كلام العضو نفسه، وليس تخمينات المدرب.',
    'يمكن استخدام رد المدرب لوصف الإجراء التدريبي الذي تم، لكن لا تحوّل كلام المدرب إلى حقيقة عن العضو.',
    'احفظ النتيجة إذا كانت هناك محاولة، نتيجة، تصحيح، درس، هدف، عقبة، تقدم، أو خطوة تالية واضحة.',
    'إذا ذكر العضو معلومة ثابتة عن نفسه أو هدفه أو مستواه أو طريقة تعلمه أو تجربته، أضفها إلى member_facts.',
    'لا تحفظ معلومات صحية أو سياسية أو أسرارًا أو بيانات شديدة الحساسية.',
    'عند وجود تصحيح لمعلومة سابقة، أضف المعلومة الجديدة ولا تطلب حذف القديمة.',
    'أعد JSON فقط بهذا الشكل:',
    '{"training":{"topic":null,"objective":null,"phase":null,"member_statement":null,"coach_action":null,"outcome":null,"lesson":null,"next_step":null},"member_facts":[{"fact":"...","supersedes_id":null}]}',
    'phase يجب أن تكون discover أو explain أو practice أو feedback أو next_step أو complete أو null.',
    'إذا لم يوجد شيء يستحق الحفظ أعد training بكل قيمه null وmember_facts=[]',
    'العضو:',
    JSON.stringify(context.member||{}),
    'الجلسة الحالية:',
    JSON.stringify(currentSession||{}),
    'آخر سجل تدريبي:',
    JSON.stringify((Array.isArray(recentTraining)?recentTraining.slice(0,12):[])),
    'الحقائق الحالية القريبة:',
    JSON.stringify((Array.isArray(learnedFacts)?learnedFacts.slice(0,30):[])),
    'رسالة العضو:',
    String(message||'').slice(0,6000),
    'رد المدرب:',
    String(answer||'').slice(0,6000)
  ].join('\\n');

  try{
    const r=await openai({
      model:OPENAI_HELPER_MODEL,
      instructions:'استخرج سجل تدريب شخصي دقيق. لا تخترع معلومات. JSON فقط.',
      input:[{role:'user',content:prompt}],
      max_output_tokens:700
    });
    if(!r.ok) return null;
    const text=outputText(r.data);
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start<0||end<=start) return null;
    const p=JSON.parse(text.slice(start,end+1));
    const t=p.training&&typeof p.training==='object'?p.training:{};
    const phases=['discover','explain','practice','feedback','next_step','complete'];
    const facts=Array.isArray(p.member_facts)?p.member_facts.map(f=>({
      fact:String(f?.fact||'').trim().slice(0,4000),
      supersedes_id:f?.supersedes_id||null
    })).filter(f=>f.fact).slice(0,8):[];
    return {
      training:{
        topic:String(t.topic||'').trim().slice(0,500)||null,
        objective:String(t.objective||'').trim().slice(0,500)||null,
        phase:phases.includes(t.phase)?t.phase:null,
        member_statement:String(t.member_statement||'').trim().slice(0,3000)||null,
        coach_action:String(t.coach_action||'').trim().slice(0,3000)||null,
        outcome:String(t.outcome||'').trim().slice(0,1200)||null,
        lesson:String(t.lesson||'').trim().slice(0,2000)||null,
        next_step:String(t.next_step||'').trim().slice(0,1200)||null
      },
      member_facts:facts
    };
  }catch(_){return null;}
}

async function savePersonalTrainingMemory(token,memory,currentSession){
  if(!memory) return null;
  const t=memory.training||{};
  const hasTraining=Object.values(t).some(v=>v);
  const facts=Array.isArray(memory.member_facts)?memory.member_facts.filter(x=>x&&x.fact):[];
  if(!hasTraining&&!facts.length) return null;
  const r=await supabaseRpc('append_ai_agent_member_training_memory',{
    p_token:token,
    p_memory:{
      training_session_id:currentSession?.started_at||null,
      session_type:currentSession?.session_type||'coaching',
      ...t,
      member_facts:facts,
      source_message_id:null
    }
  });
  return r.ok ? r.data : null;
}

async function savePersonalTrainingFacts(token,memory){
  const facts=Array.isArray(memory?.member_facts)?memory.member_facts:[];
  if(!facts.length) return [];
  return await saveLearnedFacts(token,facts.map(f=>({
    scope:'member',
    fact:f.fact,
    supersedes_id:f.supersedes_id||null
  })));
}

async function loadPermanentAgentMemory(token){
  try{
    const r=await supabaseRpc('get_ai_agent_permanent_memory',{p_token:token,p_limit:500});
    if(!r.ok||!Array.isArray(r.data)) return [];
    let totalChars=0;
    const out=[];
    for(const x of r.data){
      const payloadRaw=JSON.stringify(x.payload||{});
      const payloadText=payloadRaw.length>1800?payloadRaw.slice(0,1800)+'…':payloadRaw;
      const item={
        event_type:String(x.event_type||''),
        entity_type:String(x.entity_type||''),
        entity_id:x.entity_id||null,
        payload:payloadText,
        created_at:x.created_at||null
      };
      const itemChars=payloadText.length+120;
      if(totalChars+itemChars>120000) break;
      out.push(item);
      totalChars+=itemChars;
    }
    return out;
  }catch(_){return [];}
}

const LOCAL_KNOWLEDGE_FLAT=(()=>{
  const out=[];
  for(const source of LOCAL_KNOWLEDGE_SOURCES){
    const pages=Array.isArray(source?.pages)?source.pages:[];
    for(const page of pages){
      const text=String(page?.text||'').trim();
      if(!text)continue;
      out.push({
        scope:'global',
        category:'source_pdf',
        title:String(source?.source||source?.slug||'')+' — الصفحة '+String(page?.page||''),
        content:text,
        priority:140,
        source:String(source?.slug||source?.source||'local_pdf'),
        page:Number(page?.page||0)
      });
    }
  }
  return out;
})();

const durableKnowledgeCache=new Map();
const DURABLE_KNOWLEDGE_CACHE_TTL_MS=2*60*1000;

function knowledgeRoleScope(role){
  return String(role||'member').toLowerCase()==='leader'?'leader':'member';
}

function fetchKnowledgePage(role,from,to){
  return new Promise(resolve=>{
    if(!SUPABASE_SECRET_KEY)return resolve({ok:false,data:[],status:0});
    const q=new URLSearchParams();
    q.set('select','scope,category,title,content,priority,updated_at');
    q.set('active','eq.true');
    q.set('scope',`in.(global,${knowledgeRoleScope(role)})`);
    q.set('order','priority.desc,updated_at.desc');
    const target=new URL(`${SUPABASE_URL_FIXED}/rest/v1/ai_agent_knowledge?${q.toString()}`);
    const req=https.request({
      protocol:target.protocol,
      hostname:target.hostname,
      port:target.port||443,
      method:'GET',
      path:target.pathname+target.search,
      headers:{
        Accept:'application/json',
        apikey:SUPABASE_SECRET_KEY,
        Authorization:'Bearer '+SUPABASE_SECRET_KEY,
        Range:`${from}-${to}`,
        Prefer:'count=exact'
      },
      timeout:15000
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',x=>text+=x);
      res.on('end',()=>{
        let data=[];
        try{data=text?JSON.parse(text):[]}catch(_){data=[]}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,data:Array.isArray(data)?data:[],status:res.statusCode||0});
      });
    });
    req.on('timeout',()=>req.destroy());
    req.on('error',()=>resolve({ok:false,data:[],status:0}));
    req.end();
  });
}

async function loadAllDurableKnowledge(role){
  const key=knowledgeRoleScope(role);
  const cached=durableKnowledgeCache.get(key);
  if(cached&&Date.now()-cached.at<DURABLE_KNOWLEDGE_CACHE_TTL_MS)return cached.rows;

  const rows=[];
  const pageSize=250;
  const maxRows=3000;
  for(let from=0;from<maxRows;from+=pageSize){
    const r=await fetchKnowledgePage(role,from,Math.min(from+pageSize-1,maxRows-1));
    if(!r.ok||!r.data.length)break;
    rows.push(...r.data);
    if(r.data.length<pageSize)break;
  }

  const normalized=rows.map(x=>({
    scope:x.scope||'global',
    category:x.category||'platform',
    title:x.title||null,
    content:String(x.content||'').trim().slice(0,12000),
    priority:Number(x.priority||0),
    source:x.source||null,
    updated_at:x.updated_at||null
  })).filter(x=>x.content);

  durableKnowledgeCache.set(key,{at:Date.now(),rows:normalized});
  return normalized;
}

async function searchDurableKnowledge(token,role,query,limit=80){
  const q=String(query||'').trim();
  if(!q||!SUPABASE_SECRET_KEY)return [];
  try{
    const r=await supabaseRpc('search_ai_agent_knowledge',{
      p_token:token,
      p_query:q,
      p_limit:Math.max(1,Math.min(Number(limit||80),80))
    });
    if(!r.ok||!Array.isArray(r.data))return [];
    return r.data.map(x=>({
      scope:x.scope||'global',
      category:x.category||'platform',
      title:x.title||null,
      content:String(x.content||'').trim().slice(0,12000),
      priority:Number(x.priority||0),
      source:x.source||null,
      updated_at:x.updated_at||null,
      relevance:Number(x.relevance||0)
    })).filter(x=>x.content);
  }catch(_){return [];}
}

async function loadAgentKnowledge(token,role='member',message=''){
  const [durableAll,local]=await Promise.all([
    loadAllDurableKnowledge(role),
    Promise.resolve(LOCAL_KNOWLEDGE_FLAT)
  ]);

  // Retrieval must be query-driven, but the original source files remain
  // authoritative. Search is an index over the existing knowledge; it does
  // not create summaries or replace source content.
  let retrieved=[];
  if(String(message||'').trim()){
    const aliases=memorySearchTerms(message);
    const queries=[String(message).trim()];
    if(aliases.length)queries.push(aliases.join(' '));
    const results=await Promise.all(
      queries.slice(0,2).map(q=>searchDurableKnowledge(token,role,q,80))
    );
    const seen=new Set();
    for(const rows of results){
      for(const row of rows){
        const key=[row.source||'',row.title||'',String(row.content||'').slice(0,160)].join('|');
        if(seen.has(key))continue;
        seen.add(key);
        retrieved.push(row);
      }
    }
  }

  const retrievedMap=new Map(
    retrieved.map(x=>[
      [String(x.source||''),String(x.title||''),String(x.content||'').slice(0,160)].join('|'),
      x
    ])
  );

  const seen=new Set();
  const merged=[];
  for(const item of [...retrieved,...local,...durableAll]){
    const key=[
      String(item?.source||''),
      String(item?.page||''),
      String(item?.title||''),
      String(item?.content||'').slice(0,120)
    ].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    const hit=retrievedMap.get([
      String(item?.source||''),String(item?.title||''),String(item?.content||'').slice(0,160)
    ].join('|'));
    merged.push(hit?{...item,relevance:Number(hit.relevance||0)}:item);
  }

  // Keep source rows available for the source-fidelity layer, while placing
  // query-matched rows first for ordinary questions.
  return merged.sort((a,b)=>
    Number(b?.relevance||0)-Number(a?.relevance||0) ||
    Number(b?.priority||0)-Number(a?.priority||0)
  );
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

  async get_dxn_team_intelligence(token,args={}){
    const ctx=await loadContext(token);
    if(!ctx.member?.member_no) throw new Error('لا يمكن تحديد رقم عضوية العضو الحالي');
    const mode=['summary','member','downline','generation','line_summary'].includes(String(args.mode||'').toLowerCase())
      ? String(args.mode).toLowerCase()
      : 'summary';
    const memberNo=String(args.member_no||'').trim()||null;
    const generation=args.generation==null||args.generation===''?null:Number(args.generation);
    const limit=Math.max(1,Math.min(Number(args.limit||50),200));
    if(generation!==null && (!Number.isInteger(generation)||generation<0)) {
      throw new Error('رقم الجيل غير صالح');
    }
    const r=await supabaseRpc('get_dxn_team_intelligence',{
      p_token:token,
      p_mode:mode,
      p_member_no:memberNo,
      p_generation:generation,
      p_limit:limit
    });
    if(!r.ok) throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'تعذر قراءة بيانات فريق DXN');
    return r.data;
  },
  async search_dxn_team_members(token,args={}){
    const query=String(args.query||'').trim();
    if(!query) throw new Error('اكتب اسم العضو أو جزءًا من الاسم');
    const limit=Math.max(1,Math.min(Number(args.limit||20),50));
    const r=await supabaseRpc('search_dxn_team_members',{
      p_token:token,
      p_query:query,
      p_limit:limit
    });
    if(!r.ok) throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'تعذر البحث عن العضو');

    // If the name resolves to exactly one Downline member, immediately load
    // that member's real Team Intelligence record. This prevents the model
    // from accidentally answering with the authenticated user's own profile.
    const result=r.data||{};
    const members=Array.isArray(result.members)?result.members:[];
    if(Number(result.count||0)===1 && members.length===1 && members[0]?.member_no){
      const selectedMemberNo=String(members[0].member_no).trim();
      try{
        const memberIntelligence=await AGENT_TOOLS.get_dxn_team_intelligence(token,{
          mode:'member',
          member_no:selectedMemberNo,
          generation:null,
          limit:1
        });
        return {
          ...result,
          selected_member:members[0],
          member_intelligence:memberIntelligence
        };
      }catch(_){
        // Keep the successful name-search result even if the detail lookup fails.
      }
    }
    return result;
  },
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

function buildCognitiveState({message,context,currentSession,dailyAutoPlan,directDailyCompletion}){
  const s=String(message||'').trim().toLowerCase();

  let user_intent='general_conversation';
  if(hasExplicitTaskCompletionEvidence(message)) user_intent='report_task_completion';
  else if(/شلون|كيف|ماذا|شنو|ليش|وين|متى|هل\s/.test(s)) user_intent='ask_question';
  else if(/أريد|اريد|أحتاج|احتاج|ساعدني|خلينا|ابدأ|نبدأ/.test(s)) user_intent='request_help';
  else if(/ما أگدر|ما اكدر|ما أقدر|صعب|محتار|متردد|ما أعرف|ما اعرف/.test(s)) user_intent='report_obstacle';
  else if(/جربت|سويت|طبقت|نفذت|عملت/.test(s)) user_intent='report_attempt';

  const interaction_signal=hasExplicitTaskCompletionEvidence(message)
    ? 'explicit_completion'
    : /ما أگدر|ما اكدر|ما أقدر|صعب|محتار|متردد|ما أعرف|ما اعرف/.test(s)
      ? 'possible_obstacle'
      : /رفض|رفضني|ما رد|ما ردوا|ما اقتنع/.test(s)
        ? 'reported_result_or_objection'
        : 'neutral';

  const current_task=currentSession?.objective
    || dailyAutoPlan?.actions?.[0]?.title
    || null;

  const current_goal=currentSession?.objective
    || dailyAutoPlan?.actions?.[0]?.reason
    || 'مساعدة العضو على التقدم بخطوة عملية واضحة';

  const known_facts=[];
  if(current_task) known_facts.push('المهمة الحالية: '+String(current_task).slice(0,300));
  if(currentSession?.phase) known_facts.push('مرحلة الجلسة: '+String(currentSession.phase));
  if(currentSession?.session_type) known_facts.push('نوع الجلسة: '+String(currentSession.session_type));
  if(directDailyCompletion) known_facts.push('تم تسجيل إكمال المهمة السابقة في هذه الرسالة');

  const unknown_facts=[];
  if(user_intent==='report_obstacle') unknown_facts.push('سبب العائق المحدد يحتاج إلى توضيح');
  if(user_intent==='report_attempt') unknown_facts.push('نتيجة المحاولة تحتاج إلى توضيح');
  if(!current_task) unknown_facts.push('لا توجد مهمة حالية مؤكدة في السياق');

  let next_best_action='أجب عن الطلب الحالي ثم اختر خطوة واحدة فقط مناسبة للتقدم.';
  if(user_intent==='report_obstacle') next_best_action='شخّص العائق بسؤال واحد قبل إعطاء الحل.';
  else if(user_intent==='report_attempt') next_best_action='اسأل عن النتيجة ثم عدّل الخطوة بناءً عليها.';
  else if(user_intent==='report_task_completion') next_best_action='انتقل للمهمة التالية وابدأها بسؤال أو تطبيق واحد.';
  else if(currentSession?.phase==='practice') next_best_action='اطلب محاولة عملية واحدة ثم قيّمها.';
  else if(currentSession?.phase==='feedback') next_best_action='قدّم تصحيحًا واحدًا واضحًا ثم اطلب المحاولة المحسنة.';

  return {
    version:'cognitive_state_v1',
    user_intent,
    interaction_signal,
    current_goal:String(current_goal||'').slice(0,500),
    current_task:String(current_task||'').slice(0,500)||null,
    session_phase:currentSession?.phase||null,
    session_type:currentSession?.session_type||null,
    known_facts:known_facts.slice(0,8),
    unknown_facts:unknown_facts.slice(0,6),
    next_best_action,
    decision_rule:'افهم السياق أولًا، لا تفترض ما ينقصك، واسأل سؤالًا واحدًا فقط عندما تكون الإجابة ضرورية للقرار.'
  };
}
function buildLongTermPersonalModel({memoryState,coachingProfile,reflectionState,currentSession}){
  const p=memoryState?.personal_memory||coachingProfile||{};
  const strengths=Array.isArray(p.strengths)?p.strengths.slice(0,8):[];
  const gaps=Array.isArray(p.gaps)?p.gaps.slice(0,8):[];
  const outcome=reflectionState?.outcome||'unknown';
  return {
    version:'long_term_personal_model_v1',
    profile:{
      goal:p.goal||null,
      experience_level:p.experience_level||'unknown',
      focus_area:p.focus_area||null,
      strengths,
      gaps,
      current_next_step:p.current_next_step||null
    },
    learning_pattern:{
      current_outcome:outcome,
      current_session_type:currentSession?.session_type||null,
      current_phase:currentSession?.phase||null,
      adaptive_mode:reflectionState?.adjustment||'continue'
    },
    stable_facts:[],
    inferred_patterns:[],
    update_policy:'احفظ فقط الحقائق التدريبية الصريحة في ملف العضو. الأنماط المستنتجة تبقى مؤقتة ولا تصبح حقائق ثابتة إلا بعد تكرار أو تصريح واضح.',
    safety_policy:'لا تبنِ أو تحفظ استنتاجات حساسة أو تشخيصات أو تنبؤات شخصية.'
  };
}

function buildReflectionState({message,cognitiveState,memoryState,decisionState,adaptiveDialogueState,currentSession}){
  const s=String(message||'').toLowerCase();
  const recent=Array.isArray(memoryState?.recent_relevant_messages)?memoryState.recent_relevant_messages:[];
  let outcome='unknown',signal='none',learning='لا توجد نتيجة مؤكدة بعد.',adjustment='continue';
  if(/نجح|نجحت|فادني|فادتني|اشتغل|اشتغلت|ضبط|ضبطت|اقتنعت|وافق|وافقوا/.test(s)){
    outcome='positive'; signal='reported_success'; learning='الأسلوب الحالي لديه إشارة نجاح صريحة من العضو.'; adjustment='increase_challenge_gradually';
  }else if(/فشل|فشلت|ما نفع|ما نفعني|ما اشتغل|ما اشتغلت|رفض|رفضني|ما اقتنع|ما رد/.test(s)){
    outcome='negative'; signal='reported_failure'; learning='الأسلوب الحالي لديه إشارة عدم نجاح أو اعتراض صريح.'; adjustment='change_approach';
  }else if(cognitiveState?.interaction_signal==='possible_obstacle'){
    outcome='blocked'; signal='obstacle'; learning='هناك عائق لم يُشخّص بعد.'; adjustment='diagnose_before_teaching';
  }else if(cognitiveState?.user_intent==='report_attempt'){
    signal='attempt_reported'; learning='تم الإبلاغ عن محاولة لكن نتيجتها غير مؤكدة.'; adjustment='ask_for_result';
  }
  if(currentSession?.phase==='feedback'&&adaptiveDialogueState?.mode==='feedback'){
    adjustment='apply_one_correction_then_retry';
  }
  return {
    version:'reflection_learning_v1',
    outcome,signal,learning,adjustment,
    evidence_count:recent.length,
    rule:'لا تعتبر الاستنتاج تعلمًا ثابتًا إلا إذا دعمه تصريح واضح من العضو أو تكرار سلوك يمكن ملاحظته. استخدم النتيجة الحالية لتكييف الحوار، ولا تحوّلها إلى حقيقة شخصية محفوظة دون تصريح.'
  };
}

function buildContextualCoachingState({
  message,
  cognitiveState,
  memoryState,
  conversationState,
  causalMemory,
  learningPatterns,
  currentSession
}){
  const text=String(message||'').trim().toLowerCase();
  const profile=memoryState?.personal_memory||{};
  const recentEvents=Array.isArray(causalMemory)?causalMemory.slice(0,6):[];
  const patterns=Array.isArray(learningPatterns)?learningPatterns.filter(x=>x&&x.status!=='rejected'&&x.status!=='superseded').slice(0,6):[];

  let person_context='unknown';
  if(/شخص جديد|جديد تمامًا|ما اعرفه|ما أعرفه|ما اعرفه من قبل|أول مرة|اول مرة|ما بينا معرفة|ما بينا سابق/.test(text)){
    person_context='new_person';
  }else if(/أعرفه|اعرفه|نعرف بعض|بيننا معرفة|صديقي|زميلي|قريبي|سبق وحچينا|سبق وحكينا|سبق وتكلمنا|تكلمنا قبل|حچينا قبل/.test(text)){
    person_context='known_person';
  }else if(/سبق|قبل|مرة ثانية|مرة ثانيه|رجع|تابعت وياه|تابعت معه|رد علي|ما رد|رفض|وافق|اعترض|مهتم/.test(text)){
    person_context='previous_interaction';
  }

  let situation='general';
  if(/فتح حوار|أفتح حوار|افتح حوار|أبدي حوار|ابدأ حوار|أكلمه|اكلمه|أتواصل|اتواصل|رسالة أولى|رساله اولى/.test(text)) situation='opening_conversation';
  else if(/متابعة|أتابعه|اتابعه|أتابع|اتابع|بعد ما رد|بعد الرد|رجع رد|متابعة شخص/.test(text)) situation='follow_up';
  else if(/اعتراض|اعترض|رافض|رفض|مو مقتنع|ما مقتنع|سأل عن السعر|السعر|غالي/.test(text)) situation='objection_handling';
  else if(/شرح المشروع|أشرح المشروع|اشرح المشروع|أعرض المشروع|اعرض المشروع|أقدم المشروع|اقدم المشروع/.test(text)) situation='presentation';
  else if(/دعوة|أدعوه|ادعوه|دعيت|أدعوه للمشروع|ادعوه للمشروع/.test(text)) situation='invitation';

  let goal_context='unknown';
  if(/أريد أفتح|اريد افتح|أريد أبدأ|اريد ابدي|أريد أتواصل|اريد اتواصل/.test(text)) goal_context='start_contact';
  else if(/أريد أعرف اهتمامه|اريد اعرف اهتمامه|أريد أعرف احتياجه|اريد اعرف احتياجه|أريد أفهمه|اريد افهمه/.test(text)) goal_context='discover_need';
  else if(/أريد أقدم|اريد اقدم|أريد أشرح|اريد اشرح|أريد أعرض|اريد اعرض/.test(text)) goal_context='present_offer';
  else if(/أريد أتابع|اريد اتابع|شلون أتابع|شلون اتابع/.test(text)) goal_context='follow_up';

  const relevantPattern=patterns.find(p=>{
    const blob=[p.topic,p.pattern,p.working_lesson,p.next_test].filter(Boolean).join(' ').toLowerCase();
    return !blob || ['opening_conversation','follow_up','objection_handling','presentation','invitation'].some(k=>k===situation);
  })||null;

  const relevantEvents=recentEvents.filter(e=>{
    const blob=[e.topic,e.attempt,e.result,e.observation,e.adjustment].filter(Boolean).join(' ').toLowerCase();
    if(!blob)return false;
    if(situation==='opening_conversation')return /حوار|رسالة|بداية|افتتاح|مشروع|تواصل/.test(blob);
    if(situation==='follow_up')return /متابع|رد|رسالة|تواصل/.test(blob);
    if(situation==='objection_handling')return /اعتراض|رفض|سعر|مقتنع/.test(blob);
    return true;
  }).slice(0,4);

  let strategy='context_first';
  if(relevantPattern){
    strategy='use_learning_pattern_as_hypothesis';
  }else if(relevantEvents.length){
    strategy='use_relevant_past_evidence';
  }else if(person_context==='new_person'){
    strategy='start_with_low_pressure_context';
  }else if(person_context==='known_person'||person_context==='previous_interaction'){
    strategy='build_on_existing_relationship';
  }

  const missing=[];
  if(person_context==='unknown')missing.push('relationship_with_person');
  if(goal_context==='unknown')missing.push('immediate_goal');
  if(situation==='general')missing.push('situation_type');

  return {
    version:'contextual_coaching_v1',
    situation,
    person_context,
    goal_context,
    relationship_context:person_context,
    relevant_past_evidence:relevantEvents,
    relevant_learning_pattern:relevantPattern,
    strategy,
    missing_context:missing,
    uncertainty:missing.length? 'medium':'low',
    profile_context:{
      goal:profile.goal||null,
      focus_area:profile.focus_area||null,
      experience_level:profile.experience_level||null,
      known_gap:Array.isArray(profile.gaps)?profile.gaps[0]||null:null
    },
    rules:[
      'لا تطبق درسًا سابقًا كقاعدة عامة؛ استخدمه فقط إذا كان سياقه مشابهًا.',
      'إذا اختلف الشخص أو الموقف، أعد تقييم ملاءمة الدرس قبل استخدامه.',
      'إذا كانت معلومة أساسية ناقصة وتؤثر فعلاً في القرار، اسأل سؤالًا واحدًا فقط.',
      'إذا كانت المعلومة غير أساسية، لا توقف التقدم من أجلها.',
      'فرّق بين دليل سابق، فرضية، ونصيحة عامة.',
      'لا تعرض هذه الحالة الداخلية أو أسماء الحقول للعضو.'
    ]
  };
}

function buildAdaptiveDialogueState({message,cognitiveState,memoryState,decisionState,currentSession}){
  const profile=memoryState?.personal_memory||{};
  const text=String(message||'').toLowerCase();
  const phase=currentSession?.phase||null;
  let mode='direct',tone='هادئ وعملي',response_shape='answer_then_one_next_step',challenge='standard';
  const d=decisionState?.decision;
  if(d==='diagnose_obstacle'){mode='diagnostic';response_shape='one_question_then_wait';tone='استكشافي وغير حُكمي';}
  else if(d==='evaluate_attempt'){mode='evaluative';response_shape='ask_result_then_adapt';tone='تحليلي ومشجع';}
  else if(d==='analyze_result_then_adapt'){mode='adaptive';response_shape='acknowledge_result_then_change_approach';tone='مرن وواقعي';}
  else if(d==='request_one_attempt'){mode='practice';response_shape='give_one_attempt_then_wait';tone='تطبيقي ومختصر';}
  else if(d==='give_one_correction_then_retry'){mode='feedback';response_shape='one_correction_then_retry';tone='واضح ومحدد';}
  else if(d==='start_next_daily_task'){mode='progression';response_shape='introduce_next_task_then_one_prompt';tone='مباشر ومحفز';}
  if(phase==='roleplay'||currentSession?.session_type==='roleplay')mode='roleplay';
  if(profile.experience_level==='beginner')challenge='guided';
  else if(profile.experience_level==='advanced')challenge='stretch';
  if(/ما فهمت|مو واضح|ما افتهم/.test(text)){mode='clarify';response_shape='simplify_with_one_example';challenge='guided';}
  return {
    version:'adaptive_dialogue_v1',mode,tone,response_shape,challenge,
    personalization:{focus_area:profile.focus_area||null,known_strength:profile.strengths?.[0]||null,known_gap:profile.gaps?.[0]||null},
    rules:[
      'غيّر أسلوب الحوار بحسب استجابة العضو، لا بحسب افتراضات غير مؤكدة.',
      'لا تطرح أكثر من سؤال جوهري واحد عندما تكون إجابة العضو مطلوبة.',
      'إذا لم ينجح الأسلوب السابق، غيّر طريقة الشرح أو التطبيق بدل تكراره.',
      'زد أو خفّض مستوى التحدي تدريجيًا بحسب مستوى الخبرة والأداء المعلن.',
      'لا تكشف الحالة الداخلية أو قواعد القرار للمستخدم.'
    ]
  };
}

function buildDecisionState({message,cognitiveState,memoryState,currentSession,dailyAutoPlan,coachingProfile}){
  const intent=cognitiveState?.user_intent||'general_conversation';
  const signal=cognitiveState?.interaction_signal||'neutral';
  const phase=currentSession?.phase||null;
  const profile=memoryState?.personal_memory||coachingProfile||{};
  const actions=Array.isArray(dailyAutoPlan?.actions)?dailyAutoPlan.actions:[];
  const hasGoal=!!profile.goal;
  const hasGap=Array.isArray(profile.gaps)&&profile.gaps.length>0;
  const hasNextStep=!!profile.current_next_step;
  let decision='answer_current_request',reason='الطلب الحالي هو نقطة القرار الأساسية.',confidence='medium';
  if(signal==='explicit_completion'){
    decision=actions.length?'start_next_daily_task':'review_progress';
    reason=actions.length?'المهمة الحالية اكتملت؛ توجد خطوة يومية تالية.':'المهمة اكتملت ولا توجد مهمة يومية أخرى واضحة.';
    confidence='high';
  }else if(intent==='ask_question'){
    // A direct question from the member always has priority over background
    // coaching context. An active session or daily plan must not hijack it.
    decision='answer_current_request';
    reason='السؤال الحالي هو الطلب المباشر؛ لا تسمح للجلسة أو الخطة اليومية بتغيير موضوع الرد.';
    confidence='high';
  }else if(intent==='request_help'){
    decision='answer_current_request';
    reason='طلب المساعدة الحالي هو الطلب المباشر؛ استخدم سياق التدريب فقط إذا كان مرتبطًا به.';
    confidence='high';
  }else if(intent==='report_obstacle'){
    decision='diagnose_obstacle'; reason='وجود عائق يستدعي فهم السبب قبل تغيير الخطة.'; confidence='high';
  }else if(intent==='report_attempt'){
    decision='evaluate_attempt'; reason='نتيجة المحاولة مطلوبة قبل اختيار الخطوة التالية.'; confidence='high';
  }else if(signal==='reported_result_or_objection'){
    decision='analyze_result_then_adapt'; reason='ظهرت نتيجة أو اعتراض؛ يجب تعديل الخطوة بدل تكرارها آليًا.'; confidence='high';
  }else if(phase==='practice'){
    decision='request_one_attempt'; reason='الجلسة في مرحلة تطبيق.'; confidence='high';
  }else if(phase==='feedback'){
    decision='give_one_correction_then_retry'; reason='الجلسة في مرحلة تغذية راجعة.'; confidence='high';
  }else if(actions.length){
    decision='continue_daily_plan'; reason='توجد مهمة يومية مرتبطة بتقدم العضو.';
  }else if(hasNextStep){
    decision='continue_member_next_step'; reason='يوجد next step محفوظ في ملف العضو.';
  }else if(hasGap){
    decision='target_known_gap'; reason='يوجد مجال ضعف محفوظ يمكن تحويله إلى تطبيق.';
  }else if(hasGoal){
    decision='advance_toward_goal'; reason='يوجد هدف محفوظ يمكن ربط الرد به.';
  }
  return {
    version:'decision_state_v1',decision,reason,confidence,
    based_on:{intent,signal,session_phase:phase,has_daily_action:actions.length>0,has_goal:hasGoal,has_known_gap:hasGap,has_saved_next_step:hasNextStep},
    guardrails:[
      'لا تغيّر الهدف أو الخطة بناءً على استنتاج غير مؤكد.',
      'إذا كان القرار يعتمد على معلومة ناقصة اسأل سؤالًا واحدًا فقط.',
      'لا تكرر محاولة ثبت فشلها دون تعديل واضح.',
      'بعد نتيجة إيجابية زد التحدي تدريجيًا بدل إعادة نفس الشرح.',
      'بعد عائق متكرر ابحث عن السبب قبل إضافة مهمة جديدة.'
    ]
  };
}

async function buildMemoryState(token,message,cognitiveState,currentSession,coachingProfile=null){
  try{
    const rows=await loadAgentMemory(token);
    const recent=Array.isArray(rows)?rows.slice(-8):[];

    // Personal memory is durable; conversation memory is used only when it
    // matches the current request. This prevents old topics from hijacking replies.
    const personal_memory={
      goal:coachingProfile?.goal||null,
      experience_level:coachingProfile?.experience_level||'unknown',
      focus_area:coachingProfile?.focus_area||null,
      strengths:Array.isArray(coachingProfile?.strengths)?coachingProfile.strengths.slice(0,8):[],
      gaps:Array.isArray(coachingProfile?.gaps)?coachingProfile.gaps.slice(0,8):[],
      current_next_step:coachingProfile?.current_next_step||null
    };

    let relevant=rankMemoryByRelevance(
      recent,
      message,
      {
        limit:4,
        textOf:item=>String(item?.content||'')
      }
    );

    const shortFollowup=/^(?:طيب|زين|تمام|بس|وبعدين|واذا|إذا|ليش|شلون|شنو|وهسه|يعني|اوكي|أوكي|نعم|إي|اي)\b/i.test(String(message||'').trim());
    if(!relevant.length&&shortFollowup){
      relevant=recent.slice(-2);
    }

    const facts=[];
    const seen=new Set();
    for(const item of relevant){
      const content=String(item?.content||'').trim().slice(0,700);
      const key=content.toLowerCase();
      if(!content||seen.has(key))continue;
      seen.add(key);
      facts.push({
        role:item.role==='assistant'?'assistant':'user',
        content
      });
    }

    return {
      version:'personal_memory_v1',
      personal_memory,
      recent_relevant_messages:facts,
      memory_rule:'الذاكرة الشخصية تمثل معلومات تدريبية مستقرة صرّح بها العضو وحُفظت في ملفه. ذاكرة الحوار للترابط فقط. لا تحول الاستنتاج إلى حقيقة، واعتمد أحدث معلومة صريحة عند التعارض.'
    };
  }catch(_){
    return {
      version:'personal_memory_v1',
      personal_memory:{
        goal:coachingProfile?.goal||null,
        experience_level:coachingProfile?.experience_level||'unknown',
        focus_area:coachingProfile?.focus_area||null,
        strengths:Array.isArray(coachingProfile?.strengths)?coachingProfile.strengths.slice(0,8):[],
        gaps:Array.isArray(coachingProfile?.gaps)?coachingProfile.gaps.slice(0,8):[],
        current_next_step:coachingProfile?.current_next_step||null
      },
      recent_relevant_messages:[],
      memory_rule:'لا توجد ذاكرة حوار إضافية؛ استخدم فقط المعلومات الشخصية المحفوظة والسياق الحالي.'
    };
  }
}


function firstMemberName(member){
  const raw=String(member?.name||'').trim();
  return raw?raw.split(/\s+/)[0]:'';
}

function buildDeterministicChatReply(message,member){
  const s=String(message||'').trim().toLowerCase().replace(/[،,!.؟?]+$/,'').trim();
  const first=firstMemberName(member);
  const who=first?(' '+first):'';
  if(/^(?:هلا|هلا والله|هلا بيك|اهلا|أهلا|أهلًا|مرحبا|مرحبًا|السلام عليكم|السلام عليكم ورحمة الله|صباح الخير|مساء الخير)$/i.test(s)){
    return 'هلا'+who+' 🌷 شلون أگدر أساعدك هسه؟';
  }
  if(/^(?:شلونك|شخبارك|كيفك|يعطيك العافية|يعافيك)$/i.test(s)){
    return 'تمام والحمد لله 🌷 شنو تحب نشتغل عليه هسه؟';
  }
  if(/^(?:شكرا|شكرًا|مشكور|مشكورة|thanks|thank you)$/i.test(s)){
    return 'العفو 🌷 نكمل من النقطة اللي تريدها.';
  }
  if(/^(?:ممتاز|تمام|زين|حلو|اوكي|أوكي|ok)$/i.test(s)){
    return 'زين 👍 خلينا نكمل. شنو تريد نشتغل عليه هسه؟';
  }
  return null;
}

function canUseDeterministicChatReply(message,currentSession,conversationState){
  if(!isLowInformationChatMessage(message)) return false;
  if(currentSession?.active) return false;
  if(conversationState?.pending_question||conversationState?.pending_member_action||conversationState?.open_loop) return false;
  return true;
}

function detectDirectAssessmentRequest(message){
  const s=String(message||'').trim().toLowerCase();
  if(!s)return null;
  if(/(?:نتيج(?:تي|ة)|درجات(?:ي|ي بالاختبار|الاختبار)|أدائي|ادائي|متوسط درجتي|كم جبت|شكد جبت|كم اختبار.*(?:نجح|مكتمل)|شكد اختبار.*(?:نجح|مكتمل)).*?(?:اختبار|اختبارات)?/i.test(s)){
    const m=s.match(/(?:الاختبار|اختبار|التدريب)\s*(?:رقم\s*)?(\d{1,2})/i);
    return m?{kind:'lesson',lesson_no:Number(m[1])}:{kind:'summary',lesson_no:null};
  }
  if(/(?:اختبارات|الاختبار|درجاتي|نتيجة الاختبار|نتيجة الاختبارات).*(?:الثالث|الثاني|الأول|الاول|الرابع|الخامس|السادس|السابع|الثامن|\d{1,2})/i.test(s)){
    const m=s.match(/(?:الاختبار|اختبار)\s*(?:رقم\s*)?(\d{1,2})/i);
    if(m)return {kind:'lesson',lesson_no:Number(m[1])};
  }
  return null;
}

function buildDirectAssessmentReply(performance,request){
  const p=performance||{};
  const lessons=Array.isArray(p.lessons)?p.lessons:[];
  if(!lessons.length){
    if(request?.kind==='summary' && !Number(p.total_answered||0))return 'ماكو نتائج اختبارات مسجلة عندي حاليًا.';
    return 'ماكو بيانات كافية عن الاختبارات حتى أعطيك نتيجة دقيقة.';
  }
  if(request.kind==='lesson'){
    const row=lessons.find(x=>Number(x.lesson_no)===Number(request.lesson_no));
    if(!row)return 'ما لقيت نتيجة مسجلة لهذا الاختبار حاليًا.';
    return 'نتيجة اختبار التدريب '+row.lesson_no+':\\nالاختبار: '+String(row.lesson_title||'')+
      '\\nعدد الإجابات: '+Number(row.answered||0)+
      '\\nالمتوسط: '+Number(row.average_score||0)+'%'+
      '\\nناجح: '+Number(row.approved||0)+
      '\\nإعادة: '+Number(row.retry||0);
  }
  return 'ملخص اختباراتك:\\n'+
    'الإجابات المقيمة: '+Number(p.total_answered||0)+
    '\\nالمقبول: '+Number(p.approved||0)+
    '\\nيحتاج إعادة: '+Number(p.retry||0)+
    '\\nبانتظار التقييم: '+Number(p.pending||0)+
    '\\nمتوسط الأداء: '+Number(p.average_score||0)+'%'+
    (lessons.length?'\\n\\nحسب التدريب:\\n'+lessons.map(x=>String(x.lesson_no)+'. '+String(x.lesson_title||'')+' — '+Number(x.average_score||0)+'%').join('\\n'):'');
}

function detectDirectTrainingInfoRequest(message){
  const s=String(message||'').trim().toLowerCase();
  if(!s) return null;
  if(/(?:شنو|ما هي|ماهي|اعرف|أريد أعرف|اريد اعرف|اعرفلي|اعطني|أعطني|اعطنيلي).*?(?:التدريبات|الدروس)/.test(s) ||
     /(?:كل|قائمة).*?(?:التدريبات|الدروس)/.test(s)){
    return 'list';
  }
  if(/(?:تقدمي|تقدمي بالتدريبات|وين وصلت|وين واصل|كم كملت|شكد كملت|كم تدربت|شكد تدربت|نسبة إكمال|نسبه اكمال|نسبة التقدم|نسبه التقدم)/.test(s)){
    return 'progress';
  }
  if(/(?:مشاهدتي|مشاهداتي|نسبة المشاهدة|نسبه المشاهده|كم شاهدت|شكد شاهدت|شكد وصلت مشاهدة|وين وصلت مشاهدة|watch[_\s-]?percent)/.test(s)){
    return 'watch';
  }
  if(/(?:التدريب|الدرس)\s*(?:رقم|رقمًا)?\s*([0-9]{1,2})/.test(s) ||
     /(?:الدرس|التدريب)\s*(?:الأول|الاول|الثاني|الثانى|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/.test(s)){
    return 'lesson';
  }
  if(/(?:شنو|ما هو|ماهو).*?(?:التدريب|الدرس).*?(?:الي|الذي|اللي).*?(?:مكتمل|اكملته|كملته|خلصته|متبقي|باقي)/.test(s) ||
     /(?:شنو|ما هي|ماهي).*?(?:التدريبات|الدروس).*?(?:المتبقية|الباقية)/.test(s)){
    return 'remaining';
  }
  return null;
}

function directTrainingOrdinalToNumber(message){
  const s=String(message||'').toLowerCase();
  const m=s.match(/(?:التدريب|الدرس)\s*(?:رقم|رقمًا)?\s*(\d{1,2})/);
  if(m)return Number(m[1]);
  const words={
    'الأول':1,'الاول':1,'الثاني':2,'الثانى':2,'الثالث':3,'الرابع':4,
    'الخامس':5,'السادس':6,'السابع':7,'الثامن':8,'التاسع':9,'العاشر':10
  };
  for(const [w,n] of Object.entries(words)) if(s.includes(w)) return n;
  return null;
}

function buildDirectTrainingReply(context,kind,message){
  const lessons=Array.isArray(context?.lessons)?context.lessons:[];
  const progress=Array.isArray(context?.progress)?context.progress:[];
  const byId=new Map(progress.map(p=>[String(p.lesson_id),p]));
  const rows=lessons.map((l,index)=>{
    const p=byId.get(String(l.id))||byId.get(String(l.lesson_id))||{};
    return {
      no:Number(l.lesson_no||index+1),
      title:String(l.title||'').trim()||('التدريب '+(index+1)),
      completed:!!p.completed,
      watch_percent:Math.max(0,Math.min(100,Number(p.watch_percent||0)))
    };
  });
  const completed=rows.filter(x=>x.completed).length;
  const total=rows.length;
  const remaining=rows.filter(x=>!x.completed);

  if(kind==='list'){
    if(!rows.length)return 'ماكو تدريبات متاحة حاليًا في بيانات حسابك.';
    const lines=rows.map(x=>String(x.no)+'. '+x.title).join('\n');
    return 'هذه التدريبات الموجودة بحسابك حاليًا:\n'+lines;
  }

  if(kind==='progress'){
    if(!rows.length)return 'ماكو بيانات تدريبات متاحة حاليًا.';
    const pct=total?Math.round(completed/total*100):0;
    return 'تقدمك الحالي: '+completed+' من '+total+' تدريبات مكتملة ('+pct+'%).\nالمتبقي: '+remaining.length+' تدريب.';
  }

  if(kind==='watch'){
    if(!rows.length)return 'ماكو بيانات مشاهدة متاحة حاليًا.';
    const lines=rows.map(x=>String(x.no)+'. '+x.title+': '+x.watch_percent+'%'+(x.completed?' — مكتمل':'' )).join('\n');
    return 'هذه نسب المشاهدة المسجلة عندك:\n'+lines;
  }

  if(kind==='remaining'){
    if(!remaining.length)return 'كل التدريبات المتاحة عندك مكتملة حاليًا. ✅';
    return 'التدريبات المتبقية عندك:\n'+remaining.map(x=>String(x.no)+'. '+x.title+' — '+x.watch_percent+'% مشاهدة').join('\n');
  }

  if(kind==='lesson'){
    const no=directTrainingOrdinalToNumber(message);
    const row=rows.find(x=>x.no===no);
    if(!row)return no?'ما لقيت تدريب رقم '+no+' ضمن تدريبات حسابك.':'حدد لي رقم التدريب حتى أعطيك حالته.';
    return 'التدريب '+row.no+': '+row.title+'\nنسبة المشاهدة: '+row.watch_percent+'%\nالحالة: '+(row.completed?'مكتمل ✅':'غير مكتمل');
  }

  return null;
}
function memorySearchTerms(message){
  const raw=String(message||'').toLowerCase().replace(/[أإآ]/g,'ا');
  const stop=new Set([
    'شنو','شنه','شن','ما','ماذا','ممكن','اريد','أريد','اعطني','أعطني',
    'كيف','شلون','وين','متى','ليش','هل','من','الى','إلى','عن','في','على',
    'هذا','هذه','ذلك','تريد','اريد','عندي','عندك','هو','هي','هم','انا','اني',
    'الي','اللي','الذي','التي','اذا','إذا','او','أو','بس','تمام','زين','طيب',
    'شنويا','يعني','هسه'
  ]);
  const aliases=[
    ['نجم ياقوتي','sr','ياقوت','star ruby'],
    ['نجم ماسي','qsd','ماسي','diamond'],
    ['وكيل نجم','qsa','sa','star agent'],
    ['السفير','ambassador'],
    ['رتب','مراتب','رتبة','مستويات','ترقية'],
    ['تدريب','درس','اختبار','مشاهدة','تقدم'],
    ['فريق','downline','الاجيال','الخطوط','pv','sv'],
    ['اعتراض','اعتراضات','تواصل','بيع','تسويق'],
  ];
  const terms=new Set();

  raw
    .split(/[^\p{L}\p{N}]+/u)
    .map(x=>x.trim())
    .filter(x=>x.length>=3&&!stop.has(x))
    .forEach(x=>terms.add(x));

  for(const [canonical,...alts] of aliases){
    if(raw.includes(canonical)||alts.some(a=>raw.includes(a))){
      terms.add(canonical);
      alts.forEach(a=>terms.add(a));
    }
  }

  return [...terms].slice(0,24);
}

function rankMemoryByRelevance(items,message,options={}){
  const list=Array.isArray(items)?items:[];
  const limit=Math.max(0,Number(options.limit||8));
  const textOf=typeof options.textOf==='function'
    ? options.textOf
    : (x)=>JSON.stringify(x||{});
  const terms=memorySearchTerms(message);
  if(!terms.length)return [];

  const ranked=list.map((item,index)=>{
    const text=String(textOf(item)||'').toLowerCase();
    let score=0;
    for(const term of terms){
      if(!term)continue;
      if(text===term)score+=10;
      if(text.includes(term))score+=3;
    }
    return {item,score,index};
  });

  ranked.sort((a,b)=>b.score-a.score||a.index-b.index);

  return ranked
    .filter(x=>x.score>0)
    .slice(0,limit)
    .map(x=>x.item);
}

function adaptiveReasoningEffort(message,cognitiveState,currentSession){
  const s=String(message||'').trim().toLowerCase();
  const intent=String(cognitiveState?.user_intent||'general_conversation');
  if(currentSession?.active)return 'low';
  if(/حلل|تحليل|قارن|مقارنة|استراتيجية|بالتفصيل|اعتراضات|عمولات|نقاط|فريق|downline|الأجيال|roleplay|محاكاة|تمثيل|اختبار/.test(s))return 'low';
  if(intent==='ask_question'||intent==='request_help')return 'none';
  return 'none';
}

function adaptiveOutputTokenBudget(message,cognitiveState,currentSession){
  const s=String(message||'').trim().toLowerCase();
  const intent=String(cognitiveState?.user_intent||'general_conversation');
  const sourceRequest=isSourceKnowledgeRequest(message);
  const complex=/(حلل|تحليل|قارن|مقارنة|خطة|استراتيجية|اشرح بالتفصيل|بالتفصيل|أريد شرح|اريد شرح|اعتراض|عمولات|نقاط|فريق|downline|الأجيال|الخطوط|roleplay|محاكاة|تمثيل|اختبار|تدريب)/i.test(s);
  if(sourceRequest) return 1400;
  if(currentSession?.active) return 900;
  if(complex || intent==='report_obstacle' || intent==='report_attempt') return 900;
  if(s.length<=90 && intent==='ask_question') return 500;
  if(s.length<=180) return 650;
  if(s.length<=450) return 800;
  return 900;
}

function buildCostOptimizedAgentContext({
  context,
  message,
  cognitiveState,
  coachingProfile,
  currentSession,
  conversationState,
  causalMemory,
  learningPatterns,
  knowledgeMemory,
  permanentMemory,
  learnedFacts,
  memberTrainingMemory,
  dailyAutoPlan,
  directDailyCompletion,
  dailyCompletionDiagnostic,
  teamIntelligence,
  marketingPlan
}){
  const s=String(message||'').toLowerCase();
  const teamRequest=isTeamIntelligenceRequest(message);
  const trainingRequest=!!currentSession?.active || /تدريب|التدريبات|اختبار|الاختبارات|تقدم|المشاهدة|شاهدت|نسبة|إكمال|اكتمال|جلسة تدريب/i.test(s);
  const coachingRequest=trainingRequest || /عائق|محتار|متردد|جربت|طبقت|نفذت|رفض|ما نفع|نجح|فشل|نتيجة|خطوة|هدف/i.test(s);
  const knowledgeRequest=trainingRequest || isRankKnowledgeRequest(message) || /dxn|ديكسن|اعتراض|اعتراضات|تسويق|بيع مباشر|عضوية|تسجيل|نقاط|pv|sv|عمولة|عمولات|منتج|منتجات|شرعي|حرام|خطة|مراتب|رتب|رتبة|مستويات/i.test(s);

  const lessons=Array.isArray(context.lessons)?context.lessons:[];
  const progress=Array.isArray(context.progress)?context.progress:[];
  const completed=progress.filter(x=>x?.completed).length;
  const training={
    summary:{
      total:lessons.length,
      completed,
      remaining:Math.max(0,lessons.length-completed),
      completion_percent:lessons.length?Math.round(completed/lessons.length*100):0
    }
  };
  if(trainingRequest){
    training.lessons=lessons.slice(0,10).map(x=>({
      id:x.id||x.lesson_id,
      lesson_no:x.lesson_no,
      title:String(x.title||'').slice(0,220),
      active:x.active!==false
    }));
    training.progress=progress.slice(0,10);
  }

  const knowledgeRows=Array.isArray(knowledgeMemory)?knowledgeMemory:[];
  const localSourceRows=knowledgeRows.filter(x=>String(x?.category||'')==='source_pdf');
  const sourceRequest=isSourceKnowledgeRequest(message);
  const rankRequest=isRankKnowledgeRequest(message);

  const sourceRows=knowledgeRows
    .filter(x=>/^(?:dxn_marketing_plan_full|dxn_pdf_source_exact|source_pdf)$/i.test(String(x?.category||'')))
    .sort((a,b)=>{
      const pa=(String(a?.title||'').match(/(?:الصفحة|page)\s*([0-9]+)/i)||[])[1];
      const pb=(String(b?.title||'').match(/(?:الصفحة|page)\s*([0-9]+)/i)||[])[1];
      return Number(pa||999)-Number(pb||999);
    });

  const rankRows=knowledgeRows
    .filter(x=>/^(?:dxn_ranks_authoritative|coach_behavior_permanent)$/i.test(String(x?.category||'')))
    .sort((a,b)=>Number(b?.priority||0)-Number(a?.priority||0));

  const rankSourcePages=sourceRows.filter(x=>{
    const title=String(x?.title||'');
    return /(?:الصفحة|page)\s*(?:9|10)\b/i.test(title);
  });

  const excludedKnowledge=new Set([...sourceRows,...rankRows]);
  const sourceRelevantRows=rankMemoryByRelevance(
    sourceRows,
    message,
    {
      limit:(rankRequest||sourceRequest)?24:(knowledgeRequest?18:8),
      textOf:x=>[x?.title,x?.category,x?.content].filter(Boolean).join(' ')
    }
  );

  const relevantRows=rankMemoryByRelevance(
    knowledgeRows.filter(x=>!sourceRows.includes(x)&&!rankRows.includes(x)),
    message,
    {
      limit:(rankRequest||sourceRequest)?24:(knowledgeRequest?14:6),
      textOf:x=>[x?.title,x?.category,x?.content].filter(Boolean).join(' ')
    }
  );

  let chosenKnowledge;
  if(rankRequest){
    chosenKnowledge=[...rankRows,...rankSourcePages,...sourceRelevantRows,...relevantRows];
  }else if(sourceRequest){
    chosenKnowledge=[...sourceRows,...relevantRows];
  }else if(knowledgeRequest){
    // Source files participate in ordinary knowledge questions too.
    // Do not require a brittle keyword pattern to recognize a trained topic.
    chosenKnowledge=[...sourceRelevantRows,...relevantRows];
  }else{
    chosenKnowledge=relevantRows;
  }

  const compactKnowledge=[];
  let knowledgeChars=0;
  const knowledgeLimit=rankRequest?36:(sourceRequest?60:(knowledgeRequest?24:6));
  const rankedKnowledge=chosenKnowledge.slice().sort((a,b)=>
    Number(b?.relevance||0)-Number(a?.relevance||0) ||
    Number(b?.priority||0)-Number(a?.priority||0)
  );
  for(const x of rankedKnowledge){
    const content=String(x?.content||'').trim();
    if(!content)continue;
    const clipped=(sourceRequest||rankRequest)?content.slice(0,12000):content.slice(0,4200);
    const item={
      scope:x?.scope||'global',
      category:x?.category||'platform',
      title:x?.title||null,
      source:x?.source||null,
      page:x?.page||null,
      content:clipped,
      priority:Number(x?.priority||0)
    };
    const chars=clipped.length+220;
    if(knowledgeChars+chars>75000)break;
    compactKnowledge.push(item);
    knowledgeChars+=chars;
    if(compactKnowledge.length>=knowledgeLimit)break;
  }

  const permanentSource=Array.isArray(permanentMemory)?permanentMemory:[];
  const permanentAnchor=permanentSource.slice(0,3);
  const permanentRelevant=rankMemoryByRelevance(
    permanentSource,
    message,
    {
      limit:coachingRequest?16:6,
      textOf:x=>String(x?.payload||x?.content||x?.text||'')
    }
  );
  const compactPermanent=[];
  const permanentSeen=new Set();
  for(const x of [...permanentAnchor,...permanentRelevant]){
    const key=String(x?.id||'')+'|'+String(x?.created_at||'')+'|'+String(x?.payload||x?.content||x?.text||'').slice(0,160);
    if(permanentSeen.has(key))continue;
    permanentSeen.add(key);
    const payload=String(x?.payload||x?.content||x?.text||'').slice(0,1200);
    if(!payload)continue;
    compactPermanent.push({
      event_type:x?.event_type||null,
      entity_type:x?.entity_type||null,
      entity_id:x?.entity_id||null,
      payload,
      created_at:x?.created_at||null
    });
    if(compactPermanent.length>Math.max(3,coachingRequest?10:5))break;
  }

  const factsSource=Array.isArray(learnedFacts)?learnedFacts:[];
  const factsAnchor=factsSource.slice(0,4);
  const factsRelevant=rankMemoryByRelevance(
    factsSource,
    message,
    {
      limit:coachingRequest?8:4,
      textOf:x=>String(x?.fact||'')
    }
  );
  const compactFacts=[];
  const factsSeen=new Set();
  for(const x of [...factsAnchor,...factsRelevant]){
    const key=String(x?.id||'')+'|'+String(x?.fact||'').slice(0,160);
    if(factsSeen.has(key))continue;
    factsSeen.add(key);
    const fact=String(x?.fact||'').slice(0,700);
    if(!fact)continue;
    compactFacts.push({
      scope:x?.scope||'member',
      fact
    });
    if(compactFacts.length>Math.max(4,coachingRequest?12:6))break;
  }

  const compactCausal=coachingRequest
    ? rankMemoryByRelevance(
        Array.isArray(causalMemory)?causalMemory:[],
        message,
        {
          limit:4,
          textOf:x=>[x?.topic,x?.attempt,x?.result,x?.observation,x?.adjustment].filter(Boolean).join(' ')
        }
      )
    : [];
  const compactPatterns=coachingRequest
    ? rankMemoryByRelevance(
        Array.isArray(learningPatterns)?learningPatterns:[],
        message,
        {
          limit:4,
          textOf:x=>[x?.topic,x?.pattern,x?.working_lesson,x?.next_test].filter(Boolean).join(' ')
        }
      )
    : [];
  const trainingSource=Array.isArray(memberTrainingMemory)?memberTrainingMemory:[];
  const trainingAnchor=trainingSource.slice(0,2);
  const trainingRelevant=rankMemoryByRelevance(
    trainingSource,
    message,
    {
      limit:trainingRequest?6:3,
      textOf:x=>[
        x?.topic,x?.objective,x?.phase,x?.member_statement,
        x?.coach_action,x?.outcome,x?.lesson,x?.next_step,
        Array.isArray(x?.member_facts)?x.member_facts.join(' '):''
      ].filter(Boolean).join(' ')
    }
  );
  const compactTrainingMemory=[];
  const trainingSeen=new Set();
  for(const x of [...trainingAnchor,...trainingRelevant]){
    const key=String(x?.id||'')+'|'+String(x?.created_at||'')+'|'+JSON.stringify(x).slice(0,140);
    if(trainingSeen.has(key))continue;
    trainingSeen.add(key);
    compactTrainingMemory.push(x);
    if(compactTrainingMemory.length>Math.max(2,trainingRequest?6:3))break;
  }

  const compactProfile=coachingProfile?{
    goal:coachingProfile.goal||null,
    experience_level:coachingProfile.experience_level||'unknown',
    focus_area:coachingProfile.focus_area||null,
    strengths:Array.isArray(coachingProfile.strengths)?coachingProfile.strengths.slice(0,5):[],
    gaps:Array.isArray(coachingProfile.gaps)?coachingProfile.gaps.slice(0,5):[],
    current_next_step:coachingProfile.current_next_step||null
  }:null;

  return {
    role:context.role,
    member:context.member,
    training,
    coaching_profile:compactProfile,
    coaching_session:currentSession,
    conversation_state:conversationState,
    interaction_signal:conversationState?.interaction_signal||null,
    interaction_confidence:conversationState?.interaction_confidence==null?null:conversationState.interaction_confidence,
    causal_memory:compactCausal,
    learning_patterns:compactPatterns,
    knowledge_memory:compactKnowledge,
    source_knowledge_exact:(sourceRequest||rankRequest)
      ? compactKnowledge
          .filter(x=>x.category==='source_pdf'||x.category==='dxn_pdf_source_exact'||x.category==='dxn_marketing_plan_full')
          .map(x=>({
            title:x.title,
            source:x.source,
            page:x.page||null,
            content:x.content
          }))
      : [],
    permanent_memory:compactPermanent,
    learned_facts:compactFacts,
    member_training_memory:compactTrainingMemory,
    knowledge_source_policy:'المعرفة المصدرية الكاملة للملفات التدريبية هي المرجع الأول للمعلومة. الذاكرة الشخصية للعضو للترابط والتخصيص. الرسالة الحالية تحدد موضوع الرد.',
    source_fidelity_mode:sourceRequest||rankRequest,
    source_fidelity_rule:(sourceRequest||rankRequest)
      ? 'استخدم النص المصدر ذي الصلة كما هو مرجعًا أولًا. لا تختصر أو تحذف عناصر جدول/قائمة عندما يطلب العضو التفاصيل.'
      : null,
    memory_continuity:{
      always_on:true,
      permanent_anchor:compactPermanent.slice(0,3),
      stable_facts_anchor:compactFacts.slice(0,4),
      training_anchor:compactTrainingMemory.slice(0,2),
      rule:'هذه الذاكرة لاستمرارية العضو والمواقف السابقة. لا تجعلها تغيّر موضوع السؤال الحالي، لكنها متاحة دائمًا لتجنب نسيان الشخص أو تكرار مواقف سابقة.'
    },
    personal_training_mode:context.role==='member',
    contextual_coaching_state:{
      ...(contextualCoachingStateForModel({
        message,
        currentSession,
        conversationState,
        coachingRequest
      })||{})
    },
    cognitive_state:cognitiveState,
    memory_state:undefined,
    decision_state:undefined,
    adaptive_dialogue_state:undefined,
    reflection_state:undefined,
    long_term_personal_model:undefined,
    ...(dailyAutoPlan?{daily_auto_plan:dailyAutoPlan}: {}),
    ...(directDailyCompletion?{daily_completion:{completed:true}}: {}),
    ...(dailyCompletionDiagnostic?{daily_completion_error:dailyCompletionDiagnostic}: {}),
    ...(teamIntelligence?{team_intelligence:teamIntelligence}: {}),
    ...(marketingPlan?{marketing_plan:marketingPlan}: {})
  };
}

function contextualCoachingStateForModel({message,currentSession,conversationState,coachingRequest}){
  return {
    current_focus:currentSession?.objective||null,
    phase:currentSession?.phase||null,
    open_loop:conversationState?.open_loop||null,
    pending_question:conversationState?.pending_question||null,
    pending_member_action:conversationState?.pending_member_action||null,
    coaching_relevance:!!coachingRequest,
    current_message:String(message||'').slice(0,1200),
    instruction_priority:'أجب عن current_message أولًا. knowledge_memory هو المصدر الدائم للمعلومات المثبتة، بينما الذاكرة الشخصية وسجل الحوار للترابط والتخصيص ولا يغيران موضوع السؤال.'
  };
}

function instructions(context){
  return [
    'أنت المدرب وائل حاتم، المدرب الذكي في منصة مجتمع الصحة والثراء. لا تقدم نفسك كبرنامج أو روبوت إلا إذا سُئلت مباشرة عن طبيعتك.',
    'هويتك: المدرب وائل حاتم. أنت مدرب عراقي عملي وهادئ وقريب من العضو. مهمتك أن تساعده على التعلم والتطبيق والمتابعة، وأن تجعله يعرف دائمًا ما الخطوة التالية.',
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
    'اسم العضو الحالي موجود في السياق داخل member.name. عند وجود الاسم، استخدمه كاسم المخاطبة الصحيح ولا تستبدله باسم آخر.',
    'قاعدة التحية الشخصية: إذا كانت رسالة العضو تحية أو افتتاحًا اجتماعيًا قصيرًا مثل «هلا»، «مرحبا»، «السلام عليكم»، «شلونك» أو ما شابه، ابدأ ردك مباشرة بالاسم الأول للعضو فقط. استخرج الاسم الأول من member.name، وهو الجزء الأول من الاسم قبل أول مسافة. مثال: إذا كان الاسم «وائل حاتم» أو «وائل حاتم محمد»، تكون التحية «هلا وائل». لا تستخدم الاسم الكامل في التحية.',
    'إذا كان العضو قد بدأ سؤالًا أو طلبًا واضحًا، لا تضع اسمه في كل رد بشكل مصطنع؛ استخدم الاسم عندما يكون طبيعيًا، مع إلزام استخدامه في أول تحية/افتتاح اجتماعي.',
    'لا تقل «حاتم سعيد» أو أي اسم كمثال إلا إذا كان هو فعلًا قيمة member.name في السياق. الاسم يجب أن يأتي من بيانات العضو الحالية فقط.',

    'أولوية الحوار: الرسالة الحالية للعضو هي المصدر الأول لتحديد موضوع الرد. إذا سأل سؤالًا مباشرًا أو طلب معلومة/مساعدة محددة، أجب عن هذا الطلب أولًا وبشكل مباشر.',
    'قاعدة صارمة لعزل السؤال: لا تستخدم أي معلومة من الذاكرة أو سجل الحوار أو الخطة اليومية إلا إذا كانت مرتبطة مباشرة بالسؤال الحالي. إذا تعارضت ذاكرة قديمة أو موضوع سابق مع الرسالة الحالية، تجاهل القديم وأجب عن الرسالة الحالية فقط. لا تجب عن سؤال آخر لم يُطرح.',
    'أولوية المعرفة: عندما يكون السؤال عن مادة تدريبية أو خطة DXN أو معلومة تم تثبيتها من ملف، استخدم knowledge_memory والمصدر الأصلي أولًا. لا تختصر قائمة أو جدولًا أو شروطًا متعددة إذا كان السؤال يطلبها كاملة، ولا تغيّر الأرقام أو أسماء المراتب. انقل الحقائق بأمانة ثم اشرحها بأسلوب احترافي.',
    'وضع أمانة المصدر: إذا كان السؤال يطلب معلومات من ملف تدريبي، فالمحتوى الموسوم source_pdf أو dxn_pdf_source_exact أو المصدر الأصلي للملف هو المرجع الأعلى. لا تستبدله بملخص من قاعدة المعرفة. عند وجود جدول أو قائمة في المصدر، حافظ على جميع العناصر والشروط التي طلبها العضو، ولا تقول إن التفاصيل غير موجودة إذا كانت موجودة في النص المصدر.',
    'وجود coaching_session أو daily_auto_plan أو مهمة يومية في السياق لا يعني أن الرد يجب أن يكون عن التدريب. لا تجرّ السؤال الحالي إلى المهمة اليومية لمجرد وجود جلسة نشطة.',
    'إذا كان السؤال الحالي عن بيانات العضو أو فريقه أو أي موضوع آخر، ابقَ على موضوع السؤال. يمكن ذكر الجلسة أو الخطوة اليومية فقط بعد الإجابة وإذا كان ذلك مرتبطًا بشكل طبيعي بالطلب.',
    'لا تستخدم مرحلة الجلسة الحالية أو المهمة اليومية كبديل عن فهم الرسالة الحالية. القرار continue_daily_plan لا يُستخدم عندما تكون هناك نية مباشرة مثل ask_question أو request_help أو report_obstacle أو report_attempt.',
    'لديك أيضًا conversation_state وهي حالة الحوار القصيرة الحالية: current_topic وopen_loop وpending_question وpending_member_action وstate_status. استخدمها لاستكمال نفس الموضوع وعدم إسقاط سؤال أو تجربة ما زالت مفتوحة.',
    'تحتوي conversation_state أيضًا على interaction_signal وinteraction_confidence، وهما إشارات خفيفة للحالة الحالية وليستا تشخيصًا ولا صفات ثابتة. استخدمهما فقط لتعديل الأسلوب: confused → بسّط واشرح بمثال واحد، hesitant → خفف الضغط واسأل سؤالًا واضحًا، frustrated → اعترف بالمشكلة وغيّر الأسلوب بدل تكرار المحاولة نفسها، rushed → اختصر واذهب للنقطة العملية، positive → حافظ على الإيقاع واسمح بتحدٍ صغير إذا كان مناسبًا، neutral → الأسلوب المعتاد.',
    'لا تقل للعضو: أنت محبط/مرتبك/قلق... اعتمادًا على هذه الإشارة. طبّق التكييف في أسلوبك دون تسمية الحالة، ولا تستخدمها لاتخاذ استنتاجات صحية أو نفسية.',
    'إذا كان conversation_state.state_status = waiting_member، فالأولوية هي متابعة السؤال أو النتيجة التي ينتظرها المدرب وائل حاتم، ما لم يطرح العضو طلبًا جديدًا مباشرًا.',
    'إذا كان هناك pending_question أو pending_member_action، لا تبدأ موضوعًا جديدًا لمجرد وجود خطة يومية. تابع الحلقة المفتوحة أولًا.',
    'إذا كانت الحالة تشير إلى أن المدرب وائل حاتم سأل العضو إن كان يريد الانتقال إلى تدريب اليوم، فلا تعتبر الموافقة الضمنية أو الصمت كافيًا؛ الانتقال الفعلي يحدث فقط بعد موافقة واضحة.',
    'لديك طبقة حالة معرفية (cognitive_state) وطبقة ذاكرة (memory_state) في السياق. استخدمهما للحفاظ على استمرارية الحوار وتجنب إعادة الأسئلة التي تمت الإجابة عنها سابقًا.',

    'لديك ذاكرة معرفة ثابتة ودائمة اسمها knowledge_memory، ويجري بناؤها من قاعدة المعرفة ومن النصوص الكاملة للملفات التدريبية المعتمدة المضمّنة مع الموقع. هذه هي المرجعية الأولى للمعلومة. عند السؤال عن موضوع سبق تدريسه من ملف، استخدم النصوص ذات الصلة من المصدر قبل أي معرفة عامة، ولا تستبدل المصدر الكامل بملخص قصير أو تخمين.',
    'لديك أيضًا permanent_memory، وهي سجل طويل الأمد غير محدود زمنيًا يحفظ لقطات سابقة من المحادثة وإجابات واختبارات وتعلم العضو. استخدمه لاستعادة الاستمرارية عندما تكون المعلومة ذات صلة، وميّز دائمًا بين السجل الفعلي وبين الاستنتاج.',
    'عندما يطلب العضو قائمة أو شروطًا أو خطوات من مادة تدريبية، أعد المعلومات المطلوبة كاملة بقدر ما طلبه، ولا تستبدل عبارة موجودة في المصدر بعبارة عامة مثل «ومستويات أعلى». إذا احتوى المصدر على جدول أو قائمة، اعتمد عناصره الأصلية ولا تحذف المراحل من عندك.',
    'عندما يكون personal_training_mode = true فأنت في مسار تدريب شخصي مستمر لهذا العضو. تعامل مع المحادثة الحالية كجزء من رحلة تدريبية تراكمية حتى لو كان السؤال مباشرًا: أجب عن السؤال أولًا، ثم اربطه بالتدريب فقط إذا كان ذلك طبيعيًا.',
    'لديك member_training_memory، وهو سجل تدريبي دائم خاص بهذا العضو فقط. استخدمه لمعرفة ما تدرب عليه، وما جربه، وما نجح أو لم ينجح، وما هو الدرس والخطوة التالية. لا تخلط بين ذاكرة عضو وعضو آخر.',
    'لديك memory_continuity، وهي طبقة استمرارية تُحمّل في كل طلب لتذكيرك بآخر الحقائق الثابتة والمواقف والتدريب السابق للعضو. استخدمها لمنع نسيان العضو أو تكرار موقف سبق التعامل معه، لكن لا تجعلها تغيّر موضوع السؤال الحالي. عند وجود تعارض، الرسالة الحالية والمعلومة الأحدث هما المرجع.',
    'لا تبدأ تدريب العضو من الصفر عند عودته. إذا وجدت سجلًا تدريبيًا سابقًا مرتبطًا بالموضوع، ابنِ عليه واسأل عن النتيجة أو التطبيق التالي بدل إعادة الدرس كاملًا.',

    'التخزين الدائم لا يعني عرض كل التاريخ للمستخدم. استخدم ما يلزم فقط للإجابة الحالية، ولا تكشف أسماء الجداول أو الحقول الداخلية.',
    'لديك أيضًا contextual_coaching_state: فهم خفيف للسياق الحالي، مثل نوع الموقف، طبيعة العلاقة مع الشخص، هدف العضو، والأدلة السابقة المرتبطة بالموقف. استخدمه لتحديد مدى ملاءمة الدرس السابق للموقف الحالي.',
    'لا تطبق learning_pattern لمجرد أنه موجود. قارِن سياقه بالسياق الحالي أولًا. إذا كان الشخص أو الموقف مختلفًا، اعتبر الدرس فرضية تحتاج تكييفًا أو اختبارًا جديدًا.',
    'إذا كان السياق ناقصًا ومعلومة واحدة فقط ستغيّر القرار فعلاً، اسأل عن تلك المعلومة فقط. لا تحوّل كل طلب إلى استجواب.',
    'عند استخدام الذاكرة، ميّز بين ما قاله العضو فعلًا وما هو استنتاج. لا تقدم استنتاجًا على أنه حقيقة.',
    'إذا تعارضت معلومة قديمة مع معلومة أحدث قالها العضو، اعتمد الأحدث واعتبر القديمة غير سارية.',
    'لا تذكر للمستخدم بنية الذاكرة أو أسماء الحقول الداخلية. استخدمها طبيعيًا داخل الحوار.',
    'لديك طبقة حالة معرفية (cognitive_state) في السياق. استخدمها لفهم النية والهدف والمهمة والمرحلة والمعلومات الناقصة قبل الرد. لا تعرض JSON أو تفاصيل التفكير الداخلي للمستخدم.',
    'اتخذ القرار الحواري على مراحل: افهم الطلب، راجع ما تعرفه، حدّد ما ينقصك، ثم اختر أفضل خطوة تالية. لا تفترض معلومة غير موجودة.',
    'إذا كانت هناك معلومة أساسية ناقصة وتؤثر في القرار، اسأل سؤالًا واحدًا محددًا فقط. إذا كانت غير أساسية، لا توقف الحوار من أجلها.',
    'لا تعطِ قائمة طويلة من الخيارات عندما يمكن اختيار خطوة عملية واحدة. الهدف هو تقدم العضو خطوة واحدة واضحة في كل دور.',
    'اعتبر next_best_action في cognitive_state توجيهًا أوليًا وليس أمرًا أعمى؛ إذا قدم المستخدم معلومة جديدة، حدّث قرارك وفقها.',
    'استخدم adaptive_dialogue_state لتغيير أسلوب الحوار ومستوى التحدي بحسب استجابة العضو، دون كشف الحالة الداخلية.',
    'استخدم reflection_state لتكييف الخطوة الحالية فقط. لا تعرضه للمستخدم ولا تحول استنتاجًا مؤقتًا إلى حقيقة ثابتة.',
    'استخدم long_term_personal_model لتخصيص التدريب عبر الزمن، لكن لا تعرض النموذج الداخلي للمستخدم.',
    'اعتمد في النموذج طويل المدى على الحقائق الصريحة المحفوظة فقط. الأنماط المستنتجة مؤقتة ولا تعاملها كحقائق.',
    'استخدم outcome الحالي لتكييف الجلسة الحالية، ولا تحفظ نتيجة عابرة كصفة ثابتة للعضو.',

    'لديك أيضًا causal_memory وهي ذاكرة خبرات سبب/نتيجة: المحاولة والنتيجة والملاحظة والسبب المحتمل والتعديل القادم. استخدمها عندما تكون مرتبطة بالموضوع الحالي، حتى لا تعيد نفس الأسلوب بعد تجربة فاشلة.',
    'لديك أيضًا learning_patterns وهي دروس مؤقتة مستخرجة من أكثر من تجربة. استخدمها كفرضيات قابلة للاختبار، لا كحقائق ثابتة.',
    'إذا كان learning_pattern = testing، استخدمه لتوجيه تجربة واحدة جديدة بدل إعلان أن السبب ثبت.',
    'إذا دعمت تجارب متعددة نفس التعديل، يمكنك القول إن التجارب حتى الآن تشير إلى فائدة هذا التعديل، مع إبقاء الباب مفتوحًا لاختبار جديد.',
    'إذا ناقضت تجربة جديدة درسًا سابقًا، لا تتمسك بالدرس؛ حدّثه وغيّر التجربة القادمة.',
    'في causal_memory ميّز دائمًا بين observation/نتيجة صرّح بها العضو وبين hypothesis/سبب محتمل. لا تقدم hypothesis على أنها حقيقة.',
    'إذا وجدت تجربة سابقة بنتيجة سلبية، لا تكرر نفس الأسلوب بلا تغيير واضح. وإذا وجدت تجربة ناجحة، حافظ على العنصر الذي دعمه العضو وجرّب تطويره تدريجيًا.',
    'لا تستنتج من causal_memory أن العضو ضعيف أو قوي بشكل ثابت. هي سجل لتجارب محددة فقط.',
    'إذا كانت النتيجة positive زد التحدي تدريجيًا. إذا كانت negative غيّر الأسلوب أو التمرين. إذا كانت blocked شخّص السبب أولًا.',
    'لا تعتبر نجاحًا أو فشلًا إلا إذا كان مدعومًا بإشارة واضحة من العضو.',
    'التعلم المستمر يكون من النتائج المعلنة والمتكررة، وليس من التخمين.',
    'في الوضع diagnostic اسأل سؤالًا واحدًا فقط ثم انتظر إجابة العضو.',
    'في الوضع evaluative اسأل عن النتيجة الفعلية قبل تعديل التدريب.',
    'في الوضع adaptive غيّر الأسلوب أو التمرين إذا كانت المحاولة السابقة لم تحقق النتيجة.',
    'في الوضع clarify بسّط الفكرة مع مثال واحد فقط.',
    'لا تجعل التخصيص يغيّر الحقائق؛ استخدم فقط ما هو محفوظ أو صرّح به العضو.',
    'لديك أيضًا decision_state لتحديد نوع القرار الحواري الحالي. استخدمه داخليًا ولا تعرضه للمستخدم.',
    'إذا كان القرار diagnose_obstacle فاسأل سؤالًا واحدًا لتحديد السبب قبل الحل.',
    'إذا كان القرار evaluate_attempt فاسأل عن النتيجة الفعلية ثم عدّل الخطوة.',
    'إذا كان القرار analyze_result_then_adapt فلا تكرر الأسلوب نفسه دون تعديل.',
    'إذا كان القرار give_one_correction_then_retry فقدم تصحيحًا واحدًا ثم اطلب إعادة المحاولة.',
    'إذا كان القرار start_next_daily_task فابدأ بالمهمة التالية مباشرة.',


    'في التدريب: لا تسكب معلومات كثيرة دفعة واحدة. قسّم التعلم إلى خطوات صغيرة، واطلب من العضو التطبيق عندما يكون التطبيق مفيدًا.',
    'في التصحيح: إذا أخطأ العضو، اذكر الخطأ بوضوح ثم قل له كيف يصححه، مع مثال عراقي قصير عند الحاجة.',
    'في المتابعة: إذا كان العضو متقدمًا، انتقل من الشرح إلى التحدي والتطبيق. إذا كان جديدًا، استخدم شرحًا أبسط وأكثر تدرجًا.',
    'عند الحاجة إلى تحليل مستوى العضو أو نقاط قوته وضعفه في الاختبارات، استخدم أداة أداء الاختبارات بدل الاعتماد على الانطباع من المحادثة فقط.',
    'لديك أداة Team Intelligence لقراءة سجل فريق DXN الحقيقي. استخدمها عندما يسأل العضو عن فريقه أو الـDownline أو الأجيال أو الخطوط المباشرة أو توزيع الرتب أو PV.',
    'عند شرح خطة DXN أو الرتب أو العمولات، استخدم المعرفة الدائمة ذات المصدر الأصلي الموجودة في knowledge_memory. انقل المعلومة كما وردت في المصدر ولا تخترع شروطًا أو أرقامًا.' ,
    'إذا سأل العضو عن السعر أو التكلفة، لا تجعل الرقم محور الحوار من تلقاء نفسك. افهم الاحتياج والقيمة أولًا، ثم اذكر السعر فقط إذا كان مصدر أسعار الدولة متاحًا. لا تحوّل شرط النقاط إلى شراء شهري إلزامي ما لم يذكر المصدر ذلك صراحة.',


    'إذا سأل العضو عن معلومات عضو آخر ولا يعرف رقم العضوية، وكان لديه الاسم أو جزء منه، استخدم أداة search_dxn_team_members أولًا بالاسم أو الجزء الذي أعطاك إياه. لا تخمّن اسمًا بديلًا ولا رقم عضوية. إذا رجعت نتيجة واحدة ومعها member_intelligence، فهذه هي بيانات العضو المطلوب تحديدًا: أجب منها مباشرة ولا تستخدم بيانات member الحالية للحساب بدلًا عنها. لا تقل إن العضو هو الحساب الحالي إلا إذا كانت أرقام العضوية متطابقة. إذا رجعت نتائج متعددة، اعرض الأسماء وأرقام العضوية واطلب تحديد الشخص الصحيح. إذا لم توجد نتائج، قل إنه لم يظهر في فريقه الحالي وابحث بعبارة أقصر عند الحاجة.',
    'Sponsor هو مفتاح علاقة فقط؛ عند تحليل الفريق ركّز على الـDownline الذي يرجع إلى العضو الحالي. لا تعامل الراعي الشخصي للعضو كأنه الفريق المطلوب تحليله.',
    'عند المقارنة بين الخطوط، اعرض أرقامًا وحقائق من الأداة فقط. لا تستنتج نشاطًا أو مبيعات أو إنتاجية تشغيلية إذا لم تكن موجودة في البيانات.',
    'إذا وُجد team_intelligence في السياق، فهو المصدر المرجعي للأرقام: انقل total_members وdirect_downline_count وgeneration_counts وrank_counts كما وردت حرفيًا دون تقريب أو إعادة حساب أو تغيير أي رقم. إذا كان رقم الأداة غير متاح، قل إنه غير متوفر ولا تخمّن.',
    'عند طلب ملخص الفريق، يجب أن يكون الرد كاملًا وليس للمباشرين فقط: اذكر إجمالي أعضاء الفريق، ثم عدد المباشرين، ثم توزيع جميع الأجيال المتاحة واحدًا واحدًا (الجيل 0 ثم 1 ثم 2 ثم 3 ثم 4 ثم 5 إن كانت موجودة)، ثم الرتب إذا كانت متاحة. لا تكتفِ بذكر direct_downline_count أو عبارة عامة مثل إلى حد الجيل الخامس. استخدم أرقام team_intelligence نفسها حرفيًا.',
    'في ملخص الفريق لا تختصر generation_counts إلى وصف لفظي مثل "حد الجيل الخامس"؛ اعرض كل جيل وعدده بوضوح، لأن المستخدم طلب ملخصًا كاملًا لفريقه.',

    'عندما يسأل العضو: شنو أسوي هسه؟ أو شنو أشتغل اليوم؟ أو ماذا أفعل الآن؟ استخدم أداة الخطة اليومية الشخصية، ثم حوّل نتيجتها إلى خطوة عملية واحدة واضحة قبل اقتراح الخطوة التالية.',
    'إذا بدأت الجلسة تلقائيًا من الخطة اليومية، لا تكتفِ بإخبار العضو بالمهمة؛ ابدأ الجلسة فورًا من أول خطوة، ووجّه العضو بسؤال أو تمرين واحد فقط يناسب نوع المهمة.',
    'إذا أكد العضو بوضوح أنه أنهى المهمة الحالية، استخدم أداة complete_daily_coaching_task لتسجيل إنجازها. لا تعتبر كلمة مثل تمام أو إي وحدها دليلًا على الإكمال.',
    'بعد تسجيل إكمال المهمة اليومية، انتقل مباشرة إلى المهمة التالية إذا كانت متاحة، وابدأها بسؤال أو تمرين واحد فقط بدل إعطاء قائمة طويلة.',
    'في المحاكاة: يمكنك لعب دور عميل أو شخص متردد أو عضو جديد، ثم تقييم رد العضو واقتراح تحسين واحد أو اثنين في كل مرة.',
    'في التشجيع: استخدم عبارات عراقية طبيعية مثل زين، ممتاز، خلينا نكمل، هسه نركز على الخطوة الجاية، لكن لا تكررها في كل رد.',
    'لا تتصرف كصديق شخصي يعتمد عليه المستخدم عاطفيًا، ولا تحاول خلق تبعية. كن مدربًا مساعدًا يحافظ على استقلال قرار المستخدم.',
    'إذا لم تعرف الإجابة، قل ذلك بوضوح واقترح ما يمكن التحقق منه. لا تخمّن لتبدو واثقًا.',
    'في المواضيع الحساسة، حافظ على الهدوء والوضوح ولا تستخدم التخويف أو الضغط أو الإحراج.',
    'المنصة تدعم تحويل ردودك إلى صوت تلقائيًا. لا تقل للمستخدم إنك لا تملك صوتًا أو أنك محصور بالمحادثة النصية؛ تعامل مع نفسك كالمدرب وائل حاتم القادر على الرد نصيًا وصوتيًا، إلا إذا أخبرك النظام أو المستخدم بأن التشغيل الصوتي فشل.',
    'إذا كانت هناك جلسة تدريبية نشطة، تصرف كمدرب جلسة لا كمجيب عادي: التزم بمرحلتها الحالية، اسأل سؤالًا واحدًا في كل مرة عند الحاجة، واطلب من العضو التطبيق قبل الانتقال إلى التقييم أو الخطوة التالية.',
    'في جلسة roleplay، مثّل الشخصية المطلوبة بصورة واقعية ولا تعطِ الإجابة النموذجية قبل أن يحاول العضو، ثم قدّم ملاحظات محددة بعد المحاولة.',
    'في جلسة practice، اجعل التفاعل عمليًا: سؤال، محاولة من العضو، تصحيح، ثم محاولة محسنة.',
    'إذا بدأ المستخدم جلسة جديدة، رحّب به باختصار وحدد الهدف والمرحلة الأولى. إذا طلب إنهاء الجلسة، أنهِها بخلاصة قصيرة وخطوة تالية.',
    'السياق الحالي للمستخدم هو JSON التالي:',
    JSON.stringify(context)
  ].join('\\n');
}

async function getMemberSponsorLink(token){
  try{
    const r=await supabaseRpc('get_member_sponsor_link',{p_token:token});
    if(!r.ok) return {configured:false,verified:false,sponsor_member_no:null,error:r.data?.message||r.data?.error||r.text||null};
    const row=Array.isArray(r.data)?r.data[0]:null;
    return {configured:!!row?.sponsor_member_no,verified:!!row?.sponsor_member_no,sponsor_member_no:row?.sponsor_member_no||null,updated_at:row?.updated_at||null};
  }catch(e){
    return {configured:false,verified:false,sponsor_member_no:null,error:String(e?.message||e)};
  }
}

const AGENT_TOOL_DEFINITIONS = [
  {
    type:'function',
    name:'get_member_sponsor_link',
    description:'قراءة الراعي المباشر الذي سجله العضو برقم العضوية. استخدمها عند تحليل هيكل الفريق أو تحديد علاقة العضو بالراعي. لا تستنتج منها شجرة DXN كاملة ولا تتجاوز البيانات غير المؤكدة.',
    parameters:{type:'object',properties:{},additionalProperties:false},
    strict:true
  },
  {
    type:'function',
    name:'get_dxn_team_intelligence',
    description:'قراءة بيانات فريق DXN من سجل الفريق الحقيقي للعضو الحالي. تدعم ملخص الفريق، بيانات عضو تابع، الـDownline، أعضاء جيل محدد، وملخص الخطوط المباشرة. استخدمها عند تحليل هيكل الفريق أو المقارنة بين الخطوط أو معرفة توزيع الأعضاء والرتب وبيانات PV. لا تفترض نشاطًا أو مبيعات غير موجودة في البيانات.',
    parameters:{
      type:'object',
      properties:{
        mode:{type:'string',enum:['summary','member','downline','generation','line_summary']},
        member_no:{type:['string','null']},
        generation:{type:['integer','null'],minimum:0},
        limit:{type:'integer',minimum:1,maximum:200}
      },
      required:['mode','member_no','generation','limit'],
      additionalProperties:false
    },
    strict:true
  },
  {
    type:'function',
    name:'search_dxn_team_members',
    description:'البحث عن عضو داخل فريق DXN الخاص بالعضو الحالي باستخدام الاسم الكامل أو جزء من الاسم. استخدمها عندما يسأل المستخدم عن معلومات عضو ولا يعرف رقم العضوية. لا تخمّن الاسم أو رقم العضوية؛ ابحث أولًا ثم استخدم نتيجة البحث.',
    parameters:{
      type:'object',
      properties:{
        query:{type:'string',minLength:1},
        limit:{type:'integer',minimum:1,maximum:50}
      },
      required:['query','limit'],
      additionalProperties:false
    },
    strict:true
  },
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

  // Never treat a negated statement as completion.
  // Examples: "ما سويت التدريب", "لسه ما أنجزت", "لم أكمل المهمة".
  const negatedCompletionPatterns=[
    /(?:ما|مو|موش|مش|لسه\s+ما|بعدني\s+ما|لم|لن|ما\s+قدرت)\s*(?:أنجزت|انجزت|أكملت|اكملت|كملت|كمّلت|أنهيت|انهيت|خلصت|سويت|سوى|طبقت|نفذت|عملت|جاوبت|حلّيت|حليت|جربت)/,
    /(?:ما|مو|موش|مش)\s+(?:سويت|عملت|طبقت|نفذت|كملت|أنجزت|أكملت|أنهيت)\s*(?:ها|ه)?/,
    /(?:لسه|بعدني|بعده|بعدها)\s*(?:ما|مو|موش|مش)/
  ];
  if(negatedCompletionPatterns.some(re=>re.test(s))) return false;

  return /(?:أنجزت|انجزت|أكملت|اكملت|كملت|كمّلت|أنهيت|انهيت|انتهيت|خلصت(?:ها|ه)?|سويته|سويتها|سويت(?:ها|ه)?|طبقت(?:ه|ها)?|نفذت(?:ه|ها)?|عملت(?:ه|ها)?|جاوبت(?:ه|ها)?|حلّيت(?:ه|ها)?|حليت(?:ه|ها)?|جربت(?:ه|ها)?|طبقت التمرين|أنجزت المهمة|أكملت المهمة|أنهيت المهمة|أنهيت التمرين|أنجزت التمرين)/.test(s);
}


async function executeAgentTool(call,token,currentUserMessage){
  if(call.name==='get_member_sponsor_link') return await getMemberSponsorLink(token);

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

function dailyHelperInstructions({context,coachingProfile,session,plan,mode}){
  return [
    'أنت المدرب وائل حاتم.',
    'اكتب باللهجة العراقية الطبيعية وباختصار شديد.',
    'لا تذكر أنك نموذج أو نظام.',
    mode==='kickoff'
      ? 'ابدأ جلسة التدريب بشكل طبيعي، اذكر المهمة باختصار، ثم اطرح سؤالًا أو تمرينًا واحدًا فقط.'
      : 'ذكّر العضو بالخطوة الحالية بلطف، واطلب استكمالها بسؤال أو تمرين واحد فقط.',
    'لا تعرض قائمة مهام ولا تشرح الخطة ولا تضف معلومات غير موجودة.',
    JSON.stringify({member:context.member,session,action:Array.isArray(plan?.actions)?plan.actions[0]||null:null,coaching_profile:coachingProfile||null})
  ].join('\\n');
}

async function generateDailyKickoff(context,coachingProfile,session,plan){
  const action=Array.isArray(plan?.actions)?plan.actions[0]:null;
  if(!session?.active||!action) return null;
  const kickoffPrompt=[
    'ابدأ الرسالة كأن المدرب وائل حاتم إنسان مرح وجلس مع العضو فعلًا، وليس كنظام يعلن بدء مهمة. اجعل الافتتاح دافئًا وعفويًا وخفيفًا.',
    'تنسيق الكتابة: لا تستخدم علامة النجمة * أو ** للتأكيد أو التعداد. عند الحاجة إلى إبراز عبارة، استخدم الأقواس ( ) بدل النجوم، واجعل النص مباشرًا وواضحًا.',
    'استخدم تحية أو جملة اجتماعية قصيرة عند الحاجة مثل: هلا والله، شلونك؟ أو زين، خلينا اليوم ناخذها ببساطة. لا تكرر نفس الافتتاح في كل مرة.',
    'ممنوع أن تبدأ بصيغة آلية مثل: هسه نبدأ تدريب... أو مهمتك اليوم هي... أو سأطرح عليك سؤالًا. اربط المهمة بالكلام بشكل طبيعي داخل الحوار.',
    'لا تقل إنك تنتظر سؤالًا. أنت من يبدأ الجلسة، لكن لا تجعل البداية تبدو كإشعار أو تعليمات نظام.',
    'اذكر المهمة الحالية بصورة طبيعية جدًا وبجملة قصيرة، ثم ادخل مباشرة في سؤال أو موقف بسيط يشجع العضو على الكلام. لا تحوّل اسم المهمة إلى عنوان.',
    'لا تعرض قائمة مهام كاملة ولا تشرح الخطة ولا تذكر أنك تعمل وفق خطة يومية.',
    'إذا كانت المهمة مراجعة أو ممارسة، افتح بموقف واقعي خفيف. وإذا كانت تدريبًا جديدًا، افتح بمدخل conversational بسيط يجعل العضو يشعر أن الحديث بدأ طبيعيًا.',
    'اجعل الرسالة الأولى قصيرة وحيوية وفيها روح شخص مرح ومتفاعل، مع الحفاظ على اللهجة العراقية الطبيعية ومن دون مبالغة أو حماس مصطنع.',
    'قاعدة الانتقال من الحوار إلى التدريب:',
    'توقف العضو عن الكتابة أو مرور الوقت لا يعني أن موضوعه انتهى ولا يعني موافقته على التدريب.',
    'إذا لم توجد جلسة تدريب نشطة وكان للعضو موضوع حواري أو سؤال جاري، لا تبدأ التدريب تلقائيًا ولا تغيّر الموضوع لمجرد وجود خطة يومية.',
    'بعد أن يتضح من الحوار أن موضوع العضو انتهى فعلًا، وإذا كانت هناك مهمة يومية غير مكتملة، استأذن العضو أولًا قبل الانتقال إليها بصيغة طبيعية مثل: إذا خلصنا من هالموضوع، تحب ننتقل لتدريب اليوم؟',
    'لا تبدأ جلسة تدريب جديدة إلا بعد موافقة واضحة من العضو أو طلب مباشر منه بدء التدريب/الخطوة اليومية.',
    'إذا انتهى موضوع العضو، لا تعتبر ذلك إذنًا بالانتقال. اسأله أولًا: عندك شيء ثاني تريد نحچي بيه، لو ننتقل لتدريب اليوم؟',
    'إذا اختار موضوعًا آخر، ابقَ معه. وإذا لم يرد على سؤال الانتقال، لا تبدأ التدريب ولا تعتبر الصمت موافقة.',
    'السياق:',
    JSON.stringify({
      member:context.member,
      session,
      action,
      coaching_profile:coachingProfile||null
    })
  ].join('\\n');

  const r=await openai({
    model:OPENAI_HELPER_MODEL,
    instructions:dailyHelperInstructions({context,coachingProfile,session,plan,mode:'kickoff'}),
    input:[{role:'user',content:kickoffPrompt.slice(0,3500)}],
    reasoning:{effort:'none'},
    max_output_tokens:220
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
    model:OPENAI_HELPER_MODEL,
    instructions:dailyHelperInstructions({context,coachingProfile,session,plan,mode:'reminder'}),
    input:[{role:'user',content:prompt.slice(0,2200)}],
    reasoning:{effort:'none'},
    max_output_tokens:140
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
  let requestStage='init';
  try{
    requestStage='env';
    if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');
    requestStage='parse_request';
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    const action=String(body.action||'').trim();

    if(action==='daily_bootstrap'){
      if(!token)return res.status(400).json({error:'جلسة الدخول مطلوبة'});
      requestStage='load_context';
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
        // Silence, page reloads, or returning to the page are NOT consent to start training.
        // Muhammad must wait for an explicit member request/approval before starting a new session.
        plan=await AGENT_TOOLS.get_daily_coaching_plan(token);
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
    // Save a durable snapshot of the member/training state on every coaching request.
    // This preserves watch progress and other training context across time.
    await supabaseRpc('save_ai_agent_context_snapshot',{
      p_token:token,
      p_snapshot:{
        member:context.member,
        role:context.role,
        training:{
          lessons:context.lessons,
          progress:context.progress
        }
      }
    }).catch(()=>null);
    requestStage='load_session';
    const sessionCommand=detectSessionCommand(message);
    let currentSession=await loadAgentSession(token);
    let conversationState=await loadConversationState(token);

    // Stage 8: deterministic replies for low-information social messages.
    // This preserves the member-first-name greeting rule without spending a model call.
    if(!sessionCommand && canUseDeterministicChatReply(message,currentSession,conversationState)){
      const deterministicAnswer=buildDeterministicChatReply(message,context.member);
      if(deterministicAnswer){
        await saveAgentMessage(token,'user',message).catch(()=>null);
        await saveAgentMessage(token,'assistant',deterministicAnswer).catch(()=>null);
        return res.status(200).json({ok:true,answer:deterministicAnswer,deterministic:true});
      }
    }

    // Stage 15: simple training-data lookups bypass OpenAI completely.
    // These are read-only facts already available from Supabase training data.
    if(!sessionCommand && !currentSession?.active && !conversationState?.pending_question && !conversationState?.pending_member_action && !conversationState?.open_loop){
      const directTrainingKind=detectDirectTrainingInfoRequest(message);
      if(directTrainingKind){
        const directTrainingAnswer=buildDirectTrainingReply(context,directTrainingKind,message);
        if(directTrainingAnswer){
          await saveAgentMessage(token,'user',message).catch(()=>null);
          await saveAgentMessage(token,'assistant',directTrainingAnswer).catch(()=>null);
          return res.status(200).json({
            ok:true,
            answer:directTrainingAnswer,
            deterministic:true,
            source:'training-data'
          });
        }
      }
    }

    // Stage 16: simple assessment result lookups bypass OpenAI completely.
    if(!sessionCommand && !currentSession?.active && !conversationState?.pending_question && !conversationState?.pending_member_action && !conversationState?.open_loop){
      const directAssessmentRequest=detectDirectAssessmentRequest(message);
      if(directAssessmentRequest){
        try{
          const performance=await AGENT_TOOLS.get_member_assessment_performance(token);
          const directAssessmentAnswer=buildDirectAssessmentReply(performance,directAssessmentRequest);
          if(directAssessmentAnswer){
            await saveAgentMessage(token,'user',message).catch(()=>null);
            await saveAgentMessage(token,'assistant',directAssessmentAnswer).catch(()=>null);
            return res.status(200).json({
              ok:true,
              answer:directAssessmentAnswer,
              deterministic:true,
              source:'assessment-data'
            });
          }
        }catch(error){
          console.error('[ai-agent] direct assessment lookup failed',String(error?.message||error));
        }
      }
    }

    let dailyAutoPlan=null;
    let directDailyCompletion=false;
    let teamIntelligence=null;
    let marketingPlan=null;
    if(isTeamIntelligenceRequest(message)){
      teamIntelligence=await AGENT_TOOLS.get_dxn_team_intelligence(
        token,
        {mode:'summary',member_no:null,generation:null,limit:50}
      );
    }

    // Completion of the daily task is a deterministic server-side action.
    // Do not depend on the model deciding to call the completion tool.
    // Only accept explicit completion when a daily coaching session is active.
    let dailyCompletionDiagnostic=null;
    if(!sessionCommand && hasExplicitTaskCompletionEvidence(message)){
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

    // Clear member consent to move from conversation into today's training
    // is a real transition, not merely a conversational acknowledgement.
    if(!sessionCommand && !directDailyCompletion && (!currentSession || !currentSession.active) && detectTrainingConsent(message,conversationState)){
      const autoStart=await buildDailyAutoSession(token,currentSession);
      if(autoStart){
        currentSession=autoStart.session;
        dailyAutoPlan=autoStart.plan;
        await saveAgentSession(token,currentSession).catch(()=>null);
        conversationState={
          ...(conversationState||{}),
          pending_question:null,
          pending_member_action:null,
          open_loop:null,
          state_status:'open',
          last_member_message_at:new Date().toISOString()
        };
        await saveConversationState(token,conversationState).catch(()=>null);
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
    requestStage='seed_curated_knowledge';
    await ensureObjectionsKnowledgePack();
    requestStage='load_memory_profile';
    const [persistentMemory,coachingProfile,causalMemory,learningPatterns,knowledgeMemory,permanentMemory,learnedFacts,memberTrainingMemory]=await Promise.all([
      loadAgentMemory(token),
      loadAgentProfile(token),
      loadCausalMemory(token),
      loadLearningPatterns(token),
      loadAgentKnowledge(token,context.role,message),
      loadPermanentAgentMemory(token),
      loadLearnedFacts(token),
      loadMemberTrainingMemory(token)
    ]);
    const fallbackHistory=cleanHistory(body.history);
    const historySource=(persistentMemory.length?persistentMemory:fallbackHistory);
    const history=historySource.slice(-24);
    const baseInput=[...history,{role:'user',content:message}];
    requestStage='build_state';
    const cognitiveState=buildCognitiveState({
      message,
      context,
      currentSession,
      dailyAutoPlan,
      directDailyCompletion
    });
    requestStage='build_memory';
    const memoryState=await buildMemoryState(
      token,
      message,
      cognitiveState,
      currentSession,
      coachingProfile
    );
    requestStage='build_decision';
    const decisionState=buildDecisionState({
      message,cognitiveState,memoryState,currentSession,dailyAutoPlan,coachingProfile
    });
    const adaptiveDialogueState=buildAdaptiveDialogueState({
      message,cognitiveState,memoryState,decisionState,currentSession
    });
    const reflectionState=buildReflectionState({
      message,cognitiveState,memoryState,decisionState,adaptiveDialogueState,currentSession
    });
    const longTermPersonalModel=buildLongTermPersonalModel({
      memoryState,coachingProfile,reflectionState,currentSession
    });
    const contextualCoachingState=buildContextualCoachingState({
      message,
      cognitiveState,
      memoryState,
      conversationState,
      causalMemory,
      learningPatterns,
      currentSession
    });

    let enrichedContext=buildCostOptimizedAgentContext({
      context,
      message,
      cognitiveState,
      coachingProfile,
      currentSession,
      conversationState,
      causalMemory,
      learningPatterns,
      knowledgeMemory,
      permanentMemory,
      learnedFacts,
      memberTrainingMemory,
      dailyAutoPlan,
      directDailyCompletion,
      dailyCompletionDiagnostic,
      teamIntelligence,
      marketingPlan
    });
    enrichedContext.memory_state=memoryState;
    enrichedContext.decision_state=decisionState;
    enrichedContext.adaptive_dialogue_state=adaptiveDialogueState;
    enrichedContext.reflection_state=reflectionState;
    enrichedContext.long_term_personal_model=longTermPersonalModel;
    let input=baseInput;
    const availableAgentTools=selectRelevantAgentTools(message,cognitiveState,currentSession)
      .filter(x=>!(directDailyCompletion||dailyCompletionDiagnostic) || x.name!=='complete_daily_coaching_task');
    requestStage='openai';
    let ai=null;
    // Primary trainer quality takes precedence over tool-call minimization.
    // Knowledge/coaching turns may need multiple read-only tool rounds before synthesis.
    const maxToolRounds=availableAgentTools.length ? 3 : 0;

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
      requestStage='openai_round_'+round;
      const roundCanUseTools=availableAgentTools.length>0 && round<maxToolRounds;
      ai=await openai({
        model:OPENAI_MODEL,
        instructions:instructions(enrichedContext),
        input,
        tools:roundCanUseTools?availableAgentTools:[],
        tool_choice:roundCanUseTools?'auto':'none',
        reasoning:{effort:adaptiveReasoningEffort(message,cognitiveState,currentSession)},
        max_output_tokens:adaptiveOutputTokenBudget(message,cognitiveState,currentSession)
      });
      if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});

      const calls=getFunctionCalls(ai.data);
      if(!calls.length)break;

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
          max_output_tokens:Math.max(420,Math.min(680,adaptiveOutputTokenBudget(message,cognitiveState,currentSession)))
        });
        if(!ai.ok)return res.status(502).json({error:(ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل الوكيل الذكي'});
        break;
      }

      if(dailyTaskCompleted){
        const advanced=await startNextDailySession(token,currentSession).catch(()=>null);
        if(advanced){
          currentSession=advanced.session;
          dailyAutoPlan=advanced.plan;
          enrichedContext=buildCostOptimizedAgentContext({
            context,
            message,
            cognitiveState,
            coachingProfile,
            currentSession,
            conversationState,
            causalMemory,
            learningPatterns,
            knowledgeMemory,
            permanentMemory,
            learnedFacts,
            memberTrainingMemory,
            dailyAutoPlan,
            directDailyCompletion,
            dailyCompletionDiagnostic:null,
            teamIntelligence,
            marketingPlan
          });
          enrichedContext.memory_state=memoryState;
          enrichedContext.decision_state=decisionState;
          enrichedContext.adaptive_dialogue_state=adaptiveDialogueState;
          enrichedContext.reflection_state=reflectionState;
          enrichedContext.long_term_personal_model=longTermPersonalModel;
        }
      }
    }

    requestStage='finalize_response';
    const answer=outputText(ai.data);
    if(!answer)throw new Error('لم يرجع الوكيل ردًا');

    // Persist the successful turn so المدرب وائل حاتم can continue naturally across future sessions.
    await saveAgentMessage(token,'user',message).catch(()=>null);
    await saveAgentMessage(token,'assistant',answer).catch(()=>null);

    // One Nano pass handles the background memory layers together.
    // This avoids sending the same message/answer to multiple helper calls.
    const skipTurnAnalysis =
      isLowInformationChatMessage(message) &&
      !currentSession?.active &&
      !conversationState?.pending_question &&
      !conversationState?.pending_member_action &&
      !conversationState?.open_loop;

    const backgroundValue=backgroundMemoryValueLikely(
      message,
      cognitiveState,
      currentSession,
      conversationState,
      causalMemory
    );
    const causalRequested=backgroundValue && causalMemoryLikely(message,cognitiveState,causalMemory);
    const durableRequested=backgroundValue && durableLearningLikely(message,context.role);
    const personalRequested=context.role==='member' && backgroundValue;
    const conversationRequested=backgroundValue && !skipTurnAnalysis;
    const learningRequested=causalRequested && (Array.isArray(causalMemory)&&causalMemory.length>=1);
    const needBackgroundAnalysis=backgroundValue && (
      personalRequested||durableRequested||conversationRequested||causalRequested
    );

    let backgroundBundle=null;
    if(needBackgroundAnalysis){
      backgroundBundle=await extractBackgroundMemoryBundle({
        message,
        answer,
        context,
        currentSession,
        conversationState,
        recentTraining:memberTrainingMemory,
        learnedFacts,
        permanentMemory,
        causalMemory,
        learningPatterns,
        doPersonalTraining:personalRequested,
        doDurableFacts:durableRequested,
        doConversationState:conversationRequested,
        doCausalMemory:causalRequested,
        doLearningPattern:learningRequested
      });
    }

    if(backgroundBundle){
      if(personalRequested && backgroundBundle.personal_training){
        const pt=backgroundBundle.personal_training;
        const hasTraining=pt.training && (
          pt.training.topic||pt.training.objective||pt.training.member_statement||
          pt.training.coach_action||pt.training.outcome||pt.training.lesson||pt.training.next_step
        );
        if(hasTraining||pt.member_facts?.length){
          await savePersonalTrainingMemory(token,pt,currentSession).catch(()=>null);
          await savePersonalTrainingFacts(token,pt).catch(()=>null);
        }
      }

      if(durableRequested && backgroundBundle.durable_facts?.length){
        await saveLearnedFacts(token,backgroundBundle.durable_facts,message).catch(()=>null);
      }

      const updatedConversationState =
        conversationRequested && backgroundBundle.conversation_state
          ? backgroundBundle.conversation_state
          : conversationState;
      if(conversationRequested && updatedConversationState){
        await saveConversationState(token,updatedConversationState);
      }

      if(causalRequested && backgroundBundle.causal_event){
        const ce=backgroundBundle.causal_event;
        if(ce.attempt||ce.result||ce.adjustment){
          const causalId=await saveCausalMemory(token,ce);
          const latestCausalMemory=[
            {id:causalId,...ce},
            ...causalMemory
          ].slice(0,12);

          if(learningRequested && backgroundBundle.learning_pattern?.save){
            const lp={...backgroundBundle.learning_pattern};
            lp.source_event_ids=(Array.isArray(lp.source_event_ids)?lp.source_event_ids:[])
              .map(id=>String(id||'')==='CURRENT_EVENT'?String(causalId):String(id||''))
              .filter(id=>String(id)===String(causalId)||latestCausalMemory.some(e=>String(e.id||'')===String(id)))
              .slice(0,12);
            if(lp.source_event_ids.length) await saveLearningPattern(token,lp);
          }
        }
      }
    }

    const updatedConversationState =
      conversationRequested && backgroundBundle?.conversation_state
        ? backgroundBundle.conversation_state
        : conversationState;

    return res.status(200).json({
      ok:true,
      answer,
      context:{
        member:context.member,
        role:context.role,
        daily_completion:directDailyCompletion?{completed:true}:null,
        coaching_session:currentSession,
        conversation_state:updatedConversationState||conversationState||null
      }
    });
  }catch(error){
    console.error('[ai-agent]',error);
    const msg=String(error?.message||error||'FUNCTION_INVOCATION_FAILED');
    return res.status(500).json({
      error:msg,
      stage:requestStage
    });
  }
};
