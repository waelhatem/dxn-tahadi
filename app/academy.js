/* V86.74 — Academy: direct browser upload to Cloudflare R2. */
(function(){
  if(window.__DXN_ACADEMY_V1__)return;
  window.__DXN_ACADEMY_V1__=true;
  const API='/api/academy-videos',BANNER='/academy-video-upload-banner.png',MAX=2147483648;
  const TYPES=['video/mp4','video/webm','video/quicktime'];
  const state={episodes:[],selectedIndex:0,watched:loadWatched(),loaded:false,loading:false,loadError:'',saving:false,uploadOpen:false,uploadNote:'اختر فيديو MP4 أو WebM أو MOV من جهازك (حتى 2 GB).'};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function el(id){return document.getElementById(id);}
  function pad(n){return String(n).padStart(2,'0');}
  function leader(){try{return typeof role!=='undefined'&&role==='leader'}catch(_){return false}}
  function token(){try{return String(localStorage.getItem('dxn_session')||'').trim()}catch(_){return ''}}
  function loadWatched(){try{const a=JSON.parse(localStorage.getItem('dxn_academy_watched_v1')||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string'):[]}catch(_){return []}}
  function saveWatched(){try{localStorage.setItem('dxn_academy_watched_v1',JSON.stringify(state.watched))}catch(_){}}
  function idAt(i){return state.episodes[i]?.id||'episode-'+i}
  function isWatched(i){return state.watched.includes(idAt(i))}
  function watchedCount(){return state.episodes.filter((_,i)=>isWatched(i)).length}
  function nextIndex(){return state.episodes.findIndex((_,i)=>!isWatched(i))}
  function countLabel(n){if(!n)return 'لا توجد فيديوهات بعد';if(n===1)return 'فيديو واحد';if(n===2)return 'فيديوهان';return n<=10?n+' فيديوهات':n+' فيديو';}

  async function api(body){
    const t=token();if(!t)throw new Error('سجّل الدخول لعرض فيديوهات الأكاديمية.');
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-DXN-Session':t},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'تعذّر الاتصال بالخادم.');return d;
  }
  function rerender(){if(document.querySelector('.academy-root')&&typeof render==='function')render();}
  function setEpisodes(list){
    state.episodes=(Array.isArray(list)?list:[]).filter(v=>v&&v.title&&v.file_url).map((v,p)=>({id:String(v.id||''),title:String(v.title),section:String(v.section||''),fileUrl:String(v.file_url),contentType:String(v.content_type||''),sortOrder:Number(v.sort_order)||p})).sort((a,b)=>a.sortOrder-b.sortOrder);
    const n=nextIndex();state.selectedIndex=n<0?0:n;rerender();
  }
  async function load(selectId){
    state.loading=true;state.loadError='';rerender();
    try{const d=await api({action:'list'});state.loaded=true;state.loading=false;setEpisodes(d.videos||[]);if(selectId){const i=state.episodes.findIndex(v=>v.id===String(selectId));if(i>=0){state.selectedIndex=i;rerender();}}}
    catch(e){state.loaded=true;state.loading=false;state.loadError=String(e?.message||e);rerender();}
  }
  function header(){
    const total=state.episodes.length,w=watchedCount(),n=nextIndex();
    const label=!total?'الفيديوهات قادمة قريبًا':n<0?'شاهد الجولة من جديد':w?'تابع الجولة: الفيديو '+pad(n+1):'ابدأ من هنا';
    return \`<header class="academy-header"><div class="academy-header-kicker">🎓 أكاديمية المنصة</div><h1 class="academy-header-title">🎥 تعرّف على منصتك</h1><p class="academy-header-text">اكتشف أهم أقسام الموقع وكيفية الاستفادة منها، من خلال فيديوهات قصيرة تشرح كل ميزة خطوة بخطوة.</p><div class="academy-header-actions"><button type="button" class="academy-cta" onclick="academyStart()" ${total?'':'disabled'}>▶ ${label}</button>${total?\`<span class="academy-header-stat">${countLabel(total)} · شاهدت ${w}</span>\`:''}</div></header>\`;
  }
  function tour(){
    const t=state.episodes.length,w=watchedCount(),n=nextIndex(),ratio=t?w/t:0;
    const next=t&&n>=0?\`<div class="academy-next"><span class="academy-next-number">${pad(n+1)}</span><div class="academy-next-text"><div class="academy-next-kicker">الفيديو التالي</div><div class="academy-next-title">${esc(state.episodes[n].title)}</div></div><button type="button" class="academy-next-button" onclick="academySelectEpisode(${n})">شاهد الآن</button></div>\`:'';
    return \`<div class="academy-tour-head"><span class="academy-tour-label">ما استكشفته من المنصة</span><span class="academy-tour-value">${w} من ${t}</span></div><div class="academy-progress" role="progressbar" aria-valuenow="${Math.round(ratio*100)}" aria-valuemin="0" aria-valuemax="100"><span class="academy-progress-fill" style="width:${(ratio*100).toFixed(1)}%"></span></div>${next}\`;
  }
  function stage(){
    const v=state.episodes[state.selectedIndex];if(!v)return \`<div class="academy-screen academy-screen-empty"><div class="academy-screen-icon">▶</div><div class="academy-screen-title">${state.loading?'جارٍ تحميل الفيديوهات…':'لا توجد فيديوهات بعد'}</div><div class="academy-screen-note">${esc(state.loadError||'عند إضافة أول فيديو سيُعرض هنا.')}</div></div>\`;
    const section=v.section?\`<span class="academy-chip">📍 ${esc(v.section)}</span>\`:'';const done=isWatched(state.selectedIndex)?'<span class="academy-chip academy-chip-done">✓ تمت مشاهدته</span>':'';
    return \`<div class="academy-screen" id="academyScreen"><video class="academy-video" id="academyPlayer" controls playsinline preload="metadata" src="${esc(v.fileUrl)}" title="${esc(v.title)}" onended="academyMarkWatched(${state.selectedIndex},true)"></video></div><div class="academy-stage-info"><div class="academy-stage-meta"><span class="academy-chip academy-chip-gold">الفيديو ${pad(state.selectedIndex+1)} من ${pad(state.episodes.length)}</span>${section}${done}</div><h2 class="academy-stage-title">${esc(v.title)}</h2></div><div class="academy-controls"><button type="button" class="academy-control academy-control-prev" onclick="academyStep(-1)" ${state.selectedIndex<=0?'disabled':''}>→ السابق</button><button type="button" class="academy-control academy-control-list" onclick="academyShowList()">☰ كل الفيديوهات</button><button type="button" class="academy-control academy-control-next" onclick="academyStep(1)" ${state.selectedIndex>=state.episodes.length-1?'disabled':''}>الفيديو التالي ←</button></div>\`;
  }
  function library(){
    return \`<section class="academy-library"><div class="academy-library-head"><div><h3 class="academy-library-title">استكشف المزيد</h3><div class="academy-library-sub">كل فيديوهات شرح المنصة</div></div><span class="academy-library-count">${state.episodes.length?countLabel(state.episodes.length):''}</span></div><div class="academy-episodes">${state.episodes.map((v,i)=>\`<button type="button" class="academy-episode${i===state.selectedIndex?' academy-episode-active':''}${isWatched(i)?' academy-episode-watched':''}" onclick="academySelectEpisode(${i})"><div class="academy-episode-thumb"><span class="academy-episode-number">${pad(i+1)}</span></div><div class="academy-episode-body"><div class="academy-episode-title">${esc(v.title)}</div>${v.section?\`<div class="academy-episode-section">📍 ${esc(v.section)}</div>\`:''}<span class="academy-episode-status ${isWatched(i)?'academy-status-done':'academy-status-todo'}">${isWatched(i)?'✓ تمت مشاهدته':'جديد'}</span></div></button>\`).join('')}</div></section>\`;
  }
  function uploadZone(){
    if(!leader())return '';
    return \`<section class="academy-studio"><div class="academy-studio-head"><div><div class="academy-studio-title">👑 إضافة فيديو شرح</div><div class="academy-studio-sub">للقائد فقط · الرفع مباشر إلى R2</div></div><button type="button" class="academy-upload-button" onclick="academyToggleUpload()">＋ رفع فيديو جديد</button></div><button type="button" class="academy-studio-banner" onclick="academyToggleUpload()"><img class="academy-studio-image" src="${BANNER}" alt="" width="1983" height="793" loading="lazy"></button><div class="academy-upload-panel" id="academyUploadPanel"${state.uploadOpen?'':' hidden'}><label class="academy-field"><span>عنوان الفيديو</span><input type="text" id="academyUploadTitle" maxlength="160" placeholder="مثال: كيف تستخدم المركز الذكي"></label><label class="academy-field"><span>القسم الذي يشرحه (اختياري)</span><input type="text" id="academyUploadSection" maxlength="80"></label><label class="academy-field"><span>ملف الفيديو</span><input type="file" id="academyUploadFile" accept="video/mp4,video/webm,video/quicktime"></label><div class="academy-upload-actions"><button type="button" class="academy-upload-submit" id="academyUploadSubmit" onclick="academySubmitUpload()">رفع ونشر الفيديو</button><button type="button" class="academy-upload-cancel" onclick="academyToggleUpload()">إلغاء</button></div><div class="academy-upload-note" id="academyUploadNote">${esc(state.uploadNote)}</div></div></section>\`;
  }
  window.academyPage=function(){if(!state.loaded&&!state.loading){state.loading=true;setTimeout(load,0)}return \`<div class="academy-root">${header()}<section class="academy-tour">${tour()}</section>${uploadZone()}<section class="academy-stage" id="academyStage">${stage()}</section>${library()}</div>\`;};
  window.academySelectEpisode=function(i){if(Number.isInteger(i)&&i>=0&&i<state.episodes.length){state.selectedIndex=i;rerender();document.getElementById('academyStage')?.scrollIntoView({behavior:'smooth',block:'start'});}};
  window.academyStep=function(d){academySelectEpisode(state.selectedIndex+d);};
  window.academyStart=function(){const n=nextIndex();academySelectEpisode(n<0?0:n);};
  window.academyShowList=function(){document.querySelector('.academy-library')?.scrollIntoView({behavior:'smooth',block:'start'});};
  window.academyMarkWatched=function(i,ended){if(i<0||i>=state.episodes.length)return;const id=idAt(i);if(!state.watched.includes(id)){state.watched=[...state.watched,id];saveWatched();rerender();}if(ended&&i+1<state.episodes.length)academySelectEpisode(i+1);};
  window.academyReloadVideos=function(){load();};
  window.academyToggleUpload=function(){if(!leader())return;state.uploadOpen=!state.uploadOpen;const p=el('academyUploadPanel');if(p)p.hidden=!state.uploadOpen;};
  function note(v){state.uploadNote=v;const n=el('academyUploadNote');if(n)n.textContent=v;}
  window.academySubmitUpload=async function(){
    if(!leader()||state.saving)return;const b=el('academyUploadSubmit'),f=el('academyUploadFile')?.files?.[0],title=String(el('academyUploadTitle')?.value||'').trim(),section=String(el('academyUploadSection')?.value||'').trim();
    if(!title)return note('اكتب عنوان الفيديو أولًا.');if(!f)return note('اختر ملف الفيديو أولًا.');if(!TYPES.includes(f.type))return note('نوع الفيديو غير مدعوم. استخدم MP4 أو WebM أو MOV.');if(f.size<=0||f.size>MAX)return note('حجم الفيديو يجب أن يكون أكبر من صفر ولا يتجاوز 2 GB.');
    state.saving=true;if(b)b.disabled=true;note('جارٍ تجهيز رابط الرفع…');
    try{const p=await api({action:'prepare',title,section,file_size:f.size,content_type:f.type});note('جارٍ رفع الفيديو مباشرة إلى التخزين…');const r=await fetch(p.upload_url,{method:'PUT',headers:{'Content-Type':p.content_type},body:f});if(!r.ok)throw new Error('فشل رفع الفيديو إلى التخزين.');note('تم الرفع. جارٍ التحقق من الملف قبل النشر…');const c=await api({action:'complete',id:p.id,file_size:f.size,content_type:f.type});state.uploadOpen=false;state.uploadNote='تم رفع الفيديو والتحقق منه ونشره بنجاح.';await load(c.video.id);}catch(e){note(String(e?.message||e));}finally{state.saving=false;const x=el('academyUploadSubmit');if(x)x.disabled=false;}
  };
})();