'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const base=read('supabase/migrations/20261013_basic_training_persistence_90_80.sql');
const frontend=read('basic-training.js');
const adminSql=read('supabase/migrations/20261013_basic_training_revision_admin.sql');
const extract=(source,fn)=>{
 const token='CREATE OR REPLACE FUNCTION public.'+fn+'(';
 const start=source.indexOf(token);
 assert.ok(start>=0,'Function not found: '+fn);
 const end=source.indexOf('END $fn$;',start);
 assert.ok(end>start,'Function body incomplete: '+fn);
 return source.slice(start,end+8);
};
test('approved answer keys are absent from the public repository working tree',()=>{
 for(let n=1;n<=8;n++){
   const file='basic-training-'+String(n).padStart(2,'0')+'-new-quiz.json';
   assert.equal(fs.existsSync(path.join(root,file)),false,file+' must never be deployed');
 }
 assert.equal(fs.existsSync(path.join(root,'supabase/migrations/20261013_basic_training_approved_160_questions.sql')),false);
});
test('the browser does not fetch public answer-key JSONs',()=>{
 assert.doesNotMatch(frontend,/basic-training-\d\d-new-quiz\.json/);
 assert.match(frontend,/rpc\('basic_training_admin_revision'/);
 assert.match(frontend,/!backendReady\|\|viewerRole!=='leader'/);
});
test('systemic grading sends aggregate scores only, without the correct answer key',()=>{
 const fn=extract(base,'basic_training_submit_quiz');
 assert.match(fn,/app_current_user_id\(p_token\)/);
 assert.match(fn,/v_attempt_count>=6/);
 const returned=fn.slice(fn.lastIndexOf('RETURN jsonb_build_object('));
 assert.match(returned,/'score',v_score/);
 assert.doesNotMatch(returned,/correct_index|correct'|details|v_details|p_answers/);
 assert.doesNotMatch(fn,/jsonb_agg\(jsonb_build_object\('no',q\.question_no,\s*'chosen'/);
});
test('member quiz delivery never exposes correction keys',()=>{
 const fn=extract(base,'basic_training_get_quiz');
 const returned=fn.slice(fn.indexOf('SELECT count(*), jsonb_agg('));
 assert.doesNotMatch(returned,/correct_index|correct'|answer_key|correct_answer/);
 assert.match(fn,/watch_completed/);
});
test('admin revision export requires an authenticated active leader',()=>{
 const fn=extract(adminSql,'basic_training_admin_revision');
 assert.match(fn,/app_current_user_id\(p_token\)/);
 assert.match(fn,/role='leader'/);
 assert.match(fn,/status='draft'/);
 assert.match(fn,/p_action='publish'/);
});
test('direct reads of questions and attempts are revoked',()=>{
 assert.match(base,/REVOKE ALL ON public\.basic_training_lessons,public\.basic_training_questions,[\s\S]*?FROM PUBLIC, anon, authenticated/);
 assert.match(base,/ENABLE ROW LEVEL SECURITY/);
 assert.match(adminSql,/REVOKE ALL ON public\.basic_training_revisions FROM PUBLIC,anon,authenticated/);
});

test('one-time private importer is restricted to service role and contains no published keys',()=>{
 const importer=read('supabase/migrations/20261013_basic_training_private_import_function.sql');
 const client=read('scripts/import-private-basic-training-bank.js');
 assert.match(importer,/SECURITY INVOKER/);
 assert.match(importer,/current_user <> 'service_role'/);
 assert.match(importer,/FROM PUBLIC,anon,authenticated/);
 assert.match(importer,/TO service_role/);
 assert.match(importer,/jsonb_array_length\(p_bank\)<>8/);
 assert.match(client,/PROD_REF/);
 assert.match(client,/CONFIRM_ISOLATED_TEST_IMPORT/);
 assert.match(client,/SUPABASE_TEST_SERVICE_ROLE_KEY/);
 assert.match(read('.gitignore'),/\.private\//);
});
