// Tests for the academy videos API (api/academy-videos.js), the shared YouTube parser
// (api/_academy-youtube.js) and the academy_videos migration. The database is replaced
// by a fake rpc that behaves like the SQL functions: it validates the session and, for
// create_academy_video, the leader role.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../api/academy-videos');
const {parseYouTubeId,canonicalYouTubeUrl}=require('../api/_academy-youtube');

const ROOT=path.join(__dirname,'..');
const MIGRATION=fs.readFileSync(path.join(ROOT,'supabase','migrations','20260930120000_academy_videos.sql'),'utf8');
const LEADER_TOKEN='11111111-1111-4111-8111-111111111111';
const MEMBER_TOKEN='22222222-2222-4222-8222-222222222222';
const PUBLISHED=[
  {id:'a1',title:'المقدمة',section:'جولة في المنصة',youtube_id:'qcwkRlsYsIg',youtube_url:'https://www.youtube.com/watch?v=qcwkRlsYsIg',sort_order:1,created_at:'2026-09-30T12:00:00Z'}
];

// Fake database: same rules as the SQL functions.
function fakeDb(){
  const calls=[];
  const sessions={[LEADER_TOKEN]:'leader',[MEMBER_TOKEN]:'member'};
  async function rpc(fn,args){
    calls.push({fn,args});
    const roleName=sessions[args.p_token];
    if(!roleName)return {ok:false,status:400,data:{message:'انتهت الجلسة'}};
    if(fn==='list_academy_videos')return {ok:true,status:200,data:PUBLISHED};
    if(fn==='create_academy_video'){
      if(roleName!=='leader')return {ok:false,status:400,data:{message:'إضافة فيديو للأكاديمية متاحة للقائد فقط'}};
      return {ok:true,status:200,data:'new-video-id'};
    }
    return {ok:false,status:404,data:{message:'unknown function'}};
  }
  return {rpc,calls};
}

async function call(handler,{method='POST',token,body={}}={}){
  const headers=token?{'x-dxn-session':token}:{};
  const res={statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(b){this.body=b;}};
  await handler({method,headers,body},res);
  return {status:res.statusCode,json:JSON.parse(res.body||'{}'),headers:res.headers};
}

test('a member can read the published videos',async()=>{
  const db=fakeDb();
  const r=await call(createHandler({rpc:db.rpc}),{token:MEMBER_TOKEN,body:{action:'list'}});
  assert.equal(r.status,200);
  assert.deepEqual(r.json.videos,[{id:'a1',title:'المقدمة',section:'جولة في المنصة',youtube_id:'qcwkRlsYsIg',youtube_url:'https://www.youtube.com/watch?v=qcwkRlsYsIg',sort_order:1}]);
  assert.deepEqual(db.calls,[{fn:'list_academy_videos',args:{p_token:MEMBER_TOKEN}}]);
  assert.equal(r.headers['cache-control'],'no-store');
});

test('a leader can add a video; the link is stored in canonical form with its id',async()=>{
  const db=fakeDb();
  const r=await call(createHandler({rpc:db.rpc}),{token:LEADER_TOKEN,body:{action:'create',title:' المقدمة ',section:'جولة في المنصة',youtube_url:'https://youtu.be/qcwkRlsYsIg?si=abc'}});
  assert.equal(r.status,201);
  assert.deepEqual(r.json,{id:'new-video-id',youtube_id:'qcwkRlsYsIg',youtube_url:'https://www.youtube.com/watch?v=qcwkRlsYsIg'});
  assert.deepEqual(db.calls,[{fn:'create_academy_video',args:{p_token:LEADER_TOKEN,p_title:'المقدمة',p_section:'جولة في المنصة',p_youtube_url:'https://www.youtube.com/watch?v=qcwkRlsYsIg',p_youtube_id:'qcwkRlsYsIg'}}]);
});

test('a member cannot add a video (the server refuses, whatever the interface shows)',async()=>{
  const db=fakeDb();
  const r=await call(createHandler({rpc:db.rpc}),{token:MEMBER_TOKEN,body:{action:'create',title:'x',youtube_url:'https://youtu.be/qcwkRlsYsIg'}});
  assert.equal(r.status,403);
  assert.match(r.json.error,/للقائد فقط/);
});

test('requests without a valid session are refused before reaching the database',async()=>{
  for(const token of [undefined,'not-a-uuid']){
    const db=fakeDb();
    const r=await call(createHandler({rpc:db.rpc}),{token,body:{action:'list'}});
    assert.equal(r.status,401);
    assert.equal(db.calls.length,0);
  }
  const db=fakeDb();
  const expired=await call(createHandler({rpc:db.rpc}),{token:'33333333-3333-4333-8333-333333333333',body:{action:'list'}});
  assert.equal(expired.status,401);
});

