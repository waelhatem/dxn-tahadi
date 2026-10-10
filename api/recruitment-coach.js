/* V86.81 — 🎙️ مدرب الاستقطاب الصوتي (محاكاة تدريبية فقط، بدون اتصالات حقيقية).
   POST {token, action, ...}
   - voice_status: حالة طبقة الصوت (المزوّد، هل صوت المدرب وائل حاتم مفعّل) بدون أي أسرار
   - scenario: يولّد بطاقة شخصية حسب {setup}
   - turn:     رد الشخصية على رسالة المتدرب {setup, scenario, history, state, message}
   - coach:    نصيحة المدرب وائل حاتم أثناء الإيقاف {setup, scenario, history, question}
   - evaluate: تقرير نهائي من 100 {setup, scenario, history}
   - speak:    صوت mp3 (Streaming) لنص أنتجه الخادم فقط {text, speech:{role,ts,sig}, scenario}
   المسار: صوت العضو → /api/ai-agent-voice (transcribe) → turn/coach → الرد النصي → speak → api/_voice-providers.js (MiniMax).
   الخادم لا يحفظ حالة الجلسة ولا أي تسجيل صوتي؛ المتصفح يرسل السياق في كل طلب ويُنقّى هنا. */
const crypto=require('crypto');
const voice=require('./ai-agent-voice');
const core=require('./_recruitment-coach-core');
const providers=require('./_voice-providers');

const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').trim().replace(/[\r\n]/g,'');
const MODEL=process.env.AI_RECRUITMENT_MODEL||process.env.AI_AGENT_MODEL||'gpt-5.6-luna';
const SPEECH_TTL_MS=30*60*1000;

/* نفس أسعار api/ai-agent.js لتسجيل التكلفة في log_ai_agent_usage. */
const RATES={'gpt-5.6-luna':{input:0.20,cached:0.02,output:1.20}};
const BUDGET={
  scenario:{effort:'none',tokens:700},
  turn:{effort:'none',tokens:450},
  coach:{effort:'low',tokens:700},
  evaluate:{effort:'low',tokens:1600}
};

class InputError extends Error{}

/* ---------- توقيع النص المنطوق ----------
   speak لا يقبل إلا نصًا أنتجه هذا الخادم (رد شخصية أو نصيحة المدرب)، حتى لا يُستخدم صوت المدرب
   وائل حاتم المستنسخ لنطق نص يكتبه أي شخص، ولا يُستخدم الـendpoint كخدمة تحويل صوت مجانية. */
function speechSecret(){
  return String(process.env.VOICE_SIGNING_SECRET||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||OPENAI_API_KEY);
}
function speechDigest(role,ts,text){
  return crypto.createHmac('sha256',speechSecret()).update(`${role}|${ts}|${text}`).digest('hex');
}
function signSpeech(role,text,now=Date.now()){
  return {role,ts:now,sig:speechDigest(role,now,text)};
}
function verifySpeech(speech,text,now=Date.now()){
  const role=speech&&speech.role;
  const ts=Number(speech&&speech.ts);
  const sig=String(speech&&speech.sig||'');
  if(role!=='coach'&&role!=='persona')return null;
  if(!Number.isFinite(ts)||ts>now+60000||now-ts>SPEECH_TTL_MS)return null;
  const expected=speechDigest(role,ts,text);
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  return role;
}

async function logUsage(action,usage){
  if(!usage)return;
  const input=Number(usage.input_tokens||0),output=Number(usage.output_tokens||0);
  const cached=Number(usage.input_tokens_details?.cached_tokens||0);
  const rate=RATES[String(MODEL).toLowerCase()];
  const cost=rate?((Math.max(input-cached,0)*rate.input)+(cached*rate.cached)+(output*rate.output))/1e6:0;
  try{
    await voice.supabaseRpc('log_ai_agent_usage',{
      p_model:String(MODEL),
      p_input_tokens:input,
      p_cached_input_tokens:cached,
      p_output_tokens:output,
      p_total_tokens:Number(usage.total_tokens||input+output),
      p_estimated_cost_usd:cost,
      p_request_kind:'recruitment_coach',
      p_metadata:{source:'recruitment-coach',action}
    });
  }catch(e){console.error('[recruitment-coach] usage logging failed',String(e?.message||e));}
}

function outputText(data){
  if(data&&typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data?.output)?data.output:[]))
    for(const part of (Array.isArray(item?.content)?item.content:[]))
      if(part?.type==='output_text'&&typeof part.text==='string')parts.push(part.text);
  return parts.join('').trim();
}

async function respond(action,{instructions,input,json}){
  const budget=BUDGET[action];
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      instructions,
      input,
      reasoning:{effort:budget.effort},
      max_output_tokens:budget.tokens,
      ...(json?{text:{format:{type:'json_object'}}}:{})
    }),
    signal:AbortSignal.timeout(45000)
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw new Error((data&&data.error&&data.error.message)||`OpenAI HTTP ${r.status}`);
  await logUsage(action,data?.usage);
  const text=outputText(data);
  if(!text)throw new Error('لم يصل رد من الذكاء الاصطناعي');
  return json?core.parseJsonObject(text):text;
}

function historyAsInput(history){
  return history.map(t=>({role:t.role==='persona'?'assistant':'user',content:t.content}));
}
function scenarioFrom(body,setup){
  return core.validateScenario(body.scenario,setup,providers.personaVoiceKeys());
}

async function handleVoiceStatus(){
  return {voice:providers.voiceStatus()};
}

