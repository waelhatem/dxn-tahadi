// طبقة الصوت: MiniMax (أساسي) و OpenAI (احتياطي)، وتوقيع النص المنطوق في مدرب الاستقطاب. بدون شبكة.
process.env.OPENAI_API_KEY='test-openai';
process.env.SUPABASE_SECRET_KEY='test-secret';
const test=require('node:test');
const assert=require('node:assert/strict');
const providers=require('../api/_voice-providers');
const voice=require('../api/ai-agent-voice');
const coach=require('../api/recruitment-coach');

voice.supabaseRpc=async()=>({ok:true});
const MINIMAX_ENV=['MINIMAX_API_KEY','MINIMAX_COACH_VOICE_ID','MINIMAX_API_HOST','MINIMAX_GROUP_ID','MINIMAX_TTS_MODEL','MINIMAX_PERSONA_VOICES','VOICE_PROVIDER'];
function resetEnv(extra){for(const k of MINIMAX_ENV)delete process.env[k];Object.assign(process.env,extra||{});}

function sse(objects){return objects.map(o=>'data: '+JSON.stringify(o)+'\n\n').join('');}
function streamResponse(text,splitAt){
  const enc=new TextEncoder();
  const parts=splitAt?[text.slice(0,splitAt),text.slice(splitAt)]:[text];
  return new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(enc.encode(p));c.close();}}),{status:200,headers:{'Content-Type':'text/event-stream'}});
}
const CHUNKS=[{data:{audio:'aabb',status:1},base_resp:{status_code:0}},{data:{audio:'ccdd',status:1}},{data:{audio:'aabbccdd',status:2},extra_info:{audio_format:'mp3'},base_resp:{status_code:0,status_msg:'success'}}];

test('parser emits hex chunks, skips the aggregated final chunk, and survives split boundaries',()=>{
  const out=[];
  const p=providers.createMinimaxStreamParser(b=>out.push(b.toString('hex')));
  const text=sse(CHUNKS);
  p.push(text.slice(0,17));p.push(text.slice(17,60));p.push(text.slice(60));
  assert.equal(p.end(),2);
  assert.deepEqual(out,['aabb','ccdd']);
});

test('parser uses the final chunk when it is the only audio',()=>{
  const out=[];
  const p=providers.createMinimaxStreamParser(b=>out.push(b.toString('hex')));
  p.push(sse([{data:{audio:'0102',status:2}}]));
  assert.equal(p.end(),1);
  assert.deepEqual(out,['0102']);
});

test('parser surfaces MiniMax errors from base_resp',()=>{
  const p=providers.createMinimaxStreamParser(()=>{});
  assert.throws(()=>{p.push(sse([{base_resp:{status_code:1004,status_msg:'auth failed'}}]));},/MiniMax 1004/);
});

test('coach voice uses the clone voice_id only when configured, otherwise a temporary voice',()=>{
  resetEnv({MINIMAX_API_KEY:'k'});
  assert.equal(providers.resolveVoice('coach').minimax.voice_id,'Arabic_FriendlyGuy');
  assert.equal(providers.voiceStatus().coach_voice_ready,false);
  resetEnv({MINIMAX_API_KEY:'k',MINIMAX_COACH_VOICE_ID:'WaelHatemClone01'});
  assert.equal(providers.resolveVoice('coach').minimax.voice_id,'WaelHatemClone01');
  assert.equal(providers.voiceStatus().coach_voice_ready,true);
  assert.doesNotMatch(JSON.stringify(providers.voiceStatus()),/WaelHatemClone01|"k"/);
});

test('persona voices differ from the coach and from each other, and unknown keys fall back by gender',()=>{
  resetEnv({MINIMAX_API_KEY:'k',MINIMAX_COACH_VOICE_ID:'WaelHatemClone01'});
  const m1=providers.resolveVoice('persona','m1','male').minimax;
  const m2=providers.resolveVoice('persona','m2','male').minimax;
  assert.notDeepEqual(m1,m2);
  assert.notEqual(m1.voice_id,'WaelHatemClone01');
  assert.equal(providers.resolveVoice('persona','zz','female').minimax.voice_id,'Arabic_CalmWoman');
});

test('MINIMAX_PERSONA_VOICES adds custom persona voices and rejects invalid ids',()=>{
  resetEnv({MINIMAX_PERSONA_VOICES:JSON.stringify([{key:'m4',gender:'male',voice_id:'IraqiCustomer01',pitch:-20},{key:'bad key',voice_id:'x'},{key:'f9',voice_id:'1starts-with-digit'}])});
  assert.ok(providers.personaVoiceKeys('male').includes('m4'));
  assert.ok(!providers.personaVoiceKeys().includes('f9'));
  const m4=providers.resolveVoice('persona','m4','male').minimax;
  assert.equal(m4.voice_id,'IraqiCustomer01');
  assert.equal(m4.pitch,-12);
});

