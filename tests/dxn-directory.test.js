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

test('unverified branch locations never generate fake GPS 0,0 pins',()=>{
 const js=source('app/branches-prices.js');
 assert.match(js,/b\.latitude!==null&&b\.latitude!==undefined/);
 assert.match(js,/b\.longitude!==null&&b\.longitude!==undefined/);
 assert.match(js,/const destination=hasGps\?/);
 assert.match(js,/الخرائط مبنية على العنوان المكتوب|اتجاهات الخريطة مبنية على العنوان المكتوب/);
 assert.match(js,/href="tel:/);
});
test('Syria seed retains 15 phone numbers and does not overwrite later edits',()=>{
 const sql=source('supabase/migrations/20261116183000_syria_service_centers_20261007.sql');
 const phones=sql.match(/'0[0-9]{9}'/g)||[];
 assert.equal(phones.length,15);
 assert.match(sql,/2026-10-07/);
 assert.match(sql,/where not exists/i);
 assert.match(source('supabase/migrations/20261116182500_dxn_directory_optional_verified_coordinates.sql'),/alter column latitude drop not null/);
});

test('WhatsApp links format Syrian and Egyptian branch numbers with country codes',()=>{
 const src=source('app/branches-prices.js');
 const isolated=src.replace('window.dxnBranchesPricesPage=page;','window.__dxndTestContact=whatsappContact;window.dxnBranchesPricesPage=page;');
 assert.notEqual(isolated,src);
 const sandbox={
   window:{},
   document:{createElement(){return {textContent:''}},head:{appendChild(){}}},
   localStorage:{getItem(){return ''}}
 };
 vm.runInNewContext(isolated,sandbox);
 const contact=sandbox.window.__dxndTestContact;
 const syria=contact('0934885089','سوريا');
 assert.equal(syria.url,'https://wa.me/963934885089');
 assert.equal(syria.display,'+963 934885089');
 assert.equal(contact('+963934885089','سوريا').url,syria.url);
 assert.equal(contact('00963934885089','سوريا').url,syria.url);
 assert.equal(contact('٠٩٣٤٨٨٥٠٨٩','سوريا').url,syria.url);
 assert.equal(contact('01012345678','مصر').url,'https://wa.me/201012345678');
 assert.equal(contact('01012345678','دولة غير محددة'),null);
 assert.match(src,/dxnd-wa-icon/);
 assert.match(src,/target="_blank" rel="noopener noreferrer" aria-label="فتح محادثة واتساب/);
 assert.match(source('app/index.html'),/branches-prices\.js\?v=20261116-whatsapp-1/);
});
