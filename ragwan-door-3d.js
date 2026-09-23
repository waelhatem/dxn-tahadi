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
      '.ragwan3dportal{position:absolute;left:50%;top:50%;width:26vw;height:68vh;transform:translate(-50%,-50%);z-index:2;background:transparent;box-shadow:0 0 0 100vmax rgba(4,15,13,.985);pointer-events:none}'+
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

  function openBook1(door){
    if(busy) return;
    busy=true;
    injectBookCss();

    const n=1;
    if(typeof window.ragwanOpenDoor==='function'){
      try{ window.ragwanOpenDoor(n); }catch(e){ console.error(e); }
      const panel=document.getElementById('ragwanStepPanel');
      if(panel){
        const top=window.scrollY+panel.getBoundingClientRect().top-Math.max(90,window.innerWidth<=620?78:90);
        window.scrollTo({top:Math.max(0,top),behavior:'auto'});
      }
    }

    const label=door.querySelector('.ragwan-door-label');
    const title=label?label.textContent.trim():'عرض فكرة العمل مع رد الاعتراضات';
    const detail='عرض فكرة العمل على الشخص بطريقة واضحة، ثم التعامل مع اعتراضاته وتحديد الخطوة التالية معه.';

    overlay=document.createElement('div');
    overlay.className='ragwan-book-overlay';
    overlay.innerHTML=
      '<div class="ragwan-book-scene">'+
        '<button class="ragwan-book-close" type="button" aria-label="إغلاق">×</button>'+
        '<div class="ragwan-book-title">'+
          '<span class="ragwan-book-num">1</span>'+title+
        '</div>'+
        '<div class="ragwan-book">'+
          '<div class="ragwan-book-pages"><div class="ragwan-page-lines"></div></div>'+
          '<div class="ragwan-book-back"></div>'+
          '<div class="ragwan-book-cover">'+
            '<div class="ragwan-book-cover-inner">'+
              '<span class="ragwan-book-cover-num">1</span>'+
              '<strong>'+title+'</strong>'+
              '<span>'+detail+'</span>'+ 
            '</div>'+ 
          '</div>'+ 
          '<div class="ragwan-book-spine"></div>'+ 
        '</div>'+ 
        '<div class="ragwan-book-hint">افتح الكتاب لتبدأ الخطوة</div>'+ 
      '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow='hidden';
    requestAnimationFrame(function(){overlay.classList.add('show');});

    let done=false;
    function finish(){
      if(done) return;
      done=true;
      document.body.style.overflow='';
      if(overlay) overlay.classList.remove('show');
      setTimeout(function(){
        if(overlay) overlay.remove();
        overlay=null;
        busy=false;
      },420);
    }

    overlay.querySelector('.ragwan-book-close').onclick=finish;

    setTimeout(function(){
      if(!overlay || done) return;
      overlay.classList.add('opening');
    },1000);

    setTimeout(function(){
      if(!overlay || done) return;
      overlay.classList.add('revealing');
    },3000);

    setTimeout(finish,5700);
  }

  function injectBookCss(){
    if(document.getElementById('ragwanBookCss')) return;
    const style=document.createElement('style');
    style.id='ragwanBookCss';
    style.textContent=
      '.ragwan-book-overlay{position:fixed;inset:0;z-index:100000;background:radial-gradient(circle at 50% 44%,rgba(29,82,67,.96),rgba(3,20,16,.995) 72%);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .38s ease;direction:rtl;overflow:hidden}'+
      '.ragwan-book-overlay.show{opacity:1}'+
      ' .ragwan-book-overlay.revealing{background:radial-gradient(ellipse 190px 255px at 50% 50%,transparent 0 62%,rgba(3,20,16,.94) 78%,rgba(3,20,16,.995) 100%)}'+
      '.ragwan-book-scene{position:relative;width:min(92vw,760px);height:min(92vh,760px);display:flex;align-items:center;justify-content:center;perspective:1400px}'+
      '.ragwan-book-title{position:absolute;top:18px;right:18px;left:18px;text-align:center;color:#fff;font-weight:950;font-size:clamp(15px,2.2vw,24px);text-shadow:0 3px 18px #0008;z-index:10}'+
      '.ragwan-book-num{display:inline-grid;place-items:center;width:34px;height:34px;margin-left:8px;border-radius:50%;background:linear-gradient(145deg,#f7df88,#b8861b);color:#2c2411;vertical-align:middle}'+
      '.ragwan-book-close{position:absolute;top:12px;left:12px;width:42px;height:42px;border-radius:50%;border:1px solid #ffffff44;background:#ffffff18;color:#fff;font-size:24px;z-index:20;cursor:pointer}'+
      '.ragwan-book{position:relative;width:300px;height:400px;transform:translateY(18px) rotateX(4deg) scale(.82);transform-style:preserve-3d;filter:drop-shadow(0 30px 28px rgba(0,0,0,.48));transition:transform 1.55s cubic-bezier(.2,.8,.2,1)}'+
      '.ragwan-book-overlay.opening .ragwan-book{transform:translateY(0) rotateX(2deg) scale(1.08)}'+
      '.ragwan-book-overlay.revealing .ragwan-book{transform:translateY(0) rotateX(0) scale(1.18)}'+
      '.ragwan-book-pages,.ragwan-book-back,.ragwan-book-cover{position:absolute;inset:0;border-radius:8px 14px 14px 8px;transform-style:preserve-3d}'+
      '.ragwan-book-back{background:linear-gradient(100deg,#4e2614,#8a4a25 55%,#3a1c10);box-shadow:inset -12px 0 20px #0006,inset 5px 0 8px #fff1}'+
      '.ragwan-book-pages{right:10px;left:9px;top:10px;bottom:10px;background:repeating-linear-gradient(0deg,#f8f0da 0,#f8f0da 5px,#ded3b8 6px,#fff8e8 8px);box-shadow:inset 0 0 18px #8d775633,0 4px 7px #0005;transform:translateZ(8px);transition:opacity 1.4s ease,transform 1.4s ease}'+
      '.ragwan-book-overlay.revealing .ragwan-book-pages{opacity:.08;transform:translateZ(2px) scale(.98)}'+
      '.ragwan-page-lines{position:absolute;inset:22px 20px;background:repeating-linear-gradient(180deg,transparent 0 20px,rgba(88,72,49,.16) 21px 22px);opacity:.7}'+
      '.ragwan-book-cover{background:linear-gradient(135deg,#173e32,#0d2b22 58%,#082019);transform-origin:right center;transform:translateZ(14px) rotateY(0deg);transition:transform 1.35s cubic-bezier(.2,.75,.18,1);box-shadow:inset -8px 0 12px #0007,inset 5px 0 12px #ffffff0d}'+
      '.ragwan-book-overlay.opening .ragwan-book-cover{transform:translateZ(14px) rotateY(-155deg)}'+
      '.ragwan-book-cover-inner{position:absolute;inset:24px 20px;border:1px solid #d9b85d88;border-radius:5px;padding:34px 22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;color:#f9e8ad;backface-visibility:hidden;box-shadow:inset 0 0 25px #0003}'+
      '.ragwan-book-cover-inner strong{font-size:25px;line-height:1.55}.ragwan-book-cover-inner>span:last-child{font-size:12px;line-height:1.8;color:#e8dfc7;opacity:.9}'+
      '.ragwan-book-cover-num{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#f8df88,#a87516);color:#2d230d;font-size:25px;font-weight:950;box-shadow:0 8px 20px #0004}'+
      '.ragwan-book-spine{position:absolute;top:0;right:-10px;width:18px;height:100%;border-radius:5px;background:linear-gradient(90deg,#35180d,#9a5229,#4a2413);transform:translateZ(2px);box-shadow:0 0 10px #0007}'+
      '.ragwan-book-hint{position:absolute;bottom:30px;color:#dbece5;font-size:13px;opacity:.86;transition:opacity .3s}.ragwan-book-overlay.opening .ragwan-book-hint{opacity:0}'+
      '@media(max-width:620px){.ragwan-book-scene{width:100vw;height:100vh}.ragwan-book{width:220px;height:300px;transform:translateY(18px) rotateX(4deg) scale(.76)}.ragwan-book-overlay.opening .ragwan-book{transform:translateY(0) rotateX(2deg) scale(.9)}.ragwan-book-overlay.revealing .ragwan-book{transform:translateY(0) rotateX(0) scale(1.02)}.ragwan-book-cover-inner{inset:16px 14px;padding:22px 12px;gap:11px}.ragwan-book-cover-inner strong{font-size:19px}.ragwan-book-cover-inner>span:last-child{font-size:10px;line-height:1.7}.ragwan-book-title{top:60px;right:48px;left:48px;font-size:14px}.ragwan-book-num{width:28px;height:28px;font-size:12px}.ragwan-book-close{top:12px;left:12px}.ragwan-book-hint{bottom:34px;font-size:11px}}';
    document.head.appendChild(style);
  }

  function open3d(door){
    if(getStepNumber(door)===1){ openBook1(door); return; }
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
              portal.style.width=(26+29*reveal)+'vw';
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