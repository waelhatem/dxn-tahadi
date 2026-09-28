// Regression test: the background memory helper must request JSON mode and
// report (without conversation content) why a response could not be used.
// Production 2026-09-28: the helper returned HTTP 200 but
// extractBackgroundMemoryBundle returned null silently, so nothing was saved.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const SOURCE=fs.readFileSync(path.join(__dirname,'..','api','ai-agent.js'),'utf8').replace(/\r/g,'');

function functionSource(signature){
  const start=SOURCE.indexOf(signature);
  assert.ok(start>=0,signature+' not found');
  const end=SOURCE.indexOf('\n}\n',start);
  return SOURCE.slice(start,end+2);
}

test('background memory helper requests JSON mode and mentions JSON in its instructions',()=>{
  const body=functionSource('async function extractBackgroundMemoryBundle(');
  assert.match(body,/text:\{format:\{type:'json_object'\}\}/);
  assert.match(body,/instructions:'[^']*JSON[^']*'/);
});

test('both silent null exits now log a diagnostic',()=>{
  const body=functionSource('async function extractBackgroundMemoryBundle(');
  assert.match(body,/background memory helper returned no JSON object/);
  assert.match(body,/background memory helper output unusable/);
  assert.doesNotMatch(body,/catch\(_\)\{\s*return null;/);
});

test('diagnostic shape never contains the helper text',()=>{
  const OPENAI_HELPER_MODEL='gpt-5-nano';
  // eslint-disable-next-line no-eval
  const backgroundHelperOutputShape=eval('('+functionSource('function backgroundHelperOutputShape(').replace(/^function backgroundHelperOutputShape/,'function')+')');
  const secret='اسمي وائل وهذا نص خاص بالعضو';
  const r={status:200,data:{status:'completed',usage:{output_tokens:165}}};
  const shape=backgroundHelperOutputShape(r,secret,'parse');
  assert.equal(JSON.stringify(shape).includes('وائل'),false);
  assert.deepEqual(Object.keys(shape).sort(),['http_status','incomplete_reason','model','output_tokens','reason','response_status','text_length']);
  assert.equal(shape.text_length,secret.length);
  assert.equal(shape.model,OPENAI_HELPER_MODEL);
});
