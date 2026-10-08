'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=p=>fs.readFileSync(p,'utf8');

test('real Design Studio provider routes are present and keep secrets server-side',()=>{
  for(const file of ['api/_design-studio-common.js','api/design-image.js','api/design-video.js','api/design-video-status.js']){
    const src=read(file);
    new vm.Script(src,{filename:file});
  }
  const common=read('api/_design-studio-common.js');
  assert.match(common,/process\.env\.OPENAI_API_KEY/);
  assert.match(common,/process\.env\.FAL_KEY/);
  const frontend=read('app/design-studio/engines/native.mjs');
  assert.doesNotMatch(frontend,/process\.env|OPENAI_API_KEY|FAL_KEY/);
  assert.match(frontend,/\/api\/design-image/);
  assert.match(frontend,/\/api\/design-video/);
  assert.match(frontend,/\/api\/design-video-status/);
});

test('modular studio exposes restored AI image tools and image-to-video',()=>{
  const image=read('app/design-studio/views/image.mjs');
  for(const id of ['removeObject','addObject','productMarketing','freeEdit','ad','generate']) assert.match(image,new RegExp("id: '"+id+"'"));
  assert.match(image,/وصف الصورة/);
  const video=read('app/design-studio/views/video.mjs');
  assert.match(video,/image-ai/);
  assert.match(video,/imageToVideo/);
  assert.match(video,/صورة إلى فيديو AI/);
  const home=read('app/design-studio/views/home.mjs');
  assert.match(home,/إنشاء صورة/);
  assert.match(home,/صورة إلى فيديو/);
});

test('native capability routing and Vercel limits are configured',()=>{
  const engines=read('api/_design/engines.js');
  assert.match(engines,/nativeCapabilities/);
  assert.match(engines,/providers\[engine\] = 'native'/);
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@fal-ai/client'],'1.10.1');
  const vercel=JSON.parse(read('vercel.json'));
  for(const route of ['api/design-image.js','api/design-video.js','api/design-video-status.js']) assert.equal(vercel.functions[route].maxDuration,60);
});

test('training isolation regression remains included',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test,/tests\/training-tab-isolation\.test\.js/);
  const assessment=read('training-assessment.js');
  assert.match(assessment,/function lessonsHost\(\)/);
  assert.match(assessment,/tab!==['"]training['"]/);
});


test('image enhancement reports visible resolution metadata and updated cache version',()=>{
  const local=read('app/design-studio/engines/local/image.mjs');
  assert.match(local,/sourceWidth/);
  assert.match(local,/sourceHeight/);
  assert.match(local,/provider: 'local'/);
  assert.match(local,/contrast: 1\.16/);
  assert.match(local,/sharpen\(c\.getContext\('2d'\), c\.width, c\.height, 0\.42\)/);
  const view=read('app/design-studio/views/image.mjs');
  assert.match(view,/معالجة محلية/);
  assert.match(view,/قبل:/);
  assert.match(view,/عرض بالحجم الكامل/);
  const loader=read('app/design-studio-loader.js');
  assert.match(loader,/VERSION='2'/);
  const html=read('app/index.html');
  assert.match(html,/design-studio-loader\.js\?v=2/);
});
