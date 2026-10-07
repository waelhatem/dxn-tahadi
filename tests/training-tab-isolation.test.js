'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');

test('training assessment mounts only inside training lessons path',()=>{
  const src=read('training-assessment.js');
  assert.match(src,/function lessonsHost\(\)/);
  assert.match(src,/tab!==['"]training['"]/);
  assert.match(src,/trainingSubtab===['"]undefined['"]\|\|trainingSubtab!==['"]lessons['"]/);
  assert.match(src,/document\.getElementById\(['"]section-training['"]\)/);
  assert.match(src,/if\(!host\)\{[\s\S]*?if\(root\)root\.remove\(\);[\s\S]*?return;/);
  assert.doesNotMatch(src,/document\.querySelector\(['"]#app \.app['"]\)\|\|document\.getElementById\(['"]app['"]\)\|\|document\.body/);
});

test('external assessment history is removed outside training lessons',()=>{
  const src=read('external-training-assessment-profile.js');
  assert.match(src,/function lessonsHost\(\)/);
  assert.match(src,/tab!==['"]training['"]/);
  assert.match(src,/trainingSubtab===['"]undefined['"]\|\|trainingSubtab!==['"]lessons['"]/);
  assert.match(src,/var root=lessonsHost\(\)/);
  assert.match(src,/if\(!lessonsHost\(\)\)\{[\s\S]*?dxn-member-external-assessment-history[\s\S]*?stale\.remove\(\)/);
});

test('app loads the isolated external assessment runtime',()=>{
  const html=read('app/index.html');
  assert.match(html,/external-training-assessment-profile\.js\?v=5/);
  assert.match(html,/tab==='training'&&canAccessTraining\(\)\?'<div id="section-training">/);
});
