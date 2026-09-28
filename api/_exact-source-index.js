// Deterministic source selection for verbatim training-material requests
// ("كما ورد", "دون إضافة", "أجب بالنقاط"...).
//
// A source is chosen by the identity of its unit title (or a heading inside
// the source text), never by counting shared words. Generic vocabulary such as
// "المادة" or "دون" therefore cannot make an unrelated source (for example a
// bundled PRO GO page) win. When the title is not found, or is found in more
// than one place, the caller receives that status instead of a guess.
//
// The underscore prefix keeps Vercel from exposing this file as an endpoint.

const EXACT_SOURCE_CATEGORY=/^(?:dxn_pdf_source_exact|uploaded_image_exact|source_pdf|dxn_marketing_plan_full)$/i;
const UPLOADED_EXACT_CATEGORY=/^(?:dxn_pdf_source_exact|uploaded_image_exact)$/i;
const UPLOADED_SOURCE_PREFIX='uploaded_material:';
const TITLE_SEPARATOR=/\s+[—–]\s+/;

const MAX_HEADING_CHARS=90;
const MAX_HEADING_WORDS=9;
const MIN_SINGLE_WORD_TITLE_CHARS=5;
const MAX_AMBIGUITY_OPTIONS=6;

// Origin tiers are an authority order, not a score: an uploaded exact source
// outranks other stored sources, which outrank the files bundled with the code.
const ORIGIN_UPLOADED=0;
const ORIGIN_STORED=1;
const ORIGIN_BUNDLED=2;

const KIND_TITLE=0;
const KIND_CONTENT=1;

// Words that never identify a unit on their own (all stored normalized).
const GENERIC_HEADING_WORDS=new Set([
  'الصفحه','صفحه','page','قسم','القسم','الفصل','فصل','الوحده','وحده','الجزء','جزء','رقم',
  'مقدمه','المقدمه','خلاصه','الخلاصه','ملخص','الملخص','تمهيد','تعريف','التعريف',
  'امثله','الامثله','مثال','المثال','شروط','الشروط','خطوات','الخطوات','نقاط','النقاط',
  'عناصر','العناصر','ملاحظات','ملاحظه','تمارين','تمرين','اسئله','الاسئله','اجوبه','الاجوبه',
  'الاول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر',
  'الاولي','الثانيه','الثالثه','الرابعه','الخامسه','السادسه','السابعه','الثامنه','التاسعه','العاشره',
  // Structural nouns that only name a position ("الخطوة الأولى", "القاعدة الثانية").
  'الخطوه','خطوه','المرحله','مرحله','القاعده','قاعده','النقطه','نقطه','الدرس','درس','المحور','محور'
]);

// Lead-in words that often end a heading line ("... كالتالي:") without being part of its identity.
const TRAILING_FILLER_WORDS=new Set(['كالتالي','كالاتي','الاتي','التالي','التاليه','وهي','هي','وهو','هو','منها']);

const ARABIC_INDIC_DIGITS=/[٠-٩]/g;

function normalizeArabic(text){
  return String(text||'')
    .toLowerCase()
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g,'')
    .replace(/ـ/g,'')
    .replace(ARABIC_INDIC_DIGITS,d=>String(d.charCodeAt(0)-0x0660))
    .replace(/[أإآٱ]/g,'ا')
    .replace(/[ئؤ]/g,'ء')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim();
}

function wordsOf(normalized){
  return normalized?normalized.split(' '):[];
}

function containsPhrase(normalizedText,normalizedPhrase){
  if(!normalizedPhrase)return false;
  return (' '+normalizedText+' ').includes(' '+normalizedPhrase+' ');
}

function stripTrailingFiller(words){
  const out=words.slice();
  while(out.length>1 && TRAILING_FILLER_WORDS.has(out[out.length-1]))out.pop();
  return out;
}

function isGenericHeading(words){
  return words.every(w=>GENERIC_HEADING_WORDS.has(w)||/^\d+$/.test(w));
}

