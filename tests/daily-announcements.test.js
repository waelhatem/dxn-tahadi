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

test('member AI broadcast uses ONE bold unified text block and leaves manual announcements untouched',()=>{
  assert.match(INDEX,/item\.source==='daily_ai'&&window\.__DXN_DAILY_PRESENTATION__/);
  assert.match(INDEX,/\/daily-announcement-presentation\.js/);
  const formatter=require('../daily-announcement-presentation.js');
  const old='🌿 فكرة اليوم: صحتك تستحق اهتمامك\n\n💡 خطوة عملية: امش كل يوم\n\n💬 سؤال اليوم: ماذا ستبدأ؟';
  const normalized=formatter.normalizeDailyText(old);
  assert.equal(normalized,'🌿 صحتك تستحق اهتمامك 💡 امش كل يوم 💬 ماذا ستبدأ؟');
  assert.ok(!normalized.includes('\n'));
  let value='';
  const classes=[];
  const attrs={};
  const container={
    classList:{add(v){classes.push(v)}},
    setAttribute(k,v){attrs[k]=v},
    set textContent(v){value=v},
    get textContent(){return value}
  };
  formatter.renderBody(container,old);
  assert.equal(container.textContent,normalized);
  assert.deepEqual(classes,['dxn-ga-daily-content']);
  assert.equal(attrs.dir,'rtl');
  const css=fs.readFileSync(path.join(ROOT,'daily-announcement-presentation.js'),'utf8');
  assert.match(css,/font-weight:900/);
  assert.match(css,/display:block/);
  assert.doesNotMatch(css,/createElement\('p'\)/);
  assert.doesNotMatch(css,/innerHTML/);
  assert.match(css,/textContent=normalizeDailyText\(text\)/);
  const cron=fs.readFileSync(path.join(ROOT,'api','daily-announcement-cron.js'),'utf8');
  assert.match(cron,/مقطع واحد متصل فقط/);
  assert.match(cron,/4 إلى 6 رموز إيموجي/);
  assert.match(cron,/String\(draft\.body\)\.replace/);
});

test('standalone preview opens directly, stays purely local and shares daily styling',()=>{
  const page=fs.readFileSync(path.join(ROOT,'daily-announcement-preview.html'),'utf8');
  assert.match(page,/lang="ar" dir="rtl"/);
  assert.match(page,/daily-announcement-presentation\.js/);
  assert.match(page,/renderBody\(body/);
  assert.match(page,/معاينة مستقلة/);
  assert.match(page,/صحتك هي ثروتك الأولى/);
  assert.doesNotMatch(page,/\/api\/|fetch\(|localStorage|create_global_announcement/);
});

test('member no 820469486 remains eligible as an active member, separate from leader login',()=>{
  // No membership-number targeting: every authenticated member is included.
  assert.match(SQL,/public\.app_current_role\(p_token\) <> 'member'/);
  assert.match(SQL,/from public\.global_announcements a/);
  assert.doesNotMatch(SQL,/and\s+(?:u\.|m\.)?member_no\s*=/i);
  assert.match(INDEX,/loadMemberAnnouncements/);
  assert.match(INDEX,/item\.source==='daily_ai'/);
});

test('daily member popup shows real publish time in Baghdad, not a fixed 8 AM claim',()=>{
  const p=require('../daily-announcement-presentation.js');
  assert.equal(typeof p.addPublishTime,'function');
  assert.equal(p.formatBaghdadPublishTime(''), '');
  assert.equal(p.formatBaghdadPublishTime('invalid'), '');
  const formatted=p.formatBaghdadPublishTime('2026-10-19T05:17:00Z');
  assert.match(formatted,/٨|8/);
  assert.match(formatted,/١٧|17/);
  assert.match(INDEX,/addPublishTime\(panel,item\.created_at\)/);
  const script=fs.readFileSync(path.join(ROOT,'daily-announcement-presentation.js'),'utf8');
  assert.match(script,/نُشرت الساعة/);
  assert.match(script,/Asia\/Baghdad/);
  assert.match(script,/if\(!time\)return/);
});
