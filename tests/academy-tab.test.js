// Regression tests for the «🎓 أكاديمية المنصة» tab, a plain library of YouTube videos
// that show members how to use the platform: the tab is wired in after «🚀 المركز الذكي»
// without breaking the other tabs, its CSS/JS stay isolated under academy- names, it
// keeps the site's identity, stays free of cinematic effects, plays videos inside the
// academy, and only leaders see the add-video form.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ROOT=path.join(__dirname,'..');
const INDEX=fs.readFileSync(path.join(ROOT,'app','index.html'),'utf8');
const ACADEMY_JS=fs.readFileSync(path.join(ROOT,'app','academy.js'),'utf8');
const ACADEMY_CSS=fs.readFileSync(path.join(ROOT,'app','academy.css'),'utf8');
const EXISTING_TABS=['home','notifications','ch','teams','path','progress','training','community','advanced','leader'];

function renderAcademy(role,episodes){
  const context={role,console,URL};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(ACADEMY_JS,context);
  if(episodes)context.academySetEpisodes(episodes);
  return {html:context.academyPage(),context};
}

// Rows as returned by /api/academy-videos (published only).
const SAMPLE_VIDEOS=[
  {id:'v2',title:'كيف تستخدم المركز الذكي',section:'المركز الذكي',youtube_id:'dQw4w9WgXcQ',youtube_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',sort_order:2},
  {id:'v1',title:'المقدمة',section:'جولة في المنصة',youtube_id:'qcwkRlsYsIg',youtube_url:'https://www.youtube.com/watch?v=qcwkRlsYsIg',sort_order:1},
  {id:'v3',title:'كيفية استخدام المجتمع',section:'',youtube_id:'aaaaaaaaaaa',youtube_url:'https://www.youtube.com/watch?v=aaaaaaaaaaa',sort_order:3}
];

test('academy tab button comes right after the smart center tab',()=>{
  assert.match(INDEX,/onclick="switchTab\('advanced'\)">🚀 المركز الذكي<\/button><button class="tab academy-tab \$\{tab==='academy'\?'active':''\}" onclick="switchTab\('academy'\)">🎓 أكاديمية المنصة<\/button><button class="tab community-tab/);
});

test('render dispatch keeps every existing tab and routes academy before the leader fallback',()=>{
  const chain=(INDEX.match(/html\+=tab==='home'\?home\(\):[^;]*;/)||[''])[0];
  assert.ok(chain,'dispatch chain not found');
  for(const t of ['home','notifications','ch','teams','path','progress','training','community','advanced'])assert.match(chain,new RegExp(`tab==='${t}'`));
  assert.match(chain,/tab==='advanced'\?advancedCenter\(\):tab==='academy'\?\(typeof academyPage==='function'\?academyPage\(\):''\):leader\(\);$/);
});

test('saved UI state accepts the academy tab and still accepts every existing tab',()=>{
  const list=(INDEX.match(/if\(x\.tab && \[([^\]]*)\]\.includes\(x\.tab\)\)/)||[])[1];
  assert.ok(list,'tab whitelist not found');
  for(const t of [...EXISTING_TABS,'academy'])assert.ok(list.includes(`'${t}'`),`${t} missing`);
});

test('academy assets are loaded once, after config.js, with the new version',()=>{
  assert.equal((INDEX.match(/<link rel="stylesheet" href="\.\/academy\.css\?v=2">/g)||[]).length,1);
  assert.equal((INDEX.match(/<script src="academy\.js\?v=2"><\/script>/g)||[]).length,1);
  assert.ok(INDEX.indexOf('config.js?v=86.44.7')<INDEX.indexOf('academy.js?v=2'));
});

test('every academy CSS selector and keyframe is isolated under academy-',()=>{
  const noComments=ACADEMY_CSS.replace(/\/\*[\s\S]*?\*\//g,'');
  const keyframes=[...noComments.matchAll(/@keyframes\s+([\w-]+)/g)].map(m=>m[1]);
  assert.ok(keyframes.length>0);
  for(const name of keyframes)assert.match(name,/^academy-/,`keyframe not isolated: ${name}`);
  const css=noComments.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,'').replace(/@(media|supports)[^{]*\{/g,'');
  const selectors=[...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m=>m[1].trim()).filter(Boolean);
  assert.ok(selectors.length>20);
  for(const group of selectors){
    for(const sel of group.split(',')){
      assert.match(sel.trim(),/^\.academy-/,`not isolated: ${sel.trim()}`);
    }
  }
});

test('academy script only adds academy-prefixed globals',()=>{
  const {context}=renderAcademy('member');
  const added=Object.keys(context).filter(k=>!['role','console','window','URL'].includes(k));
  assert.ok(added.length>0);
  for(const k of added)assert.match(k,/^(academy|__DXN_ACADEMY_)/,`unexpected global ${k}`);
});

test('member sees the platform videos without the add-video form',()=>{
  const {html}=renderAcademy('member',SAMPLE_VIDEOS);
  assert.match(html,/academy-root/);
  assert.match(html,/academy-header/);
  assert.match(html,/academy-stage/);
  assert.match(html,/academy-tour/);
  assert.match(html,/academy-library/);
  assert.match(html,/🎥 تعرّف على منصتك/);
  assert.doesNotMatch(html,/رفع فيديو جديد|academyUploadPanel|academyUploadUrl/);
});

test('leader sees the add-video form with title, section and YouTube link, plus the approved banner',()=>{
  const {html}=renderAcademy('leader');
  assert.match(html,/＋ رفع فيديو جديد/);
  assert.match(html,/id="academyUploadPanel" hidden/);
  assert.match(html,/id="academyUploadTitle"/);
  assert.match(html,/id="academyUploadSection"/);
  assert.match(html,/<input type="url" id="academyUploadUrl"/);
  assert.doesNotMatch(html,/type="file"/);
  assert.equal((html.match(/<img /g)||[]).length,1,'only the banner image');
  assert.match(html,/src="\/academy-video-upload-banner\.png"/);
  assert.ok(fs.existsSync(path.join(ROOT,'academy-video-upload-banner.png')),'banner image missing from repository root');
});

test('the academy only calls its own API and never Supabase or Storage directly',()=>{
  const fetches=[...ACADEMY_JS.matchAll(/fetch\(([^,)]+)/g)].map(m=>m[1].trim());
  assert.deepEqual(fetches,['ACADEMY_API']);
  assert.match(ACADEMY_JS,/const ACADEMY_API='\/api\/academy-videos';/);
  assert.doesNotMatch(ACADEMY_JS,/XMLHttpRequest|supabase|storage\.from|\/api\/rpc|signedUrl/i);
  assert.match(ACADEMY_JS,/'X-DXN-Session':token/);
});

test('empty academy keeps navigation disabled except the video list',()=>{
  const {html}=renderAcademy('member');
  assert.match(html,/academy-control-prev"[^>]*disabled/);
  assert.match(html,/academy-control-next"[^>]*disabled/);
  assert.doesNotMatch(html,/academy-control-list"[^>]*disabled/);
  assert.match(html,/الفيديوهات قادمة قريبًا/);
});

test('published videos appear in the list in sort_order',()=>{
  const {html}=renderAcademy('member',SAMPLE_VIDEOS);
  const titles=[...html.matchAll(/<div class="academy-episode-title">([^<]*)<\/div>/g)].map(m=>m[1]);
  assert.deepEqual(titles,['المقدمة','كيف تستخدم المركز الذكي','كيفية استخدام المجتمع']);
  assert.match(html,/academy-episode academy-episode-active" data-academy-index="0"/);
  assert.match(html,/الفيديو 01 من 03/);
  assert.match(html,/📍 جولة في المنصة/);
  assert.match(html,/▶ يُعرض الآن/);
  assert.match(html,/academy-control-prev"[^>]*disabled/);
  assert.doesNotMatch(html,/academy-control-next"[^>]*disabled/);
  assert.match(html,/academy-tour-value">0 من 3/);
});

test('the selected video plays inside the academy through the YouTube embed, without autoplay',()=>{
  const {html}=renderAcademy('member',SAMPLE_VIDEOS);
  const frame=(html.match(/<iframe[^>]*>/)||[''])[0];
  assert.ok(frame,'no embedded player');
  assert.match(frame,/src="https:\/\/www\.youtube-nocookie\.com\/embed\/qcwkRlsYsIg\?rel=0&amp;playsinline=1&amp;enablejsapi=1"/);
  assert.match(frame,/allowfullscreen/);
  assert.doesNotMatch(frame,/autoplay=1/);
  assert.equal((html.match(/<iframe/g)||[]).length,1,'only the selected video is embedded');
  assert.doesNotMatch(ACADEMY_JS,/window\.open|target="_blank"|autoplay=1/);
});

test('videos without a valid YouTube id are dropped',()=>{
  const {html}=renderAcademy('member',[
    {id:'x',title:'bad id',youtube_id:'short'},
    {id:'y',title:'script',youtube_id:'javascript:1'},
    {id:'z',title:'ok',youtube_id:'qcwkRlsYsIg',sort_order:1}
  ]);
  assert.equal((html.match(/data-academy-index="/g)||[]).length,1);
  assert.doesNotMatch(html,/javascript:/);
});

test('watched videos advance the progress and point to the next video (localStorage watch status)',()=>{
  const {context}=renderAcademy('member',SAMPLE_VIDEOS);
  context.academyMarkWatched(0,false);
  const html=context.academyPage();
  assert.match(html,/academy-tour-value">1 من 3/);
  assert.match(html,/width:33\.3%/);
  assert.match(html,/الفيديو التالي<\/div><div class="academy-next-title">كيف تستخدم المركز الذكي/);
  assert.match(html,/تابع الجولة: الفيديو 02/);
  assert.match(ACADEMY_JS,/const ACADEMY_WATCHED_KEY='dxn_academy_watched_v1';/);
});

test('the browser pre-check extracts YouTube ids like the server',()=>{
  const {context}=renderAcademy('member');
  const {parseYouTubeId}=require('../api/_academy-youtube');
  const cases=[
    ['https://www.youtube.com/watch?v=qcwkRlsYsIg','qcwkRlsYsIg'],
    ['https://youtu.be/qcwkRlsYsIg','qcwkRlsYsIg'],
    ['https://youtu.be/qcwkRlsYsIg?si=abc123','qcwkRlsYsIg'],
    ['youtube.com/watch?v=qcwkRlsYsIg&t=30s','qcwkRlsYsIg'],
    ['https://m.youtube.com/watch?feature=share&v=qcwkRlsYsIg','qcwkRlsYsIg'],
    ['https://vimeo.com/123','']
  ];
  for(const [input,expected] of cases){
    assert.equal(context.academyYouTubeId(input),expected,input);
    assert.equal(parseYouTubeId(input),expected,input);
  }
});

test('academy reuses the site palette instead of defining its own',()=>{
  for(const name of ['green','green2','gold','text','muted','line','card'])assert.ok(ACADEMY_CSS.includes(`var(--${name},`),`site variable --${name} not reused`);
  const site=INDEX.toLowerCase();
  const css=ACADEMY_CSS.toLowerCase();
  const hex=[...new Set(css.match(/#[0-9a-f]{3,8}\b/g)||[])];
  for(const h of hex)assert.ok(site.includes(h),`colour ${h} is not used anywhere in the site`);
  const rgba=[...new Set(css.match(/rgba\(\d+,\d+,\d+/g)||[])].filter(r=>!/rgba\((0,0,0|255,255,255)/.test(r));
  for(const r of rgba)assert.ok(site.includes(r),`colour ${r}) is not used anywhere in the site`);
});

test('academy wording presents a platform tour, not a course',()=>{
  const {html:memberEmpty}=renderAcademy('member');
  const {html:leaderFull}=renderAcademy('leader',SAMPLE_VIDEOS);
  const text=ACADEMY_JS+memberEmpty+leaderFull;
  const courseTerms=['درس','دروس','تدريب','تعليمي','تعلّم','تعلم','اختبار','دورة','حلقة','حلقات','إكمال','مكتملة','تقدّم','تقدمك','رحلة'];
  // Whole words only (optionally after «ال»), so e.g. «المرحلة» does not count as «رحلة».
  for(const term of courseTerms){
    const word=new RegExp(`(^|[^\\u0600-\\u06FF]|ال)${term}`);
    assert.doesNotMatch(text,word,`course wording found: ${term}`);
  }
});

test('academy stays a plain section: no cinematic effects',()=>{
  const code=ACADEMY_JS+ACADEMY_CSS;
  assert.doesNotMatch(code,/startViewTransition|view-transition|animation-timeline|scroll\(root\)|parallax|perspective|filter:\s*blur/i);
  assert.doesNotMatch(ACADEMY_CSS,/scale\(/,'nothing is scaled');
  assert.doesNotMatch(ACADEMY_CSS,/academy-hero|academy-aurora|academy-beam/);
});

test('switching videos fades the old one out before the new one fades in',()=>{
  assert.match(ACADEMY_CSS,/\.academy-stage>\*\{transition:opacity \.16s ease\}/);
  assert.match(ACADEMY_CSS,/\.academy-stage-fading>\*\{opacity:0\}/);
  assert.match(ACADEMY_JS,/stage\.classList\.add\('academy-stage-fading'\);\s*academyState\.fadeTimer=setTimeout\(apply,ACADEMY_FADE_MS\);/);
});

test('the loading bar is clear and the error note never overlaps the next-video card',()=>{
  assert.match(ACADEMY_JS,/academy-screen-loader-label">جارٍ تحميل الفيديو…/);
  assert.match(ACADEMY_CSS,/\.academy-screen-loader-bar\{position:relative;height:5px/);
  assert.match(ACADEMY_CSS,/\.academy-screen-ended \.academy-screen-error-note,\.academy-screen-ended \.academy-screen-loader\{display:none\}/);
  const upnextZ=Number((ACADEMY_CSS.match(/\.academy-upnext\{[^}]*z-index:(\d+)/)||[])[1]);
  const errorZ=Number((ACADEMY_CSS.match(/\.academy-screen-error-note\{[^}]*z-index:(\d+)/)||[])[1]);
  assert.ok(upnextZ>errorZ,'next-video card must sit above the error note');
});

test('the next video never plays automatically',()=>{
  assert.doesNotMatch(ACADEMY_JS,/autoplay/i);
  const showUpNext=(ACADEMY_JS.match(/function academyShowUpNext\(index\)\{[\s\S]*?\n  \}/)||[''])[0];
  assert.ok(showUpNext,'academyShowUpNext not found');
  assert.doesNotMatch(showUpNext,/setTimeout|academySwapStage|playVideo/);
  assert.match(showUpNext,/▶ شاهد الآن/);
  assert.match(showUpNext,/↺ إعادة/);
  // Only the replay button sends playVideo to the embedded player.
  assert.equal((ACADEMY_JS.match(/'playVideo'/g)||[]).length,1);
  assert.match(ACADEMY_JS,/window\.academyReplay=function\(\)\{[\s\S]*?'playVideo'/);
});

test('player messages are only trusted from YouTube and from our own player',()=>{
  assert.match(ACADEMY_JS,/const ACADEMY_YOUTUBE_ORIGINS=\['https:\/\/www\.youtube-nocookie\.com','https:\/\/www\.youtube\.com'\];/);
  assert.match(ACADEMY_JS,/if\(!ACADEMY_YOUTUBE_ORIGINS\.includes\(event\.origin\)\)return;/);
  assert.match(ACADEMY_JS,/if\(!player\|\|event\.source!==player\.contentWindow\)return;/);
});

test('academy styles respect reduced motion',()=>{
  assert.match(ACADEMY_CSS,/@media \(prefers-reduced-motion:reduce\)\{\s*\.academy-root \*\{animation:none!important;transition:none!important\}/);
  assert.match(ACADEMY_JS,/if\(academyReducedMotion\(\)\)\{apply\(\);return;\}/);
});
