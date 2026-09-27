const https = require('https');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/,'');
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');
const MODEL = process.env.AI_TRAINING_MODEL || 'gpt-5.6-luna';

function request(url, method, body, headers={}, timeout=60000){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const payload=body==null?null:JSON.stringify(body);
    const req=https.request({
      protocol:u.protocol,hostname:u.hostname,port:u.port||443,method,
      path:u.pathname+u.search,
      headers:{
        Accept:'application/json',
        ...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),
        ...headers
      },
      timeout
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',c=>text+=c);
      res.on('end',()=>{
        let data=null; try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال')));
    req.on('error',reject);
    if(payload)req.write(payload);
    req.end();
  });
}

function supabaseRpc(fn,args){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط');
  return request(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(fn)}`,'POST',args,{
    apikey:SUPABASE_SECRET_KEY,
    Authorization:`Bearer ${SUPABASE_SECRET_KEY}`
  },60000);
}

async function getMaterial(token,id){
  const r=await supabaseRpc('get_ai_training_material_for_processing',{
    p_token:token,p_material_id:id
  });
  if(!r.ok)throw new Error(r.data?.message||r.data?.error||r.text||'تعذر قراءة المادة التدريبية');
  const rows=Array.isArray(r.data)?r.data:[];
  if(!rows.length)throw new Error('المادة التدريبية غير موجودة');
  return rows[0];
}

async function updateMaterial(token,id,status,errorMessage,metadata,processedAt){
  const r=await supabaseRpc('update_ai_training_material_processing',{
    p_token:token,
    p_material_id:id,
    p_status:status,
    p_error_message:errorMessage||null,
    p_metadata:metadata||null,
    p_processed_at:processedAt||null
  });
  if(!r.ok)console.error('[ai-training-materials] status update failed',r.text||r.data);
}

async function signedDownloadUrl(bucket,path){
  const encodedPath=String(path||'').split('/').map(encodeURIComponent).join('/');
  const r=await request(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,'POST',{
    expiresIn:3600
  },{
    apikey:SUPABASE_SECRET_KEY,
    Authorization:`Bearer ${SUPABASE_SECRET_KEY}`
  });
  if(!r.ok)throw new Error(r.data?.message||r.data?.error||r.text||'تعذر إنشاء رابط قراءة المادة');
  const signed=String(r.data?.signedURL||r.data?.signedUrl||r.data?.url||'').trim();
  if(!signed)throw new Error('لم يُنشأ رابط قراءة للمادة');
  return /^https?:\/\//i.test(signed)?signed:`${SUPABASE_URL}/storage/v1${signed.startsWith('/')?signed:'/'}`;
}

function openai(payload){
  return request('https://api.openai.com/v1/responses','POST',payload,{
    Authorization:`Bearer ${OPENAI_API_KEY}`
  },120000);
}

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data?.output)?data.output:[])){
    for(const part of (Array.isArray(item?.content)?item.content:[])){
      if(part?.type==='output_text'&&typeof part.text==='string')parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function parseChunks(text){
  const raw=String(text||'').trim();
  let value=null;
  try{value=JSON.parse(raw)}catch(_){
    const match=raw.match(/\\{[\\s\\S]*\\}/);
    if(match){try{value=JSON.parse(match[0])}catch(__){}}
  }
  if(!value||!Array.isArray(value.chunks))throw new Error('لم تُرجع عملية الاستخراج بنية معرفة صالحة');
  return value.chunks
    .map((x,i)=>({
      title:String(x?.title||`قسم ${i+1}`).trim().slice(0,300),
      content:String(x?.content||'').trim().slice(0,4000)
    }))
    .filter(x=>x.content);
}

function extractionPrompt(material){
  const type=String(material.material_type||'').toLowerCase();
  const source=type==='pdf'
    ? 'حلّل ملف PDF المرفق صفحةً صفحة، واستخرج المعرفة التدريبية الفعلية دون اختلاق أو تلخيص يغيّر المعنى.'
    : 'حلّل الصورة المرفقة بدقة واستخرج كل النص والمعلومات التدريبية المقروءة منها دون اختلاق.';
  return `أنت طبقة استخراج معرفة للمدرب وائل حاتم. هذه المادة مصدر تدريبي مرفوع من القائد.
المادة: ${material.title}
النوع: ${type}
${source}

قواعد صارمة:
1) لا تضف أي معلومة غير موجودة في المادة.
2) حافظ على المصطلحات والأرقام والشروط والأسماء كما وردت.
3) إذا كان جزء غير مقروء أو غير واضح فلا تخمّن؛ تجاهله.
4) قسّم الناتج إلى وحدات معرفية مستقلة، كل وحدة تشرح فكرة واحدة.
5) لا تحول الأمثلة أو الادعاءات الواردة في المصدر إلى حقائق خارجية.
6) أعد JSON فقط بالشكل:
{"chunks":[{"title":"...","content":"..."}]}
`;
}

async function processMaterial(token,id){
  if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY غير مضبوط');
  const material=await getMaterial(token,id);
  if(!['pdf','image'].includes(String(material.material_type).toLowerCase())){
    throw new Error('المعالجة الآلية الحالية تدعم PDF والصور فقط؛ الفيديو يبقى مسجلاً حتى إضافة طبقة تفريغ الفيديو.');
  }

  await updateMaterial(token,id,'processing',null,{...(material.metadata||{}),processing_started_at:new Date().toISOString()});
  try{
    const url=await signedDownloadUrl(material.storage_bucket,material.storage_path);
    const inputType=String(material.material_type).toLowerCase()==='pdf'?'input_file':'input_image';
    const content=inputType==='input_file'
      ? [{type:'input_file',file_url:url}]
      : [{type:'input_image',image_url:url}];

    const ai=await openai({
      model:MODEL,
      input:[{
        role:'user',
        content:[
          {type:'input_text',text:extractionPrompt(material)},
          ...content
        ]
      }],
      text:{format:{type:'json_object'}}
    });
    if(!ai.ok)throw new Error(ai.data?.error?.message||ai.text||'فشل استخراج المعرفة من OpenAI');

    const chunks=parseChunks(outputText(ai.data));
    const saved=await supabaseRpc('save_ai_training_material_knowledge',{
      p_token:token,
      p_material_id:id,
      p_category:String(material.material_type).toLowerCase()==='pdf'?'dxn_pdf_source_exact':'uploaded_image_exact',
      p_title_prefix:material.title,
      p_priority:Number(material.priority||80),
      p_chunks:chunks
    });
    if(!saved.ok)throw new Error(saved.data?.message||saved.data?.error||saved.text||'تعذر حفظ المعرفة المستخرجة');

    const metadata={
      ...(material.metadata||{}),
      processing_model:MODEL,
      extracted_chunks:chunks.length,
      knowledge_rows_saved:Number(saved.data||0),
      processed_at:new Date().toISOString()
    };
    await updateMaterial(token,id,'ready',null,metadata,new Date().toISOString());
    return {id,status:'ready',chunks:chunks.length,saved:Number(saved.data||0)};
  }catch(error){
    await updateMaterial(token,id,'failed',String(error?.message||error).slice(0,1000),{
      ...(material.metadata||{}),
      processing_failed_at:new Date().toISOString()
    });
    throw error;
  }
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){
    res.statusCode=405;
    return res.end(JSON.stringify({error:'Method Not Allowed'}));
  }
  try{
    const body=typeof req.body==='object'&&req.body?req.body:{};
    const token=String(body.p_token||'').trim();
    const materialId=String(body.material_id||'').trim();
    if(!token||!materialId){
      res.statusCode=400;
      return res.end(JSON.stringify({error:'p_token و material_id مطلوبان'}));
    }
    const result=await processMaterial(token,materialId);
    res.statusCode=200;
    return res.end(JSON.stringify(result));
  }catch(error){
    console.error('[ai-training-materials]',error);
    res.statusCode=500;
    return res.end(JSON.stringify({error:String(error?.message||error)}));
  }
};
