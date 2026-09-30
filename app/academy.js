/* V86.73 — «🎓 أكاديمية المنصة»: a clear library of videos that explain how to use the
   platform, styled as a native section of the site (no cinematic effects).
   Videos are YouTube links stored in the academy_videos table. The list is loaded from
   /api/academy-videos when the tab opens; the selected video plays inside the academy
   through the YouTube privacy-enhanced embed (youtube-nocookie.com), never in a new
   window and never automatically. Leaders add videos with title, section and YouTube
   link; the server checks the leader role. Every global name starts with academy so
   nothing collides with the other tabs. */
(function(){
  if(window.__DXN_ACADEMY_V1__)return;
  window.__DXN_ACADEMY_V1__=true;

  const ACADEMY_BANNER_SRC='/academy-video-upload-banner.png';
  const ACADEMY_API='/api/academy-videos';
  const ACADEMY_EMBED_ORIGIN='https://www.youtube-nocookie.com';
  const ACADEMY_YOUTUBE_ORIGINS=['https://www.youtube-nocookie.com','https://www.youtube.com'];
  const ACADEMY_WATCHED_KEY='dxn_academy_watched_v1';
  const ACADEMY_WATCHED_RATIO=0.9;
  const ACADEMY_FADE_MS=160;
  const ACADEMY_PLAYER_ENDED=0;
  const ACADEMY_PLAYER_PLAYING=1;
  const ACADEMY_TITLE_MAX=160;
  const ACADEMY_SECTION_MAX=80;
  const ACADEMY_UPLOAD_HINT='الصق رابط الفيديو من YouTube بصيغة youtube.com/watch?v=… أو youtu.be/…';
  // Same rules as api/_academy-youtube.js (the server re-checks every link).
  const ACADEMY_YOUTUBE_ID=/^[A-Za-z0-9_-]{11}$/;
  const ACADEMY_WATCH_HOSTS=['youtube.com','www.youtube.com','m.youtube.com'];
  const ACADEMY_SHORT_HOSTS=['youtu.be','www.youtu.be'];

  const academyState={episodes:[],selectedIndex:0,watched:academyLoadWatched(),fadeTimer:0,loaded:false,loading:false,loadError:'',saving:false,uploadOpen:false,uploadNote:ACADEMY_UPLOAD_HINT};

  function academyEscape(value){
    return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

  function academySessionToken(){
    try{return String(localStorage.getItem('dxn_session')||'').trim()}catch(_){return ''}
  }

  // Returns the 11-character video id of a youtube.com/watch or youtu.be link, or ''.
  function academyYouTubeId(input){
    const raw=String(input==null?'':input).trim();
    if(!raw||raw.length>500)return '';
    let url;
    try{url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw);}catch(_){return '';}
    if(url.protocol!=='https:'&&url.protocol!=='http:')return '';
    const host=url.hostname.toLowerCase();
    let id='';
    if(ACADEMY_WATCH_HOSTS.includes(host)&&url.pathname==='/watch')id=url.searchParams.get('v')||'';
    else if(ACADEMY_SHORT_HOSTS.includes(host))id=url.pathname.replace(/^\/+/,'').split('/')[0];
    return ACADEMY_YOUTUBE_ID.test(id)?id:'';
  }

  function academyEmbedUrl(id){
    let origin='';
    try{origin=location.origin&&location.origin!=='null'?location.origin:''}catch(_){}
    return `${ACADEMY_EMBED_ORIGIN}/embed/${id}?rel=0&playsinline=1&enablejsapi=1${origin?'&origin='+encodeURIComponent(origin):''}`;
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

  // The selected video plays inside the academy (YouTube privacy-enhanced embed).
  // Nothing starts on its own: the member presses play in the player.
  function academyScreen(episode,index){
    return `<div class="academy-screen academy-screen-loading" id="academyScreen">
      <iframe class="academy-video" id="academyPlayer" src="${academyEscape(academyEmbedUrl(episode.youtubeId))}" title="${academyEscape(episode.title)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" onload="academyEmbedLoaded(this,${index})"></iframe>
      <div class="academy-screen-loader" role="status" aria-live="polite"><div class="academy-screen-loader-bar"><span></span></div><div class="academy-screen-loader-label">جارٍ تحميل الفيديو…</div></div>
      <div class="academy-screen-error-note" role="status">تعذّر تحميل الفيديو حاليًا، حاول مرة أخرى لاحقًا.</div>
    </div>`;
  }

  function academyEmptyScreen(){
    let title='لا توجد فيديوهات بعد';
    let note='عند إضافة أول فيديو سيُعرض هنا مع شرح القسم الذي يتناوله.';
    if(academyState.loading){title='جارٍ تحميل الفيديوهات…';note='لحظات وتظهر فيديوهات شرح المنصة.';}
    else if(academyState.loadError){title='تعذّر تحميل الفيديوهات';note=academyState.loadError;}
    return `<div class="academy-screen academy-screen-empty">
      <div class="academy-screen-icon" aria-hidden="true">▶</div>
      <div class="academy-screen-title">${academyEscape(title)}</div>
      <div class="academy-screen-note">${academyEscape(note)}</div>
      ${academyState.loadError?'<button type="button" class="academy-cta" onclick="academyReloadVideos()">إعادة المحاولة</button>':''}
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
    const watched=academyIsWatched(index)?'<span class="academy-chip academy-chip-done">✓ تمت مشاهدته</span>':'';
    return `${academyScreen(episode,index)}
      <div class="academy-stage-info">
        <div class="academy-stage-meta"><span class="academy-chip academy-chip-gold">الفيديو ${academyPad(index+1)} من ${academyPad(total)}</span>${section}${watched}</div>
        <h2 class="academy-stage-title">${academyEscape(episode.title)}</h2>
      </div>
      ${academyControls()}`;
  }

  function academyCard(episode,index){
    const status=academyStatus(index);
    const active=index===academyState.selectedIndex;
    const classes=`academy-episode${active?' academy-episode-active':''}${academyIsWatched(index)?' academy-episode-watched':''}`;
    return `<button type="button" class="${classes}" data-academy-index="${index}" onclick="academySelectEpisode(${index})"${active?' aria-current="true"':''}>
      <div class="academy-episode-thumb">
        <span class="academy-episode-number">${academyPad(index+1)}</span>
      </div>
      <div class="academy-episode-body">
        <div class="academy-episode-title">${academyEscape(episode.title)}</div>
        ${episode.section?`<div class="academy-episode-section">📍 ${academyEscape(episode.section)}</div>`:''}
        <span class="academy-episode-status ${status.cls}">${status.label}</span>
      </div>
    </button>`;
  }

  function academyLibraryList(){
    if(!academyState.episodes.length){
      const text=academyState.loading?'جارٍ تحميل الفيديوهات…':academyState.loadError?'تعذّر تحميل الفيديوهات.':'لم تُضف فيديوهات شرح المنصة بعد.';
      return `<div class="academy-episodes-empty">${text}</div>`;
    }
    return `<div class="academy-episodes" id="academyEpisodes">${academyState.episodes.map(academyCard).join('')}</div>`;
  }

  // Leader-only form. The server re-checks the leader role before saving. The open
  // state and the last message survive re-renders.
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
      <div class="academy-upload-panel" id="academyUploadPanel"${academyState.uploadOpen?'':' hidden'}>
        <label class="academy-field"><span>عنوان الفيديو</span><input type="text" id="academyUploadTitle" maxlength="${ACADEMY_TITLE_MAX}" placeholder="مثال: كيف تستخدم المركز الذكي"></label>
        <label class="academy-field"><span>القسم الذي يشرحه (اختياري)</span><input type="text" id="academyUploadSection" maxlength="${ACADEMY_SECTION_MAX}" placeholder="مثال: المركز الذكي"></label>
        <label class="academy-field"><span>رابط YouTube</span><input type="url" id="academyUploadUrl" dir="ltr" inputmode="url" maxlength="500" placeholder="https://youtu.be/..."></label>
        <div class="academy-upload-actions">
          <button type="button" class="academy-upload-submit" id="academyUploadSubmit" onclick="academySubmitUpload()">حفظ الفيديو</button>
          <button type="button" class="academy-upload-cancel" onclick="academyToggleUpload()">إلغاء</button>
        </div>
        <div class="academy-upload-note" id="academyUploadNote">${academyEscape(academyState.uploadNote)}</div>
      </div>
    </section>`;
  }

  window.academyPage=function(){
    const total=academyState.episodes.length;
    // Opening the tab loads the list once; academySetEpisodes() re-renders with it.
    if(!academyState.loaded&&!academyState.loading&&typeof document!=='undefined'&&typeof fetch==='function'){
      academyState.loading=true;
      setTimeout(()=>academyLoadVideos(),0);
    }
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

  async function academyApi(payload){
    const token=academySessionToken();
    if(!token)throw new Error('سجّل الدخول لعرض فيديوهات الأكاديمية.');
    const response=await fetch(ACADEMY_API,{method:'POST',headers:{'Content-Type':'application/json','X-DXN-Session':token},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'تعذّر الاتصال بالخادم.');
    return data;
  }

  function academyRerender(){
    if(typeof document!=='undefined'&&document.querySelector('.academy-root')&&typeof render==='function')render();
  }

  // Loads the published videos; selectId selects a given video after the load (used
  // right after a leader saves a new one).
  async function academyLoadVideos(selectId){
    academyState.loading=true;
    academyState.loadError='';
    try{
      const data=await academyApi({action:'list'});
      academyState.loading=false;
      academyState.loaded=true;
      academySetEpisodes(Array.isArray(data.videos)?data.videos:[]);
      if(selectId){
        const index=academyState.episodes.findIndex(e=>e.id===selectId);
        if(index>=0){academyState.selectedIndex=index;academyRerender();}
      }
    }catch(error){
      academyState.loading=false;
      academyState.loaded=true;
      academyState.loadError=String(error&&error.message||error);
      academyRerender();
    }
  }

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
  // in. Opacity only, so nothing is scaled and the two never overlap. Replacing the
  // iframe stops the previous video.
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

  // Sends a command to the embedded YouTube player (postMessage protocol of the embed).
  function academyPlayerCommand(func,args){
    const player=academyEl('academyPlayer');
    if(!player||!player.contentWindow)return;
    player.contentWindow.postMessage(JSON.stringify({event:'command',func,args:args||[]}),ACADEMY_EMBED_ORIGIN);
  }

  // Watch status from the embedded player: ended → watched + next-video card;
  // 90% played → watched. Only messages from YouTube and from our own player count.
  function academyOnPlayerMessage(event){
    if(!ACADEMY_YOUTUBE_ORIGINS.includes(event.origin))return;
    const player=academyEl('academyPlayer');
    if(!player||event.source!==player.contentWindow)return;
    let data;
    try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch(_){return;}
    if(!data||typeof data!=='object')return;
    const index=academyState.selectedIndex;
    const info=data.info&&typeof data.info==='object'?data.info:{};
    const state=data.event==='onStateChange'?data.info:info.playerState;
    if(state===ACADEMY_PLAYER_PLAYING)academyHideUpNext(academyEl('academyScreen'));
    if(state===ACADEMY_PLAYER_ENDED){academyMarkWatched(index,true);return;}
    const duration=Number(info.duration),current=Number(info.currentTime);
    if(duration>0&&current/duration>=ACADEMY_WATCHED_RATIO&&!academyIsWatched(index))academyMarkWatched(index,false);
  }

  if(typeof window.addEventListener==='function')window.addEventListener('message',academyOnPlayerMessage);

  window.academyEmbedLoaded=function(frame,index){
    const screen=frame&&frame.closest&&frame.closest('.academy-screen');
    if(screen)screen.classList.remove('academy-screen-loading');
    // Ask the embed to report its state (used for the watch status only).
    try{frame.contentWindow.postMessage(JSON.stringify({event:'listening',id:index,channel:'widget'}),ACADEMY_EMBED_ORIGIN);}catch(_){}
  };

  window.academySelectEpisode=function(index){
    if(!Number.isInteger(index)||index<0||index>=academyState.episodes.length)return;
    const stage=academyEl('academyStage');
    if(index!==academyState.selectedIndex){
      academyState.selectedIndex=index;
      if(!stage){if(typeof render==='function')render();return;}
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
    academyPlayerCommand('seekTo',[0,true]);
    academyPlayerCommand('playVideo');
  };

  window.academyReloadVideos=function(){
    academyState.loadError='';
    academyState.loading=true;
    academyRerender();
    return academyLoadVideos();
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

  window.academyYouTubeId=academyYouTubeId;

  // Accepts the rows returned by /api/academy-videos (published only, by sort_order).
  // Rows without a valid YouTube id are dropped.
  window.academySetEpisodes=function(list){
    academyState.episodes=(Array.isArray(list)?list:[])
      .filter(item=>item&&typeof item.title==='string'&&ACADEMY_YOUTUBE_ID.test(String(item.youtube_id||item.youtubeId||'')))
      .map((item,position)=>({
        id:item.id==null?'':String(item.id),
        title:item.title,
        section:typeof item.section==='string'?item.section:'',
        youtubeId:String(item.youtube_id||item.youtubeId),
        sortOrder:Number.isFinite(Number(item.sort_order))?Number(item.sort_order):position,
        position
      }))
      .sort((a,b)=>a.sortOrder-b.sortOrder||a.position-b.position);
    const next=academyNextIndex();
    academyState.selectedIndex=next<0?0:next;
    academyRerender();
  };

  window.academyToggleUpload=function(){
    if(!academyIsLeader())return;
    academyState.uploadOpen=!academyState.uploadOpen;
    const panel=academyEl('academyUploadPanel');
    if(panel)panel.hidden=!academyState.uploadOpen;
  };

  function academySetUploadNote(text){
    academyState.uploadNote=text;
    const note=academyEl('academyUploadNote');
    if(note)note.textContent=text;
  }

  window.academySubmitUpload=async function(){
    if(!academyIsLeader()||academyState.saving)return;
    const button=academyEl('academyUploadSubmit');
    const title=String(academyEl('academyUploadTitle')?.value||'').trim();
    const section=String(academyEl('academyUploadSection')?.value||'').trim();
    const link=String(academyEl('academyUploadUrl')?.value||'').trim();
    if(!title){academySetUploadNote('اكتب عنوان الفيديو أولًا.');return;}
    if(!academyYouTubeId(link)){academySetUploadNote('رابط YouTube غير صالح. استخدم رابطًا بصيغة youtube.com/watch?v=… أو youtu.be/…');return;}
    academyState.saving=true;
    if(button)button.disabled=true;
    academySetUploadNote('جارٍ حفظ الفيديو…');
    try{
      const saved=await academyApi({action:'create',title,section,youtube_url:link});
      academySetUploadNote('تم حفظ الفيديو ونشره في الأكاديمية.');
      await academyLoadVideos(saved.id);
    }catch(error){
      academySetUploadNote(String(error&&error.message||error));
    }finally{
      academyState.saving=false;
      const again=academyEl('academyUploadSubmit');
      if(again)again.disabled=false;
    }
  };
})();
