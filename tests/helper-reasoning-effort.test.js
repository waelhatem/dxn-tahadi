// Regression test: the background memory helper must send a reasoning.effort
// value that the helper model accepts. Production 2026-09-28 returned HTTP 400:
// "Unsupported value: 'none' is not supported with the 'gpt-5-nano' model".
// api/ai-agent.js only exports the request handler, so this reads its source.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const SOURCE=fs.readFileSync(path.join(__dirname,'..','api','ai-agent.js'),'utf8').replace(/\r/g,'');
const GPT5_NANO_EFFORTS=['minimal','low','medium','high'];

function functionBody(name){
  const start=SOURCE.indexOf('async function '+name+'(');
  assert.ok(start>=0,name+' not found');
  const end=SOURCE.indexOf('\n}\n',start);
  return SOURCE.slice(start,end);
}

test('helper reasoning effort constant is a value gpt-5-nano accepts',()=>{
  const m=SOURCE.match(/const OPENAI_HELPER_REASONING_EFFORT\s*=\s*'([a-z]+)'/);
  assert.ok(m,'OPENAI_HELPER_REASONING_EFFORT is not defined');
  assert.ok(GPT5_NANO_EFFORTS.includes(m[1]),'unsupported effort: '+m[1]);
});

test('background memory helper sends the supported effort, never none',()=>{
  const body=functionBody('extractBackgroundMemoryBundle');
  assert.match(body,/model:OPENAI_HELPER_MODEL/);
  assert.match(body,/reasoning:\{effort:OPENAI_HELPER_REASONING_EFFORT\}/);
  assert.doesNotMatch(body,/effort:'none'/);
});
