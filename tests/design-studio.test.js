'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');

test('Design Studio is linked into the SPA',()=>{
  const html=read('app/index.html');
  assert.match(html,/design-studio\.css/);
  assert.match(html,/design-studio\.js/);
  assert.match(html,/switchTab\('design'\)/);
  assert.match(html,/tab==='design'/);
  assert.match(html,/designStudioPage/);
  assert.match(html,/designStudioAfterRender/);
});

test('Design Studio exposes the promised tool set',()=>{
  const js=read('app/design-studio.js');
  for(const key of ['enhance','product','remove_bg','background','lighting','erase','free','upscale','resize','ad','generate','video']){
    assert.ok(js.includes(key+':{'),key+' tool is missing');
  }
  assert.match(js,/وضع الحفاظ على المنتج/);
  assert.match(js,/dsEditorCanvas/);
  assert.match(js,/data-ds-undo/);
  assert.match(js,/data-ds-export/);
  new vm.Script(js,{filename:'app/design-studio.js'});
});

test('Design Studio server routes are syntax-valid and keep keys server-side',()=>{
  for(const file of ['api/_design-studio-common.js','api/design-image.js','api/design-video.js','api/design-video-status.js']){
    const src=read(file);
    new vm.Script(src,{filename:file});
  }
  const common=read('api/_design-studio-common.js');
  assert.match(common,/process\.env\.OPENAI_API_KEY/);
  assert.match(common,/process\.env\.FAL_KEY/);
  assert.doesNotMatch(read('app/design-studio.js'),/OPENAI_API_KEY|FAL_KEY/);
});

test('fal client dependency and Vercel limits are configured',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@fal-ai/client'],'1.10.1');
  const vercel=JSON.parse(read('vercel.json'));
  assert.equal(vercel.functions['api/design-image.js'].maxDuration,60);
  assert.equal(vercel.functions['api/design-video.js'].maxDuration,60);
  assert.equal(vercel.functions['api/design-video-status.js'].maxDuration,60);
});
