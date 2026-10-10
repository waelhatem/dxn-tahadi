/* V86.81 — طبقة مزوّدي الصوت (نص → صوت) لمدرب الاستقطاب الصوتي.
   voice provider → MiniMax (أساسي) | OpenAI (احتياطي). لإضافة محرك جديد: أضف كائنًا في PROVIDERS بنفس الواجهة.
   واجهة كل مزوّد: { name, configured(), stream({text,voice}, onChunk) → Promise<void> } حيث onChunk يستقبل Buffer من mp3.
   المتصفح لا يرسل voice_id أبدًا: يرسل الدور (coach/persona) ومفتاح صوت من الكتالوج فقط، والتحويل إلى voice_id هنا.
   مرجع MiniMax: POST {host}/v1/t2a_v2 — https://platform.minimax.io/docs/api-reference/speech-t2a-http */

const env=name=>String(process.env[name]||'').trim().replace(/[\r\n]/g,'');

const MINIMAX_DEFAULT_HOST='https://api.minimax.io';
const MINIMAX_DEFAULT_MODEL='speech-2.8-turbo';
const MINIMAX_ARABIC_MALE='Arabic_FriendlyGuy';
const MINIMAX_ARABIC_FEMALE='Arabic_CalmWoman';
const REQUEST_TIMEOUT_MS=30000;

/* كتالوج أصوات الشخصيات. MiniMax لديه صوتان عربيان جاهزان فقط، لذلك نميّز الشخصيات بطبقة الصوت والسرعة.
   يمكن استبدال أي مفتاح أو إضافة مفاتيح بصوت مستنسخ/مصمم عبر MINIMAX_PERSONA_VOICES (JSON) دون تغيير الكود. */
const BASE_PERSONA_VOICES={
  m1:{gender:'male',minimax:{voice_id:MINIMAX_ARABIC_MALE,pitch:0,speed:1},openai:'ash'},
  m2:{gender:'male',minimax:{voice_id:MINIMAX_ARABIC_MALE,pitch:-3,speed:0.95},openai:'echo'},
  m3:{gender:'male',minimax:{voice_id:MINIMAX_ARABIC_MALE,pitch:2,speed:1.05},openai:'verse'},
  f1:{gender:'female',minimax:{voice_id:MINIMAX_ARABIC_FEMALE,pitch:0,speed:1},openai:'coral'},
  f2:{gender:'female',minimax:{voice_id:MINIMAX_ARABIC_FEMALE,pitch:2,speed:1.05},openai:'shimmer'},
  f3:{gender:'female',minimax:{voice_id:MINIMAX_ARABIC_FEMALE,pitch:-2,speed:0.95},openai:'nova'}
};
const VOICE_KEY_PATTERN=/^[a-z][a-z0-9_]{0,31}$/;
const MINIMAX_VOICE_ID_PATTERN=/^[A-Za-z][A-Za-z0-9_-]{0,255}$/;

/* MINIMAX_PERSONA_VOICES مثال: [{"key":"m4","gender":"male","voice_id":"IraqiCustomer01","pitch":0,"speed":1}] */
function personaVoiceCatalog(){
  const catalog={...BASE_PERSONA_VOICES};
  const raw=env('MINIMAX_PERSONA_VOICES');
  if(!raw)return catalog;
  try{
    for(const v of JSON.parse(raw)){
      if(!v||!VOICE_KEY_PATTERN.test(String(v.key))||!MINIMAX_VOICE_ID_PATTERN.test(String(v.voice_id)))continue;
      const gender=v.gender==='female'?'female':'male';
      catalog[v.key]={
        gender,
        minimax:{voice_id:String(v.voice_id),pitch:Math.max(-12,Math.min(12,Math.round(Number(v.pitch)||0))),speed:Math.max(0.5,Math.min(2,Number(v.speed)||1))},
        openai:gender==='female'?'coral':'ash'
      };
    }
  }catch(e){console.error('[voice] MINIMAX_PERSONA_VOICES is not valid JSON');}
  return catalog;
}
function personaVoiceKeys(gender){
  return Object.entries(personaVoiceCatalog()).filter(([,v])=>!gender||v.gender===gender).map(([k])=>k);
}

const COACH_OPENAI_INSTRUCTIONS='أنت المدرب وائل حاتم، مدرب عراقي ودود. صوت رجل دافئ وواثق، تكلم باللهجة العراقية الطبيعية بإيقاع محادثة مريح.';

function coachVoiceReady(){return !!(env('MINIMAX_API_KEY')&&env('MINIMAX_COACH_VOICE_ID'));}

/* يحوّل الدور إلى إعدادات صوت لكل مزوّد. بدون صوت مستنسخ يُستخدم صوت تجريبي مؤقت. */
function resolveVoice(role,personaVoiceKey,gender,personaInstructions){
  if(role==='coach'){
    const clone=env('MINIMAX_COACH_VOICE_ID');
    return {
      role,
      minimax:{voice_id:clone||MINIMAX_ARABIC_MALE,pitch:clone?0:-1,speed:1},
      openai:{voice:'onyx',instructions:COACH_OPENAI_INSTRUCTIONS}
    };
  }
  const catalog=personaVoiceCatalog();
  const entry=catalog[personaVoiceKey]||catalog[gender==='female'?'f1':'m1'];
  return {role,minimax:entry.minimax,openai:{voice:entry.openai,instructions:personaInstructions||''}};
}

