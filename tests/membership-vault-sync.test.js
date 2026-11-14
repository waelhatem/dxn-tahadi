'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('membership vault: leader-only encrypted persistence and optimistic locking', async t=>{
  process.env.SUPABASE_SECRET_KEY = 'only-for-unit-test';
  const original = https.request;
  const handler = require('../api/membership-vault.js');
  let saved = null, calls = 0;
  const images=new Map();
  const ciphertext = (saltChar='a')=>({
    format:'mafatih-dxn',version:1,iterations:600000,
    salt:Buffer.alloc(16,saltChar).toString('base64'),
    iv:Buffer.alloc(12,7).toString('base64'),
    data:Buffer.from('only-encrypted-test-data').toString('base64')
  });
  function fakeRequest(url,options,callback){
    const request = new EventEmitter();
    let serialized = '';
    request.write = value=>{ serialized += String(value); };
    request.end = ()=>{
      queueMicrotask(()=>{
        calls++;
        const pathname=new URL(url).pathname;
        const params=new URL(url).searchParams;
        const parsed=serialized?JSON.parse(serialized):null;
        let code=200,data=null;
        if(pathname==='/rest/v1/rpc/bootstrap'){
          if(parsed.p_token==='leader-test-token')data={role:'leader'};
          else if(parsed.p_token==='member-test-token')data={role:'member'};
          else {code=401;data={error:'invalid-session'};}
        }else if(pathname==='/rest/v1/membership_keys_vaults'){
          if(options.method==='GET'){
            data=saved?[{encrypted_envelope:saved.encrypted_envelope,revision:saved.revision}]:[];
          }else if(options.method==='POST'){
            if(saved){code=409;data={code:'23505'};}
            else{
              saved={...parsed};
              code=201;data=[saved];
            }
          }else if(options.method==='PATCH'){
            const version=Number((params.get('revision')||'').replace('eq.',''));
            if(saved && version===saved.revision) {
              saved={...saved,...parsed};
              data=[saved];
            } else data=[];
          }else {code=405;data={};}
        }else if(pathname==='/rest/v1/membership_keys_images'){
          const memberId=(params.get('member_id')||'').replace('eq.','');
          const revision=Number((params.get('revision')||'').replace('eq.',''));
          const existing=images.get(memberId);
          if(options.method==='GET'){
            if(!memberId){
              data=[...images.values()].map(row=>({member_id:row.member_id,revision:row.revision}));
            }else{
              data=existing?[{encrypted_envelope:existing.encrypted_envelope,revision:existing.revision}]:[];
            }
          }else if(options.method==='POST'){
            if(images.has(parsed.member_id)){code=409;data={code:'23505'};}
            else{images.set(parsed.member_id,{...parsed});code=201;data=[parsed];}
          }else if(options.method==='PATCH'){
            if(existing&&existing.revision===revision){
              const next={...existing,...parsed};
              images.set(memberId,next);data=[next];
            }else data=[];
          }else if(options.method==='DELETE'){
            if(existing&&existing.revision===revision){images.delete(memberId);data=[existing];}
            else data=[];
          }else{code=405;data={};}
        }else {code=404;data={};}
        const response=new EventEmitter();
        response.statusCode=code;
        response.setEncoding=()=>{};
        callback(response);
        response.emit('data',JSON.stringify(data));
        response.emit('end');
      });
    };
    request.destroy = ()=>{};
    return request;
  }
  https.request=fakeRequest;
  const invoke=async (body,headers={})=>{
    const res={
      code:200, headers:{},
      setHeader(key,value){this.headers[key]=value;},
      status(code){this.code=code;return this;},
      json(data){this.data=data;return this;}
    };
    await handler({method:'POST',headers:{host:'example.test',...headers},body},res);
    return res;
  };
  try{
    await t.test('rejects unauthenticated calls without reading private data',async()=>{
      const before=calls;
      const res=await invoke({action:'load',token:'bad'});
      assert.equal(res.code,401);
      assert.equal(calls,before);
    });
    await t.test('rejects member sessions and cross-site requests',async()=>{
      const a=await invoke({action:'load',token:'member-test-token'});
      assert.equal(a.code,403);
      const b=await invoke({action:'load',token:'leader-test-token'},{origin:'https://evil.example'});
      assert.equal(b.code,403);
    });
    await t.test('returns no vault before migration',async()=>{
      const res=await invoke({action:'load',token:'leader-test-token'});
      assert.equal(res.code,200);
      assert.equal(res.data.exists,false);
      assert.equal(res.data.revision,0);
    });
    await t.test('rejects plaintext or malformed envelopes',async()=>{
      const res=await invoke({action:'save',token:'leader-test-token',baseRevision:0,envelope:{password:'secret'}});
      assert.equal(res.code,400);
      assert.equal(saved,null);
    });
    await t.test('creates ciphertext only; subsequent load has the same opaque payload',async()=>{
      const envelope=ciphertext();
      const res=await invoke({action:'save',token:'leader-test-token',baseRevision:0,envelope});
      assert.equal(res.code,200);
      assert.equal(res.data.revision,1);
      assert.deepEqual(saved.encrypted_envelope,envelope);
      assert.equal(JSON.stringify(saved).includes('memberPassword'),false);
      const read=await invoke({action:'load',token:'leader-test-token'});
      assert.equal(read.data.exists,true);
      assert.deepEqual(read.data.envelope,envelope);
    });
    await t.test('prevents overwriting an existing vault with a second first-time upload',async()=>{
      const before=JSON.stringify(saved);
      const res=await invoke({action:'save',token:'leader-test-token',baseRevision:0,envelope:ciphertext('b')});
      assert.equal(res.code,409);
      assert.equal(JSON.stringify(saved),before);
    });
    await t.test('rejects outdated saves, accepts exact revision',async()=>{
      const old=await invoke({action:'save',token:'leader-test-token',baseRevision:12,envelope:ciphertext('b')});
      assert.equal(old.code,409);
      assert.equal(saved.revision,1);
      const good=await invoke({action:'save',token:'leader-test-token',baseRevision:1,envelope:ciphertext('c')});
      assert.equal(good.code,200);
      assert.equal(good.data.revision,2);
      assert.deepEqual(saved.encrypted_envelope,ciphertext('c'));
      const stale=await invoke({action:'save',token:'leader-test-token',baseRevision:1,envelope:ciphertext('d')});
      assert.equal(stale.code,409);
      assert.deepEqual(saved.encrypted_envelope,ciphertext('c'));
    });

    await t.test('screenshot access requires a leader session',async()=>{
      const read=await invoke({action:'image_list',token:'member-test-token'});
      assert.equal(read.code,403);
      const upload=await invoke({action:'image_save',token:'member-test-token',memberId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',baseRevision:0,envelope:ciphertext()});
      assert.equal(upload.code,403);
    });
    await t.test('stores independently encrypted screenshots per member',async()=>{
      const one='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const two='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const invalid=await invoke({action:'image_save',token:'leader-test-token',memberId:one,baseRevision:0,envelope:{registrationImage:'data:image/png;base64,aabb'}});
      assert.equal(invalid.code,400,'plain image data must be refused');
      const a=await invoke({action:'image_save',token:'leader-test-token',memberId:one,baseRevision:0,envelope:ciphertext('a')});
      const b=await invoke({action:'image_save',token:'leader-test-token',memberId:two,baseRevision:0,envelope:ciphertext('b')});
      assert.equal(a.code,200);assert.equal(b.code,200);
      assert.equal(images.size,2);
      assert.deepEqual(images.get(one).encrypted_envelope,ciphertext('a'));
      const index=await invoke({action:'image_list',token:'leader-test-token'});
      assert.equal(index.code,200);
      assert.equal(index.data.images.length,2);
      assert.ok(index.data.images.every(item=>!('encrypted_envelope' in item)),'image list must not include ciphertext');
      const read=await invoke({action:'image_get',token:'leader-test-token',memberId:one});
      assert.deepEqual(read.data.envelope,ciphertext('a'));
      const overwrite=await invoke({action:'image_save',token:'leader-test-token',memberId:one,baseRevision:0,envelope:ciphertext('c')});
      assert.equal(overwrite.code,409,'second first-write must not overwrite');
      const edit=await invoke({action:'image_save',token:'leader-test-token',memberId:one,baseRevision:1,envelope:ciphertext('c')});
      assert.equal(edit.code,200);assert.equal(edit.data.revision,2);
      const stale=await invoke({action:'image_save',token:'leader-test-token',memberId:one,baseRevision:1,envelope:ciphertext('d')});
      assert.equal(stale.code,409);
      assert.deepEqual(images.get(one).encrypted_envelope,ciphertext('c'));
      const deleteStale=await invoke({action:'image_delete',token:'leader-test-token',memberId:one,baseRevision:1});
      assert.equal(deleteStale.code,409);
      const removed=await invoke({action:'image_delete',token:'leader-test-token',memberId:one,baseRevision:2});
      assert.equal(removed.code,200);
      assert.equal(images.size,1);
      assert.equal((await invoke({action:'image_get',token:'leader-test-token',memberId:one})).code,404);
      assert.deepEqual(images.get(two).encrypted_envelope,ciphertext('b'),'other members must not be affected');
    });
  }finally{https.request=original;}
});

