(function(){
  const MODEL='https://cdn.3dassets.dev/assets/26695/v1/model.glb';
  const VIEWER='https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js';

  let ready=null;
  let busy=false;
  let overlay=null;

  function loadModelViewer(){
    if(customElements.get('model-viewer')) return Promise.resolve();
    if(ready) return ready;

    ready=new Promise(function(resolve,reject){
      const s=document.createElement('script');
      s.type='module';
      s.src=VIEWER;
      s.onload=function(){
        customElements.whenDefined('model-viewer').then(resolve).catch(reject);
      };
      s.onerror=reject;
      document.head.appendChild(s);
    });

    return ready;
  }

  function injectCss(){
    if(document.getElementById('ragwan3dcss')) return;

    const style=document.createElement('style');
    style.id='ragwan3dcss';
    style.textContent=
      '.ragwan3d{position:fixed;inset:0;z-index:99999;background:transparent;opacity:0;transition:opacity .35s ease;display:block}'+
      '.ragwan3d.show{opacity:1}'+
      '.ragwan3dbox{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:transparent}'+
      '.ragwan3dportal{position:absolute;left:50%;top:50%;width:30vw;height:68vh;transform:translate(-50%,-50%);z-index:2;background:transparent;box-shadow:0 0 0 100vmax rgba(4,15,13,.985);pointer-events:none}'+
      '.ragwan3dtop{position:absolute;top:16px;left:20px;right:20px;z-index:4;display:flex;justify-content:space-between;align-items:center;direction:rtl;color:#fff;font-weight:900;pointer-events:none}'+
      '.ragwan3dnum{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;margin-left:8px;background:linear-gradient(145deg,#f7df88,#b8861b);color:#2c2411}'+
      '.ragwan3dclose{pointer-events:auto;width:42px;height:42px;border:1px solid #ffffff44;border-radius:50%;background:#ffffff18;color:#fff;font-size:24px;cursor:pointer}'+
      '.ragwan3dviewer{position:absolute;inset:0;width:100%;height:100%;background:transparent;--poster-color:transparent;--progress-bar-color:#f2cc58}'+
      '.ragwan3dbottom{position:absolute;bottom:18px;left:0;right:0;z-index:4;text-align:center;direction:rtl;pointer-events:none}'+
      '.ragwan3dstatus{display:inline-block;padding:8px 15px;border-radius:999px;background:#ffffff10;border:1px solid #ffffff18;color:#eaf7f2;font-size:12px}'+
      '@media(max-width:620px){.ragwan3dtop{top:10px;left:10px;right:10px}}';

    document.head.appendChild(style);
  }

  function getStepNumber(door){
    const m=String(door.id||'').match(/ragwanDoor(\d+)/);
    return m?Number(m[1]):1;
  }

  function open3d(door){
    if(busy) return;
    busy=true;
    injectCss();

    const n=getStepNumber(door);

    // Prepare the real step content before opening the 3D scene.
    if(typeof window.ragwanOpenDoor==='function'){
      try{ window.ragwanOpenDoor(n); }catch(e){ console.error(e); }
      const panel=document.getElementById('ragwanStepPanel');
      if(panel){
        const top=window.scrollY+panel.getBoundingClientRect().top-Math.max(90,window.innerWidth<=620?78:90);
        window.scrollTo({top:Math.max(0,top),behavior:'auto'});
      }
    }

    const label=door.querySelector('.ragwan-door-label');
    const title=label?label.textContent.trim():'الخطوة';

    overlay=document.createElement('div');
    overlay.className='ragwan3d';
    overlay.innerHTML=
      '<div class="ragwan3dbox">'+
        '<div class="ragwan3dtop">'+
          '<div><span class="ragwan3dnum">'+n+'</span>'+title+'</div>'+
          '<button class="ragwan3dclose" type="button" aria-label="إغلاق">×</button>'+
        '</div>'+
        '<div class="ragwan3dportal"></div>'+
        '<model-viewer class="ragwan3dviewer"'+
          ' src="'+MODEL+'"'+
          ' camera-orbit="0deg 76deg 8.2m"'+
          ' camera-target="0m 1.3m 0m"'+
          ' min-camera-orbit="auto auto 0.02m"'+
          ' field-of-view="28deg"'+
          ' interaction-prompt="none"'+
          ' disable-pan disable-tap'+
          ' shadow-intensity="0.45" exposure="1.65" tone-mapping="aces"'+
          ' skybox-image="" environment-image="neutral" loading="eager">'+
        '</model-viewer>'+
        '<div class="ragwan3dbottom"><div class="ragwan3dstatus">جارٍ تحميل الباب الواقعي...</div></div>'+
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow='hidden';

    requestAnimationFrame(function(){
      if(overlay) overlay.classList.add('show');
    });

    const viewer=overlay.querySelector('.ragwan3dviewer');
    const portal=overlay.querySelector('.ragwan3dportal');
    const status=overlay.querySelector('.ragwan3dstatus');
    let finished=false;
    let timer=null;

    function finish(){
      if(finished) return;
      finished=true;
      if(timer) clearTimeout(timer);
      document.body.style.overflow='';
      if(overlay) overlay.classList.remove('show');

      setTimeout(function(){
        if(overlay) overlay.remove();
        overlay=null;
        busy=false;
      },360);
    }

    overlay.querySelector('.ragwan3dclose').onclick=finish;

    loadModelViewer().then(function(){
      status.textContent='جارٍ تحميل الباب الواقعي...';

      viewer.addEventListener('load',function(){
        const animations=viewer.availableAnimations||[];
        const openName=
          animations.find(function(x){return x.toLowerCase()==='open'})||
          animations.find(function(x){return x.toLowerCase().indexOf('open')>=0});

        if(!openName){
          status.textContent='تم تحميل الباب';
          timer=setTimeout(finish,1200);
          return;
        }

        viewer.animationName=openName;
        viewer.currentTime=0;
        viewer.timeScale=.82;

        const start=performance.now();
        const approachEnd=5200;
        const entryEnd=19000;
        const fromR=8.2;
        const doorR=5.1;
        const nearR=.02;
        let opened=false;

        function smooth(t){
          t=Math.max(0,Math.min(1,t));
          return t*t*(3-2*t);
        }

        function animate(now){
          const elapsed=now-start;
          let radius;
          let targetZ=0;

          if(elapsed<approachEnd){
            const p=smooth(elapsed/approachEnd);
            radius=fromR+(doorR-fromR)*p;
            status.textContent='اقترب ببطء من الباب...';
          }else{
            if(!opened){
              opened=true;
              status.textContent='🚪 الباب يفتح...';
              try{viewer.play({repetitions:1});}catch(e){console.error(e);}
            }

            const p=smooth((elapsed-approachEnd)/(entryEnd-approachEnd));
            radius=doorR+(nearR-doorR)*p;

            const pass=smooth((p-.20)/.80);
            targetZ=-3.8*pass;

            status.textContent='✨ الدخول المستمر عبر الباب...';

            if(portal){
              const reveal=Math.max(0,Math.min(1,(p-.45)/.55));
              portal.style.width=(30+70*reveal)+'vw';
              portal.style.height=(68+32*reveal)+'vh';
            }
          }

          try{
            viewer.cameraOrbit='0deg 76deg '+radius.toFixed(3)+'m';
            viewer.cameraTarget='0m 1.3m '+targetZ.toFixed(3)+'m';
          }catch(e){}

          if(elapsed<entryEnd){
            requestAnimationFrame(animate);
          }else{
            // Keep the scene moving until the door has fully left the view,
            // then reveal the actual step content.
            status.textContent='✨';
            setTimeout(finish,180);
          }
        }

        requestAnimationFrame(animate);
      },{once:true});

      viewer.addEventListener('error',function(){
        status.textContent='تعذر تحميل النموذج';
        timer=setTimeout(finish,700);
      },{once:true});
    }).catch(function(error){
      console.error(error);
      status.textContent='تعذر تشغيل العرض ثلاثي الأبعاد';
      timer=setTimeout(finish,700);
    });
  }

  window.ragwanDoor3DOpen=open3d;

  // Capture the click before the old door handler so the 3D scene owns the interaction.
  document.addEventListener('click',function(e){
    const door=e.target.closest&&e.target.closest('.ragwan-door');
    if(!door||door.disabled||busy) return;

    e.preventDefault();
    e.stopPropagation();
    open3d(door);
  },true);
})();