async function handleScenario(body){
  const setup=core.validateSetup(body.setup);
  const personaKey=core.resolvePersonaKey(setup.persona);
  const gender=core.resolveGender(personaKey);
  const chosenVoice=core.pickVoice(gender);
  let raw=null;
  try{
    raw=await respond('scenario',{
      instructions:core.scenarioInstructions(setup,personaKey,gender),
      input:'أنشئ الشخصية الآن.',
      json:true
    });
  }catch(e){console.error('[recruitment-coach] scenario fallback',String(e?.message||e));}
  const scenario=core.sanitizeScenario(raw,setup,personaKey,gender,chosenVoice);
  return {scenario,generated:!!raw,opening_speech:signSpeech('persona',core.cleanText(scenario.opening_line,core.LIMITS.speak))};
}

async function handleTurn(body){
  const setup=core.validateSetup(body.setup);
  const scenario=scenarioFrom(body,setup);
  const history=core.validateHistory(body.history);
  const state=core.validateState(body.state);
  const message=core.cleanText(body.message,core.LIMITS.message);
  if(!message)throw new InputError('رسالة المتدرب فارغة');
  const raw=await respond('turn',{
    instructions:core.personaInstructions(setup,scenario,state),
    input:[...historyAsInput(history),{role:'user',content:message}],
    json:true
  });
  const turn=core.sanitizeTurn(raw,state);
  return {...turn,speech:signSpeech('persona',core.cleanText(turn.reply,core.LIMITS.speak))};
}

async function handleCoach(body){
  const setup=core.validateSetup(body.setup);
  const scenario=scenarioFrom(body,setup);
  const history=core.validateHistory(body.history);
  const question=core.cleanText(body.question,core.LIMITS.question)||'أين أخطأت؟ وماذا كان الأفضل أن أقول؟';
  const raw=await respond('coach',{
    instructions:core.coachInstructions(setup,scenario),
    input:`نص المحادثة حتى الآن:\n${core.transcriptText(history,scenario)||'(لم تبدأ المحادثة بعد)'}\n\nسؤال المتدرب: ${question}`,
    json:false
  });
  const answer=core.cleanText(raw,1500);
  return {answer,speech:signSpeech('coach',core.cleanText(answer,core.LIMITS.speak))};
}

async function handleEvaluate(body){
  const setup=core.validateSetup(body.setup);
  const scenario=scenarioFrom(body,setup);
  const history=core.validateHistory(body.history);
  if(!history.some(t=>t.role==='trainee'))throw new InputError('لا توجد محادثة لتقييمها بعد');
  const raw=await respond('evaluate',{
    instructions:core.evaluationInstructions(setup,scenario),
    input:`نص المحادثة الكامل:\n${core.transcriptText(history,scenario)}`,
    json:true
  });
  if(!raw)throw new Error('تعذر قراءة تقرير التقييم');
  return {report:core.sanitizeEvaluation(raw)};
}

/* يبث mp3 للمتصفح فور وصول أول جزء من المزوّد. في server.js المحلي (بدون res.write) يُرسل الصوت كاملًا. */
async function handleSpeak(body,res){
  const text=core.cleanText(body.text,core.LIMITS.speak);
  if(!text)throw new InputError('النص المطلوب تحويله إلى صوت فارغ');
  const role=verifySpeech(body.speech,text);
  if(!role)throw new InputError('طلب الصوت غير صالح أو انتهت صلاحيته');
  const s=body.scenario&&typeof body.scenario==='object'?body.scenario:{};
  const gender=s.gender==='female'?'female':'male';
  const target=providers.resolveVoice(role,String(s.voice||''),gender,core.personaVoiceInstructions({
    gender,
    age:Math.min(80,Math.max(20,Number(s.age)||35)),
    time_availability:core.cleanText(s.time_availability,60)
  }));
  const canStream=typeof res.write==='function';
  const buffered=[];
  let started=false;
  const begin=()=>{
    started=true;
    res.statusCode=200;
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Voice-Role',role);
  };
  try{
    await providers.synthesize({text,voice:target},chunk=>{
      if(!canStream){buffered.push(chunk);return;}
      if(!started)begin();
      res.write(chunk);
    });
  }catch(e){
    if(started){console.error('[recruitment-coach] speak stream interrupted',String(e?.message||e));return res.end();}
    throw e;
  }
  if(!canStream){begin();return res.end(Buffer.concat(buffered));}
  return res.end();
}

const ACTIONS={voice_status:handleVoiceStatus,scenario:handleScenario,turn:handleTurn,coach:handleCoach,evaluate:handleEvaluate};
const INPUT_ERROR_PATTERN=/غير معروف|جلسة|غير صالح|غير مدعوم|فارغ|لا توجد محادثة/;

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'').trim();
    if(action!=='speak'&&!ACTIONS[action])return res.status(400).json({error:'الإجراء غير معروف'});
    await voice.verifyToken(String(body.token||'').trim());
    if(action==='speak')return await handleSpeak(body,res);
    return res.status(200).json({ok:true,...await ACTIONS[action](body)});
  }catch(e){
    const isInput=e instanceof InputError||INPUT_ERROR_PATTERN.test(String(e?.message||''));
    if(!isInput)console.error('[recruitment-coach] error',e);
    return res.status(isInput?400:500).json({error:String(e?.message||e)});
  }
};

/* للاختبارات فقط. */
module.exports._internal={historyAsInput,ACTIONS,signSpeech,verifySpeech,handleSpeak};
