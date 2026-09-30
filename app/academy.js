/* V86.72 — «🎓 أكاديمية المنصة»: a clear library of videos that explain how to use the
   platform, styled as a native section of the site (no cinematic effects).
   UI only: no Storage upload and no network call in this phase. Every global name
   starts with academy so nothing collides with the other tabs. Switching videos
   updates the academy in place (a short sequential fade) instead of calling the
   app-wide render(). Nothing ever plays the next video automatically. */
(function(){
  if(window.__DXN_ACADEMY_V1__)return;
  window.__DXN_ACADEMY_V1__=true;

  const ACADEMY_BANNER_SRC='/academy-video-upload-banner.png';
  const ACADEMY_WATCHED_KEY='dxn_academy_watched_v1';
  const ACADEMY_WATCHED_RATIO=0.9;
  const ACADEMY_FADE_MS=160;
  const ACADEMY_URL_PATTERN=/^(https:\/\/|\/)[^\s"'()<>\\]*$/;

  // Videos are supplied through academySetEpisodes(); the database source is added
  // in a later phase, so the page shows its empty state until then.
  const academyState={episodes:[],selectedIndex:0,watched:academyLoadWatched(),fadeTimer:0};

  function academyEscape(value){
    return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function academySafeUrl(value){
    const url=String(value||'').trim();
    return ACADEMY_URL_PATTERN.test(url)?url:'';
  }

  function academyPad(n){
    return String(n).padStart(2,'0');
  }

  function academyCountLabel(n){
    if(n===0)return 'لا توجد فيديوهات بعد';
    if(n===1)return 'فيديو واحد';
    if(n===2)return 'فيديوهان';
    return n<=10?`${n} فيديوهات`:`${n} فيديو`;
  }

  function academyIsLeader(){
    try{return typeof role!=='undefined'&&role==='leader'}catch(_){return false}
  }

  function academyEl(id){
    return typeof document!=='undefined'?document.getElementById(id):null;
  }

  function academyReducedMotion(){
    try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(_){return false}
  }

  // Watch status is a per-device convenience kept in localStorage; it never leaves
  // the browser.
  function academyLoadWatched(){
    try{
      const list=JSON.parse(localStorage.getItem(ACADEMY_WATCHED_KEY)||'[]');
      return Array.isArray(list)?list.filter(id=>typeof id==='string'):[];
    }catch(_){return []}
  }

  function academySaveWatched(){
    try{localStorage.setItem(ACADEMY_WATCHED_KEY,JSON.stringify(academyState.watched))}catch(_){}
  }

  function academyEpisodeId(index){
    const episode=academyState.episodes[index];
    return episode&&episode.id?String(episode.id):`episode-${index}`;
  }

  function academyIsWatched(index){
    return academyState.watched.includes(academyEpisodeId(index));
  }

  function academyWatchedCount(){
    return academyState.episodes.filter((_,index)=>academyIsWatched(index)).length;
  }

  function academyNextIndex(){
    return academyState.episodes.findIndex((_,index)=>!academyIsWatched(index));
  }

  function academyStatus(index){
    if(index===academyState.selectedIndex)return {cls:'academy-status-now',label:'▶ يُعرض الآن'};
    if(academyIsWatched(index))return {cls:'academy-status-done',label:'✓ تمت مشاهدته'};
    if(index===academyNextIndex())return {cls:'academy-status-next',label:'التالي'};
    return {cls:'academy-status-todo',label:'جديد'};
  }

  function academyHeaderActions(){
    const total=academyState.episodes.length;
    const watched=academyWatchedCount();
    const next=academyNextIndex();
    let label='ابدأ من هنا';
    if(!total)label='الفيديوهات قادمة قريبًا';
    else if(next<0)label='شاهد الجولة من جديد';
    else if(watched)label=`تابع الجولة: الفيديو ${academyPad(next+1)}`;
    const stat=total?`${academyCountLabel(total)} · شاهدت ${watched}`:'';
    return `<button type="button" class="academy-cta" onclick="academyStart()"${total?'':' disabled'}>▶ ${label}</button>
      ${stat?`<span class="academy-header-stat">${stat}</span>`:''}`;
  }

  function academyHeader(){
    return `<header class="academy-header">
      <div class="academy-header-kicker">🎓 أكاديمية المنصة</div>
      <h1 class="academy-header-title">🎥 تعرّف على منصتك</h1>
      <p class="academy-header-text">اكتشف أهم أقسام الموقع وكيفية الاستفادة منها، من خلال فيديوهات قصيرة تشرح كل ميزة خطوة بخطوة.</p>
      <div class="academy-header-actions" id="academyHeaderActions">${academyHeaderActions()}</div>
    </header>`;
  }

  function academyUpNextCard(){
    const total=academyState.episodes.length;
    const next=academyNextIndex();
    if(!total)return `<div class="academy-next academy-next-muted"><div class="academy-next-text"><div class="academy-next-kicker">ابدأ من هنا</div><div class="academy-next-title">ستظهر هنا فيديوهات شرح المنصة فور إضافتها.</div></div></div>`;
    if(next<0)return `<div class="academy-next"><div class="academy-next-text"><div class="academy-next-kicker">أحسنت</div><div class="academy-next-title">شاهدت كل فيديوهات شرح المنصة.</div></div><button type="button" class="academy-next-button" onclick="academyShowList()">استكشف المزيد</button></div>`;
    return `<div class="academy-next"><span class="academy-next-number">${academyPad(next+1)}</span><div class="academy-next-text"><div class="academy-next-kicker">الفيديو التالي</div><div class="academy-next-title">${academyEscape(academyState.episodes[next].title)}</div></div><button type="button" class="academy-next-button" onclick="academySelectEpisode(${next})">شاهد الآن</button></div>`;
  }

  function academyTourInner(){
    const total=academyState.episodes.length;
    const watched=academyWatchedCount();
    const ratio=total?watched/total:0;
    return `<div class="academy-tour-head"><span class="academy-tour-label">ما استكشفته من المنصة</span><span class="academy-tour-value">${watched} من ${total}</span></div>
      <div class="academy-progress" role="progressbar" aria-label="نسبة الفيديوهات التي شاهدتها" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio*100)}"><span class="academy-progress-fill" style="width:${(ratio*100).toFixed(1)}%"></span></div>
      ${academyUpNextCard()}`;
  }

  function academyScreen(episode,index){
    const url=academySafeUrl(episode.url);
    const poster=academySafeUrl(episode.poster);
    const events=['loadstart','waiting','loadeddata','canplay','playing','play','error']
      .map(type=>` on${type}="academyVideoEvent(this,'${type}')"`).join('');
    return `<div class="academy-screen academy-screen-loading" id="academyScreen">
      <video class="academy-video" controls playsinline preload="metadata" src="${academyEscape(url)}"${poster?` poster="${academyEscape(poster)}"`:''}${events} ontimeupdate="academyTrackProgress(this,${index})" onended="academyMarkWatched(${index},true)"></video>
      <div class="academy-screen-loader" role="status" aria-live="polite"><div class="academy-screen-loader-bar"><span></span></div><div class="academy-screen-loader-label">جارٍ تحميل الفيديو…</div></div>
      <div class="academy-screen-error-note" role="status">تعذّر تحميل الفيديو حاليًا، حاول مرة أخرى لاحقًا.</div>
    </div>`;
  }

  function academyEmptyScreen(){
    return `<div class="academy-screen academy-screen-empty">
      <div class="academy-screen-icon" aria-hidden="true">▶</div>
      <div class="academy-screen-title">لا توجد فيديوهات بعد</div>
      <div class="academy-screen-note">عند إضافة أول فيديو سيُعرض هنا مع شرح القسم الذي يتناوله.</div>
    </div>`;
  }

  function academyControls(){
    const total=academyState.episodes.length;
    const index=academyState.selectedIndex;
    return `<div class="academy-controls">
      <button type="button" class="academy-control academy-control-prev" onclick="academyStep(-1)"${!total||index<=0?' disabled':''}>→ السابق</button>
      <button type="button" class="academy-control academy-control-list" onclick="academyShowList()">☰ كل الفيديوهات</button>
      <button type="button" class="academy-control academy-control-next" id="academyNextButton" onclick="academyStep(1)"${!total||index>=total-1?' disabled':''}>الفيديو التالي ←</button>
    </div>`;
  }

  function academyStageInner(){
    const total=academyState.episodes.length;
    const index=academyState.selectedIndex;
    const episode=academyState.episodes[index];
    if(!episode)return `${academyEmptyScreen()}${academyControls()}`;
    const section=episode.section?`<span class="academy-chip">📍 ${academyEscape(episode.section)}</span>`:'';
    const duration=episode.duration?`<span class="academy-chip">⏱ ${academyEscape(episode.duration)}</span>`:'';
    const watched=academyIsWatched(index)?'<span class="academy-chip academy-chip-done">✓ تمت مشاهدته</span>':'';
    return `${academyScreen(episode,index)}
      <div class="academy-stage-info">
        <div class="academy-stage-meta"><span class="academy-chip academy-chip-gold">الفيديو ${academyPad(index+1)} من ${academyPad(total)}</span>${section}${duration}${watched}</div>
        <h2 class="academy-stage-title">${academyEscape(episode.title)}</h2>
        ${episode.description?`<p class="academy-stage-text">${academyEscape(episode.description)}</p>`:''}
      </div>
      ${academyControls()}`;
  }

  function academyCard(episode,index){
    const poster=academySafeUrl(episode.poster);
    const status=academyStatus(index);
    const active=index===academyState.selectedIndex;
    const classes=`academy-episode${active?' academy-episode-active':''}${academyIsWatched(index)?' academy-episode-watched':''}`;
    return `<button type="button" class="${classes}" data-academy-index="${index}" onclick="academySelectEpisode(${index})"${active?' aria-current="true"':''}>
      <div class="academy-episode-thumb"${poster?` style="background-image:url('${academyEscape(poster)}')"`:''}>
        <span class="academy-episode-number">${academyPad(index+1)}</span>
        ${episode.duration?`<span class="academy-episode-duration">${academyEscape(episode.duration)}</span>`:''}
      </div>
      <div class="academy-episode-body">
        <div class="academy-episode-title">${academyEscape(episode.title)}</div>
        ${episode.section?`<div class="academy-episode-section">📍 ${academyEscape(episode.section)}</div>`:''}
        <span class="academy-episode-status ${status.cls}">${status.label}</span>
      </div>
    </button>`;
  }

  function academyLibraryList(){
    if(!academyState.episodes.length)return '<div class="academy-episodes-empty">لم تُضف فيديوهات شرح المنصة بعد.</div>';
    return `<div class="academy-episodes" id="academyEpisodes">${academyState.episodes.map(academyCard).join('')}</div>`;
  }

  // Leader-only form (UI only in this phase; nothing is uploaded).
  function academyUploadZone(){
    if(!academyIsLeader())return '';
    return `<section class="academy-studio" aria-label="إضافة فيديو">
      <div class="academy-studio-head">
        <div><div class="academy-studio-title">👑 إضافة فيديو شرح</div><div class="academy-studio-sub">للقائد فقط</div></div>
        <button type="button" class="academy-upload-button" onclick="academyToggleUpload()">＋ رفع فيديو جديد</button>
      </div>
      <button type="button" class="academy-studio-banner" onclick="academyToggleUpload()" aria-label="فتح لوحة إضافة فيديو">
        <img class="academy-studio-image" src="${ACADEMY_BANNER_SRC}" alt="" width="1983" height="793" loading="lazy" decoding="async">
      </button>
      <div class="academy-upload-panel" id="academyUploadPanel" hidden>
        <label class="academy-field"><span>عنوان الفيديو</span><input type="text" id="academyUploadTitle" maxlength="160" placeholder="مثال: كيف تستخدم المركز الذكي"></label>
        <label class="academy-field"><span>القسم الذي يشرحه (اختياري)</span><input type="text" id="academyUploadSection" maxlength="80" placeholder="مثال: المركز الذكي"></label>
        <label class="academy-field"><span>ملف الفيديو</span><input type="file" id="academyUploadFile" accept="video/*" onchange="academyPreviewFile()"></label>
        <div class="academy-upload-file" id="academyUploadFileInfo"></div>
        <div class="academy-upload-actions">
          <button type="button" class="academy-upload-submit" onclick="academySubmitUpload()">حفظ الفيديو</button>
          <button type="button" class="academy-upload-cancel" onclick="academyToggleUpload()">إلغاء</button>
        </div>
        <div class="academy-upload-note" id="academyUploadNote">رفع الفيديو إلى التخزين سيُفعَّل في المرحلة القادمة.</div>
      </div>
    </section>`;
  }

  window.academyPage=function(){
    const total=academyState.episodes.length;
    return `<div class="academy-root">
      ${academyHeader()}
      <section class="academy-tour" id="academyTour" aria-label="ما استكشفته من المنصة">${academyTourInner()}</section>
      ${academyUploadZone()}
      <section class="academy-stage" id="academyStage" aria-label="الفيديو المعروض">${academyStageInner()}</section>
      <section class="academy-library" id="academyLibrary" aria-label="كل فيديوهات شرح المنصة">
        <div class="academy-library-head">
          <div><h3 class="academy-library-title">استكشف المزيد</h3><div class="academy-library-sub">كل فيديوهات شرح المنصة</div></div>
          <span class="academy-library-count">${total?academyCountLabel(total):''}</span>
        </div>
        ${academyLibraryList()}
      </section>
    </div>`;
  };

  function academyRefreshCards(){
    const list=academyEl('academyEpisodes');
    if(!list)return;
    list.querySelectorAll('.academy-episode[data-academy-index]').forEach(card=>{
      const index=Number(card.dataset.academyIndex);
      const active=index===academyState.selectedIndex;
      card.classList.toggle('academy-episode-active',active);
      card.classList.toggle('academy-episode-watched',academyIsWatched(index));
      if(active)card.setAttribute('aria-current','true');else card.removeAttribute('aria-current');
      const badge=card.querySelector('.academy-episode-status');
      const status=academyStatus(index);
      if(badge){badge.className=`academy-episode-status ${status.cls}`;badge.textContent=status.label;}
    });
  }

  // Updates the progress card, header and video cards in place so the list keeps its
  // position and the rest of the platform is not re-rendered.
  function academyRefreshSide(){
    const tour=academyEl('academyTour');
    const headerActions=academyEl('academyHeaderActions');
    if(tour)tour.innerHTML=academyTourInner();
    if(headerActions)headerActions.innerHTML=academyHeaderActions();
    academyRefreshCards();
  }

  function academyScrollTo(id){
    const el=academyEl(id);
    if(el&&el.scrollIntoView)el.scrollIntoView({behavior:academyReducedMotion()?'auto':'smooth',block:'start'});
  }

  // Sequential fade: the current video fades out completely, then the new one fades
  // in. Opacity only, so nothing is scaled and the two never overlap.
  function academySwapStage(stage){
    clearTimeout(academyState.fadeTimer);
    const apply=()=>{
      stage.innerHTML=academyStageInner();
      academyRefreshSide();
      if(academyReducedMotion()){stage.classList.remove('academy-stage-fading');return;}
      requestAnimationFrame(()=>requestAnimationFrame(()=>stage.classList.remove('academy-stage-fading')));
    };
    if(academyReducedMotion()){apply();return;}
    stage.classList.add('academy-stage-fading');
    academyState.fadeTimer=setTimeout(apply,ACADEMY_FADE_MS);
  }

  function academyShowUpNext(index){
    const screen=academyEl('academyScreen');
    if(!screen||screen.querySelector('.academy-upnext'))return;
    const next=index+1<academyState.episodes.length?index+1:-1;
    const body=next<0
      ?`<div class="academy-upnext-kicker">أحسنت</div><div class="academy-upnext-title">شاهدت آخر فيديو في الجولة</div><div class="academy-upnext-actions"><button type="button" class="academy-upnext-play" onclick="academyShowList()">استكشف المزيد</button><button type="button" class="academy-upnext-replay" onclick="academyReplay()">↺ إعادة</button></div>`
      :`<div class="academy-upnext-kicker">الفيديو التالي · ${academyPad(next+1)}</div><div class="academy-upnext-title">${academyEscape(academyState.episodes[next].title)}</div><div class="academy-upnext-actions"><button type="button" class="academy-upnext-play" onclick="academySelectEpisode(${next})">▶ شاهد الآن</button><button type="button" class="academy-upnext-replay" onclick="academyReplay()">↺ إعادة</button></div>`;
    screen.classList.add('academy-screen-ended');
    screen.insertAdjacentHTML('beforeend',`<div class="academy-upnext" role="dialog" aria-label="الفيديو التالي"><div class="academy-upnext-body">${body}</div></div>`);
    const primary=screen.querySelector('.academy-upnext-play');
    if(primary)primary.focus({preventScroll:true});
  }

  function academyHideUpNext(screen){
    if(!screen)return;
    const overlay=screen.querySelector('.academy-upnext');
    if(overlay)overlay.remove();
    screen.classList.remove('academy-screen-ended');
  }

  window.academySelectEpisode=function(index){
    if(!Number.isInteger(index)||index<0||index>=academyState.episodes.length)return;
    const stage=academyEl('academyStage');
    if(index!==academyState.selectedIndex){
      academyState.selectedIndex=index;
      if(!stage){if(typeof render==='function')render();return;}
      const playing=stage.querySelector('video');
      if(playing)playing.pause();
      academySwapStage(stage);
    }
    academyScrollTo('academyStage');
  };

  window.academyStep=function(delta){
    academySelectEpisode(academyState.selectedIndex+delta);
  };

  window.academyStart=function(){
    const next=academyNextIndex();
    academySelectEpisode(next<0?0:next);
  };

  window.academyShowList=function(){
    academyScrollTo('academyLibrary');
  };

  window.academyReplay=function(){
    const screen=academyEl('academyScreen');
    if(!screen)return;
    academyHideUpNext(screen);
    const video=screen.querySelector('video');
    if(video){video.currentTime=0;const played=video.play();if(played&&played.catch)played.catch(()=>{});}
  };

  // Loading and error states of the player.
  window.academyVideoEvent=function(video,type){
    const screen=video&&video.closest&&video.closest('.academy-screen');
    if(!screen)return;
    if(type==='loadstart'||type==='waiting')screen.classList.add('academy-screen-loading');
    if(type==='loadeddata'||type==='canplay'||type==='playing')screen.classList.remove('academy-screen-loading','academy-screen-error');
    if(type==='error'){screen.classList.remove('academy-screen-loading');screen.classList.add('academy-screen-error');}
    if(type==='play')academyHideUpNext(screen);
  };

  window.academyTrackProgress=function(video,index){
    if(!video||!video.duration||academyIsWatched(index))return;
    if(video.currentTime/video.duration>=ACADEMY_WATCHED_RATIO)academyMarkWatched(index,false);
  };

  window.academyMarkWatched=function(index,ended){
    if(!Number.isInteger(index)||index<0||index>=academyState.episodes.length)return;
    const id=academyEpisodeId(index);
    if(!academyState.watched.includes(id)){
      academyState.watched=[...academyState.watched,id];
      academySaveWatched();
      academyRefreshSide();
    }
    if(ended)academyShowUpNext(index);
  };

  // Entry point for the next phase (videos loaded from the database). Only https or
  // same-origin URLs are kept.
  window.academySetEpisodes=function(list){
    academyState.episodes=(Array.isArray(list)?list:[]).filter(item=>item&&typeof item.title==='string'&&academySafeUrl(item.url)).map(item=>({
      id:item.id==null?'':String(item.id),
      title:item.title,
      url:item.url,
      poster:item.poster||'',
      section:typeof item.section==='string'?item.section:'',
      duration:item.duration||'',
      description:item.description||''
    }));
    const next=academyNextIndex();
    academyState.selectedIndex=next<0?0:next;
    if(typeof document!=='undefined'&&document.querySelector('.academy-root')&&typeof render==='function')render();
  };

  window.academyToggleUpload=function(){
    if(!academyIsLeader())return;
    const panel=academyEl('academyUploadPanel');
    if(panel)panel.hidden=!panel.hidden;
  };

  window.academyPreviewFile=function(){
    const input=academyEl('academyUploadFile');
    const info=academyEl('academyUploadFileInfo');
    const file=input&&input.files&&input.files[0];
    if(!info)return;
    info.textContent=file?`${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`:'';
  };

  window.academySubmitUpload=function(){
    if(!academyIsLeader())return;
    const note=academyEl('academyUploadNote');
    const file=academyEl('academyUploadFile')?.files?.[0];
    const title=String(academyEl('academyUploadTitle')?.value||'').trim();
    if(!note)return;
    if(!title||!file){
      note.textContent='اكتب عنوان الفيديو واختر الملف أولًا.';
      return;
    }
    // Phase one: no network call. Storage upload is added in the next phase.
    note.textContent='تم تجهيز الفيديو محليًا. رفع الفيديو إلى التخزين سيُفعَّل في المرحلة القادمة.';
  };
})();
