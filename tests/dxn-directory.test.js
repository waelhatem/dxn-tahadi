'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function source(file){return fs.readFileSync(path.join(root,file),'utf8')}
test('global directory client JavaScript parses',()=>{
  assert.doesNotThrow(()=>new vm.Script(source('app/branches-prices.js')));
});
test('dedicated directory tab is integrated and can restore state',()=>{
  const html=source('app/index.html');
  assert.match(html,/branches-prices\.js\?v=/);
  assert.match(html,/switchTab\('branches_prices'\)/);
  assert.match(html,/dxnBranchesPricesPage/);
  assert.match(html,/dxnBranchesPricesLoad/);
  assert.match(html,/path','branches_prices','progress/);
});
test('private PDF service exposes a safe upload and view helper',()=>{
  const api=require('../api/dxn-directory-storage');
  assert.equal(api.__test.MAX_PDF,20*1024*1024);
  assert.equal(api.__test.signedUrl('/object/sign/a.pdf?token=abc'),'https://ryqpstkzppaifpvhezzn.supabase.co/storage/v1/object/sign/a.pdf?token=abc');
  assert.equal(api.__test.signedUrl('https://other-domain.example/anything'),null);
  assert.match(source('api/dxn-directory-storage.js'),/user\.role!=='leader'/);
  assert.match(source('api/dxn-directory-storage.js'),/dxn_directory_list/);
});
test('database migration requires server-backed leader checks and protects tables',()=>{
  const sql=source('supabase/migrations/20261116165000_global_dxn_branches_prices.sql');
  for(const table of ['dxn_directory_countries','dxn_directory_branches','dxn_directory_prices'])
    assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,/public\.app_current_role\(p_token\)<>'leader'/);
  assert.match(sql,/public\.app_current_user_id\(p_token\)/);
  assert.match(sql,/dxn-directory-pdfs','dxn-directory-pdfs',false/);
});