function cleanHeadingLine(line){
  return String(line||'')
    .trim()
    .replace(/^(?:[#*•●▪\-–—]+\s*|\d+\s*[-.)(]\s*)/,'')
    .replace(/\s*[:：]\s*$/,'')
    .trim();
}

// "التشويق السيئ (السلبي)" is indexed as the full title, the title without the
// parenthesis, and the parenthesis as a synonym of the last word.
function headingVariants(rawHeading){
  const raw=String(rawHeading||'');
  const variants=new Set();
  const full=wordsOf(normalizeArabic(raw));
  const outside=wordsOf(normalizeArabic(raw.replace(/\([^)]*\)/g,' ')));
  variants.add(stripTrailingFiller(full).join(' '));
  variants.add(stripTrailingFiller(outside).join(' '));
  const inside=[...raw.matchAll(/\(([^)]*)\)/g)].map(m=>wordsOf(normalizeArabic(m[1])));
  for(const words of inside){
    if(words.length===1 && outside.length>=2){
      variants.add([...outside.slice(0,-1),words[0]].join(' '));
    }
  }
  return [...variants].filter(Boolean);
}

function acceptHeading(variant,kind){
  const words=wordsOf(variant);
  if(!words.length || words.length>MAX_HEADING_WORDS || variant.length>MAX_HEADING_CHARS)return false;
  if(isGenericHeading(words))return false;
  if(words.length===1){
    return kind===KIND_TITLE && variant.length>=MIN_SINGLE_WORD_TITLE_CHARS;
  }
  return true;
}

function sourceOrigin(row,bundledRows){
  if(bundledRows.has(row))return ORIGIN_BUNDLED;
  const category=String(row?.category||'');
  const source=String(row?.source||'').toLowerCase();
  if(UPLOADED_EXACT_CATEGORY.test(category)||source.startsWith(UPLOADED_SOURCE_PREFIX))return ORIGIN_UPLOADED;
  return ORIGIN_STORED;
}

function contentHeadings(content){
  const lines=String(content||'').split(/\r?\n/);
  const out=[];
  lines.forEach((line,index)=>{
    const trimmed=line.trim();
    if(!/[:：]$/.test(trimmed) && !/^#/.test(trimmed))return;
    const heading=cleanHeadingLine(trimmed);
    if(heading && heading.length<=MAX_HEADING_CHARS)out.push({heading,line:index});
  });
  return out;
}

function buildEntry(row,origin){
  const segments=String(row?.title||'').split(TITLE_SEPARATOR).map(x=>x.trim()).filter(Boolean);
  const material=segments[0]||String(row?.source||'مادة تدريبية');
  const headings=[];
  const addHeading=(raw,kind,line)=>{
    for(const variant of headingVariants(raw)){
      if(acceptHeading(variant,kind))headings.push({raw,variant,words:wordsOf(variant).length,kind,line});
    }
  };
  // Bundled titles are "book — author — page N": they name the material, not a unit.
  if(origin!==ORIGIN_BUNDLED){
    const units=segments.length>1?segments.slice(1):segments;
    units.forEach(unit=>addHeading(unit,KIND_TITLE,null));
  }
  contentHeadings(row?.content).forEach(h=>addHeading(h.heading,KIND_CONTENT,h.line));
  return {row,origin,material,normalizedMaterial:normalizeArabic(material),headings};
}

const entryCache=new WeakMap();

function entryFor(row,bundledRows){
  const cached=entryCache.get(row);
  if(cached)return cached;
  const entry=buildEntry(row,sourceOrigin(row,bundledRows));
  entryCache.set(row,entry);
  return entry;
}

// The same stored row can arrive twice: once from the search RPC (without its
// source column) and once from the full knowledge load. Keep one copy.
function uniqueSourceRows(rows){
  const byKey=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    if(!EXACT_SOURCE_CATEGORY.test(String(row?.category||'')) || !String(row?.content||'').trim())continue;
    const key=normalizeArabic(row.title)+'|'+normalizeArabic(row.content).slice(0,300);
    const existing=byKey.get(key);
    if(!existing || (!existing.source && row.source))byKey.set(key,row);
  }
  return [...byKey.values()];
}

function materialPhrases(entry){
  const words=wordsOf(entry.normalizedMaterial);
  const phrases=[entry.normalizedMaterial];
  if(words.length>2 && !isGenericHeading(words.slice(0,2)))phrases.push(words.slice(0,2).join(' '));
  return phrases.filter(Boolean);
}

function namedMaterialPhrases(normalizedQuestion,entries){
  const phrases=new Set();
  for(const entry of entries){
    for(const phrase of materialPhrases(entry)){
      if(containsPhrase(normalizedQuestion,phrase))phrases.add(phrase);
    }
  }
  return [...phrases];
}

function isMaterialNamed(normalizedQuestion,entry){
  return materialPhrases(entry).some(p=>containsPhrase(normalizedQuestion,p));
}

// A heading that is only part of a material name the question mentions
// ("... في نظام البيع المباشر") is the material reference, not the topic.
// It is set aside only when another heading also matched.
function withoutMaterialNameHeadings(matches,namedPhrases){
  if(!namedPhrases.length)return matches;
  const topical=matches.filter(m=>!namedPhrases.some(p=>containsPhrase(p,m.heading.variant)));
  return topical.length?topical:matches;
}

// The material name never narrows the search; it only breaks a tie between
// equally ranked matches from different records.
function breakTieByNamedMaterial(normalizedQuestion,top){
  const named=top.filter(m=>isMaterialNamed(normalizedQuestion,m.entry));
  return named.length?named:top;
}

function collectMatches(normalizedQuestion,entries){
  const matches=[];
  for(const entry of entries){
    for(const heading of entry.headings){
      if(containsPhrase(normalizedQuestion,heading.variant))matches.push({entry,heading});
    }
  }
  return matches;
}

// Most specific first: the longest matching title, then a unit title over a
// heading inside the text, then the origin authority tier.
function compareMatches(a,b){
  return b.heading.words-a.heading.words ||
    a.heading.kind-b.heading.kind ||
    a.entry.origin-b.entry.origin;
}

function blockFromHeading(content,line){
  const lines=String(content||'').split(/\r?\n/);
  const headingLines=new Set(contentHeadings(content).map(h=>h.line));
  let end=lines.length;
  for(let i=line+1;i<lines.length;i++){
    if(headingLines.has(i)){end=i;break;}
  }
  return lines.slice(line,end).join('\n').trim();
}

function answerFromMatch(match){
  const content=String(match.entry.row?.content||'').trim();
  if(match.heading.kind===KIND_TITLE)return content;
  return blockFromHeading(content,match.heading.line)||content;
}

function ambiguityOptions(matches){
  const seen=new Set();
  const options=[];
  for(const m of matches){
    const heading=cleanHeadingLine(m.heading.raw);
    const label=m.entry.material+' — '+heading;
    if(seen.has(label))continue;
    seen.add(label);
    options.push({material:m.entry.material,heading,title:m.entry.row?.title||null});
    if(options.length>=MAX_AMBIGUITY_OPTIONS)break;
  }
  return options;
}

// Returns {status:'found',row,title,heading,answer}
//       | {status:'ambiguous',options}
//       | {status:'not_found'}
function selectExactSource(message,rows,{bundledRows=[]}={}){
  const bundled=new Set(bundledRows);
  const entries=uniqueSourceRows(rows).map(row=>entryFor(row,bundled));
  const question=normalizeArabic(message);
  const namedPhrases=namedMaterialPhrases(question,entries);
  const matches=withoutMaterialNameHeadings(collectMatches(question,entries),namedPhrases).sort(compareMatches);
  if(!matches.length)return {status:'not_found'};

  let top=matches.filter(m=>compareMatches(m,matches[0])===0);
  if(new Set(top.map(m=>m.entry.row)).size>1)top=breakTieByNamedMaterial(question,top);
  if(new Set(top.map(m=>m.entry.row)).size>1)return {status:'ambiguous',options:ambiguityOptions(top)};

  const best=top[0];
  return {
    status:'found',
    row:best.entry.row,
    title:best.entry.row?.title||null,
    heading:cleanHeadingLine(best.heading.raw),
    answer:answerFromMatch(best)
  };
}

module.exports={normalizeArabic,headingVariants,selectExactSource};
