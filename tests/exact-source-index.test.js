// Regression tests for api/_exact-source-index.js. Run with: npm test
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {selectExactSource}=require('../api/_exact-source-index');

// Same shape as LOCAL_KNOWLEDGE_FLAT in api/ai-agent.js.
function bundledRows(){
  const dir=path.join(__dirname,'..','api','knowledge');
  const rows=[];
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
    const source=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
    for(const page of source.pages||[]){
      const text=String(page?.text||'').trim();
      if(!text)continue;
      rows.push({scope:'global',category:'source_pdf',title:String(source.source||source.slug)+' — الصفحة '+page.page,content:text,priority:140,source:String(source.slug||source.source)});
    }
  }
  return rows;
}

const M1='فنون_الدعوة_ومهارات_الاستقطاب_محمود';
const M2='مهارات_الدعوة_المتقدمة';
const uploaded=(material,unit,content)=>({scope:'global',category:'dxn_pdf_source_exact',title:material+' — '+unit,content,priority:80,source:'uploaded_material:'+material+':uploaded_pdf_exact'});
const BAD_CONTENT='من صور التشويق السيئ (السلبي): نبرة الصوت المنخفضة، الحماس الزائد، الاستجداء، أي كلام عن المنتجات قبل المحاضرة، وأي كلام عن خطة الدخل قبل المحاضرة.';

const LOCAL=bundledRows();
const ROWS=[
  uploaded(M1,'التشويق السيئ (السلبي)',BAD_CONTENT),
  uploaded(M1,'التشويق المباشر','التشويق المباشر:\n• نص M1'),
  uploaded(M2,'التشويق المباشر','التشويق المباشر:\n• نص M2'),
  ...LOCAL
];
const select=(message,allowContentHeadings)=>selectExactSource(message,ROWS,{bundledRows:LOCAL,allowContentHeadings});

test('summary question does not resolve to a heading inside a bundled page',()=>{
  // Production 2026-09-28: answered with training_bag_qna page 2 and the next question's heading.
  const r=select('ما هي أهم النقاط التي تعلمناها عن التشويق في البيع المباشر؟',false);
  assert.equal(r.status,'not_found');
});

test('an explicit quote of an in-page heading stops at the next numbered question',()=>{
  const r=select('ما هي النقاط في البيع المباشر كما وردت في المادة؟',true);
  assert.equal(r.status,'found');
  assert.match(r.answer,/^في البيع المباشر/);
  assert.match(r.answer,/نسبة المخاطرة فيه 0 %$/);
  assert.doesNotMatch(r.answer,/س\/5|الجواب\//);
});

test('a line starting with a word beginning with س is not treated as a numbered question',()=>{
  const r=select('ما هي النقاط في البيع المباشر كما وردت في المادة؟',true);
  assert.match(r.answer,/سيمكنك العمل فيه/);
});

test('verbatim request still returns the uploaded unit by title (PR #48)',()=>{
  const r=select('ما هي أمثلة التشويق السيئ (السلبي) المذكورة في المادة؟ أجب بالنقاط كما وردت في المادة، دون إضافة أمثلة من عندك.',true);
  assert.equal(r.status,'found');
  assert.equal(r.title,M1+' — التشويق السيئ (السلبي)');
  assert.equal(r.answer,BAD_CONTENT);
});

test('list question without a quote request still matches an uploaded unit title',()=>{
  const r=select('ما هي أمثلة التشويق السيئ؟',false);
  assert.equal(r.status,'found');
  assert.equal(r.title,M1+' — التشويق السيئ (السلبي)');
});

test('same unit title in two materials is ambiguous, and a named material breaks the tie',()=>{
  assert.equal(select('ما هي نقاط التشويق المباشر كما وردت؟',true).status,'ambiguous');
  const r=select('ما هي نقاط التشويق المباشر كما وردت في مهارات الدعوة المتقدمة؟',true);
  assert.equal(r.status,'found');
  assert.equal(r.title,M2+' — التشويق المباشر');
});

test('unknown topic is not_found and never falls back to another material',()=>{
  assert.equal(select('ما هي أمثلة التشويق العاطفي كما وردت في المادة؟',true).status,'not_found');
});
