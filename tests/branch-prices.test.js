'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('new catalog browser and server modules parse as valid JavaScript',()=>{
 for(const file of ['app/branches-prices.js','api/branch-price-catalog.js']){
  assert.doesNotThrow(()=>new Function(read(file)),file);
 }
});
test('main navigation and state lifecycle include branch and price catalog',()=>{
 const html=read('app/index.html');
 assert.match(html,/switchTab\('branch_prices'\)/);
 assert.match(html,/DXN_BRANCH_PRICES\?\.pageHtml\(role\)/);
 assert.match(html,/DXN_BRANCH_PRICES\?\.activate\(\)/);
 assert.match(html,/branches-prices\.js\?v=/);
 assert.match(html,/'training','branch_prices','community'/);
});
test('server authenticates sessions and restricts edits to leader',()=>{
 const server=read('api/branch-price-catalog.js');
 assert.match(server,/rpc\/bootstrap/);
 assert.match(server,/x-dxn-session/);
 assert.match(server,/leaderOnly\(role\)/);
 assert.match(server,/prepare_pdf/);
 assert.match(server,/open_pdf/);
 assert.match(server,/expiresIn:900/);
});
test('database migration has RLS and private PDF storage',()=>{
 const sql=read('supabase/migrations/20261116170000_dxn_branch_prices.sql');
 assert.match(sql,/dxn_branch_locations enable row level security/i);
 assert.match(sql,/dxn_price_lists enable row level security/i);
 assert.match(sql,/revoke all on table public\.dxn_price_lists from anon, authenticated/i);
 assert.match(sql,/false,15728640,array\['application\/pdf'\]/);
});
