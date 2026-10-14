#!/usr/bin/env node
'use strict';
// Build a local-only private bank from the eight leader-approved legacy quiz JSON files.
// IMPORTANT: historical published answer keys are compromised; rotate before production use.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path.resolve(process.argv[2]||'');
const dest=path.resolve(process.argv[3]||path.join(root,'.private','basic-training-bank.private.json'));
const lessons=[
 ['التعريف بمشروع DXN ومنتجاتها ونظامها التسويقي','lxhnkUov9sE',503],
 ['التعريف بشركة DXN ومنتجاتها ونظامها التسويقي والأرباح','K_N80xZlxXw',503],
 ['منتجات DXN وأصنافها وطرق تسويقها','n7W9LoCMdPo',1353],
 ['نظام البيع المباشر في DXN','AMKtcQt8ltc',706],
 ['خطة الأرباح والحوافز لشركة DXN','Wa_Kp2U7x0E',842],
 ['التطبيق العملي لخطة الأرباح خلال ستة أشهر','G09ztpXOBBM',838],
 ['تفعيل العضوية وتسجيل أعضاء الفريق','kYJjJu2JQFI',1175],
 ['أساسيات النجاح التسعة مع DXN','v4gYSL-KuHQ',994]
];
function die(msg){console.error(msg);process.exit(1);}
if(process.argv.length<3)die('Usage: node scripts/prepare-private-basic-training-bank.js /secure/source-folder [/secure/destination.private.json]');
if(source===root||source.startsWith(path.join(root,'app')+path.sep)||source.startsWith(path.join(root,'public')+path.sep))
 die('Refusing to load sensitive answer files from the public web tree');
if(dest.startsWith(path.join(root,'app')+path.sep)||dest.startsWith(path.join(root,'public')+path.sep))
 die('Refusing to write private bank into web-published paths');
if(fs.existsSync(dest))die('Refusing to overwrite an existing private bank');
const result=lessons.map((l,i)=>{
 const filename='basic-training-'+String(i+1).padStart(2,'0')+'-new-quiz.json';
 const items=JSON.parse(fs.readFileSync(path.join(source,filename),'utf8'));
 if(!Array.isArray(items)||items.length!==20)die('Expected 20 questions in training '+(i+1));
 return {training_no:i+1,title:l[0],video_id:l[1],expected_duration_seconds:l[2],
  questions:items.map((q,j)=>{
    const index=q.answer??q.correct_index;
    if(typeof q.question!=='string'||!Array.isArray(q.options)||q.options.length!==3||
      !Number.isInteger(index)||index<0||index>2)die('Invalid question '+(j+1)+' of training '+(i+1));
    return {no:j+1,question:q.question,options:q.options,correct_index:index};
  })};
});
fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
fs.writeFileSync(dest,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
console.log('Private bank prepared locally (8 trainings, 160 questions). Historical keys still require rotation. Never commit the output.');
