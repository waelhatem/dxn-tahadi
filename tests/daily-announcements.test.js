const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const SQL=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261019080000_ai_daily_global_announcements.sql'),'utf8');
const INDEX=fs.readFileSync(path.join(ROOT,'app/index.html'),'utf8');
const CONFIG=require('../vercel.json');
const CRON=require('../api/daily-announcement-cron.js');

test('daily cron runs at 08:00 Baghdad (05:00 UTC), and requires a secret',async()=>{
  assert.ok(CONFIG.crons.some(c=>c.path==='/api/daily-announcement-cron'&&c.schedule==='0 5 * * *'));
  assert.equal(CRON.__test.baghdadDate(new Date('2026-10-18T22:30:00Z')),'2026-10-19');
  const call=async(headers,method='GET')=>{
    let code=200,payload;
    const res={status(n){code=n;return this},json(x){payload=x;return this}};
    await CRON({method,headers},res);
    return {code,payload};
  };
  process.env.CRON_SECRET='unit-test-secret';
  assert.equal((await call({})).code,401);
  assert.equal((await call({authorization:'Bearer wrong'})).code,401);
  assert.equal((await call({authorization:'Bearer unit-test-secret'},'POST')).code,405);
  delete process.env.CRON_SECRET;
});

test('AI output requires a question and rejects explicit cures and guaranteed income',()=>{
  const good={title:'فكرة صحية لهذا اليوم',body:'لنبدأ صباحنا بعادة واقعية، مثل شرب الماء بانتظام أو إضافة حركة خفيفة في يومنا. وعند الحديث مع الآخرين عن المنتجات نلتزم بالصدق واحترام احتياجاتهم. ما هي العادة التي تنوي تحسينها هذا الأسبوع؟'};
  assert.equal(CRON.__test.validateDraft(good).title,good.title);
  assert.throws(()=>CRON.__test.validateDraft({...good,body:good.body.replace('ما هي العادة','هذه العادة') .replace('؟','.')}),/سؤالاً/);
  assert.throws(()=>CRON.__test.validateDraft({...good,body:good.body+' وهذا يعالج مرض السكري.'}),/ادعاء/);
  assert.throws(()=>CRON.__test.validateDraft(good,[good.title]),/مكرر/);
});

test('database enforces permissions, daily uniqueness, expiry and manual priority',()=>{
  assert.match(SQL,/default false/);
  assert.match(SQL,/source='daily_ai'/);
  assert.match(SQL,/global_announcements_daily_date_unique/);
  assert.match(SQL,/on conflict \(publish_date\) where source='daily_ai' do nothing/);
  assert.match(SQL,/a\.publish_date=\(now\(\) at time zone 'Asia\/Baghdad'\)::date/);
  assert.match(SQL,/a\.expires_at>now\(\)/);
  assert.match(SQL,/when a\.source='manual' and a\.announcement_type='important' then 0/);
  assert.match(SQL,/grant execute on function public\.publish_daily_global_announcement\(date,text,text\)\s+to service_role/);
  assert.match(SQL,/role_name|current_role\(p_token\)/);
});
test('leader control mounts in existing announcement card; member close acknowledges daily messages',()=>{
  assert.match(INDEX,/dxn-global-announcements-v1-script/);
  assert.match(INDEX,/daily-announcement-leader\.js/);
  assert.match(INDEX,/item\.source==='daily_ai'/);
  assert.match(fs.readFileSync(path.join(ROOT,'daily-announcement-leader.js'),'utf8'),/dxnGlobalAnnouncementCard/);
});