test('MiniMax request: streaming, Arabic boost, chosen voice, bearer key, optional GroupId and host',async()=>{
  resetEnv({MINIMAX_API_KEY:'mm-key',MINIMAX_API_HOST:'https://api-uw.minimax.io/',MINIMAX_GROUP_ID:'g1'});
  const seen=[];
  global.fetch=async(url,init)=>{seen.push({url,init});return streamResponse(sse(CHUNKS),40);};
  const out=[];
  const r=await providers.synthesize({text:'هلا',voice:providers.resolveVoice('persona','f2','female')},b=>out.push(b.toString('hex')));
  assert.equal(r.provider,'minimax');
  assert.deepEqual(out,['aabb','ccdd']);
  assert.equal(seen[0].url,'https://api-uw.minimax.io/v1/t2a_v2?GroupId=g1');
  assert.equal(seen[0].init.headers.Authorization,'Bearer mm-key');
  const body=JSON.parse(seen[0].init.body);
  assert.equal(body.stream,true);
  assert.equal(body.language_boost,'Arabic');
  assert.equal(body.model,'speech-2.8-turbo');
  assert.equal(body.voice_setting.voice_id,'Arabic_CalmWoman');
  assert.equal(body.audio_setting.format,'mp3');
});

test('falls back to OpenAI when MiniMax fails before sending audio',async()=>{
  resetEnv({MINIMAX_API_KEY:'mm-key'});
  const hosts=[];
  global.fetch=async(url)=>{
    hosts.push(new URL(url).host);
    if(String(url).includes('minimax'))return new Response(JSON.stringify({base_resp:{status_code:1002,status_msg:'rate limit'}}),{status:200,headers:{'Content-Type':'application/json'}});
    return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([9,9]).buffer};
  };
  const out=[];
  const r=await providers.synthesize({text:'هلا',voice:providers.resolveVoice('persona','m1','male')},b=>out.push(b));
  assert.equal(r.provider,'openai');
  assert.deepEqual(hosts,['api.minimax.io','api.openai.com']);
  assert.equal(out.length,1);
});

test('without a MiniMax key the feature still speaks through the fallback provider',()=>{
  resetEnv();
  assert.deepEqual(providers.providerChain().map(p=>p.name),['openai']);
  assert.equal(providers.voiceStatus().provider,'openai');
  assert.equal(providers.voiceStatus().coach_voice_ready,false);
});

test('speech signature accepts server text only, per role, and expires',()=>{
  const {signSpeech,verifySpeech}=coach._internal;
  const s=signSpeech('coach','نصيحة');
  assert.equal(verifySpeech(s,'نصيحة'),'coach');
  assert.equal(verifySpeech(s,'نص مختلف'),null);
  assert.equal(verifySpeech({...s,role:'persona'},'نصيحة'),null);
  assert.equal(verifySpeech(signSpeech('coach','قديم',Date.now()-31*60*1000),'قديم'),null);
  assert.equal(verifySpeech({role:'admin',ts:Date.now(),sig:'x'},'x'),null);
});

function fakeRes(withWrite){
  const r={headers:{},statusCode:0,written:[],ended:null};
  r.setHeader=(k,v)=>{r.headers[k]=v;};
  if(withWrite)r.write=c=>{r.written.push(Buffer.from(c));};
  r.end=c=>{r.ended=c===undefined?true:c;return r;};
  return r;
}

test('speak refuses unsigned text so the coach clone cannot read arbitrary input',async()=>{
  await assert.rejects(coach._internal.handleSpeak({text:'أي نص',speech:{role:'coach',ts:Date.now(),sig:'0'.repeat(64)}},fakeRes(true)),/غير صالح/);
});

test('speak streams MiniMax audio chunks and uses the coach clone for coach text',async()=>{
  resetEnv({MINIMAX_API_KEY:'mm-key',MINIMAX_COACH_VOICE_ID:'WaelHatemClone01'});
  let sentVoice=null;
  global.fetch=async(url,init)=>{sentVoice=JSON.parse(init.body).voice_setting.voice_id;return streamResponse(sse(CHUNKS));};
  const text='جرب تسأله عن شغله أولًا';
  const res=fakeRes(true);
  await coach._internal.handleSpeak({text,speech:coach._internal.signSpeech('coach',text)},res);
  assert.equal(sentVoice,'WaelHatemClone01');
  assert.equal(res.headers['Content-Type'],'audio/mpeg');
  assert.deepEqual(res.written.map(b=>b.toString('hex')),['aabb','ccdd']);
});

test('speak buffers the whole audio when the server has no res.write (local server.js)',async()=>{
  resetEnv({MINIMAX_API_KEY:'mm-key'});
  global.fetch=async()=>streamResponse(sse(CHUNKS));
  const text='هلا بيك';
  const res=fakeRes(false);
  await coach._internal.handleSpeak({text,speech:coach._internal.signSpeech('persona',text),scenario:{gender:'male',voice:'m3'}},res);
  assert.equal(Buffer.from(res.ended).toString('hex'),'aabbccdd');
});

test('voice_status never exposes keys or voice ids',async()=>{
  resetEnv({MINIMAX_API_KEY:'secret-key',MINIMAX_COACH_VOICE_ID:'WaelHatemClone01'});
  const d=await coach._internal.ACTIONS.voice_status({});
  assert.equal(d.voice.provider,'minimax');
  assert.equal(d.voice.streaming,true);
  assert.doesNotMatch(JSON.stringify(d),/secret-key|WaelHatemClone01/);
  resetEnv();
});
