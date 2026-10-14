#!/usr/bin/env node
'use strict';
// Local operator-only import. The private JSON/secret key must NEVER be committed.
// Requires Node >=20. Performs a single atomic RPC in an ISOLATED TEST project only.
const fs=require('node:fs');
const path=require('node:path');
const PROD_REF='ryqpstkzppaifpvhezzn';
function fail(code,message){console.error(message);process.exitCode=code;}
function verify(bank){
 if(!Array.isArray(bank)||bank.length!==8)throw Error('expected 8 basic training lessons');
 let total=0;
 const videos=new Set();
 for(let i=0;i<8;i++){
  const l=bank[i];
  if(!l||l.training_no!==i+1||typeof l.title!=='string'||l.title.trim().length<4||
     typeof l.video_id!=='string'||!(/^[A-Za-z0-9_-]{11}$/).test(l.video_id)||
     !Number.isInteger(l.expected_duration_seconds)||l.expected_duration_seconds<60||
     l.expected_duration_seconds>14400||!Array.isArray(l.questions)||l.questions.length!==20)
   throw Error('invalid metadata/questions for training '+(i+1));
  if(videos.has(l.video_id))throw Error('repeated video id');
  videos.add(l.video_id);
  l.questions.forEach((q,j)=>{
   if(!q||q.no!==j+1||typeof q.question!=='string'||q.question.trim().length<3||
      !Array.isArray(q.options)||q.options.length!==3||
      q.options.some(x=>typeof x!=='string'||!x.trim())||
      !Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>2)
    throw Error('invalid question at training '+(i+1)+' question '+(j+1));
   total++;
  });
 }
 if(total!==160)throw Error('expected 160 questions');
 return {lessons:bank.length,questions:total};
}
async function main(){
 const source=process.argv[2];
 if(!source)throw Error('Usage: node scripts/import-private-basic-training-bank.js /absolute/path/to/basic-training-bank.private.json');
 const file=path.resolve(source);
 const base=path.resolve(__dirname,'..');
 if(file.startsWith(path.join(base,'app')+path.sep)||file.startsWith(path.join(base,'public')+path.sep))
  throw Error('private bank may not reside in web-published directories');
 const url=process.env.SUPABASE_TEST_URL;
 const key=process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Test Supabase URL and service role credentials must be supplied via environment');
 if(process.env.CONFIRM_ISOLATED_TEST_IMPORT!=='YES')
  throw Error('Set CONFIRM_ISOLATED_TEST_IMPORT=YES after verifying that the target is a separate development branch');
 const u=new URL(url);
 if(u.protocol!=='https:'||!(/^[a-z0-9-]+\.supabase\.co$/).test(u.hostname)||
    u.hostname===PROD_REF+'.supabase.co')
  throw Error('Refusing production, non-HTTPS or unrecognized test Supabase host');
 const bank=JSON.parse(fs.readFileSync(file,'utf8'));
 const count=verify(bank);
 const response=await fetch(u.origin+'/rest/v1/rpc/basic_training_import_private_bank',{
  method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},
  body:JSON.stringify({p_bank:bank}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){
  // Never log private answer texts or arbitrary error details.
  fail(1,'Private bank import rejected (HTTP '+response.status+'). Inspect test-branch RPC permissions.');
  return;
 }
 const result=await response.json();
 if(Number(result?.lessons)!==count.lessons||Number(result?.questions)!==count.questions)
  throw Error('import count mismatch');
 console.log('Isolated test import succeeded: 8 lessons / 160 questions. No answer keys printed.');
}
main().catch(e=>fail(1,'Import not performed: '+String(e.message||'validation failure').slice(0,200)));
