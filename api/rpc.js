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


function normalizeAssessmentMembershipNumber(value){
  return String(value||'').trim().replace(/[\s-]+/g,'');
}

async function assessmentSession(token){
  const sessionToken=String(token||'').trim();
  if(!sessionToken) throw new Error('جلسة الدخول غير موجودة');
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const boot=await supabaseRpcRequest('bootstrap',{p_token:sessionToken},SUPABASE_SECRET_KEY,10000);
  if(!boot.ok){
    throw new Error((boot.data&&(boot.data.message||boot.data.error||boot.data.hint))||boot.text||'جلسة الدخول غير صالحة');
  }
  return boot.data||{};
}

async function assessmentTableRows(extraQuery){
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const fields=[
    'id','form_id','sponsor_email','member_name','membership_number',
    'submitted_at','answers','report','created_at'
  ].join(',');
  const suffix=String(extraQuery||'');
  const url='/rest/v1/external_training_assessment_submissions?select='+
    encodeURIComponent(fields)+suffix;
  const rows=await supabaseRestRequest(url,SUPABASE_SECRET_KEY,15000);
  if(!rows.ok || !Array.isArray(rows.data)){
    throw new Error((rows.data&&(rows.data.message||rows.data.error||rows.data.hint))||rows.text||'Supabase HTTP '+rows.status);
  }
  return rows.data;
}

async function externalTrainingAssessmentSummaryFallback(args){
  const boot=await assessmentSession(args&&args.p_token);
  const role=String(boot.role||'').trim().toLowerCase();
  if(role!=='leader') throw new Error('غير مصرح بعرض سجل اختبارات الأعضاء');
  const rows=await assessmentTableRows('&order=submitted_at.desc,created_at.desc&limit=10000');
  const latest=new Map();
  for(const row of rows){
    const no=normalizeAssessmentMembershipNumber(row&&row.membership_number);
    if(!no) continue;
    if(!latest.has(no)) latest.set(no,row);
  }
  return Array.from(latest.values()).map(row=>({
    member_name:String(row.member_name||''),
    membership_number:normalizeAssessmentMembershipNumber(row.membership_number),
    score:Number(row.report&&row.report.totalScore||0),
    result:String(row.report&&row.report.overallStatus||'retry'),
    _sort_at:String(row.submitted_at||row.created_at||'')
  })).sort((a,b)=>(new Date(b._sort_at).getTime()||0)-(new Date(a._sort_at).getTime()||0))
    .map(row=>{
      delete row._sort_at;
      return row;
    });
}

