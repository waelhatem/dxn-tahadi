(function(){
const MODEL='https://cdn.3dassets.dev/assets/26695/v1/model.glb';
const VIEWER='https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js';
let ready=null,busy=false,overlay=null;

function load(){
  if(customElements.get('model-viewer')) return Promise.resolve();
  if(ready) return ready;
  ready=new Promise(function(ok,no){
    var s=document.createElement('script');
    s.type='module'; s.src=VIEWER;
    s.onload=function(){customElements.whenDefined('model-viewer').then(ok)};
    s.onerror=no; document.head.appendChild(s);
  });
  return ready;
}

function css(){
  if(document.getElementById('ragwan3dcss')) return;
  var s=document.createElement('style');
  s.id='ragwan3dcss';
  s.textContent='.ragwan3d{position:fixed;inset:0;z-index:99999;background:transparent;opacity:0;transition:opacity .9s ease;display:block}.ragwan3d.show{opacity:1}.ragwan3dbox{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:transparent;box-shadow:none;transform:none!important}.ragwan3dportal{position:absolute;left:50%;top:50%;width:30vw;height:68vh;transform:translate(-50%,-50%);z-index:1;background:transparent;box-shadow:0 0 0 100vmax rgba(4,15,13,.985);pointer-events:none;}.ragwan3dtop{position:absolute;top:16px;left:20px;right:20px;z-index:3;display:flex;justify-content:space-between;align-items:center;direction:rtl;color:#fff;font-weight:900;pointer-events:none}.ragwan3dnum{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;margin-left:8px;background:linear-gradient(145deg,#f7df88,#b8861b);color:#2c2411}.ragwan3dclose{pointer-events:auto;width:42px;height:42px;border:1px solid #ffffff44;border-radius:50%;background:#ffffff18;color:#fff;font-size:24px}.ragwan3dviewer{position:absolute;inset:0;width:100%;height:100%;background:transparent;--poster-color:transparent;--progress-bar-color:#f2cc58}.ragwan3dbottom{position:absolute;bottom:18px;left:0;right:0;z-index:3;text-align:center;direction:rtl;pointer-events:none}.ragwan3dstatus{display:inline-block;padding:8px 15px;border-radius:999px;background:#ffffff10;border:1px solid #ffffff18;color:#eaf7f2;font-size:12px}@media(max-width:620px){.ragwan3dtop{top:10px;left:10px;right:10px}}';
  document.head.appendChild(s);
}

function step(d){
  var m=String(d.id||'').match(/ragwanDoor(\d+)/);
  return m?Number(m[1]):1;
}

function open3d(d){
  if(busy) return;
  busy=true; css();
  var n=step(d);
  var prepare=window.ragwanOpenDoor;
  if(prepare){
    try{prepare(n)}catch(e){console.error(e)}
    var panel=document.getElementById('ragwanStepPanel');
    if(panel){
      var top=window.scrollY+panel.getBoundingClientRect().top-Math.max(90,window.innerWidth<=620?78:90);
      window.scrollTo({top:Math.max(0,top),behavior:'auto'});
    }
  }
  var title=(d.querySelector('.ragwan-door-label')||{}).textContent||'الخطوة';

  overlay=document.createElement('div');
  overlay.className='ragwan3d';
  overlay.innerHTML='<div class="ragwan3dbox"><div class="ragwan3dtop"><div><span class="ragwan3dnum">'+n+'</span>'+title+'</div><button class="ragwan3dclose" type="button">×</button></div><model-viewer class="ragwan3dviewer" src="'+MODEL+'" camera-orbit="0deg 76deg 8.2m" camera-target="0m 1.3m 0m" field-of-view="28deg" interaction-prompt="none" disable-pan disable-tap shadow-intensity="0.45" exposure="1.65" tone-mapping="aces" skybox-image="" environment-image="neutral" loading="eager"></model-viewer><div class="ragwan3dbottom"><div class="ragwan3dstatus">جارٍ تحميل الباب...</div></div></div>';

  document.body.appendChild(overlay);
  document.body.style.overflow='hidden';
  requestAnimationFrame(function(){overlay.classList.add('show')});

  var v=overlay.querySelector('model-viewer');
  var portal=overlay.querySelector('.ragwan3dportal');
  var st=overlay.querySelector('.ragwan3dstatus');
  var done=false,timer;

  function finish(){
    if(done) return;
    done=true;
    if(timer) clearTimeout(timer);
    document.body.style.overflow='';
    overlay.classList.remove('show');
    setTimeout(function(){
      if(overlay) overlay.remove();
      overlay=null; busy=false;
    },360);
  }

  overlay.querySelector('.ragwan3dclose').onclick=finish;

  load().then(function(){
    st.textContent='جارٍ تحميل الباب الواقعي...';
    v.addEventListener('load',function(){
      var a=v.availableAnimations||[];
      var name=a.find(function(x){return x.toLowerCase()==='open'})||a.find(function(x){return x.toLowerCase().indexOf('open')>=0});

      if(!name){
        st.textContent='تم تحميل الباب';
        timer=setTimeout(finish,1200);
        return;
      }

      v.animationName=name;
      v.currentTime=0;
      v.timeScale=.82;
      try{var vr=v.getBoundingClientRect(),seen=[];[[vr.left+vr.width*.38,vr.top+vr.height*.50],[vr.left+vr.width*.62,vr.top+vr.height*.50],[vr.left+vr.width*.50,vr.top+vr.height*.20]].forEach(function(pt){var mat=v.materialFromPoint(pt[0],pt[1]);if(mat&&seen.indexOf(mat)<0){seen.push(mat);mat.setAlphaMode('BLEND');mat.pbrMetallicRoughness.setBaseColorFactor([1,1,1,0]);}})}catch(x){}

      var start=performance.now(),approachEnd=5200,entryEnd=19000,fromR=8.2,doorR=5.1,nearR=.22,opened=false;
      function dolly(now){
        var elapsed=now-start,p,e,r,targetZ=0;
        if(elapsed<approachEnd){
          p=elapsed/approachEnd;e=p*p*(3-2*p);r=fromR+(doorR-fromR)*e;
          st.textContent='اقترب ببطء من الباب...';
        }else{
          if(!opened){opened=true;st.textContent='🚪 الباب يفتح...';try{v.play({repetitions:1})}catch(x){}}
          p=Math.min(1,(elapsed-approachEnd)/(entryEnd-approachEnd));e=p*p*(3-2*p);
          r=doorR+(nearR-doorR)*e;
          var pass=Math.max(0,Math.min(1,(p-.28)/.72));
          targetZ=-3.2*(pass*pass*(3-2*pass));
          st.textContent='✨ الدخول المستمر عبر الباب...';
          if(portal){var reveal=Math.max(0,Math.min(1,(p-.58)/.42));portal.style.width=(30+70*reveal)+'vw';portal.style.height=(68+32*reveal)+'vh';}
        }
        try{v.cameraOrbit='0deg 76deg '+r.toFixed(3)+'m';v.cameraTarget='0m 1.3m '+targetZ.toFixed(3)+'m'}catch(x){}
        if(elapsed<entryEnd)requestAnimationFrame(dolly);else setTimeout(finish,180);
      }
        }else{
          setTimeout(finish,250);
        }
      }

      requestAnimationFrame(dolly);
    },{once:true});

    v.addEventListener('error',function(){
      st.textContent='تعذر تحميل النموذج';
      timer=setTimeout(finish,700);
    },{once:true});
  }).catch(function(){
    st.textContent='تعذر تشغيل العرض ثلاثي الأبعاد';
    timer=setTimeout(finish,700);
  });
}

window.ragwanDoor3DOpen=open3d;

document.addEventListener('click',function(e){
  var d=e.target.closest&&e.target.closest('.ragwan-door');
  if(!d||d.disabled||busy) return;
  e.preventDefault();
  e.stopPropagation();
  open3d(d);
},true);
})();