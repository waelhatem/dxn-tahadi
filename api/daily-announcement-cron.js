'use strict';

// Vercel cron: 05:00 UTC = 08:00 Asia/Baghdad, independent of client logins.
const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const TOPICS = [
  'الصحة والعادات الوقائية المبنية على نمط الحياة',
  'البدء باستهلاك واعٍ قبل تقديم المنتجات',
  'البيع المباشر مسؤولية وثقة وليس إلحاحاً',
  'الاستمرارية أهم من الحماس المؤقت',
  'الاستماع للعميل وفهم احتياجاته',
  'التثقيف بالمنتج دون ادعاءات علاجية',
  'التطوير الذاتي والقراءة اليومية',
  'فن الدعوة الأخلاقية واحترام الرفض',
  'بناء الفريق بالتدريب والمساندة',
  'تنظيم الوقت بين العمل والأسرة',
  'الأمانة والشفافية في عرض الفرصة',
  'اكتساب المهارات خطوة بخطوة',
  'التعامل الراقي مع الاعتراضات',
  'تقدير الإنجاز الصغير والالتزام',
  'قيادة الفريق بالقدوة',
  'التركيز على الخدمة لا البيع فقط',
  'الاهتمام بالنشاط البدني والنوم',
  'التواصل الإنساني وبناء العلاقات',
  'التعلم من الأخطاء دون استسلام',
  'التخطيط الواقعي للأهداف'
];

