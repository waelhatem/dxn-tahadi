/* Leader video library: second folder inside the existing Community Academy.
   Existing three training-guide videos remain untouched. */
(function(){
  'use strict';
  if(window.__DXN_ACADEMY_LEADER_VIDEOS__)return;
  window.__DXN_ACADEMY_LEADER_VIDEOS__=true;
  const BUCKET='platform-academy';
  const UPGRADE_MAX_BYTES=100*1024*1024;
  // Project is currently Supabase Free: request effective cap from the server.
  let MAX_BYTES=50*1024*1024;
  const PROJECT='https://ryqpstkzppaifpvhezzn.supabase.co';
  const COVER_SRC='/academy-leader-photo.avif';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const TYPES=['video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'];
  let mode='guide',videos=[],guideVideos=[],activeRoot=null,loading=false,guideLoading=false;
  let localVideoPreviewUrl='';
  function session(){try{return String(localStorage.getItem('dxn_session')||'').trim()}catch(_){return ''}}
  function isLeader(){try{return typeof role!=='undefined'&&role==='leader'}catch(_){return false}}
  function elem(tag,className,textValue){
    const n=document.createElement(tag);
    if(className)n.className=className;
    if(textValue!==undefined)n.textContent=textValue;
    return n;
  }
  // One permanent artwork for every video. Only the DOM title text changes.
  // Only a visual cover is displayed; the original uploaded file is untouched.
  function coverElement(videoTitle){
    const cover=elem('span','academy-leader-cover');
    const art=elem('img','academy-leader-cover-art');
    art.src=COVER_SRC;
    art.alt='';
    art.loading='lazy';
    art.decoding='async';
    art.setAttribute('aria-hidden','true');
    const shading=elem('span','academy-leader-cover-shade');
    const brand=elem('span','academy-leader-cover-brand','شروحات القائد');
    const title=elem('strong','academy-leader-cover-title',videoTitle);
    const playIcon=elem('span','academy-leader-cover-play','▶');
    playIcon.setAttribute('aria-hidden','true');
    cover.append(art,shading,title,brand,playIcon);
    return cover;
  }
  // Compact landscape preview for the published catalogue only; retain the
  // original 9:16 portrait artwork in the leader's upload preview.
  function videoThumbElement(){
    const thumb=elem('span','academy-leader-video-thumb');
    const art=elem('img','academy-leader-video-thumb-art');
    art.src=COVER_SRC;art.alt='';art.loading='lazy';art.decoding='async';
    const type=elem('span','academy-leader-video-tag','🎬 فيديو تعليمي');
    const play=elem('span','academy-leader-video-play','▶');
    play.setAttribute('aria-hidden','true');
    const hint=elem('span','academy-leader-video-hint','اضغط للمشاهدة بملء الشاشة');
    thumb.append(art,type,play,hint);
    return thumb;
  }
  function showMessage(message,error){
    const node=document.getElementById('academyLeaderVideoMessage');
    if(node){node.textContent=message;node.classList.toggle('error',!!error)}
  }
  async function post(url,body){
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),cache:'no-store'});
    let data;
    try{data=await res.json()}catch(_){throw Error('تعذر قراءة استجابة الخادم')}
    if(!res.ok)throw Error(data.error||data.message||'فشل الاتصال بخادم الفيديوهات');
    return data;
  }
  function rpc(fn,args){return post('/api/rpc',{fn,args:args||{}})}
  function makeControls(root){
    const tabs=elem('div','academy-leader-tabs');
    tabs.id='academyLeaderTabSwitch';
    const guide=elem('button','','📘 دليل استخدام المجتمع');
    const leader=elem('button','','🎬 شروحات القائد');
    guide.type='button';leader.type='button';
    guide.addEventListener('click',()=>setMode('guide'));
    leader.addEventListener('click',()=>setMode('leader'));
    tabs.append(guide,leader);
    root.insertBefore(tabs,root.firstChild);
    const legacy=root.querySelector('.academy-studio');
    if(legacy)legacy.remove(); // former UI-only file picker; replaced below by real uploader
    Array.from(root.children).forEach(child=>{
      if(child!==tabs)child.dataset.academyGuideElement='1';
    });
    const section=elem('section','academy-leader-library');
    section.id='academyLeaderVideosHost';
    section.hidden=true;
    section.innerHTML='<header class="academy-leader-header"><span>🎓 أكاديمية المجتمع</span><h2>🎬 شروحات القائد</h2><p>شروحات فيديو حديثة تساعدك على استخدام المجتمع والاستفادة من إمكاناته.</p></header>'
      +(isLeader()?'<form id="academyLeaderUploadForm" class="academy-leader-upload">'
        +'<strong id="academyUploadFormHeading">👑 أضف شرحاً جديداً من هاتفك</strong>'
        +'<label>1️⃣ اختر الفيديو أولاً<input type="file" id="academyLeaderVideoFile" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp,.mp4,.mov,.webm,.m4v,.3gp" required></label>'
        +'<small>اختيار الملف لا يرفع الفيديو ولا ينشره. استمع إليه وشاهده أولاً من جهازك، ثم اختر العنوان المناسب.</small>'
        +'<section class="academy-leader-local-preview" id="academyLeaderLocalPreview" aria-label="معاينة الفيديو قبل النشر" hidden>'
        +'<strong>🔊 2️⃣ استمع وشاهد الفيديو قبل إضافته</strong>'
        +'<div class="academy-leader-local-file" id="academyLeaderLocalFile"></div>'
        +'<video id="academyLeaderLocalPlayer" class="academy-leader-local-player" controls playsinline preload="metadata" aria-label="تشغيل الفيديو المحلي للاستماع إليه قبل النشر"></video>'
        +'<p id="academyLeaderLocalHint" class="academy-leader-local-hint" role="status">اضغط تشغيل للاستماع إلى الشرح، وأوقفه أو تقدّم فيه كما تريد. الفيديو لم يُرفع بعد.</p>'
        +'<button class="academy-leader-write-title" type="button" id="academyLeaderWriteTitle">✍️ انتهيت من الاستماع — كتابة العنوان</button>'
        +'</section>'
        +'<div id="academyLeaderMetaFields" class="academy-leader-meta-fields" hidden>'
        +'<label>3️⃣ عنوان الفيديو<input id="academyLeaderVideoTitle" maxlength="160" required placeholder="مثال: طريقة استخدام تبويب فريقي"></label>'
        +'<label>موضوع الشرح ووصفه<textarea id="academyLeaderVideoDescription" maxlength="700" rows="3" required placeholder="اكتب باختصار ما الذي سيتعلمه العضو"></textarea></label>'
        +'<div class="academy-leader-cover-preview" id="academyLeaderCoverPreview" aria-label="معاينة الغلاف الموحد"></div>'
        +'<small>🖼️ الغلاف ثابت بصورتك المعتمدة، ويتغير العنوان تلقائياً دون مونتاج.</small>'
        +'<a class="academy-leader-preview-link" href="/academy-cover-preview.html" target="_blank" rel="noopener">👁️ افتح معاينة الغلاف للموبايل واللابتوب</a>'
        +'<small id="academyLeaderUploadLimit">MP4 / MOV / WebM — حد الخطة الحالية 50 ميغابايت. تقنية الرفع تدعم حتى 100 ميغابايت بعد ترقية Supabase.</small>'
        +'<small>عند الضغط على «نشر» فقط سيُرفع الملف ويُرسل الإعلان للأعضاء.</small>'
        +'</div>'
        +'<div class="academy-leader-progress-wrap" id="academyLeaderProgressWrap" hidden role="status" aria-live="polite">'
        +'<div class="academy-leader-progress-text" id="academyLeaderProgressText">0% — جاهز للرفع</div>'
        +'<progress id="academyLeaderProgress" max="100" value="0" aria-label="نسبة رفع الفيديو"></progress>'
        +'<button type="button" id="academyLeaderPauseUpload" hidden>⏸️ إيقاف مؤقت</button>'
        +'</div>'
        +'<p id="academyLeaderWelcomeNote" class="academy-leader-welcome-note">🎓 أول فيديو تنشره في «شروحات القائد» سيُعتمد تلقائياً دليلاً ترحيبياً للأعضاء الجدد. ويمكنك اختيار فيديو آخر لاحقاً.</p>'
        +'<button type="submit" id="academyLeaderPublishButton" disabled>⬆️ نشر الفيديو وإرسال الإعلان</button>'
        +'</form>':'')
      +'<div role="status" aria-live="polite" id="academyLeaderVideoMessage"></div>'
      +'<div id="academyLeaderVideoPlayer"></div><div id="academyLeaderVideoList"></div>';
    root.appendChild(section);
    const guideSlot=elem('div','academy-guide-upload-slot');
    guideSlot.id='academyGuideUploadSlot';
    guideSlot.dataset.academyGuideElement='1';
    root.insertBefore(guideSlot,root.querySelector('.academy-tour')||section);
    const guideSection=elem('section','academy-guide-added');
    guideSection.id='academyGuideAdded';
    guideSection.dataset.academyGuideElement='1';
    guideSection.innerHTML='<header class="academy-guide-added-header"><h3>📘 فيديوهات إضافية في دليل الاستخدام</h3><p>شروحات تُضاف إلى الدليل بجانب الفيديوهات الثلاثة الأساسية.</p></header><div id="academyGuideVideoList"></div>';
    root.insertBefore(guideSection,section);
    const form=section.querySelector('#academyLeaderUploadForm');
    if(form){
      form.addEventListener('submit',function(event){event.preventDefault();uploadVideo()});
      form.querySelector('#academyLeaderPauseUpload')?.addEventListener('click',async function(){
        try{await window.__DXN_ACADEMY_RESUMABLE__?.togglePause()}
        catch(e){showMessage(e.message||'تعذر إيقاف الرفع مؤقتاً.',true)}
      });
      academyLoadUploadLimits();
      form.querySelector('#academyLeaderVideoFile')?.addEventListener('change',academyPreviewSelectedFile);
      form.querySelector('#academyLeaderWriteTitle')?.addEventListener('click',function(){
        const player=form.querySelector('#academyLeaderLocalPlayer');
        if(player&&!player.paused)player.pause();
        const field=form.querySelector('#academyLeaderVideoTitle');
        if(field)field.focus();
      });
      const titleInput=form.querySelector('#academyLeaderVideoTitle');
      const preview=form.querySelector('#academyLeaderCoverPreview');
      const art=coverElement('عنوان الفيديو يظهر هنا');
      preview?.append(art);
      titleInput?.addEventListener('input',function(){
        const text=String(this.value||'').trim()||'عنوان الفيديو يظهر هنا';
        art.querySelector('.academy-leader-cover-title').textContent=text;
      });
    }
    tabs._buttons={guide,leader};
    setMode(mode);
  }
  async function academyLoadUploadLimits(){
    if(!isLeader())return;
    try{
      const info=await post('/api/academy-video-storage',{action:'limits',p_token:session()});
      if(info.max_bytes===UPGRADE_MAX_BYTES)MAX_BYTES=UPGRADE_MAX_BYTES;
      else MAX_BYTES=50*1024*1024;
      const note=document.getElementById('academyLeaderUploadLimit');
      if(note)note.textContent=MAX_BYTES===UPGRADE_MAX_BYTES
        ?'MP4 / MOV / WebM — الحد المسموح حالياً: 100 ميغابايت. الرفع قابل للاستكمال عند انقطاع الإنترنت.'
        :'MP4 / MOV / WebM — الحد الحالي 50 ميغابايت بسبب خطة Supabase المجانية. تقنية الرفع مجهزة حتى 100 ميغابايت بعد الترقية.';
      const current=document.getElementById('academyLeaderVideoFile')?.files?.[0];
      const publish=document.getElementById('academyLeaderPublishButton');
      if(current&&publish&&!window.__DXN_ACADEMY_RESUMABLE__?.hasActive())
        publish.disabled=current.size>MAX_BYTES;
    }catch(e){console.warn('Unable to check Academy storage limit',e)}
  }
  function setMode(next){
    mode=next==='leader'?'leader':'guide';
    const root=document.querySelector('.academy-root');
    if(!root)return;
    const host=root.querySelector('#academyLeaderVideosHost');
    const tabs=root.querySelector('#academyLeaderTabSwitch');
    if(!host||!tabs)return;
    const form=root.querySelector('#academyLeaderUploadForm');
    const status=root.querySelector('#academyLeaderVideoMessage');
    const slot=root.querySelector('#academyGuideUploadSlot');
    const before=host.querySelector('#academyLeaderVideoPlayer');
    if(isLeader()&&form&&status&&slot){
      if(mode==='guide'){slot.append(form,status)}
      else{host.insertBefore(form,before);host.insertBefore(status,before)}
      const heading=root.querySelector('#academyUploadFormHeading');
      const publish=root.querySelector('#academyLeaderPublishButton');
      const welcome=root.querySelector('#academyLeaderWelcomeNote');
      if(heading)heading.textContent=mode==='guide'?'👑 إضافة فيديو إلى دليل استخدام المجتمع':'👑 أضف شرحاً جديداً من هاتفك';
      if(publish)publish.textContent=mode==='guide'?'⬆️ نشر الفيديو في الدليل وإرسال الإعلان':'⬆️ نشر الفيديو وإرسال الإعلان';
      if(welcome)welcome.hidden=mode==='guide';
    }
    root.querySelectorAll('[data-academy-guide-element]').forEach(n=>{n.hidden=mode==='leader'});
    host.hidden=mode!=='leader';
    tabs._buttons?.guide.classList.toggle('active',mode==='guide');
    tabs._buttons?.leader.classList.toggle('active',mode==='leader');
    if(mode==='leader')loadVideos();
    else loadGuideVideos();
  }
  async function loadGuideVideos(){
    if(!document.getElementById('academyGuideVideoList')||guideLoading)return;
    guideLoading=true;
    try{
      const rows=await rpc('academy_guide_videos_list',{p_token:session()});
      if(!Array.isArray(rows))throw Error('البيانات الواردة غير صالحة');
      guideVideos=rows.filter(item=>UUID.test(item.id));
      renderGuideVideos();
    }catch(err){
      const list=document.getElementById('academyGuideVideoList');
      if(list)list.textContent='تعذّر تحميل إضافات الدليل: '+(err.message||err);
    }finally{guideLoading=false}
  }
  function renderGuideVideos(){
    const target=document.getElementById('academyGuideVideoList');
    if(!target)return;
    target.replaceChildren();
    if(!guideVideos.length){target.append(elem('p','academy-leader-empty','لم تُضف فيديوهات جديدة إلى الدليل بعد.'));return}
    const grid=elem('div','academy-leader-grid');
    guideVideos.forEach((v,index)=>{
      const btn=elem('button','academy-leader-card');
      btn.type='button';
      btn.setAttribute('aria-label','شاهد فيديو الدليل: '+v.title);
      btn.append(videoThumbElement());
      const copy=elem('span','academy-leader-card-copy');
      copy.append(elem('strong','',String(index+4)+'. '+v.title));
      if(v.description)copy.append(elem('small','',v.description));
      btn.append(copy);
      btn.addEventListener('click',()=>selectVideo(v.id));
      grid.append(btn);
    });
    target.append(grid);
  }
  async function loadVideos(){
    const host=document.getElementById('academyLeaderVideosHost');
    if(!host||loading)return;
    loading=true;
    try{
      const rows=await rpc('academy_leader_videos_list_v2',{p_token:session()});
      if(!Array.isArray(rows))throw Error('البيانات الواردة غير صالحة');
      videos=rows.filter(item=>UUID.test(item.id));
      renderList();
      if(!videos.length)showMessage('🎬 لم تُنشر شروحات جديدة بعد. الفيديوهات الثلاثة الحالية محفوظة في «دليل استخدام المجتمع».');
      else showMessage(videos.length+' فيديو متاح في شروحات القائد.');
    }catch(err){showMessage('تعذر تحميل الشروحات: '+err.message,true)}
    finally{loading=false}
  }
  function renderList(){
    const wrap=document.getElementById('academyLeaderVideoList');
    if(!wrap)return;
    wrap.replaceChildren();
    const title=elem('h3','','📚 أحدث شروحات القائد');
    wrap.append(title);
    if(!videos.length){wrap.append(elem('p','academy-leader-empty','لا توجد شروحات منشورة في هذا القسم بعد.'));return}
    const grid=elem('div','academy-leader-grid');
    for(const v of videos){
      const holder=elem('div','academy-leader-video-entry');
      const button=elem('button','academy-leader-card');
      button.type='button';
      button.setAttribute('aria-label','تشغيل الفيديو: '+v.title);
      button.append(videoThumbElement());
      const copy=elem('span','academy-leader-card-copy');
      copy.append(elem('strong','',v.title));
      if(v.description)copy.append(elem('small','',v.description));
      const date=new Date(v.published_at);
      if(Number.isFinite(date.getTime()))copy.append(elem('time','',date.toLocaleDateString('ar-IQ')));
      button.append(copy);
      button.addEventListener('click',()=>selectVideo(v.id));
      holder.append(button);
      if(v.is_welcome)holder.append(elem('div','academy-leader-welcome-badge','🎓 دليل الترحيب للأعضاء الجدد'));
      if(isLeader()&&v.is_welcome){
        const preview=elem('button','academy-leader-welcome-preview','👁️ معاينة إشعار الترحيب كما يراه العضو');
        preview.type='button';
        preview.addEventListener('click',()=>previewWelcomeAnnouncement(v));
        holder.append(preview);
      }
      if(isLeader()&&!v.is_welcome){
        const makeWelcome=elem('button','academy-leader-set-welcome','🎓 تعيين هذا الفيديو دليل الترحيب');
        makeWelcome.type='button';
        makeWelcome.addEventListener('click',()=>academySetWelcome(v.id));
        holder.append(makeWelcome);
      }
      grid.append(holder);
    }
    wrap.append(grid);
  }
  // Leader-only visual reproduction. No RPC acknowledgement, notification
  // creation or change to members' read/unread state.
  function previewWelcomeAnnouncement(video){
    if(!isLeader()||!video||!video.is_welcome||!UUID.test(String(video.id||'')))return;
    if(document.getElementById('academyLeaderWelcomePreview'))return;
    const modal=elem('div','dxn-global-announcement-modal');
    modal.id='academyLeaderWelcomePreview';
    const panel=elem('div','dxn-global-announcement-panel ga-announcement ga-video-announcement');
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','معاينة إشعار الترحيب بحساب القائد');
    const marker=elem('div','academy-leader-preview-marker','👑 معاينة خاصة بالقائد — لا يُرسل إشعار ولا تُسجل قراءة');
    const type=elem('div','ga-type','🎓 دليل الترحيب للأعضاء الجدد');
    const title=elem('h2','','🎬 شرح جديد: '+video.title);
    const description=String(video.description||'').trim();
    const notice='🎥 تم نشر شرح جديد في أكاديمية المجتمع: '+video.title+
      (description?' — '+description:'')+' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.';
    const body=elem('div','ga-body',notice);
    const footer=elem('div','ga-footer');
    const watch=elem('button','primary ga-video-watch-btn','▶ مشاهدة شرح التدريبات الأساسية');
    const understood=elem('button','','✓ فهمت');
    const close=elem('button','','إغلاق');
    [watch,understood,close].forEach(btn=>{btn.type='button'});
    function onEscape(event){if(event.key==='Escape')dismiss()}
    function dismiss(){
      document.removeEventListener('keydown',onEscape);
      modal.remove();
    }
    understood.addEventListener('click',dismiss);
    close.addEventListener('click',dismiss);
    watch.addEventListener('click',function(){if(selectVideo(video.id))dismiss()});
    footer.append(watch,understood,close);
    panel.append(marker,type,title,body,footer);
    modal.append(panel);
    document.body.append(modal);
    document.addEventListener('keydown',onEscape);
    watch.focus();
  }
  async function academySetWelcome(id){
    if(!isLeader()||!UUID.test(id))return;
    try{
      await rpc('academy_leader_video_set_welcome',{p_token:session(),p_video_id:id});
      showMessage('✅ تم اعتماد الفيديو دليلاً ترحيبياً للأعضاء الجدد.');
      await loadVideos();
    }catch(e){showMessage('تعذر تعيين دليل الترحيب: '+(e.message||e),true)}
  }
  // Keep the community page intact. Opening in the direct click gesture avoids
  // mobile popup blockers and lets the viewer close when playback finishes.
  function selectVideo(id){
    if(!UUID.test(String(id||'')))return false;
    const viewer=window.open('/app/academy-video-viewer.html?video='+encodeURIComponent(id),'_blank');
    if(!viewer){
      showMessage('تعذر فتح نافذة المشاهدة. اسمح بفتح التبويبات الجديدة لهذا الموقع ثم حاول مرة أخرى.',true);
      return false;
    }
    try{viewer.focus()}catch(_){}
    return true;
  }
  function inferredType(file){
    const typed=String(file.type||'').toLowerCase();
    if(TYPES.includes(typed))return typed;
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    return {mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',m4v:'video/x-m4v','3gp':'video/3gpp'}[ext]||'';
  }
  // Keep the recording on the leader's own phone/laptop until "publish" is clicked.
  // Object URLs play the original file in the browser; no upload, conversion or editing.
  function academyClearLocalPreview(){
    const player=document.getElementById('academyLeaderLocalPlayer');
    if(player){
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    if(localVideoPreviewUrl){
      URL.revokeObjectURL(localVideoPreviewUrl);
      localVideoPreviewUrl='';
    }
  }
  function academyPreviewSelectedFile(){
    const input=document.getElementById('academyLeaderVideoFile');
    const file=input?.files?.[0];
    const panel=document.getElementById('academyLeaderLocalPreview');
    const meta=document.getElementById('academyLeaderMetaFields');
    const label=document.getElementById('academyLeaderLocalFile');
    const player=document.getElementById('academyLeaderLocalPlayer');
    const hint=document.getElementById('academyLeaderLocalHint');
    const publish=document.getElementById('academyLeaderPublishButton');
    academyClearLocalPreview();
    if(panel)panel.hidden=true;
    if(meta)meta.hidden=true;
    if(publish)publish.disabled=true;
    if(!file)return;
    if(file.size<1||file.size>UPGRADE_MAX_BYTES){
      showMessage('حجم الملف غير صالح أو يتجاوز 100 ميغابايت. اختر ملفاً أصغر.',true);
      return;
    }
    if(!inferredType(file)){
      showMessage('صيغة الفيديو غير مدعومة، اختر MP4 أو MOV أو WebM.',true);
      return;
    }
    try{
      localVideoPreviewUrl=URL.createObjectURL(file);
      if(player){
        player.src=localVideoPreviewUrl;
        player.load();
        player.onerror=function(){
          if(hint)hint.textContent='تعذّر تشغيل هذا التسجيل على الجهاز. جرّب فتحه في مشغّل هاتفك أو اختر ملف MP4 متوافقاً.';
        };
      }
      if(label)label.textContent=file.name+' — '+(file.size/1024/1024).toFixed(1)+' MB';
      if(hint)hint.textContent='اضغط ▶ للتشغيل والاستماع. يمكنك الإيقاف والتقديم والتأخير، ثم كتابة العنوان في الحقول التالية.';
      if(panel)panel.hidden=false;
      if(meta)meta.hidden=false;
      if(publish)publish.disabled=file.size>MAX_BYTES;
      if(file.size>MAX_BYTES){
        showMessage('🎧 يمكنك معاينة الفيديو، لكن نشر ملف أكبر من 50 ميغابايت يحتاج ترقية خطة Supabase أولاً.',true);
      }else{
        showMessage('🎧 يمكنك الاستماع للفيديو الآن؛ لم يتم رفعه أو إرسال إعلان عنه.');
      }
    }catch(e){
      academyClearLocalPreview();
      showMessage('لم نتمكن من معاينة الملف على هذا الجهاز: '+(e.message||e),true);
    }
  }
  async function uploadVideo(){
    if(!isLeader())return;
    const destination=mode;
    const button=document.getElementById('academyLeaderPublishButton');
    const title=String(document.getElementById('academyLeaderVideoTitle')?.value||'').trim();
    const description=String(document.getElementById('academyLeaderVideoDescription')?.value||'').trim();
    const file=document.getElementById('academyLeaderVideoFile')?.files?.[0];
    if(!localVideoPreviewUrl){showMessage('اختر الفيديو واستمع إليه قبل إدخال العنوان ونشره.',true);return}
    if(!button||!file||title.length<4||title.length>160||description.length<5){showMessage('اكتب عنوان الفيديو وموضوعه، ثم اختر ملف الفيديو.',true);return}
    if(file.size>MAX_BYTES){showMessage('حجم الفيديو أكبر من الحد الذي تسمح به خطة Supabase الحالية ('+Math.round(MAX_BYTES/1024/1024)+' ميغابايت).',true);return}
    const mime=inferredType(file);
    if(!mime){showMessage('صيغة الفيديو غير مدعومة. استخدم MP4 أو MOV أو WebM.',true);return}
    button.disabled=true;
    const uploadInput=document.getElementById('academyLeaderVideoFile');
    if(uploadInput)uploadInput.disabled=true;
    try{
      showMessage('🔐 جارٍ تجهيز رفع آمن للفيديو...');
      if(!window.__DXN_ACADEMY_RESUMABLE__)throw Error('مكوّن الرفع المتتابع غير متاح. حدّث الصفحة.');
      showMessage('⬆️ جارٍ رفع الفيديو على دفعات آمنة. إذا انقطع الاتصال يمكن استكمال الرفع.');
      const progressWrap=document.getElementById('academyLeaderProgressWrap');
      const progress=document.getElementById('academyLeaderProgress');
      const progressText=document.getElementById('academyLeaderProgressText');
      const pause=document.getElementById('academyLeaderPauseUpload');
      if(progressWrap)progressWrap.hidden=false;
      const uploaded=await window.__DXN_ACADEMY_RESUMABLE__.upload(file,{
        p_token:session(),contentType:mime,request:post,
        onProgress(percent,done,total){
          if(progress)progress.value=percent;
          if(progressText)progressText.textContent=percent+'% — '+(done/1024/1024).toFixed(1)+' / '+(total/1024/1024).toFixed(1)+' ميغابايت';
        },
        onState(state){
          if(pause)pause.hidden=!['uploading','resuming','paused'].includes(state);
          if(pause)pause.textContent=state==='paused'?'▶️ استكمال الرفع':'⏸️ إيقاف مؤقت';
          if(state==='paused')showMessage('⏸️ الرفع متوقف مؤقتاً. اضغط «استكمال الرفع» عند الجاهزية.');
          if(state==='resuming')showMessage('🔄 جارٍ استكمال الأجزاء المرفوعة سابقاً...');
        }
      });
      showMessage('✅ اكتمل الرفع. جارٍ نشر الفيديو وإنشاء إعلان للأعضاء...');
      const published=await rpc(destination==='guide'?'academy_guide_video_publish':'academy_leader_video_publish',{
        p_token:session(),p_title:title,p_description:description,
        p_object_path:uploaded.path,p_content_type:mime,p_file_size:file.size
      });
      if(!published||!published.video_id)throw Error('اكتمل رفع الملف لكن تعذر إرسال الإعلان. اضغط نشر مرة ثانية لإعادة محاولة الحفظ دون رفع الملف من البداية.');
      window.__DXN_ACADEMY_RESUMABLE__?.clearDraft();
      document.getElementById('academyLeaderUploadForm')?.reset();
      academyClearLocalPreview();
      const panel=document.getElementById('academyLeaderLocalPreview');
      const meta=document.getElementById('academyLeaderMetaFields');
      if(panel)panel.hidden=true;
      if(meta)meta.hidden=true;
      if(destination==='guide')await loadGuideVideos();else await loadVideos();
      showMessage(destination==='guide'
        ?'✅ أُضيف الفيديو إلى دليل استخدام المجتمع، وأُرسل إعلان واحد للأعضاء.'
        :'✅ تم نشر الفيديو وإنشاء إعلان تلقائي للأعضاء! بإمكانهم فتحه من الرسالة.');
    }catch(err){showMessage('تعذر النشر: '+err.message,true)}
    finally{
      if(uploadInput)uploadInput.disabled=false;
      button.disabled=!localVideoPreviewUrl;
    }
  }
  function mount(){
    const root=document.querySelector('.academy-root');
    if(root===activeRoot)return;
    if(activeRoot)academyClearLocalPreview();
    activeRoot=root||null;
    if(root)makeControls(root);
  }
  window.academyOpenLeaderVideo=function(id){
    return selectVideo(id);
  };
  window.academyLeaderVideosMount=mount;
  window.academyLeaderVideoRefresh=loadVideos;
  const css=document.createElement('style');
  css.textContent=[
    '.academy-guide-upload-slot{display:grid;gap:12px;margin:14px 0}',
    '.academy-guide-added{margin-top:22px;border:1px solid #d7e5db;background:#f7fbf9;border-radius:17px;padding:17px;display:grid;gap:14px}',
    '.academy-guide-added-header h3{margin:0 0 7px;color:#145840;font-size:20px}',
    '.academy-guide-added-header p{margin:0;color:#506a5c}',
    '.academy-leader-welcome-note[hidden]{display:none!important}',
    '.academy-leader-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
    '.academy-leader-tabs button{padding:12px 8px;border-radius:14px;border:1px solid #b9d2c6;background:#fff;color:#14533b;font:inherit;font-weight:900;cursor:pointer}',
    '.academy-leader-tabs button.active{background:#145840;color:#fff}',
    '.academy-root [data-academy-guide-element][hidden],.academy-leader-library[hidden]{display:none!important}',
    '.academy-leader-library{display:grid;gap:13px;direction:rtl}',
    '.academy-leader-header{padding:22px;border-radius:18px;color:#fff;background:linear-gradient(115deg,#104432,#227454)}',
    '.academy-leader-header h2{color:#fff;font-size:25px;margin:7px 0}',
    '.academy-leader-header p{margin:0;color:#ebfff2}',
    '.academy-leader-upload{background:#fff;border:1px solid #d7e5db;padding:17px;border-radius:17px;display:grid;gap:12px}',
    '.academy-leader-upload>strong{font-size:19px;color:#145840}',
    '.academy-leader-upload label{display:grid;gap:6px;font-weight:850}',
    '.academy-leader-upload input,.academy-leader-upload textarea{font:inherit;border:1px solid #bfcec6;border-radius:11px;padding:12px;width:100%;box-sizing:border-box}',
    '.academy-leader-upload button{background:#16694a;color:#fff;border:0;padding:13px;border-radius:12px;font:inherit;font-weight:900;cursor:pointer}',
    '.academy-leader-upload button:disabled{opacity:.6}',
    '.academy-leader-upload small{color:#667085;line-height:1.7}',
    '.academy-leader-local-preview{display:grid;gap:10px;border:1px solid #b7d9c3;border-radius:15px;padding:14px;background:#f1f9f3}',
    '.academy-leader-local-preview[hidden],.academy-leader-meta-fields[hidden]{display:none!important}',
    '.academy-leader-local-preview strong{font-size:17px;color:#15543d}',
    '.academy-leader-local-file{overflow-wrap:anywhere;font-size:13px;color:#547365}',
    '.academy-leader-local-player{display:block;width:100%;max-height:60vh;min-height:180px;object-fit:contain;background:#081b15;border-radius:12px}',
    '.academy-leader-local-hint{margin:0;color:#3e6c53;font-size:13px;line-height:1.8}',
    '.academy-leader-write-title{width:100%;min-height:44px;border:1px solid #a5cdb1!important;background:#e5f4e8!important;color:#15543d!important}',
    '.academy-leader-meta-fields{display:grid;gap:12px;border-top:1px solid #d6e6d9;padding-top:16px}',
    '.academy-leader-upload button:disabled{opacity:.55;cursor:not-allowed}',
    '#academyLeaderVideoMessage{font-weight:750;color:#22593e;line-height:1.8}',
    '#academyLeaderVideoMessage.error,.academy-leader-loading.error{color:#b42318}',
    '.academy-leader-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}',
    '.academy-leader-video-entry{display:grid;gap:8px;align-content:start}',
    '.academy-leader-welcome-badge{border-radius:10px;padding:7px 10px;background:#e1f3e5;color:#15543d;font-weight:900;font-size:13px;text-align:center}',
    '.academy-leader-welcome-preview{border:1px solid #b5d1c0;border-radius:10px;background:#e6f3ea;color:#15543d;padding:11px 10px;font:inherit;font-weight:900;cursor:pointer}',
    '.academy-leader-preview-marker{border-radius:9px;background:#fff7dc;color:#755718;padding:9px 12px;font-weight:800;font-size:12px;line-height:1.6;margin-bottom:11px}',
    '.academy-leader-set-welcome{border:1px solid #b7d4bd;background:#f2fbf4;color:#14563e;font:inherit;font-size:13px;font-weight:850;border-radius:10px;padding:10px;cursor:pointer}',
    '.academy-leader-welcome-note{margin:0;background:#f3f9ec;border:1px solid #dfebc4;border-radius:12px;padding:10px;font-size:13px;line-height:1.8;color:#456338}',
    '.academy-leader-progress-wrap{display:grid;gap:8px;border:1px solid #b5d6c0;background:#f2faf4;border-radius:13px;padding:12px}',
    '.academy-leader-progress-wrap[hidden],.academy-leader-progress-wrap button[hidden]{display:none!important}',
    '.academy-leader-progress-wrap progress{height:18px;width:100%;accent-color:#16734d}',
    '.academy-leader-progress-text{font-weight:900;font-variant-numeric:tabular-nums;direction:ltr;text-align:center}',
    '.academy-leader-progress-wrap button{background:#d6ecdb;color:#155039}',
    '.academy-leader-card{display:flex;flex-direction:column;align-items:stretch;gap:10px;direction:rtl;text-align:right;width:100%;padding:10px;background:#fff;border:1px solid #d9e9df;border-radius:16px;font:inherit;cursor:pointer;box-shadow:0 5px 18px rgba(12,77,48,.07);transition:border-color .15s,box-shadow .15s}',
    '.academy-leader-card:hover{border-color:#9bc8aa;box-shadow:0 9px 22px rgba(12,77,48,.12)}',
    '.academy-leader-card-copy{display:grid;gap:5px;min-width:0;flex:1}',
    '.academy-leader-card-copy strong{font-size:17px;color:#135239;overflow-wrap:anywhere}',
    '.academy-leader-card-copy small,.academy-leader-card-copy time{color:#667085}',
    '.academy-leader-cover{position:relative;display:block;aspect-ratio:9/16;width:100%;max-width:330px;margin-inline:auto;overflow:hidden;border-radius:13px;background:#103f32;color:#fff;isolation:isolate}',
    '.academy-leader-cover-art,.academy-leader-cover-shade{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
    '.academy-leader-cover-art{object-fit:fill}',
    '.academy-leader-cover-shade{top:14.4%;left:7.4%;width:85.1%;height:12%;border:2px solid #b98b42;border-radius:12%/22%;background:linear-gradient(115deg,#073324,#0c382b 46%,#093b2b);box-shadow:inset 0 0 20px #06170f,0 3px 6px #0f281c88;z-index:1}',
    '.academy-leader-cover-brand{position:absolute;top:25.15%;left:27.4%;width:45.2%;height:5%;display:grid;place-items:center;z-index:3;padding:0 2px;border:1.7px solid #d5ac62;border-radius:999px;background:linear-gradient(110deg,#073122,#0d4531);box-shadow:0 2px 6px #1a2b15aa;font-size:clamp(10px,2vw,16px);font-weight:950;white-space:nowrap;color:#fff0bf}',
    '.academy-leader-cover-title{position:absolute;top:14.4%;left:7.4%;width:85.1%;height:12%;z-index:2;display:flex;align-items:center;justify-content:center;text-align:center;padding:3%;font-size:clamp(16px,2.45vw,24px);line-height:1.22;font-weight:950;color:#f4ce80;overflow-wrap:anywhere;overflow:hidden;text-shadow:0 2px 3px #0009}',
    '.academy-leader-cover-play{position:absolute;left:4%;bottom:4%;z-index:3;width:38px;height:38px;border-radius:50%;background:rgba(237,203,130,.94);color:#135139;display:grid;place-items:center;font-size:17px;box-shadow:0 3px 12px rgba(0,0,0,.25)}',
    '.academy-leader-video-thumb{position:relative;display:block;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:13px;background:#0a382b;isolation:isolate}',
    '.academy-leader-video-thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#04160d22 0%,transparent 35%,#06160b9a 100%);z-index:1;pointer-events:none}',
    '.academy-leader-video-thumb-art{display:block;width:100%;height:100%;object-fit:cover;object-position:center 45%}',
    '.academy-leader-video-tag{position:absolute;right:10px;top:10px;z-index:2;border-radius:8px;background:#053d2dd9;color:#fff2c6;font-size:13px;font-weight:950;padding:7px 10px}',
    '.academy-leader-video-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;width:74px;height:74px;border:3px solid #fff3d8;border-radius:50%;display:grid;place-items:center;background:#e3bf6d;color:#0a4937;font-size:30px;padding-left:4px;box-shadow:0 0 0 8px #092e2580,0 7px 24px #0008}',
    '.academy-leader-video-hint{position:absolute;inset:auto 5px 11px;z-index:2;color:white;font-size:14px;font-weight:950;text-align:center;text-shadow:0 2px 5px #000}',
    '.academy-leader-card:hover .academy-leader-video-play,.academy-leader-card:focus-visible .academy-leader-video-play{transform:translate(-50%,-50%) scale(1.08)}',
    '.academy-leader-cover-preview{max-width:480px;width:100%;margin:3px auto}',
    '.academy-leader-stage-cover{margin-bottom:12px}',
    '.academy-leader-preview-link{font-size:14px;font-weight:800;color:#1a6846;text-decoration:underline;text-underline-offset:4px}',
    '@media(min-width:600px){.academy-leader-stage-cover .academy-leader-cover-title{font-size:clamp(17px,2.45vw,24px)}}',
    '#academyLeaderVideoPlayer:empty{display:none}',
    '#academyLeaderVideoPlayer{background:#fff;border:1px solid #dce8e0;border-radius:15px;padding:14px}',
    '.academy-leader-player{width:100%;height:auto;max-height:68vh;background:#101820;border-radius:13px}',
    '@media(max-width:520px){.academy-leader-tabs button{font-size:13px}.academy-leader-card{padding:9px}.academy-leader-header h2{font-size:22px}.academy-leader-cover-title{font-size:clamp(15px,4.3vw,20px)}.academy-leader-cover-brand{font-size:clamp(10px,3vw,14px)}}'
  ].join('');
  document.head.append(css);
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.body,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