async function externalTrainingAssessmentMemberHistoryFallback(args){
  const token=String(args&&args.p_token||'').trim();
  const target=normalizeAssessmentMembershipNumber(args&&args.p_membership_number);
  if(!target) throw new Error('رقم العضوية غير موجود');
  const boot=await assessmentSession(token);
  const role=String(boot.role||'').trim().toLowerCase();
  const own=normalizeAssessmentMembershipNumber(boot.members&&boot.members[0]&&boot.members[0].member_no);
  if(role==='member' && own!==target) throw new Error('غير مصرح بعرض سجل عضو آخر');
  return assessmentTableRows('&membership_number=eq.'+encodeURIComponent(target)+'&order=submitted_at.desc,created_at.desc&limit=200');
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

async function supabaseTableRequest(method,path,key,body){
  return new Promise((resolve,reject)=>{
    const base=new URL(SUPABASE_URL);
    const payload=body==null?null:JSON.stringify(body);
    const request=https.request({
      protocol:base.protocol,
      hostname:base.hostname,
      port:base.port||443,
      method,
      path,
      headers:{
        Accept:'application/json',
        'Content-Type':'application/json',
        ...(key?{apikey:key,Authorization:'Bearer '+key}:{}),
        ...(payload?{'Content-Length':Buffer.byteLength(payload)}:{}),
        Prefer:'return=representation'
      },
      timeout:12000
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
    request.on('timeout',()=>request.destroy(new Error('انتهت مهلة الاتصال ببيانات اللقاءات')));
    request.on('error',reject);
    if(payload) request.write(payload);
    request.end();
  });
}

async function communitySession(token){
  const pToken=String(token||'').trim();
  if(!pToken) throw new Error('جلسة العضوية غير موجودة');
  if(!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const boot=await supabaseRpcRequest('bootstrap',{p_token:pToken},SUPABASE_SECRET_KEY,10000);
  if(!boot.ok) throw new Error((boot.data&&(boot.data.message||boot.data.error||boot.data.hint))||boot.text||'جلسة الدخول غير صالحة');
  const bootData=boot.data||{};
  const sessionRole=String(bootData.role||'').trim().toLowerCase();
  const member=(sessionRole==='member'&&Array.isArray(bootData.members))?bootData.members[0]:null;
  const leaderCandidate=bootData.leader||bootData.user||bootData.profile||bootData.account||{};
  const leaderName=String(
    bootData.leader_name||
    bootData.leaderName||
    leaderCandidate.name||
    leaderCandidate.full_name||
    leaderCandidate.display_name||
    leaderCandidate.displayName||
    ''
  ).trim();
  const requestedDisplayName=String(args&&args.p_display_name||'').trim();
  return {
    role:sessionRole,
    member_no:String(member&&member.member_no||'').trim(),
    member_name:String(member&&(member.member_name||member.name)||'').trim(),
    leader_name:leaderName||requestedDisplayName
  };
}

async function communityMeetingsList(args){
  await communitySession(args.p_token);
  const url='/rest/v1/community_meetings?select=id,organizer_member_no,organizer_name,title,scheduled_at,duration_minutes,description,meeting_url,status,created_at,updated_at&status=eq.scheduled&scheduled_at=gte.'+encodeURIComponent(new Date().toISOString())+'&order=scheduled_at.asc&limit=100';
  const rows=await supabaseTableRequest('GET',url,SUPABASE_SECRET_KEY);
  if(!rows.ok || !Array.isArray(rows.data)) throw new Error((rows.data&&(rows.data.message||rows.data.error||rows.data.hint))||rows.text||'تعذر تحميل جدول اللقاءات');
  return rows.data;
}

async function communityMeetingCreate(args){
  const session=await communitySession(args.p_token);
  const title=String(args.p_title||'').trim();
  const scheduledAt=String(args.p_scheduled_at||'').trim();
  const duration=Math.max(5,Math.min(Number(args.p_duration_minutes)||60,720));
  const description=String(args.p_description||'').trim();
  const meetingUrl=String(args.p_meeting_url||'').trim();
  if(!title||!scheduledAt) throw new Error('عنوان اللقاء والتاريخ والوقت مطلوبان');
  const date=new Date(scheduledAt);
  if(Number.isNaN(date.getTime())) throw new Error('تاريخ اللقاء غير صالح');
  if(date.getTime()<=Date.now()) throw new Error('يجب أن يكون موعد اللقاء في المستقبل');
  const organizerNo=session.member_no||('ROLE:'+(session.role||'member'));
  const organizerName=session.member_name||(session.role==='leader'?session.leader_name||'القائد':'عضو المجتمع');
  const row={organizer_member_no:organizerNo,organizer_name:organizerName,title,scheduled_at:date.toISOString(),duration_minutes:duration,description,meeting_url:meetingUrl,status:'scheduled'};
  const result=await supabaseTableRequest('POST','/rest/v1/community_meetings?select=id,organizer_member_no,organizer_name,title,scheduled_at,duration_minutes,description,meeting_url,status,created_at,updated_at',SUPABASE_SECRET_KEY,row);
  if(!result.ok) throw new Error((result.data&&(result.data.message||result.data.error||result.data.hint))||result.text||'تعذر حفظ اللقاء');
  return Array.isArray(result.data)?result.data[0]:result.data;
}

async function communityMeetingGet(args){
  await communitySession(args.p_token);
  const id=String(args.p_id||'').trim();
  if(!id) throw new Error('معرّف اللقاء غير موجود');
  const result=await supabaseTableRequest('GET','/rest/v1/community_meetings?select=id,organizer_member_no,organizer_name,title,scheduled_at,duration_minutes,description,meeting_url,status,created_at,updated_at&id=eq.'+encodeURIComponent(id),SUPABASE_SECRET_KEY);
  if(!result.ok || !Array.isArray(result.data) || !result.data[0]) throw new Error((result.data&&(result.data.message||result.data.error||result.data.hint))||result.text||'اللقاء غير موجود');
  return result.data[0];
}

async function communityChatList(args){
  await communitySession(args.p_token);
  const limit=Math.max(1,Math.min(Number(args.p_limit)||100,200));
  const url='/rest/v1/community_chat_messages?select=id,sender_member_no,sender_name,sender_role,message_text,created_at&order=created_at.asc&limit='+limit;
  const rows=await supabaseTableRequest('GET',url,SUPABASE_SECRET_KEY);
  if(!rows.ok || !Array.isArray(rows.data)) throw new Error((rows.data&&(rows.data.message||rows.data.error||rows.data.hint))||rows.text||'تعذر تحميل محادثة المجتمع');
  return rows.data;
}

async function communityChatSend(args){
  const session=await communitySession(args.p_token);
  const message=String(args.p_message||'').trim();
  if(!message) throw new Error('الرسالة فارغة');
  if(message.length>1000) throw new Error('الرسالة تتجاوز الحد المسموح');
  const row={
    sender_member_no:session.member_no||'',
    sender_name:session.member_name||(session.role==='leader'?session.leader_name||'القائد':'عضو المجتمع'),
    sender_role:session.role==='leader'?'leader':'member',
    message_text:message
  };
  const result=await supabaseTableRequest('POST','/rest/v1/community_chat_messages?select=id,sender_member_no,sender_name,sender_role,message_text,created_at',SUPABASE_SECRET_KEY,row);
  if(!result.ok) throw new Error((result.data&&(result.data.message||result.data.error||result.data.hint))||result.text||'تعذر حفظ الرسالة');
  return Array.isArray(result.data)?result.data[0]:result.data;
}

async function communityMeetingCancel(args){
  const session=await communitySession(args.p_token);
  const id=String(args.p_id||'').trim();
  if(!id) throw new Error('معرّف اللقاء غير موجود');
  const existing=await communityMeetingGet(args);
  const allowed=session.role==='leader' || (!!session.member_no && session.member_no===String(existing.organizer_member_no||''));
  if(!allowed) throw new Error('لا تملك صلاحية إلغاء هذا اللقاء');
  const result=await supabaseTableRequest('PATCH','/rest/v1/community_meetings?id=eq.'+encodeURIComponent(id),SUPABASE_SECRET_KEY,{status:'cancelled',updated_at:new Date().toISOString()});
  if(!result.ok) throw new Error((result.data&&(result.data.message||result.data.error||result.data.hint))||result.text||'تعذر إلغاء اللقاء');
  return {ok:true,id};
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

    if(fn==='community_meetings_list' || fn==='community_meeting_create' || fn==='community_meeting_get' || fn==='community_meeting_cancel' || fn==='community_chat_list' || fn==='community_chat_send'){
      try{
        let data;
        if(fn==='community_meetings_list') data=await communityMeetingsList(args);
        else if(fn==='community_meeting_create') data=await communityMeetingCreate(args);
        else if(fn==='community_meeting_get') data=await communityMeetingGet(args);
        else if(fn==='community_meeting_cancel') data=await communityMeetingCancel(args);
        else if(fn==='community_chat_list') data=await communityChatList(args);
        else data=await communityChatSend(args);
        return res.status(200).json(data||{});
      }catch(error){
        console.error('community meetings RPC error:',error);
        return res.status(400).json({error:String(error&&error.message||error)});
      }
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

    if(fn==='get_external_training_assessment_summary' || fn==='get_external_training_assessment_submissions'){
      const normal=await supabaseRpcRequest(fn,args,SUPABASE_KEY,10000);
      if(normal.ok){
        return res.status(normal.status||200).json(normal.data||{});
      }
      try{
        const fallback = fn==='get_external_training_assessment_summary'
          ? await externalTrainingAssessmentSummaryFallback(args)
          : await externalTrainingAssessmentMemberHistoryFallback(args);
        return res.status(200).json(fallback);
      }catch(fallbackError){
        return res.status(normal.status||500).json({
          error:String(fallbackError&&fallbackError.message||fallbackError)||normal.text||'تعذر تحميل سجل الاختبارات'
        });
      }
    }

    const privilegedTeamRpc = fn === 'get_dxn_team_intelligence' || fn === 'leader_sync_dxn_team_members';

    // Team Intelligence has existed in two RPC signatures in deployed environments:
    // newer deployments accept p_token; older deployments accept p_root_member_no.
    // Keep the browser API stable (p_token) and translate to the legacy signature
    // only when the deployed RPC still uses it. The root member is resolved from
    // the authenticated session, so a caller cannot choose an unrelated root.
    if(fn === 'get_dxn_team_intelligence' && args.p_token && !args.p_root_member_no){
      const current=await supabaseRpcRequest('get_dxn_team_intelligence_secure',args,SUPABASE_SECRET_KEY,10000);
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
