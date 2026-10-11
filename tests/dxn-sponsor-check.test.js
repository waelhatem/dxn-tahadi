// الإضافة اليدوية لعضو في سجل DXN الرئيسي: التحقق من الراعي يعتمد على dxn_team_members فقط،
// والفشل التقني لا يُعامل على أنه «الراعي غير موجود». يشغّل كود الصفحة الحقيقي من app/index.html داخل vm.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.join(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8').replace(/\r/g,'');
const SQL=fs.readFileSync(path.join(ROOT,'supabase','migrations','20261003050000_manual_dxn_member_add.sql'),'utf8').replace(/\r/g,'');

function extractFunction(source,name){
  let start=source.indexOf(`async function ${name}(`);
  if(start<0)start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} not found`);
  let depth=0,i=source.indexOf('{',start);
  for(;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)break;}
  return source.slice(start,i+1);
}
function sqlFunction(name){
  const start=SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start>=0,`${name} not found`);
  return SQL.slice(start,SQL.indexOf('$$;',start));
}

/* بيئة صفحة مصغّرة: عناصر النموذج + fetch قابل للتبديل + مؤقت فوري. */
function makePage(fetchImpl){
  const els={
    manualDxnSponsorNo:{value:'100000001'},
    manualDxnSponsorPreview:{textContent:'',style:{}},
    manualDxnMemberNo:{value:'200000002'},
    manualDxnMemberName:{value:'عضو تجريبي'},
    manualDxnJoinDate:{value:'2026-10-11'},
    manualDxnMemberStatus:{textContent:'',style:{}},
    manualDxnMemberSave:{disabled:false}
  };
  const calls=[];const toasts=[];let closed=false,synced=false;
  const ctx={
    document:{getElementById:id=>els[id]||null},
    fetch:async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});return fetchImpl(body);},
    setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{},
    token:'00000000-0000-0000-0000-000000000000',role:'leader',
    toast:m=>toasts.push(m),
    closeManualDxnMemberModal:()=>{closed=true;},openDxnSync:()=>{synced=true;},
    rpc:()=>{throw new Error('direct Supabase rpc must not be used');},
    Promise,JSON,Error,TypeError,console
  };
  vm.createContext(ctx);
  vm.runInContext([
    'let manualDxnSponsorTimer=null;',
    extractFunction(HTML,'dxnRegistryRpc'),
    extractFunction(HTML,'isDxnRegistryTechnicalError'),
    extractFunction(HTML,'lookupManualDxnSponsor'),
    extractFunction(HTML,'saveManualDxnMember'),
    'this.api={lookupManualDxnSponsor,saveManualDxnMember};'
  ].join('\n'),ctx);
  return {els,calls,toasts,api:ctx.api,state:()=>({closed,synced})};
}
const json=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
const flush=()=>new Promise(r=>setImmediate(r));

test('sponsor lookup goes through /api/rpc, not a direct Supabase call',async()=>{
  const page=makePage(()=>json(200,{found:true,sponsor_member_no:'100000001',sponsor_name:'راعٍ بلا حساب',next_generation:4}));
  await page.api.lookupManualDxnSponsor();await flush();
  assert.equal(page.calls[0].url,'/api/rpc');
  assert.equal(page.calls[0].body.fn,'lookup_dxn_team_sponsor');
  assert.match(page.els.manualDxnSponsorPreview.textContent,/✅ الراعي: راعٍ بلا حساب/);
});

test('case 4: sponsor that is not in the DXN registry is reported as not found',async()=>{
  const page=makePage(()=>json(200,{found:false,message:'الراعي غير موجود في سجل DXN'}));
  await page.api.lookupManualDxnSponsor();await flush();
  assert.match(page.els.manualDxnSponsorPreview.textContent,/^❌ الراعي غير موجود في سجل DXN/);
});

test('case 5: network failure (Failed to fetch) shows a connection error, not "not found"',async()=>{
  const page=makePage(()=>{throw new TypeError('Failed to fetch');});
  await page.api.lookupManualDxnSponsor();await flush();
  const text=page.els.manualDxnSponsorPreview.textContent;
  assert.match(text,/مشكلة اتصال/);
  assert.match(text,/لم يُحكم على الراعي بأنه غير موجود/);
  assert.doesNotMatch(text,/^❌/);
});

test('case 5: server error (HTTP 500/504) is also technical, not "not found"',async()=>{
  for(const status of [500,504]){
    const page=makePage(()=>json(status,{error:'timeout'}));
    await page.api.lookupManualDxnSponsor();await flush();
    assert.match(page.els.manualDxnSponsorPreview.textContent,/مشكلة اتصال/,`HTTP ${status}`);
  }
});

test('a real database refusal (expired session) is shown as the database message',async()=>{
  const page=makePage(()=>json(400,{message:'انتهت الجلسة'}));
  await page.api.lookupManualDxnSponsor();await flush();
  assert.equal(page.els.manualDxnSponsorPreview.textContent,'❌ انتهت الجلسة');
});

test('a late answer for an old sponsor number does not overwrite the current one',async()=>{
  let page;
  page=makePage(()=>{page.els.manualDxnSponsorNo.value='300000003';return json(200,{found:false,message:'الراعي غير موجود في سجل DXN'});});
  await page.api.lookupManualDxnSponsor();await flush();
  assert.doesNotMatch(page.els.manualDxnSponsorPreview.textContent,/غير موجود/);
});

test('adding a member goes through /api/rpc and closes the form on success',async()=>{
  const page=makePage(()=>json(200,{ok:true,member_no:'200000002',sponsor_member_no:'100000001'}));
  await page.api.saveManualDxnMember();
  assert.equal(page.calls[0].url,'/api/rpc');
  assert.equal(page.calls[0].body.fn,'leader_add_dxn_team_member_manual');
  assert.deepEqual(Object.keys(page.calls[0].body.args).sort(),['p_join_date','p_member_name','p_member_no','p_sponsor_member_no','p_token']);
  assert.deepEqual(page.state(),{closed:true,synced:true});
});

test('adding a member during a network failure shows a connection error and keeps the form',async()=>{
  const page=makePage(()=>{throw new TypeError('Failed to fetch');});
  await page.api.saveManualDxnMember();
  assert.match(page.els.manualDxnMemberStatus.textContent,/^⚠️ تعذر الاتصال بالخادم/);
  assert.equal(page.els.manualDxnMemberSave.disabled,false);
  assert.deepEqual(page.state(),{closed:false,synced:false});
});

test('adding with an unknown sponsor shows the database refusal',async()=>{
  const page=makePage(()=>json(400,{message:'رقم الراعي غير موجود في سجل DXN؛ لا يمكن جلب اسم الراعي والجيل'}));
  await page.api.saveManualDxnMember();
  assert.match(page.els.manualDxnMemberStatus.textContent,/^❌ رقم الراعي غير موجود في سجل DXN/);
});

test('SQL: sponsor is looked up only in dxn_team_members, never in app_users or by team scope',()=>{
  for(const name of ['lookup_dxn_team_sponsor','leader_add_dxn_team_member_manual']){
    const body=sqlFunction(name);
    assert.match(body,/from public\.dxn_team_members\s+where member_no = (sponsor_no_clean|no_clean)/,name);
    // app_users يُستخدم فقط للتحقق من دور القائد المنفذ (uid من الجلسة)، وليس للراعي.
    const appUsersUses=body.match(/public\.app_users[^;]*;/g)||[];
    assert.ok(appUsersUses.length>=1&&appUsersUses.every(s=>/au\.id = uid/.test(s)),name);
    assert.doesNotMatch(body,/team_root|downline_of|leader_member_no|generation\s*(<|>|<=|>=)\s*\d/i,name);
  }
});

test('the proxy routes both functions with the server secret key',()=>{
  const proxy=fs.readFileSync(path.join(ROOT,'api','rpc.js'),'utf8');
  const start=proxy.indexOf('const privilegedTeamRpc');
  const block=proxy.slice(start,proxy.indexOf(';',start));
  assert.match(block,/lookup_dxn_team_sponsor/);
  assert.match(block,/leader_add_dxn_team_member_manual/);
});
