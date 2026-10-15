'use strict';
// Private import of approved professional quiz keys. Uses SYNTHETIC keys only; the real approved keys
// live in the git-ignored .private/ folder and must never be committed or sent to the browser.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const {bankFor,buildSql,readLesson}=require('../scripts/build-professional-bank-import.js');
const SYNTH='أ، ب، ج، أ، ب، ج، أ، ب، ج، أ، ب، ج، أ، ب، ج، أ، ب، ج، أ، ب';

test('letters map to the choice order in the file (أ=a, ب=b, ج=c) and questions stay verbatim',()=>{
  for(const n of [1,2,3,4,5]){
    const bank=bankFor(n,SYNTH),L=readLesson(n);
    assert.equal(bank.length,20);
    bank.forEach((q,i)=>{
      assert.equal(q.question,L.questions[i].prompt);
      assert.deepEqual(q.options,[L.questions[i].choices.a,L.questions[i].choices.b,L.questions[i].choices.c]);
      assert.equal(q.correct_index,[0,1,2][i%3]);
    });
  }
});

test('incomplete or unknown keys are refused; nothing is invented for lessons without keys',()=>{
  assert.throws(()=>bankFor(2,'أ، ب'),/20 answer letters/);
  assert.throws(()=>bankFor(2,SYNTH.replace(/^أ/,'د')),/unknown letter/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pro-keys-'));
  const file=path.join(dir,'keys.private.json');
  fs.writeFileSync(file,JSON.stringify({'2':SYNTH,'5':SYNTH}));
  const {sql,lessons,missing,draft}=buildSql(file);
  assert.deepEqual(lessons,[2,5]);
  assert.deepEqual(missing,[1,3]);
  assert.deepEqual(draft,[4]);
  assert.match(sql,/SET LOCAL ROLE service_role;/);
  assert.equal((sql.match(/professional_training_import_bank\(/g)||[]).length,2);
  assert.doesNotMatch(sql,/import_bank\((1|3|4),/);
});

test('a private import with keys for 1, 2, 3 and 5 loads exactly those banks in order while leaving draft 4 unpublished',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pro-approved-'));
  try{
    const file=path.join(dir,'keys.private.json');
    // Synthetic test data only. Approved real answer keys must never be added to this repository.
    fs.writeFileSync(file,JSON.stringify({'1':SYNTH,'2':SYNTH,'3':SYNTH,'5':SYNTH}));
    const {sql,lessons,missing,draft}=buildSql(file);
    assert.deepEqual(lessons,[1,2,3,5]);
    assert.deepEqual(missing,[]);
    assert.deepEqual(draft,[4]);
    assert.equal((sql.match(/professional_training_import_bank\\(/g)||[]).length,4);
    for(const n of [1,2,3,5])assert.match(sql,new RegExp('professional_training_import_bank\\\\('+n+','));
    assert.doesNotMatch(sql,/professional_training_import_bank\\(4,/);
    assert.match(sql,/BEGIN;\\nSET LOCAL ROLE service_role;/);
    assert.match(sql,/COMMIT;\\n$/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a bank still marked as a draft (training 4) is never published, even when a key is given',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pro-keys-'));
  const file=path.join(dir,'keys.private.json');
  fs.writeFileSync(file,JSON.stringify({'4':SYNTH}));
  const {sql,lessons,draft}=buildSql(file);
  assert.equal(readLesson(4).review_status,'draft_pending_owner_approval');
  assert.deepEqual(lessons,[]);
  assert.deepEqual(draft,[4]);
  assert.doesNotMatch(sql,/import_bank\(4,/);
});

test('answer keys never reach a tracked file or the browser',()=>{
  const tracked=execSync('git ls-files',{cwd:root}).toString().split('\n');
  assert.ok(!tracked.some(f=>f.startsWith('.private/')||/\.private\.(json|sql)$/.test(f)),'no private file is tracked');
  for(const f of ['.private/professional-keys.private.json','.private/professional-bank-import.private.sql'])
    assert.ok(execSync('git check-ignore '+f+' || true',{cwd:root}).toString().trim(),f+' is git-ignored');
  for(const f of ['professional-training-01.js','professional-training-02.js','professional-training-03.js','professional-training-04.js','professional-training-05.js','professional-training-course.js','training-engine.js'])
    assert.doesNotMatch(fs.readFileSync(path.join(root,f),'utf8'),/correct_index|"answer"\s*:|answer_key/,f+' carries no answer key');
  const sql=fs.readFileSync(path.join(root,'supabase/pending-review/20261015200000_unified_training_engine.sql'),'utf8');
  assert.doesNotMatch(sql,/INSERT INTO public\.professional_training_questions\s*\(\s*lesson_no[^;]*VALUES/i,'no key seeded in the migration');
  const quizFn=sql.slice(sql.indexOf('FUNCTION public.professional_training_get_quiz'),sql.indexOf('FUNCTION public.professional_training_submit_quiz'));
  assert.doesNotMatch(quizFn,/correct_index/,'quiz payload has no key');
});
