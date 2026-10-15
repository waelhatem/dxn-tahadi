'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','basic-training.js'),'utf8');
const start=src.indexOf(' const HEARTBEAT_INTERVAL_MS=');
const end=src.indexOf(' function tick(){',start);
function heartbeatWithMock(){
 assert.ok(start>=0&&end>start,'heartbeat code is present');
 const body=src.slice(start,end);
 let clock=10000,calls=0;
 const movie={no:1,duration:100,max:100,confirmed:0,saving:false,completed:false,lastSent:0};
 const context={
  movie,backendReady:true,progress:[],
  Date:{now:()=>clock},Math,fmt:n=>Math.max(0,Math.floor(n)),
  rpc:async()=>({watched:++calls,completed:false}),
  watchMessage:()=>{},watchPct:()=>{},showUncreditedWatch:()=>{},Number
 };
 vm.runInNewContext(body+';this.runHeartbeat=heartbeat',context);
 return {context,movie,advance:(ms)=>clock+=ms,call:()=>context.runHeartbeat(true),calls:()=>calls};
}
test('forced heartbeat is throttled: server-safe interval despite frequent near-end ticks',async()=>{
 const env=heartbeatWithMock();
 for(let i=0;i<100;i++){await env.call();env.advance(600)}
 assert.ok(env.calls()<=12,'at most one network request every 5.2 seconds, not every 600 ms');
 assert.ok(env.calls()>=8,'regular progress can still be recorded');
});
test('never send watch updates after the server marks completion',async()=>{
 const env=heartbeatWithMock();
 await env.call();
 const before=env.calls();
 env.movie.completed=true;
 env.advance(20000);
 await env.call();
 assert.equal(env.calls(),before);
});
test('watch credits use normal playback, repeat after end is not an unthrottled RPC loop',()=>{
 assert.match(src,/getPlaybackRate/);
 assert.match(src,/setPlaybackRate\(1\)/);
 assert.match(src,/onPlaybackRateChange/);
 assert.match(src,/HEARTBEAT_INTERVAL_MS=5200/);
 assert.match(src,/if\(m\.lastSent && Date\.now\(\)-m\.lastSent<HEARTBEAT_INTERVAL_MS\)return/);
 assert.match(src,/if\(!m\.completed&&current>=duration-3\.5/);
 assert.doesNotMatch(src,/if\(!force&&Date\.now\(\)-m\.lastSent<5000\)return/);
});
