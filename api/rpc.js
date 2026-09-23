const https = require('https');

const DEFAULT_SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';
const configuredSupabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/[\r\n]/g,'').replace(/\/$/,'');
const SUPABASE_URL = /^https:\/\/ryqpstkzppaifpvhezzn\.supabase\.co$/i.test(configuredSupabaseUrl) ? configuredSupabaseUrl : DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh').trim().replace(/[\r\n]/g,'');
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim().replace(/[\r\n]/g,'');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function json(res,status,body){
  res.status(status).json(body);
}

function outputText(data){
  if(data && typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts=[];
  for(const item of (Array.isArray(data && data.output) ? data.output : [])){
    for(const part of (Array.isArray(item && item.content) ? item.content : [])){
      if(part && part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

function openaiResponses(payload){
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify(payload);
    const request=https.request('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${OPENAI_API_KEY}`,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body)
      },
      timeout:30000
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=null}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي')));
    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

function supabaseRpcRequest(fn,args,key,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const body=JSON.stringify(args||{});
    const request=https.request({
      protocol:base.protocol,
      hostname:base.hostname,
      port:base.port||443,
      method:'POST',
      path:`/rest/v1/rpc/${encodeURIComponent(fn)}`,
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json',
        ...(key?{apikey:key,Authorization:`Bearer ${key}`}:{})
        ,'Content-Length':Buffer.byteLength(body)
      },
      timeout:timeoutMs||10000
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال بخدمة Supabase')));
    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

async function supabaseRestRequest(path,key,timeoutMs){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const request=https.request({
      protocol:base.protocol,
      hostname:base.hostname,
      port:base.port||443,
      method:'GET',
      path,
      headers:{
        Accept:'application/json',
        ...(key?{apikey:key,Authorization:`Bearer ${key}`}:{})
      },
      timeout:timeoutMs||12000
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk});
      response.on('end',()=>{
        let data=null;
        try{data=text?JSON.parse(text):null}catch(_){data=text}
        resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||0,data,text});
      });
    });
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال ببيانات الفريق')));
    request.on('error',reject);
    request.end();
  });
}

async function directTeamIntelligenceFromTable(args){
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const token=String(args.p_token||'').trim();
  if(!token) throw new Error('جلسة العضوية غير موجودة');

  const boot=await supabaseRpcRequest('bootstrap',{p_token:token},SUPABASE_SECRET_KEY,10000);
  const rootNo=String(boot.data?.members?.[0]?.member_no||'').trim();
  if(!rootNo) throw new Error('تعذر التحقق من العضوية الحالية');

  const fields=[
    'member_no','member_name','sponsor_member_no','sponsor_name','generation',
    'rank','dxn_status','downline_status','join_date',
    'personal_pv','personal_group_pv','total_group_pv'
  ].join(',');
  const url='/rest/v1/dxn_team_members?select='+encodeURIComponent(fields)+'&limit=10000';
  const rows=await supabaseRestRequest(url,SUPABASE_SECRET_KEY,15000);
  if(!rows.ok || !Array.isArray(rows.data)){
    throw new Error((rows.data&&(rows.data.message||rows.data.error||rows.data.hint))||rows.text||`Supabase HTTP ${rows.status}`);
  }

  const all=rows.data;
  const byNo=new Map(all.map(m=>[String(m.member_no||'').trim(),m]).filter(([k])=>k));
  if(!byNo.has(rootNo)) throw new Error('العضو الأساسي غير موجود في سجل DXN');

  const children=new Map();
  for(const m of all){
    const sponsor=String(m.sponsor_member_no||'').trim();
    if(!sponsor) continue;
    if(!children.has(sponsor)) children.set(sponsor,[]);
    children.get(sponsor).push(m);
  }

  const reachable=[];
  const queue=[{member:byNo.get(rootNo),depth:0}];
  const seen=new Set([rootNo]);
  while(queue.length){
    const {member,depth}=queue.shift();
    for(const child of (children.get(String(member.member_no||'').trim())||[])){
      const no=String(child.member_no||'').trim();
      if(!no || seen.has(no)) continue;
      seen.add(no);
      reachable.push({...child,depth_from_target:depth+1});
      if(depth+1<20) queue.push({member:child,depth:depth+1});
    }
  }

  const mode=String(args.p_mode||'summary').trim().toLowerCase();
  const targetNo=String(args.p_member_no||rootNo).trim()||rootNo;
  const target=byNo.get(targetNo);
  if(!target || (targetNo!==rootNo && !reachable.some(m=>String(m.member_no||'').trim()===targetNo))){
    throw new Error('لا يمكن تحليل عضو خارج فريقك المباشر أو التابع');
  }

  if(mode==='summary'){
    const tree=[byNo.get(rootNo),...reachable];
    const generationCounts={};
    const rankCounts={};
    for(const m of tree){
      const g=m.generation==null?'غير محدد':String(m.generation);
      generationCounts[g]=(generationCounts[g]||0)+1;
      const r=String(m.rank||'').trim()||'غير محدد';
      rankCounts[r]=(rankCounts[r]||0)+1;
    }
    return {
      mode:'summary',
      root_member_no:rootNo,
      total_members:tree.length,
      direct_downline_count:(children.get(rootNo)||[]).length,
      personal_pv_total:tree.reduce((n,m)=>n+(Number(m.personal_pv)||0),0),
      personal_pv_members:tree.filter(m=>m.personal_pv!=null).length,
      total_group_pv_sum:tree.reduce((n,m)=>n+(Number(m.total_group_pv)||0),0),
      generation_counts:Object.entries(generationCounts).map(([generation,members])=>({generation,members})),
      rank_counts:Object.entries(rankCounts).map(([rank,members])=>({rank,members}))
    };
  }

  if(mode==='member'){
    return {
      mode:'member',
      member:target,
      immediate_downline:(children.get(targetNo)||[]).slice(0,Math.max(1,Math.min(Number(args.p_limit)||50,200)))
    };
  }

  if(mode==='downline'){
    const targetMembers=[];
    const q=(children.get(targetNo)||[]).map(m=>({member:m,depth:1}));
    const localSeen=new Set([targetNo]);
    while(q.length){
      const {member,depth}=q.shift();
      const no=String(member.member_no||'').trim();
      if(!no || localSeen.has(no)) continue;
      localSeen.add(no);
      targetMembers.push({...member,depth_from_target:depth});
      if(depth<20){
        for(const child of (children.get(no)||[])) q.push({member:child,depth:depth+1});
      }
    }
    const limit=Math.max(1,Math.min(Number(args.p_limit)||50,200));
    return {mode:'downline',root_member_no:targetNo,count:targetMembers.length,members:targetMembers.slice(0,limit)};
  }

  if(mode==='generation'){
    const generation=Number(args.p_generation);
    if(!Number.isFinite(generation) || generation<0) throw new Error('حدد رقم الجيل المطلوب');
    const members=reachable.filter(m=>Number(m.generation)===generation);
    const limit=Math.max(1,Math.min(Number(args.p_limit)||50,200));
    return {mode:'generation',root_member_no:targetNo,generation,count:members.length,members:members.slice(0,limit)};
  }

  if(mode==='line_summary'){
    const lines=(children.get(rootNo)||[]).map(line=>{
      const lineNo=String(line.member_no||'').trim();
      const branch=[line,...reachable.filter(m=>String(m.member_no||'').trim()!==lineNo && (()=> {
        let cur=m;
        const seenLocal=new Set();
        while(cur && cur.sponsor_member_no && !seenLocal.has(String(cur.member_no||'').trim())){
          const no=String(cur.member_no||'').trim();
          seenLocal.add(no);
          if(String(cur.sponsor_member_no||'').trim()===lineNo) return true;
          cur=byNo.get(String(cur.sponsor_member_no||'').trim());
        }
        return false;
      })())];
      return {
        line_member_no:lineNo,
        line_member_name:line.member_name,
        line_generation:line.generation,
        line_rank:line.rank,
        members:branch.length,
        personal_pv_total:branch.reduce((n,m)=>n+(Number(m.personal_pv)||0),0),
        total_group_pv_sum:branch.reduce((n,m)=>n+(Number(m.total_group_pv)||0),0)
      };
    });
    return {mode:'line_summary',root_member_no:rootNo,lines};
  }

  throw new Error('وضع تحليل الفريق غير صالح');
}

async function supabaseSecretRpc(fn,args){
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const response=await supabaseRpcRequest(fn,args,SUPABASE_SECRET_KEY,12000);
  if(!response.ok) throw new Error((response.data&&(response.data.message||response.data.error||response.data.hint))||response.text||`Supabase HTTP ${response.status}`);
  return response.data;
}

async function generateIdealTrainingAnswer(args){
  const token=String(args.p_token||'').trim();
  const questionId=String(args.p_question_id||'').trim();
  if(!token||!questionId) throw new Error('بيانات السؤال ناقصة');
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY غير مضبوط في Vercel');

  const admin=await supabaseSecretRpc('training_questions_admin',{p_token:token});
  const questions=admin&&Array.isArray(admin.questions)?admin.questions:[];
  const question=questions.find(q=>String(q.id)===questionId);
  if(!question) throw new Error('السؤال غير موجود أو غير مصرح به');

  const payload={
    model:OPENAI_MODEL,
    instructions:[
      'أنت كاتب إجابات نموذجية لاختبارات متدربي مجتمع الصحة والثراء.',
      'اكتب جوابًا مثاليًا تعليميًا مباشرًا للسؤال المحدد، يصلح كمرجع لتقييم إجابات المتدربين.',
      'اعتمد على السؤال ومعيار التقييم المرفق فقط، ولا تخترع معلومات غير لازمة.',
      'اجعل الجواب واضحًا ومحددًا وقابلًا للفهم والتطبيق، من فقرة قصيرة أو نقاط عند الحاجة.',
      'لا تذكر أنك نموذج ذكاء اصطناعي، ولا تتحدث عن عملية التقييم أو القائد.',
      'عند وجود جانب صحي أو منتج، استخدم صياغة مهنية غير علاجية ولا تقدم وعودًا طبية أو نتائج مضمونة.'
    ].join('\n'),
    input:`التدريب: ${question.lesson_no}\nالسؤال: ${question.question}\n\nمعيار التقييم الحالي:\n${question.rubric||''}`,
    text:{format:{type:'json_schema',name:'ideal_training_answer',strict:true,schema:{type:'object',properties:{model_answer:{type:'string',minLength:10,maxLength:1200}},required:['model_answer'],additionalProperties:false}}},
    max_output_tokens:500
  };

  let ai;
  try{
    ai=await openaiResponses(payload);
  }catch(firstError){
    console.error('ideal-answer OpenAI transport retry:',firstError);
    ai=await openaiResponses({...payload,model:'gpt-5.6'});
  }
  if(!ai.ok){
    throw new Error((ai.data&&ai.data.error&&ai.data.error.message)||ai.text||'فشل توليد الجواب المثالي');
  }

  const out=outputText(ai.data);
  if(!out) throw new Error('لم يرجع الذكاء الاصطناعي جوابًا');
  let parsed;
  try{parsed=JSON.parse(out)}catch(_){throw new Error('نتيجة التوليد غير صالحة')}
  const ideal=String(parsed&&parsed.model_answer||'').trim();
  if(!ideal) throw new Error('الجواب المثالي فارغ');

  const saved=await supabaseSecretRpc('update_training_question',{
    p_token:token,
    p_question_id:questionId,
    p_question:question.question,
    p_model_answer:ideal,
    p_rubric:question.rubric||'',
    p_points:Number(question.points||100),
    p_active:question.active!==false
  });

  return saved&&saved.question ? saved.question : {...question,model_answer:ideal};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      supabase_configured: !!SUPABASE_URL,
      key_configured: !!SUPABASE_KEY
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(body.fn || '').trim();
    const args = body.args && typeof body.args === 'object' ? body.args : {};

    if (!/^[a-zA-Z0-9_]+$/.test(fn)) {
      return res.status(400).json({ error: 'Invalid RPC name' });
    }

    if (fn === 'generate_training_answer') {
      try {
        const question = await generateIdealTrainingAnswer({
          p_token:args.p_token,
          p_question_id:args.p_question_id
        });
        return res.status(200).json({ok:true,question});
      } catch (error) {
        console.error('generate_training_answer RPC error:',error);
        return res.status(502).json({error:String(error&&error.message||error)});
      }
    }

    const privilegedTeamRpc = fn === 'get_dxn_team_intelligence' || fn === 'leader_sync_dxn_team_members';

    // Team Intelligence has existed in two RPC signatures in deployed environments:
    // newer deployments accept p_token; older deployments accept p_root_member_no.
    // Keep the browser API stable (p_token) and translate to the legacy signature
    // only when the deployed RPC still uses it. The root member is resolved from
    // the authenticated session, so a caller cannot choose an unrelated root.
    if(fn === 'get_dxn_team_intelligence' && args.p_token && !args.p_root_member_no){
      const current=await supabaseRpcRequest(fn,args,SUPABASE_SECRET_KEY,10000);
      if(current.ok){
        return res.status(current.status||200).json(current.data||{});
      }

      const boot=await supabaseRpcRequest('bootstrap',{p_token:String(args.p_token)},SUPABASE_SECRET_KEY,10000);
      const bootRole=String(boot.data?.role||'').trim().toLowerCase();
      const sessionMemberNo=String(boot.data?.members?.[0]?.member_no||'').trim();
      const requestedMemberNo=String(args.p_member_no||'').trim();

      // Leaders may inspect the member number they entered in "فريقي".
      // Regular members are anchored to their own authenticated membership.
      const memberNo=bootRole==='leader' ? requestedMemberNo : sessionMemberNo;
      if(!memberNo){
        return res.status(current.status||500).json(current.data||{error:current.text||'تعذر التحقق من العضوية الحالية'});
      }

      const legacyArgs={
        p_root_member_no:memberNo,
        p_mode:args.p_mode||'summary',
        p_member_no:args.p_member_no||null,
        p_generation:args.p_generation??null,
        p_limit:args.p_limit??50
      };
      const legacy=await supabaseRpcRequest(fn,legacyArgs,SUPABASE_SECRET_KEY,10000);
      if(legacy.ok){
        return res.status(legacy.status||200).json(legacy.data||{});
      }

      // If the Team Intelligence migration has not yet been applied to Supabase,
      // serve the same read-only result directly from dxn_team_members.
      // The root member is still resolved from the authenticated session.
      try{
        const direct=await directTeamIntelligenceFromTable(args);
        return res.status(200).json(direct);
      }catch(directError){
        return res.status(legacy.status||500).json({
          error:String(directError&&directError.message||directError)||legacy.text||current.text||'تعذر تحميل بيانات الفريق'
        });
      }
    }

    const response=await supabaseRpcRequest(fn,args,privilegedTeamRpc ? SUPABASE_SECRET_KEY : SUPABASE_KEY,10000);
    return res.status(response.status||500).json(response.data||{error:response.text||'Supabase request failed'});

  } catch (error) {
    return res.status(500).json({
      error: String(error.message || error)
    });
  }
};