test('membership vault: page integrates encrypted cloud loading and safe recovery',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../app/membership-keys.html'),'utf8');
  const host=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
  assert.match(html,/connect-src 'self'/);
  assert.doesNotMatch(html,/connect-src 'none'/);
  const inline=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline,'the inline vault script must be present');
  assert.doesNotThrow(()=>new vm.Script(inline[1]),'vault script must parse');
  assert.match(html,/cloud\('load'\)/);
  assert.match(html,/cloud\('save'/);
  assert.match(html,/await publishEncrypted\(env,0\)/);
  assert.match(html,/استعادة نسخة مشفرة/);
  assert.match(html,/const needsRestore=remoteChecked&&!remoteEnvelope&&!localBackup\(\)/);
  assert.match(html,/if\(isNew\).*?استعد الخزنة القديمة/);
  assert.match(host,/__dxnMembershipKeysSessionToken/);
  assert.match(host,/src="\/app\/membership-keys\.html\?v=20261114-sync1"/);
});

test('membership vault: complete member clipboard text, optional encrypted email and old entries',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../app/membership-keys.html'),'utf8');
  const first=html.indexOf('  function memberClipboardText(e) {');
  const after=html.indexOf('  async function copyMemberDetails(member)',first);
  assert.ok(first>=0&&after>first,'copy formatter must exist');
  const formatter=vm.runInNewContext(html.slice(first,after)+'\nmemberClipboardText',{});
  const text=formatter({
    name:'Example Member',code:'123456789',country:'العراق',
    email:'member@example.com',sponsor:'Example Sponsor',
    sponsorCode:'987654321',password:'AbCdeF123',status:'not_delivered'
  });
  assert.equal(text.split('\n').length,9,'format should use separate lines');
  assert.match(text,/الاسم الكامل: Example Member/);
  assert.match(text,/رقم العضوية: 123456789/);
  assert.match(text,/الدولة: العراق/);
  assert.match(text,/البريد الإلكتروني: member@example\.com/);
  assert.match(text,/اسم الراعي: Example Sponsor/);
  assert.match(text,/رقم عضوية الراعي: 987654321/);
  assert.match(text,/كلمة المرور: AbCdeF123/);
  assert.match(text,/حالة التسليم: لم تُسلَّم بعد/);
  const old=formatter({name:'Old Record',password:'AAAzzz123'});
  assert.match(old,/البريد الإلكتروني: غير مدخل/,'old records lacking email must remain usable');
  const changed=formatter({name:'Member',password:'',status:'changed'});
  assert.match(changed,/كلمة المرور: تم تغييرها وحذف الكلمة القديمة/);
  assert.doesNotMatch(changed,/كلمة المرور: غير مدخلة/);
  assert.match(html,/id="memberEmail" type="email"/);
  assert.match(html,/Object.assign\(e,\{name,code,country,email,sponsor/);
  assert.match(html,/v\.entries\.push\(\{id:targetId,name,code,country,email,sponsor/);
  assert.match(html,/e\.email\|\|''/);
  assert.match(html,/action\('نسخ بيانات العضو كاملة'/);
  assert.match(html,/id="copyNewBtn"[^>]*>نسخ بيانات العضو كاملة/);
  assert.match(html,/await navigator\.clipboard\.writeText\(output\)/);
  assert.doesNotMatch(html,/copyText\(e\.password\)/);
});

test('membership vault: DXN completion screenshots are selected at creation, saved encrypted and backed up',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../app/membership-keys.html'),'utf8');
  const api=fs.readFileSync(path.join(__dirname,'../api/membership-vault.js'),'utf8');
  assert.match(html,/id="newRegistrationImageInput" type="file"/);
  assert.match(html,/id="newRegistrationImagePreview"/);
  assert.match(html,/تم التسجيل بنجاح/);
  assert.match(html,/pendingFormImage=picture/);
  assert.match(html,/await saveCloudImage\(targetId,photo\)/);
  assert.match(html,/async function encodeCloudImage\(id,picture\)/);
  assert.match(html,/kind:'membership-completion'/);
  assert.match(html,/await crypto\.subtle\.decrypt/);
  assert.match(html,/cloud\('image_save'/);
  assert.match(html,/cloud\('image_get'/);
  assert.match(html,/cloud\('image_list'/);
  assert.match(html,/cloud\('image_delete'/);
  assert.match(html,/عرض صورة اكتمال العضوية/);
  assert.match(html,/إرفاق صورة اكتمال العضوية/);
  assert.match(html,/file\.size>8\*1024\*1024/);
  assert.match(html,/imageAvailable\(e\)/,'legacy photos remain accessible');
  assert.match(html,/format:'mafatih-dxn-backup',version:2/);
  assert.match(html,/images:parsed\.images/);
  assert.match(html,/decodeCloudImage\(item\.memberId,item\.envelope,otherKey\)/);
  assert.match(api,/const IMAGE_PATH = '\/rest\/v1\/membership_keys_images'/);
  assert.match(api,/function validImageEnvelope/);
  assert.match(api,/body\.action==='image_list'/);
  assert.match(api,/body\.action==='image_get'/);
  assert.match(api,/body\.action==='image_save'/);
  assert.match(api,/body\.action==='image_delete'/);
});
