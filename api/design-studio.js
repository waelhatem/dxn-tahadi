const https=require('https');

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').trim().replace(/[\r\n]/g,'');
const IMAGE_MODEL=String(process.env.DESIGN_IMAGE_MODEL||'gpt-image-2.5-sunburst').trim();

function httpJson(url,body,headers,timeout){
  return new Promise((resolve)=>{
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
      timeout:timeout||90000
    },res=>{
      let text='';
      res.setEncoding('utf8');
      res.on('data',c=>text+=c);
      res.on('end',()=>{
        let data=null;try{data=text?JSON.parse(text):null}catch(_){}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode||0,data,text});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('انتهت مهلة الاتصال بمحرك الصور')));
    req.on('error',e=>resolve({ok:false,status:0,data:null,text:String(e?.message||e)}));
    req.write(raw);req.end();
  });
}

async function assertSession(token){
  if(!SUPABASE_SECRET_KEY)throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  if(!token)throw new Error('جلسة الدخول مطلوبة');
  const r=await httpJson(`${SUPABASE_URL}/rest/v1/rpc/bootstrap`,{p_token:token},{
    apikey:SUPABASE_SECRET_KEY,
    Authorization:`Bearer ${SUPABASE_SECRET_KEY}`
  },15000);
  if(!r.ok)throw new Error((r.data&&(r.data.message||r.data.error||r.data.hint))||r.text||'جلسة الدخول غير صالحة');
  const role=String(r.data?.role||'').toLowerCase();
  if(role!=='member'&&role!=='leader')throw new Error('نوع الحساب غير مدعوم');
  return {role};
}

function validDataUrl(value){
  const v=String(value||'');
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v))return false;
  return v.length<=4_500_000;
}

function validSize(value){
  const s=String(value||'');
  return ['1024x1024','1024x1280','1024x1792','1792x1024'].includes(s)?s:'1024x1024';
}

function buildPrompt({task,background,preserveProduct,customPrompt}){
  const backgroundText={
    premium:'a premium commercial studio setting with elegant controlled lighting',
    white:'a clean seamless white studio background with realistic soft shadows',
    lifestyle:'a realistic lifestyle scene appropriate for the product category',
    natural:'a realistic natural environment with believable daylight'
  }[background]||'a premium commercial studio setting with elegant controlled lighting';

  const base=[
    'Edit the supplied product photo for professional social-media marketing.',
    'Keep the result photorealistic, commercially polished, and visually credible.',
    'Do not invent prices, certifications, medical claims, health claims, discounts, ingredients, or product benefits.',
    'Do not add logos, watermarks, badges, labels, or marketing text unless the user explicitly provided the exact text.',
    preserveProduct
      ? 'Preserve the physical product identity as faithfully as possible: package shape, proportions, brand logo, printed wording, colors, cap, label placement, and all distinctive details. Do not redesign the packaging.'
      : 'You may improve presentation while keeping the product recognizably the same item.'
  ];

  if(task==='enhance'){
    base.push('Improve sharpness, exposure, white balance, tonal range, texture clarity, and professional product lighting. Keep the existing composition unless a small crop improves presentation.');
  }else if(task==='background'){
    base.push(`Replace or refine the surrounding background with ${backgroundText}. Keep the product itself unchanged and integrate realistic contact shadows and reflections.`);
  }else if(task==='ad'){
    base.push(`Create a premium advertising-style product composition using ${backgroundText}. Make the product the clear focal point, with balanced negative space suitable for later marketing copy.`);
  }else if(task==='free'){
    base.push('Follow the user editing instruction precisely while maintaining photographic realism.');
  }

  if(customPrompt)base.push('User instruction: '+customPrompt.slice(0,1200));
  base.push('Return one finished marketing image only.');
  return base.join('\n');
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
    await assertSession(token);

    const image=String(body.image||'');
    if(!validDataUrl(image))return res.status(400).json({error:'الصورة غير صالحة أو حجمها أكبر من الحد المسموح.'});

    const task=String(body.task||'enhance').toLowerCase();
    if(!['enhance','background','ad','free'].includes(task))return res.status(400).json({error:'نوع التصميم غير مدعوم.'});

    const prompt=buildPrompt({
      task,
      background:String(body.background||'premium').toLowerCase(),
      preserveProduct:body.preserve_product!==false,
      customPrompt:String(body.prompt||'').trim()
    });

    const api=await httpJson('https://api.openai.com/v1/images/edits',{
      model:IMAGE_MODEL,
      images:[{image_url:image}],
      prompt,
      size:validSize(body.size),
      quality:'medium',
      output_format:'jpeg',
      output_compression:88,
      background:'opaque',
      n:1
    },{
      Authorization:`Bearer ${OPENAI_API_KEY}`
    },55000);

    if(!api.ok){
      const message=api.data?.error?.message||api.data?.message||api.text||'تعذر إنشاء الصورة';
      return res.status(api.status>=400&&api.status<500?api.status:502).json({error:message});
    }

    const item=Array.isArray(api.data?.data)?api.data.data[0]:null;
    const b64=String(item?.b64_json||'');
    if(!b64)return res.status(502).json({error:'لم يرجع محرك الصور نتيجة صالحة.'});

    return res.status(200).json({
      ok:true,
      image:`data:image/jpeg;base64,${b64}`,
      model:IMAGE_MODEL,
      size:api.data?.size||validSize(body.size),
      quality:api.data?.quality||'medium'
    });
  }catch(error){
    console.error('[design-studio]',error);
    return res.status(500).json({error:String(error?.message||error||'تعذر تشغيل استوديو التصميم')});
  }
};