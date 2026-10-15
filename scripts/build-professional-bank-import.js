#!/usr/bin/env node
'use strict';
/* Builds the private SQL that loads approved professional quiz banks into the server
 * (professional_training_import_bank). Questions and choices are taken verbatim from the public
 * professional-training-0N.js files; answer keys come ONLY from a private, git-ignored JSON file.
 * The output also goes to the git-ignored .private/ folder. Nothing is sent anywhere.
 *
 *   node scripts/build-professional-bank-import.js [keys.private.json] [out.private.sql]
 *
 * Keys file: {"2":"ب، أ، ج، …"} — 20 letters (أ/ب/ج) per lesson, in question order. Lessons without
 * keys are reported and left out; keys are never invented.
 */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const LETTER={'أ':0,'ا':0,'ب':1,'ج':2};
const CHOICE_ORDER=['a','b','c'];

function readLesson(no){
  const file=path.join(ROOT,'professional-training-0'+no+'.js');
  const src=fs.readFileSync(file,'utf8');
  const m=src.match(/const lesson=(\{.*?\});\r?\n/s);
  if(!m)throw Error('cannot find the question bank in '+path.basename(file));
  const lesson=JSON.parse(m[1]);
  if(!Array.isArray(lesson.questions)||lesson.questions.length!==20)throw Error('lesson '+no+' must have 20 questions');
  return lesson;
}
function parseKeys(text,no){
  const letters=String(text||'').split(/[،,\s]+/).filter(Boolean);
  if(letters.length!==20)throw Error('lesson '+no+': 20 answer letters required, got '+letters.length);
  return letters.map((l,i)=>{if(!(l in LETTER))throw Error('lesson '+no+' question '+(i+1)+': unknown letter '+l);return LETTER[l];});
}
// One lesson's import payload: verbatim questions + choices in file order + the private key.
function bankFor(no,keyText){
  const lesson=readLesson(no),keys=parseKeys(keyText,no);
  return lesson.questions.map((q,i)=>{
    if(q.number!==i+1)throw Error('lesson '+no+': question numbers out of order at '+(i+1));
    if(JSON.stringify(Object.keys(q.choices))!==JSON.stringify(CHOICE_ORDER))throw Error('lesson '+no+' question '+(i+1)+': choices must be a, b, c in order');
    return {no:i+1,question:q.prompt,options:CHOICE_ORDER.map(k=>q.choices[k]),correct_index:keys[i]};
  });
}
function buildSql(keysFile){
  const keys=JSON.parse(fs.readFileSync(keysFile,'utf8'));
  // A bank still marked as a draft in its file is never published, even if a key is provided.
  const draft=[1,2,3,4,5].filter(n=>/^draft/.test(String(readLesson(n).review_status||'')));
  const lessons=[1,2,3,4,5].filter(n=>keys[String(n)]&&!draft.includes(n));
  const missing=[1,2,3,4,5].filter(n=>!keys[String(n)]&&!draft.includes(n));
  const lit=s=>"'"+String(s).replace(/'/g,"''")+"'";
  const body=lessons.map(n=>'SELECT public.professional_training_import_bank('+n+','+lit(JSON.stringify(bankFor(n,keys[String(n)])))+'::jsonb);').join('\n');
  const sql='-- PRIVATE: contains approved answer keys. Never commit, never share publicly.\n'+
    '-- Run in the Supabase SQL editor only after the unified training engine migration, and only with approval.\n'+
    '-- Lessons included: '+(lessons.join(', ')||'none')+'. Lessons still without approved keys: '+(missing.join(', ')||'none')+
    '. Draft banks left unpublished: '+(draft.join(', ')||'none')+'.\n'+
    'BEGIN;\nSET LOCAL ROLE service_role;\n'+body+'\nCOMMIT;\n';
  return {sql,lessons,missing,draft};
}
module.exports={bankFor,buildSql,parseKeys,readLesson};

if(require.main===module){
  const keysFile=path.resolve(process.argv[2]||path.join(ROOT,'.private','professional-keys.private.json'));
  const out=path.resolve(process.argv[3]||path.join(ROOT,'.private','professional-bank-import.private.sql'));
  if(!/\.private\.(sql|json)$/.test(out))throw Error('output must be a *.private.sql file (git-ignored)');
  const {sql,lessons,missing,draft}=buildSql(keysFile);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,sql);
  console.log('Wrote '+out+' — lessons '+lessons.join(', ')+'; still missing keys: '+(missing.join(', ')||'none')+'; drafts not published: '+(draft.join(', ')||'none'));
}