test('invalid YouTube links and missing titles are rejected with a clear message and never saved',async()=>{
  for(const body of [
    {action:'create',title:'x',youtube_url:'https://vimeo.com/123'},
    {action:'create',title:'x',youtube_url:'not a link'},
    {action:'create',title:'x',youtube_url:'https://www.youtube.com/watch?v=short'},
    {action:'create',title:'',youtube_url:'https://youtu.be/qcwkRlsYsIg'},
    {action:'create',title:'x'.repeat(161),youtube_url:'https://youtu.be/qcwkRlsYsIg'}
  ]){
    const db=fakeDb();
    const r=await call(createHandler({rpc:db.rpc}),{token:LEADER_TOKEN,body});
    assert.equal(r.status,400,JSON.stringify(body).slice(0,60));
    assert.ok(r.json.error.length>0);
    assert.equal(db.calls.length,0,'nothing reaches the database');
  }
  const r=await call(createHandler({rpc:fakeDb().rpc}),{token:LEADER_TOKEN,body:{action:'create',title:'x',youtube_url:'https://vimeo.com/1'}});
  assert.match(r.json.error,/رابط YouTube غير صالح/);
});

test('only POST is accepted and unknown actions are refused',async()=>{
  assert.equal((await call(createHandler({rpc:fakeDb().rpc}),{method:'GET',token:MEMBER_TOKEN})).status,405);
  assert.equal((await call(createHandler({rpc:fakeDb().rpc}),{token:MEMBER_TOKEN,body:{action:'delete'}})).status,400);
});

test('YouTube video ids are extracted from watch and youtu.be links only',()=>{
  const ok={
    'https://www.youtube.com/watch?v=qcwkRlsYsIg':'qcwkRlsYsIg',
    'https://youtube.com/watch?v=qcwkRlsYsIg':'qcwkRlsYsIg',
    'http://m.youtube.com/watch?v=qcwkRlsYsIg&t=12':'qcwkRlsYsIg',
    'https://www.youtube.com/watch?feature=share&v=A-b_C1d2E3f':'A-b_C1d2E3f',
    'https://youtu.be/qcwkRlsYsIg':'qcwkRlsYsIg',
    'https://youtu.be/qcwkRlsYsIg?si=XyZ':'qcwkRlsYsIg',
    'youtu.be/qcwkRlsYsIg':'qcwkRlsYsIg',
    '  https://www.youtube.com/watch?v=qcwkRlsYsIg  ':'qcwkRlsYsIg'
  };
  for(const [input,id] of Object.entries(ok))assert.equal(parseYouTubeId(input),id,input);
  const bad=[
    '','qcwkRlsYsIg','https://vimeo.com/123','https://youtube.com.evil.com/watch?v=qcwkRlsYsIg',
    'https://www.youtube.com/watch?v=qcwkRlsYs','https://www.youtube.com/watch?v=qcwkRlsYsIg1',
    'https://www.youtube.com/shorts/qcwkRlsYsIg','https://www.youtube.com/embed/qcwkRlsYsIg',
    'javascript:alert(1)','ftp://youtu.be/qcwkRlsYsIg','https://youtu.be/','https://www.youtube.com/watch'
  ];
  for(const input of bad)assert.equal(parseYouTubeId(input),'',input);
  assert.equal(canonicalYouTubeUrl('qcwkRlsYsIg'),'https://www.youtube.com/watch?v=qcwkRlsYsIg');
  assert.throws(()=>canonicalYouTubeUrl('bad'));
});

test('the migration keeps the table closed and checks the leader role in SQL',()=>{
  const sql=MIGRATION.replace(/--[^\n]*/g,'');
  for(const col of ['id uuid primary key','title text not null','section text not null','youtube_url text not null','youtube_id text not null','status text not null','sort_order integer not null','created_by uuid not null references public.app_users(id)','created_at timestamptz not null','updated_at timestamptz not null'])
    assert.ok(sql.includes(col),`column missing: ${col}`);
  assert.match(sql,/alter table public\.academy_videos enable row level security;/);
  assert.match(sql,/revoke all on table public\.academy_videos from public, anon, authenticated;/);
  assert.match(sql,/check \(youtube_url = 'https:\/\/www\.youtube\.com\/watch\?v=' \|\| youtube_id\)/);
  assert.doesNotMatch(sql,/grant[^;]*to (anon|authenticated|public)/i);
  assert.equal((sql.match(/grant execute on function public\.\w+\([^)]*\)\s+to service_role;/g)||[]).length,2);
  assert.equal((sql.match(/security definer/g)||[]).length,2);
  assert.equal((sql.match(/set search_path = public/g)||[]).length,2);
});

test('only published videos are listed, in sort_order',()=>{
  const list=(MIGRATION.match(/create or replace function public\.list_academy_videos[\s\S]*?\$function\$;/)||[''])[0];
  assert.ok(list);
  assert.match(list,/where v\.status = 'published'/);
  assert.match(list,/order by v\.sort_order asc, v\.created_at asc/);
  assert.match(list,/s\.expires_at > now\(\)/);
  assert.match(list,/u\.active = true/);
});

test('create_academy_video refuses members and invalid links in SQL too',()=>{
  const create=(MIGRATION.match(/create or replace function public\.create_academy_video[\s\S]*?\$function\$;/)||[''])[0];
  assert.ok(create);
  assert.match(create,/if role_name <> 'leader' then\s+raise exception 'إضافة فيديو للأكاديمية متاحة للقائد فقط';/);
  assert.match(create,/v_id !~ '\^\[A-Za-z0-9_-\]\{11\}\$'/);
  assert.match(create,/'published'/);
  assert.doesNotMatch(MIGRATION,/storage\.|bucket/i);
});
