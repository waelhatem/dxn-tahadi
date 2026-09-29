// Regression test: the background memory helper prompt must not hand the model
// an empty answer to copy. Production 2026-09-28: with doDurableFacts=true the
// helper returned the empty template (51 tokens) and nothing was saved.
// api/ai-agent.js only exports the request handler, so this reads its source.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const SOURCE=fs.readFileSync(path.join(__dirname,'..','api','ai-agent.js'),'utf8').replace(/\r/g,'');

function helperBody(){
  const start=SOURCE.indexOf('async function extractBackgroundMemoryBundle(');
  assert.ok(start>=0,'extractBackgroundMemoryBundle not found');
  return SOURCE.slice(start,SOURCE.indexOf('\n}\n',start));
}

test('prompt no longer contains an empty answer instance',()=>{
  assert.doesNotMatch(helperBody(),/personal_training:\{training:null,member_facts:\[\]\}/);
});

test('prompt tells the model to fill requested durable facts and training',()=>{
  const body=helperBody();
  assert.match(body,/doDurableFacts = true[^']*durable_facts/);
  assert.match(body,/doPersonalTraining = true[^']*training/);
});

test('prompt defines the member_facts item shape',()=>{
  assert.match(helperBody(),/تعريف عنصر member_facts:',\s*JSON\.stringify\(\{fact:'',supersedes_id:null\}\)/);
});

test('prompt lines are joined with a real newline',()=>{
  const body=helperBody();
  assert.match(body,/\]\.join\('\\n'\);/);
  assert.doesNotMatch(body,/\]\.join\('\\\\n'\);/);
});
