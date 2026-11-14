'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

test('membership vault: leader-only encrypted persistence and optimistic locking', async t=>{
  process.env.SUPABASE_SECRET_KEY = 'only-for-unit-test';
  const original = https.request;
  const handler = require('../api/membership-vault.js');
  let saved = null, calls = 0;
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
  }finally{https.request=original;}
});

test('membership vault: page integrates encrypted cloud loading and safe recovery',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../app/membership-keys.html'),'utf8');
  const host=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
  assert.match(html,/cloud\('load'\)/);
  assert.match(html,/cloud\('save'/);
  assert.match(html,/await publishEncrypted\(env,0\)/);
  assert.match(html,/استعادة نسخة مشفرة/);
  assert.match(html,/const needsRestore=remoteChecked&&!remoteEnvelope&&!localBackup\(\)/);
  assert.match(html,/if\(isNew\).*?استعد الخزنة القديمة/);
  assert.match(host,/__dxnMembershipKeysSessionToken/);
  assert.match(host,/src="\/app\/membership-keys\.html\?v=20261114-sync1"/);
});