/* ---------- MiniMax ---------- */
function minimaxUrl(){
  const host=(env('MINIMAX_API_HOST')||MINIMAX_DEFAULT_HOST).replace(/\/+$/,'');
  const group=env('MINIMAX_GROUP_ID');
  return `${host}/v1/t2a_v2${group?`?GroupId=${encodeURIComponent(group)}`:''}`;
}

function minimaxError(obj){
  const code=obj&&obj.base_resp&&obj.base_resp.status_code;
  if(code&&code!==0)return new Error(`MiniMax ${code}: ${obj.base_resp.status_msg||'error'}`);
  return null;
}

/* يقرأ رد البث: كتل JSON مسبوقة بـ "data:" ومفصولة بسطر فارغ.
   نتجاهل المقطع النهائي status=2 إذا سبقته مقاطع، لأنه قد يكرر الصوت كاملًا. */
function createMinimaxStreamParser(onAudio){
  let buffer='';let emitted=0;
  function handle(block){
    const text=block.replace(/^data:\s*/gm,'').trim();
    if(!text||text==='[DONE]')return;
    let obj;try{obj=JSON.parse(text);}catch(_){return;}
    const err=minimaxError(obj);if(err)throw err;
    const audio=obj&&obj.data&&obj.data.audio;
    if(!audio)return;
    if(obj.data.status===2&&emitted>0)return;
    emitted++;onAudio(Buffer.from(audio,'hex'));
  }
  return {
    push(chunk){
      buffer+=chunk;
      let m;
      while((m=/\r?\n\r?\n/.exec(buffer))){
        const block=buffer.slice(0,m.index);
        buffer=buffer.slice(m.index+m[0].length);
        handle(block);
      }
    },
    end(){
      if(buffer.trim())handle(buffer);
      buffer='';
      return emitted;
    }
  };
}

const minimax={
  name:'minimax',
  configured(){return !!env('MINIMAX_API_KEY');},
  async stream({text,voice},onChunk){
    const r=await fetch(minimaxUrl(),{
      method:'POST',
      headers:{Authorization:`Bearer ${env('MINIMAX_API_KEY')}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:env('MINIMAX_TTS_MODEL')||MINIMAX_DEFAULT_MODEL,
        text,
        stream:true,
        stream_options:{exclude_aggregated_audio:true},
        language_boost:'Arabic',
        voice_setting:{voice_id:voice.minimax.voice_id,speed:voice.minimax.speed,vol:1,pitch:voice.minimax.pitch},
        audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1}
      }),
      signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const contentType=String(r.headers.get('content-type')||'');
    if(!r.ok||contentType.includes('application/json')){
      const obj=await r.json().catch(()=>null);
      throw minimaxError(obj)||new Error(`MiniMax HTTP ${r.status}`);
    }
    const parser=createMinimaxStreamParser(onChunk);
    const decoder=new TextDecoder();
    for await(const part of r.body)parser.push(decoder.decode(part,{stream:true}));
    if(!parser.end())throw new Error('MiniMax لم يُرجع صوتًا');
  }
};

/* ---------- OpenAI (احتياطي؛ يعيد استخدام speak الموجود في ai-agent-voice.js) ---------- */
const openai={
  name:'openai',
  configured(){return !!env('OPENAI_API_KEY');},
  async stream({text,voice},onChunk){
    const {speak}=require('./ai-agent-voice');
    onChunk(await speak(text,{voice:voice.openai.voice,instructions:voice.openai.instructions||undefined}));
  }
};

const PROVIDERS={minimax,openai};

/* ترتيب المحاولة: المزوّد المختار (VOICE_PROVIDER أو minimax) ثم البقية المضبوطة كاحتياط. */
function providerChain(){
  const preferred=PROVIDERS[env('VOICE_PROVIDER').toLowerCase()]||minimax;
  return [preferred,...Object.values(PROVIDERS).filter(p=>p!==preferred)].filter(p=>p.configured());
}

/* يبث الصوت عبر أول مزوّد ينجح. لا ينتقل إلى مزوّد آخر بعد إرسال أول جزء حتى لا يختلط صوتان. */
async function synthesize({text,voice},onChunk){
  const chain=providerChain();
  if(!chain.length)throw new Error('لا يوجد مزوّد صوت مضبوط');
  let lastError=null;
  for(const provider of chain){
    let started=false;
    try{
      await provider.stream({text,voice},chunk=>{started=true;onChunk(chunk);});
      return {provider:provider.name};
    }catch(e){
      lastError=e;
      console.error(`[voice] ${provider.name} failed`,String(e&&e.message||e));
      if(started)throw e;
    }
  }
  throw lastError;
}

function voiceStatus(){
  const chain=providerChain();
  return {
    provider:chain[0]?chain[0].name:null,
    fallback:chain.slice(1).map(p=>p.name),
    coach_voice_ready:coachVoiceReady(),
    streaming:!!(chain[0]&&chain[0].name==='minimax')
  };
}

module.exports={
  PROVIDERS,BASE_PERSONA_VOICES,
  personaVoiceCatalog,personaVoiceKeys,resolveVoice,coachVoiceReady,
  synthesize,voiceStatus,providerChain,
  createMinimaxStreamParser,minimaxUrl
};
