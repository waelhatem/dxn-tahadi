const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const base=require('node:path').join(__dirname,'..');
const read=n=>fs.readFileSync(require('node:path').join(base,n),'utf8');
const js=read('basic-training.js');
const sql=read('supabase/migrations/20261013020000_basic_training_track_and_assessment.sql');
const page=read('app/index.html');
test('basic bag JavaScript is syntactically valid and isolated from legacy progress',()=>{
 const ctx={window:{}};
 vm.runInNewContext(js,ctx);
 assert.equal(typeof ctx.window.basicTrainingCourseHtml,'function');
 assert.equal(typeof ctx.window.basicBagStartVideo,'function');
 assert.equal(typeof ctx.window.basicBagStartQuiz,'function');
 assert.ok(!js.includes('trainingData.my_progress'));
 assert.ok(!js.includes("startTrainingLesson("));
 assert.ok(!js.includes('localStorage.setItem('));
});
test('four approved basic lessons, no invented lesson two video',()=>{
 for(const id of ['78HTmcWYqN4','7BBYsbPgX1M','ArJSiW2E4TM'])assert.ok(js.includes(id));
 assert.match(js,/no:2,title:'منتجات DXN – فوائدها واستخداماتها',video:null/);
 assert.ok(js.includes('لا يسمح بالقفز'));
});
test('only approved corrected question bank 4 is included',()=>{
 assert.match(sql,/values\(4, '/);
 assert.equal((sql.match(/"question":/g)||[]).length,20);
 assert.equal((sql.match(/"options":/g)||[]).length,20);
 assert.equal((sql.match(/"answer":/g)||[]).length,20);
 assert.match(sql,/ما المقصود بالتوسع الأفقي في بناء فريق DXN/);
 assert.match(sql,/الأقارب والأصدقاء والزملاء/);
 assert.match(sql,/basic4-user-approved-q6-corrected/);
 assert.doesNotMatch(sql,/values\([123], '/);
});
test('video checkpoints and answers verified on server, not browser',()=>{
 assert.match(sql,/basic_training_watch_update/);
 assert.match(sql,/max_growth := least\(12/);
 assert.match(sql,/basic_training_submit_quiz/);
 assert.match(sql,/p_answers is null/);
 assert.match(sql,/training_no=p_training_no and completed_at is not null/);
 assert.match(sql,/owner_user_id=uid/);
 assert.match(sql,/jsonb_build_object\('score',num_ok/);
 assert.ok(!js.includes('correctAnswers='));
});
test('new basic renderer and script loaded, original tabs retained',()=>{
 assert.match(page,/function basicTrainingPage\(\)/);
 assert.match(page,/window.basicTrainingCourseHtml\(\)/);
 assert.match(page,/basic-training.js\?v=1/);
 assert.match(page,/trainingSubtab==='professional'/);
 assert.match(page,/trainingSubtab==='ragwan_success_plan'/);
});