function baghdadDate(now = new Date()){
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now);
  const get = type => parts.find(p=>p.type===type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
function topicFor(day){
  const dayNumber = Math.floor(Date.parse(day+'T00:00:00Z')/86400000);
  return TOPICS[((dayNumber%TOPICS.length)+TOPICS.length)%TOPICS.length];
}
function clean(s){return String(s||'').trim().replace(/\s+/g,' ');}
function validateDraft(draft,history=[]){
  if(!draft||typeof draft.title!=='string'||typeof draft.body!=='string')throw new Error('محتوى الذكاء الاصطناعي غير صالح');
  const title=clean(draft.title),body=String(draft.body).replace(/\s+/g,' ').trim();
  if(title.length<8||title.length>130||body.length<150||body.length>3000)throw new Error('طول الرسالة غير مناسب');
  if(!/[؟?]/.test(body))throw new Error('الرسالة لا تتضمن سؤالاً تفاعلياً');
  const text=title+' '+body;
  if(/يشفي|يعالج|يقضي على المرض|يمنع الإصابة|الوقاية من (السرطان|السكري|الضغط)|دخل مضمون|ربح مضمون|بديل عن (الدواء|العلاج)|علاج نهائي/i.test(text)){
    throw new Error('تم رفض الرسالة لوجود ادعاء صحي أو مالي غير موثق');
  }
  if(history.some(t=>clean(t).replace(/^🌅 صباح الصحة والثراء\s*[|｜]\s*/,'').replace(/^\d{4}-\d{2}-\d{2}\s*[—-]\s*/,'')===title)){
    throw new Error('عنوان الرسالة مكرر');
  }
  return {title,body};
}
async function responseJson(url,options,timeoutMs=20000){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(timeoutMs)});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch(e){data=null}
  if(!r.ok)throw new Error('خدمة خارجية أعادت حالة '+r.status);
  if(data==null)throw new Error('تعذر قراءة الاستجابة');
  return data;
}
async function rpc(name,body){
  const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if(!key)throw new Error('مفتاح خدمة Supabase غير مضبوط');
  return responseJson(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},
    body:JSON.stringify(body||{})
  },8000);
}
async function generateOnce(day,topic,history,maxOutputTokens){
  const key=String(process.env.OPENAI_API_KEY||'').trim();
  if(!key)throw new Error('مفتاح OpenAI غير مضبوط');
  const data=await responseJson('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.DAILY_ANNOUNCEMENT_MODEL||'gpt-5-nano',
      instructions:[
        'أنت محرر رسائل صباحية لأعضاء مجتمع الصحة والثراء، جمهور مهتم بتطوير العمل في DXN والبيع المباشر.',
        'اكتب بالعربية الفصحى الحديثة فقط، بأسلوب دافئ وواقعي ومهني، مع عدد قليل من الرموز التعبيرية.',
        'اكتب عنواناً قصيراً جديداً، ونصاً من 220 إلى 850 حرفاً تقريباً، وفكرة عملية واحدة وسؤال تفاعلي واضح في الختام.',
        'اكتب body في مقطع واحد متصل فقط؛ لا تستخدم فقرات منفصلة أو سطور فارغة أو تسميات مثل فكرة اليوم أو خطوة عملية أو سؤال اليوم.',
        'ادمج 4 إلى 6 رموز إيموجي مناسبة داخل الجمل وعلى امتداد المقطع، بتوزيع طبيعي دون حشو أو تكرار.',
        'اجعل الرسالة متسلسلة: افتتاحية جذابة ثم نصيحة عملية ثم سؤال تفاعلي في النهاية، لكن كلها في مقطع واحد ودون عناوين فرعية.',
        'لا تكتب رموز Markdown مثل ** أو HTML؛ الواجهة ستعرض المقطع بخط عريض موحّد.',
        'تجنب إعادة الموضوعات والعناوين الحديثة الموجودة في السياق.',
        'احظر الادعاءات بأن منتجات DXN تعالج أو تمنع أو تشفي الأمراض؛ الصحة تُدعم بالغذاء المتوازن والنوم والحركة والرعاية المناسبة.',
        'تجنب الوعود بدخل مضمون أو نجاح مالي مؤكد، والمبالغة التسويقية، والأرقام أو الدراسات دون مصادر.',
        'لا تقدم توصيات علاجية، ولا تخترع معلومات تفصيلية عن تركيبة أو فوائد المنتجات.',
        'لا تذكر أنك ذكاء اصطناعي. أعِد JSON فقط وفق المخطط.'
      ].join('\n'),
      input:'اليوم: '+day+'\nموضوع الرسالة: '+topic+
        '\nعناوين الرسائل الأخيرة (لا تكررها): '+JSON.stringify(history||[]),
      text:{format:{type:'json_schema',name:'daily_community_message',strict:true,schema:{
        type:'object',
        additionalProperties:false,
        required:['title','body'],
        properties:{title:{type:'string'},body:{type:'string'}}
      }}},
      max_output_tokens:maxOutputTokens
    })
  },19000);
  if(data.status==='incomplete')throw new Error('استجابة OpenAI غير مكتملة: '+String(data.incomplete_details?.reason||'unknown'));
  if(data.error)throw new Error('رفضت خدمة الذكاء الاصطناعي الطلب');
  const content=(data.output||[]).flatMap(item=>item.content||[])
    .filter(part=>part.type==='output_text').map(part=>part.text).join('');
  if(!content)throw new Error('لم تصل رسالة مكتملة من الذكاء الاصطناعي');
  let draft;
  try{draft=JSON.parse(content)}catch(e){throw new Error('تعذر تحليل الرسالة المولدة')}
  return validateDraft(draft,history);
}
// A model may spend its output budget on reasoning or return an invalid draft.
// Retry once with a larger budget, without ever publishing unvalidated content.
async function generate(day,topic,history){
  let lastError;
  for(const budget of [1600,2400]){
    try{return await generateOnce(day,topic,history,budget)}
    catch(e){
      lastError=e;
      if(/مفتاح OpenAI غير مضبوط/.test(String(e.message)))break;
      console.warn('[daily-global-announcement] AI generation attempt failed:',String(e?.message||e));
    }
  }
  throw lastError;
}
async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(!secret)return res.status(503).json({error:'CRON_SECRET غير مضبوط'});
  if(String(req.headers?.authorization||'')!=='Bearer '+secret){
    return res.status(401).json({error:'Unauthorized'});
  }
  try{
    const state=await rpc('get_daily_announcement_cron_state',{});
    const today=baghdadDate();
    if(state.day!==today)throw new Error('تاريخ قاعدة البيانات لا يطابق توقيت بغداد');
    if(!state.enabled)return res.status(200).json({ok:true,status:'disabled',day:today});
    if(state.already_published)return res.status(200).json({ok:true,status:'already_published',day:today});
    const history=Array.isArray(state.recent_titles)?state.recent_titles:[];
    const draft=await generate(today,topicFor(today),history);
    const title='🌅 صباح الصحة والثراء | '+today+' — '+draft.title;
    const result=await rpc('publish_daily_global_announcement',{
      p_day:today,p_title:title,p_body:draft.body
    });
    if(!result.ok)throw new Error('تعذر حفظ الإعلان');
    return res.status(200).json({
      ok:true,status:result.published?'published':'already_published',
      day:today,id:result.id
    });
  }catch(e){
    console.error('[daily-global-announcement]',String(e?.message||e));
    return res.status(500).json({ok:false,error:'تعذر إنشاء الرسالة أو نشرها؛ لم يتم نشر محتوى غير معتمد'});
  }
}
module.exports=handler;
module.exports.__test={baghdadDate,topicFor,validateDraft};

// Shared formatter for the leader's read-only AI preview; never writes announcements.
module.exports.generateDailyDraft=generate;
