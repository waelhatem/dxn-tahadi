/* Leader video library: second folder inside the existing Community Academy.
   Existing three training-guide videos remain untouched. */
(function(){
  'use strict';
  if(window.__DXN_ACADEMY_LEADER_VIDEOS__)return;
  window.__DXN_ACADEMY_LEADER_VIDEOS__=true;
  const BUCKET='platform-academy';
  const MAX_BYTES=50*1024*1024;
  const PROJECT='https://ryqpstkzppaifpvhezzn.supabase.co';
  const PUBLISHABLE='sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh';
  const COVER_SRC='/academy-leader-photo.avif';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const TYPES=['video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'];
  let mode='guide',pendingVideo='',videos=[],activeRoot=null,loading=false;
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
        +'<strong>👑 أضف شرحاً جديداً من هاتفك</strong>'
        +'<label>عنوان الفيديو<input id="academyLeaderVideoTitle" maxlength="160" required placeholder="مثال: طريقة استخدام تبويب فريقي"></label>'
        +'<label>موضوع الشرح ووصفه<textarea id="academyLeaderVideoDescription" maxlength="700" rows="3" required placeholder="اكتب باختصار ما الذي سيتعلمه العضو"></textarea></label>'
        +'<label>اختر ملف الفيديو<input type="file" id="academyLeaderVideoFile" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp,.mp4,.mov,.webm,.m4v,.3gp" required></label>'
        +'<small>MP4 / MOV / WebM — الحد الحالي 50 ميغابايت. سيتم إرسال إعلان مشاهدة جديد للأعضاء بعد اكتمال النشر فقط.</small>'
        +'<div class="academy-leader-cover-preview" id="academyLeaderCoverPreview" aria-label="معاينة الغلاف الموحد"></div>'
        +'<small>🖼️ صورتك المعتمدة ثابتة لجميع الفيديوهات؛ يتغيّر العنوان تلقائياً، وعبارة «شروحات القائد» ثابتة، دون أي مونتاج.</small>'
        +'<a class="academy-leader-preview-link" href="/academy-cover-preview.html" target="_blank" rel="noopener">👁️ افتح معاينة الغلاف للموبايل واللابتوب</a>'
        +'<button type="submit" id="academyLeaderPublishButton">⬆️ رفع الفيديو ونشره</button>'
        +'</form>':'')
      +'<div role="status" aria-live="polite" id="academyLeaderVideoMessage"></div>'
      +'<div id="academyLeaderVideoPlayer"></div><div id="academyLeaderVideoList"></div>';
    root.appendChild(section);
    const form=section.querySelector('#academyLeaderUploadForm');
    if(form){
      form.addEventListener('submit',function(event){event.preventDefault();uploadVideo()});
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
  function setMode(next){
    mode=next==='leader'?'leader':'guide';
    const root=document.querySelector('.academy-root');
    if(!root)return;
    const host=root.querySelector('#academyLeaderVideosHost');
    const tabs=root.querySelector('#academyLeaderTabSwitch');
    if(!host||!tabs)return;
    root.querySelectorAll('[data-academy-guide-element]').forEach(n=>{n.hidden=mode==='leader'});
    host.hidden=mode!=='leader';
    tabs._buttons?.guide.classList.toggle('active',mode==='guide');
    tabs._buttons?.leader.classList.toggle('active',mode==='leader');
    if(mode==='leader')loadVideos();
  }
  async function loadVideos(){
    const host=document.getElementById('academyLeaderVideosHost');
    if(!host||loading)return;
    loading=true;
    try{
      const rows=await rpc('academy_leader_videos_list',{p_token:session()});
      if(!Array.isArray(rows))throw Error('البيانات الواردة غير صالحة');
      videos=rows.filter(item=>UUID.test(item.id));
      renderList();
      if(pendingVideo){const id=pendingVideo;pendingVideo='';await selectVideo(id)}
      else if(!videos.length)showMessage('🎬 لم تُنشر شروحات جديدة بعد. الفيديوهات الثلاثة الحالية محفوظة في «دليل استخدام المجتمع».');
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
      const button=elem('button','academy-leader-card');
      button.type='button';
      button.append(coverElement(v.title));
      const copy=elem('span','academy-leader-card-copy');
      copy.append(elem('strong','',v.title));
      if(v.description)copy.append(elem('small','',v.description));
      const date=new Date(v.published_at);
      if(Number.isFinite(date.getTime()))copy.append(elem('time','',date.toLocaleDateString('ar-IQ')));
      button.append(copy);
      button.addEventListener('click',()=>selectVideo(v.id));
      grid.append(button);
    }
    wrap.append(grid);
  }
  async function selectVideo(id){
    if(!UUID.test(id))return;
    const video=videos.find(v=>v.id===id);
    if(!video){pendingVideo=id;return}
    const host=document.getElementById('academyLeaderVideoPlayer');
    if(!host)return;
    host.replaceChildren();
    const title=elem('h3','', '🎬 '+video.title);
    const label=elem('p','',video.description||'شرح من شروحات القائد');
    const cover=coverElement(video.title);
    cover.classList.add('academy-leader-stage-cover');
    const status=elem('p','academy-leader-loading','جارٍ تجهيز تشغيل الفيديو...');
    status.textContent='جارٍ تجهيز تشغيل الفيديو...';
    host.append(cover,title,label,status);
    try{
      const result=await post('/api/academy-video-storage',{action:'play',p_token:session(),video_id:id});
      if(!UUID.test(id)||!document.getElementById('academyLeaderVideoPlayer'))return;
      status.remove();
      cover.remove();
      const player=elem('video','academy-leader-player');
      player.controls=true;player.playsInline=true;player.preload='metadata';player.src=result.url;
      host.append(player);
      host.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){status.textContent='تعذر فتح الفيديو: '+err.message;status.classList.add('error')}
  }
  function inferredType(file){
    const typed=String(file.type||'').toLowerCase();
    if(TYPES.includes(typed))return typed;
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    return {mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',m4v:'video/x-m4v','3gp':'video/3gpp'}[ext]||'';
  }
  async function uploadVideo(){
    if(!isLeader())return;
    const button=document.getElementById('academyLeaderPublishButton');
    const title=String(document.getElementById('academyLeaderVideoTitle')?.value||'').trim();
    const description=String(document.getElementById('academyLeaderVideoDescription')?.value||'').trim();
    const file=document.getElementById('academyLeaderVideoFile')?.files?.[0];
    if(!button||!file||title.length<4||title.length>160||description.length<5){showMessage('اكتب عنوان الفيديو وموضوعه، ثم اختر ملف الفيديو.',true);return}
    if(file.size>MAX_BYTES){showMessage('حجم الفيديو أكبر من 50 ميغابايت. اضغط الملف أولاً ثم حاول.',true);return}
    const mime=inferredType(file);
    if(!mime){showMessage('صيغة الفيديو غير مدعومة. استخدم MP4 أو MOV أو WebM.',true);return}
    button.disabled=true;
    try{
      showMessage('🔐 جارٍ تجهيز رفع آمن للفيديو...');
      const prepared=await post('/api/academy-video-storage',{
        action:'prepare',p_token:session(),file_size:file.size,content_type:mime
      });
      if(!window.supabase||typeof window.supabase.createClient!=='function')throw Error('مكتبة رفع الفيديو غير متاحة، حدث الصفحة');
      const client=window.supabase.createClient(PROJECT,PUBLISHABLE);
      showMessage('⬆️ جارٍ رفع الفيديو من هاتفك إلى التخزين الخاص... لا تغلق الصفحة.');
      const upload=await client.storage.from(BUCKET).uploadToSignedUrl(prepared.path,prepared.upload_token,file,{
        contentType:mime,upsert:false
      });
      if(upload.error)throw Error(upload.error.message||'فشل رفع الملف');
      showMessage('✅ اكتمل الرفع. جارٍ نشر الفيديو وإنشاء إعلان للأعضاء...');
      const published=await rpc('academy_leader_video_publish',{
        p_token:session(),p_title:title,p_description:description,
        p_object_path:prepared.path,p_content_type:mime,p_file_size:file.size
      });
      if(!published||!published.video_id)throw Error('الرفع تم لكن تعذر حفظ إعلان الفيديو. لا تعيد الرفع قبل المراجعة.');
      document.getElementById('academyLeaderUploadForm')?.reset();
      pendingVideo=published.video_id;
      showMessage('✅ تم نشر الفيديو وإنشاء إعلان تلقائي للأعضاء! بإمكانهم فتحه من الرسالة.');
      await loadVideos();
    }catch(err){showMessage('تعذر النشر: '+err.message,true)}
    finally{button.disabled=false}
  }
  function mount(){
    const root=document.querySelector('.academy-root');
    if(!root||root===activeRoot)return;
    activeRoot=root;
    makeControls(root);
  }
  window.academyOpenLeaderVideo=function(id){
    if(!UUID.test(String(id||'')))return;
    pendingVideo=id;
    mode='leader';
    if(!document.querySelector('.academy-root'))window.switchTab?.('academy');
    mount();
    setMode('leader');
    loadVideos();
  };
  window.academyLeaderVideosMount=mount;
  window.academyLeaderVideoRefresh=loadVideos;
  const css=document.createElement('style');
  css.textContent=[
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
    '#academyLeaderVideoMessage{font-weight:750;color:#22593e;line-height:1.8}',
    '#academyLeaderVideoMessage.error,.academy-leader-loading.error{color:#b42318}',
    '.academy-leader-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}',
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
