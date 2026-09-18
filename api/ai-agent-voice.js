const https = require('https');

const SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');

function json(res,status,body){res.status(status).json(body);}

function supabaseRpc(fn,args){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const raw=JSON.stringify(args||{});
    const req=https.request({
      protocol:base.protocol,
      hostname:base.hostname,
      port:base.port||443,
      method:'POST',
      path:`/rest/v1/rpc/${encodeURIComponent(fn)}`,
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        apikey:SUPABASE_SECRET_KEY,
        Authorization:`Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Length':Buffer.byteLength(raw)
      },
      timeout:15000
    },response=>{
      let text='';response.setEncoding('utf8');response.on('data',c=>text+=c);response.on('end',()=>{
        let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بقاعدة البيانات')));
    req.on('error',reject);req.write(raw);req.end();
  });
}

async function verifyToken(token){
  if(!token)throw new Error('جلسة الدخول مطلوبة');
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r=await supabaseRpc('bootstrap',{p_token:token});
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const role=String(r.data&&r.data.role||'').toLowerCase();
  if(role!=='member'&&role!=='leader')throw new Error('نوع الحساب غير مدعوم');
}

async function transcribe(audio,filename,mime){
  const form=new FormData();
  form.append('model',process.env.AI_AGENT_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');
  form.append('language','ar');
  form.append('response_format','json');
  form.append('prompt','اللهجة العراقية: شلون، هسه، تگدر، عندك، خلينا، مو، إذا تريد، وين، ليش. أسماء ومصطلحات المنصة: DXN، مجتمع الصحة والثراء، الوكيل الذكي، التدريب، العضو، القائد. حافظ على الكلمات العراقية كما نطقها المتحدث ولا تستبدلها بلهجة أخرى.');
  form.append('file',new Blob([audio],{type:mime||'audio/webm'}),filename||'voice.webm');
  const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{
    method:'POST',
    headers:{Authorization:`Bearer ${OPENAI_API_KEY}`},
    body:form
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
  if(!r.ok)throw new Error((data&&data.error&&data.error.message)||text||`OpenAI HTTP ${r.status}`);
  return String(data&&data.text||'').trim();
}

async function speak(text){
  const r=await fetch('https://api.openai.com/v1/audio/speech',{
    method:'POST',
    headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.AI_AGENT_TTS_MODEL||'gpt-4o-mini-tts',
      voice:process.env.AI_AGENT_TTS_VOICE||'onyx',
      input:text,
      response_format:'mp3',
      instructions:'تحدث بعراقية طبيعية معاصرة بصوت رجل واضح وعميق وهادئ، بنبرة ودودة ومهنية كمدرب شخصي عراقي. لا تكتفِ بإدخال كلمات عراقية؛ اجعل تركيب الجمل وإيقاعها عراقيين طبيعيين. استخدم عند الحاجة: شلون، شنو، هسه، أكو، ماكو، تگدر، أگدر، أريد، نريد، خلينا، خلي، مو، إي، وين، ليش، شكد، بعد، بعدين، زين، تمام، خوش. لا تفرط في العامية. تجنب المصرية والخليجية والشامية، مثل إزاي، دلوقتي، عايز، كده، شو، هيك. انطق الكلمات العراقية بوضوح وبسرعة محادثة طبيعية.'
    })
  });
  const buffer=Buffer.from(await r.arrayBuffer());
  if(!r.ok){
    let data=null;try{data=JSON.parse(buffer.toString('utf8'))}catch(_){}
    throw new Error((data&&data.error&&data.error.message)||buffer.toString('utf8')||`OpenAI HTTP ${r.status}`);
  }
  return buffer;
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});

  try{
    if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const token=String(body.token||'').trim();
    await verifyToken(token);
    const action=String(body.action||'').trim();

    if(action==='transcribe'){
      const b64=String(body.audio_base64||'').trim();
      if(!b64)throw new Error('ملف الصوت مطلوب');
      if(b64.length>12000000)throw new Error('التسجيل الصوتي طويل جدًا');
      const audio=Buffer.from(b64,'base64');
      if(!audio.length)throw new Error('ملف الصوت غير صالح');
      const text=await transcribe(audio,String(body.filename||'voice.webm'),String(body.mime||'audio/webm'));
      if(!text)throw new Error('لم يتم التعرف على كلام واضح في التسجيل');
      return json(res,200,{ok:true,text});
    }

    if(action==='speak'){
      const text=String(body.text||'').trim();
      if(!text)throw new Error('النص المطلوب تحويله إلى صوت فارغ');
      if(text.length>5000)throw new Error('نص الرد طويل جدًا للصوت');
      const audio=await speak(text);
      res.statusCode=200;
      res.setHeader('Content-Type','audio/mpeg');
      res.setHeader('Content-Length',String(audio.length));
      res.setHeader('Cache-Control','no-store');
      return res.end(audio);
    }

    return json(res,400,{error:'الإجراء غير معروف'});
  }catch(e){
    console.error('AI agent voice error:',e);
    return json(res,500,{error:String(e&&e.message||e)});
  }
};
