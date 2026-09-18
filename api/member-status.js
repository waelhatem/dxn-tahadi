const https=require('https');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_KEY=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim().replace(/[\r\n]/g,'');

function send(res,status,body){res.status(status).json(body);}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});

  const no=String(req.query&&req.query.member_no||'').trim();
  if(!/^\d{9}$/.test(no))return send(res,400,{error:'رقم العضوية غير صالح'});
  if(!SUPABASE_KEY)return send(res,500,{error:'خدمة التحقق غير مهيأة'});

  try{
    const base=new URL(SUPABASE_URL);
    const path='/rest/v1/app_users?select=id&login_no=eq.'+encodeURIComponent(no)+'&role=eq.member&active=eq.true&limit=1';
    const data=await new Promise((resolve,reject)=>{
      const r=https.request({
        protocol:base.protocol,hostname:base.hostname,port:base.port||443,
        method:'GET',path,
        headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,Accept:'application/json'},
        timeout:8000
      },resp=>{
        let t='';resp.setEncoding('utf8');resp.on('data',x=>t+=x);resp.on('end',()=>{
          if(resp.statusCode<200||resp.statusCode>=300)return reject(new Error(t||('HTTP '+resp.statusCode)));
          try{resolve(JSON.parse(t||'[]'))}catch(e){reject(e)}
        });
      });
      r.on('timeout',()=>r.destroy(new Error('انتهت مهلة التحقق')));
      r.on('error',reject);r.end();
    });
    return send(res,200,{registered:Array.isArray(data)&&data.length>0});
  }catch(e){
    return send(res,502,{error:e.message||'تعذر التحقق'});
  }
};