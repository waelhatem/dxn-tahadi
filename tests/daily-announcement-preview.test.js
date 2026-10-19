'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../api/daily-announcement-preview');

function response(){
  return {
    code:200,body:null,headers:{},
    status(code){this.code=code;return this},
    setHeader(name,value){this.headers[name]=value;return this},
    json(body){this.body=body;return this}
  };
}
const token='11111111-1111-4111-8111-111111111111';
const good={
  title:'فكرة صحية لهذا اليوم',
  body:'لنبدأ صباحنا بعادة واقعية، مثل شرب الماء بانتظام أو إضافة حركة خفيفة في يومنا. وعند الحديث مع الآخرين عن المنتجات نلتزم بالصدق واحترام احتياجاتهم. ما هي العادة التي تنوي تحسينها هذا الأسبوع؟'
};

test('preview refuses non-POST and invalid sessions without external calls',async()=>{
  const originalFetch=global.fetch;global.fetch=async()=>{throw Error('network should not be called')};
  try{
    const get=response();await handler({method:'GET',body:{}},get);
    assert.equal(get.code,405);
    const missing=response();await handler({method:'POST',body:{}},missing);
    assert.equal(missing.code,401);
  }finally{global.fetch=originalFetch}
});

test('member and inactive sessions cannot generate an AI preview',async()=>{
  const originalFetch=global.fetch, originalKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY='test-role-key';
  let count=0;global.fetch=async(url)=>{
    count++;
    assert.match(url,/\/rpc\/bootstrap$/);
    return {ok:true,json:async()=> ({role:'member',user_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})};
  };
  try{
    const res=response();await handler({method:'POST',body:{p_token:token}},res);
    assert.equal(res.code,403);
    assert.equal(count,1);
  }finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=originalKey}
});

test('verified leader gets AI content but no database announcement is inserted',async()=>{
  const originalFetch=global.fetch, originalKey=process.env.SUPABASE_SECRET_KEY;
  const originalAI=process.env.OPENAI_API_KEY;
  process.env.SUPABASE_SECRET_KEY='test-role-key';process.env.OPENAI_API_KEY='test-ai-key';
  const urls=[];
  global.fetch=async(url)=>{
    urls.push(url);
    if(String(url).includes('/rpc/bootstrap')){
      return {ok:true,json:async()=> ({role:'leader',user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})};
    }
    if(String(url).includes('api.openai.com')){
      return {ok:true,text:async()=>JSON.stringify({output:[{
        content:[{type:'output_text',text:JSON.stringify(good)}]
      }]})};
    }
    throw Error('Unexpected network call: '+url);
  };
  try{
    const res=response();await handler({method:'POST',body:{p_token:token}},res);
    assert.equal(res.code,200);
    assert.equal(res.body.preview,true);
    assert.match(res.body.title,/صباح الصحة والثراء/);
    assert.equal(res.body.body,good.body);
    assert.equal(urls.length,2);
    assert.ok(!urls.some(url=>/publish_|global_announcements|\/rest\/v1\/global_announcement/.test(url)));
    assert.equal(res.headers['Cache-Control'],'no-store');
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=originalKey;
    if(originalAI===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalAI;
  }
});

test('preview matches deployed bootstrap and migration uses app_current_role',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api/daily-announcement-preview.js'),'utf8');
  assert.match(source,/\/rpc\/bootstrap/);
  assert.doesNotMatch(source,/\/rpc\/current_role/);
  const migration=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261019080000_ai_daily_global_announcements.sql'),'utf8');
  assert.match(migration,/public\.app_current_role\(p_token\)/);
  assert.doesNotMatch(migration,/public\.current_role\(p_token\)/);
});

test('leader preview is independent of the daily-settings migration',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','daily-announcement-leader.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(source,/dxnDailyPreviewButton/);
  assert.match(source,/dxnDailyDesignSampleButton/);
  assert.match(source,/showDesignSample\(el\)/);
  assert.match(source,/runTestPreview\(el\)/);
  assert.match(source,/showTestModal\(payload\)/);
  assert.match(source,/dxn-global-announcement-modal/);
  assert.match(source,/__DXN_DAILY_PRESENTATION__\.renderBody/);
  assert.match(source,/textContent=String\(message\.body/);
  assert.match(source,/لم يتم نشر أي إعلان/);
  assert.match(server,/\/api\/daily-announcement-preview/);
  assert.ok(require('../vercel.json').functions['api/daily-announcement-preview.js'].maxDuration>=30);
});

test('missing Preview AI key gives the leader an actionable error',async()=>{
  const originalFetch=global.fetch,previous=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  global.fetch=async url=>{
    assert.match(String(url),/\/rpc\/bootstrap$/);
    return {ok:true,json:async()=>({role:'leader',user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})};
  };
  try{
    const res=response();await handler({method:'POST',body:{p_token:token}},res);
    assert.equal(res.code,503);
    assert.equal(res.body.code,'OPENAI_KEY_MISSING');
  }finally{
    global.fetch=originalFetch;
    if(previous!==undefined)process.env.OPENAI_API_KEY=previous;
  }
});
