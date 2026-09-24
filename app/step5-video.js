/* Step 5 video patch
   Keeps the main training page untouched and appends uploaded video materials
   safely after the Step 5 resource list.
*/
(function(){
  'use strict';

  function isVideo(file){
    const name=String(file&&file.name||'').toLowerCase();
    const mime=String(file&&file.mime||'').toLowerCase();
    return mime.indexOf('video/')===0 || /\.(mp4|webm|mov|m4v|ogg)$/i.test(name);
  }

  function renderVideos(files){
    const arr=Array.isArray(files)?files:[];
    const videos=arr.filter(isVideo);
    const root=document.getElementById('ragwanStepResources');
    if(!root || !videos.length)return;

    const old=root.querySelector('.ragwan-step5-video-section');
    if(old)old.remove();

    const section=document.createElement('section');
    section.className='ragwan-step5-video-section';
    section.style.marginTop='12px';

    const head=document.createElement('div');
    head.className='ragwan-video-material-head';
    const wrap=document.createElement('div');
    const title=document.createElement('b');
    title.textContent='🎥 فيديو الباب الخامس';
    const note=document.createElement('small');
    note.textContent='شاهد الفيديو بعد الاطلاع على الصور والمواد.';
    wrap.appendChild(title);
    wrap.appendChild(note);
    head.appendChild(wrap);
    section.appendChild(head);

    videos.forEach(function(file,index){
      const card=document.createElement('article');
      card.className='ragwan-step-video-card';
      card.style.marginTop='10px';

      const titleRow=document.createElement('div');
      titleRow.className='ragwan-step-video-title';

      const icon=document.createElement('span');
      icon.textContent='🎥';

      const label=document.createElement('b');
      label.textContent=String(file&&file.name||('فيديو '+(index+1)));

      titleRow.appendChild(icon);
      titleRow.appendChild(label);
      card.appendChild(titleRow);

      const video=document.createElement('video');
      video.controls=true;
      video.playsInline=true;
      video.preload='metadata';
      video.style.width='100%';
      video.style.maxHeight='520px';
      video.style.borderRadius='16px';
      video.style.background='#071a14';
      video.style.marginTop='8px';
      video.src=String(file&&file.url||'');
      card.appendChild(video);

      section.appendChild(card);
    });

    root.appendChild(section);
  }

  function install(){
    if(window.__DXN_STEP5_VIDEO_PATCH__)return true;
    if(typeof window.ragwanRenderStepResources!=='function')return false;

    const original=window.ragwanRenderStepResources;
    window.ragwanRenderStepResources=function(files){
      original(files);
      if(Number(window.ragwanCurrentStep)===5 || !window.ragwanCurrentStep){
        renderVideos(files);
      }
    };

    window.__DXN_STEP5_VIDEO_PATCH__=true;
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(function(){
      if(install() || ++tries>120)clearInterval(timer);
    },100);
  }
})();
