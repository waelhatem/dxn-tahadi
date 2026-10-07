(function(){
  'use strict';
  if(window.__DXN_DESIGN_STUDIO_V2__) return;
  window.__DXN_DESIGN_STUDIO_V2__=true;

  const state={
    active:false,
    view:'create',
    mode:'enhance',
    aspect:'1:1',
    preserve:true,
    prompt:'',
    file:null,
    previewUrl:null,
    previewOwned:false,
    loading:false,
    resultDataUrl:null,
    error:'',
    history:[]
  };

  const toolsMap={
    enhance:{icon:'✨',title:'تحسين الصورة',desc:'وضوح، دقة، إضاءة وتنظيف مع الحفاظ على تفاصيل المنتج.',placeholder:'مثال: حسّن الإضاءة والوضوح واجعل الصورة نظيفة واحترافية.'},
    background:{icon:'🖼️',title:'تغيير الخلفية',desc:'إزالة الخلفية أو إنشاء بيئة تسويقية احترافية حول المنتج.',placeholder:'مثال: ضع المنتج على طاولة خشبية أنيقة بإضاءة صباحية وخلفية نظيفة.'},
    ad:{icon:'📣',title:'إنشاء إعلان',desc:'تجهيز صورة تسويقية احترافية جاهزة للنشر على وسائل التواصل.',placeholder:'مثال: أنشئ لقطة إعلانية فاخرة للمنتج مع إضاءة استوديو وخلفية راقية.'},
    free:{icon:'🎨',title:'تصميم حر',desc:'اكتب التعديل المطلوب بلغتك وسيُنفذ وفق تعليماتك.',placeholder:'اكتب بالتفصيل ما الذي تريد تغييره في الصورة...'}
  };

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function studioToast(msg,type='ok'){
    let n=document.getElementById('dsToast');
    if(!n){
      n=document.createElement('div');
      n.id='dsToast';
      n.className='ds-toast';
      document.body.appendChild(n);
    }
    n.className='ds-toast '+(type==='error'?'error':'ok')+' show';
    n.textContent=msg;
    clearTimeout(studioToast.timer);
    studioToast.timer=setTimeout(()=>n.classList.remove('show'),3200);
  }

  function syncBodyMode(){
    if(document.body) document.body.classList.toggle('dxn-design-studio-active',!!state.active);
  }

  function setActiveTabVisual(){
    syncBodyMode();
    document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('active'));
    const btn=document.querySelector('.design-studio-tab');
    if(btn) btn.classList.toggle('active',state.active);
  }

  function injectTab(){
    const tabs=document.querySelector('.tabs');
    if(!tabs) return;
    let btn=tabs.querySelector('.design-studio-tab');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='tab design-studio-tab';
      btn.innerHTML='🎨 استوديو التصميم';
      btn.addEventListener('click',openStudio);
      const community=tabs.querySelector('.community-tab');
      tabs.insertBefore(btn,community||null);
    }
    if(state.active) setActiveTabVisual();
  }

  function resultHtml(){
    if(state.loading){
      return '<div class="ds-result visible loading"><div class="ds-result-loading"><span class="ds-spinner"></span><div><b>جارٍ إنشاء التصميم الاحترافي...</b><p>قد تستغرق العملية من عدة ثوانٍ إلى نحو دقيقتين حسب تعقيد الصورة.</p></div></div></div>';
    }
    if(state.error){
      return '<div class="ds-result visible error"><b>تعذر إنشاء التصميم</b><p>'+esc(state.error)+'</p><button type="button" class="ds-result-retry" data-ds-retry>🔄 إعادة المحاولة</button></div>';
    }
    if(state.resultDataUrl){
      return '<div class="ds-result visible success"><div class="ds-result-head"><div><b>✅ التصميم جاهز</b><p>يمكنك تنزيله أو استخدامه أساسًا لتعديل جديد.</p></div></div><div class="ds-result-image"><img id="dsResultImg" alt="التصميم الناتج"></div><div class="ds-result-actions"><button type="button" class="primary" data-ds-download>⬇️ تنزيل التصميم</button><button type="button" data-ds-use-result>✏️ تعديل النتيجة</button><button type="button" data-ds-regenerate>🔄 إعادة التصميم</button></div></div>';
    }
    return '';
  }

  function historyHtml(){
    if(!state.history.length){
      return '<div class="ds-empty-history"><div><div class="icon">🗂️</div><b>لا توجد تصاميم في هذه الجلسة بعد</b><p>بعد إنشاء أول تصميم سيظهر هنا تلقائيًا.</p></div></div>';
    }
    return '<div class="ds-history-grid">'+state.history.map((item,i)=>
      '<article class="ds-history-card"><img data-ds-history-img="'+i+'" alt="تصميم سابق"><div class="ds-history-meta"><b>'+esc(toolsMap[item.mode]?.title||'تصميم')+'</b><span>'+esc(item.aspect)+' · '+new Date(item.createdAt).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})+'</span></div><div class="ds-history-actions"><button type="button" data-ds-history-use="'+i+'">✏️ تعديل</button><button type="button" data-ds-history-download="'+i+'">⬇️ تنزيل</button></div></article>'
    ).join('')+'</div>';
  }

  function studioHtml(){
    const selected=toolsMap[state.mode]||toolsMap.enhance;
    return '<section class="dxn-design-studio" id="dxnDesignStudio">'
      +'<div class="ds-hero"><span class="ds-kicker">✨ مدعوم بالذكاء الاصطناعي</span>'
      +'<h2>🎨 استوديو التصميم</h2>'
      +'<p>حوّل صور المنتجات إلى محتوى تسويقي احترافي: تحسين، تغيير خلفية، إنشاء إعلان أو تعديل حر مع الحفاظ على تفاصيل المنتج.</p></div>'
      +'<div class="ds-subnav"><button type="button" data-ds-view="create" class="'+(state.view==='create'?'active':'')+'">➕ إنشاء تصميم</button>'
      +'<button type="button" data-ds-view="history" class="'+(state.view==='history'?'active':'')+'">🗂️ تصاميمي <span class="ds-count">'+state.history.length+'</span></button></div>'
      +'<div class="ds-create '+(state.view==='create'?'':'hidden')+'" id="dsCreate">'
      +'<div class="ds-tools">'
      +Object.keys(toolsMap).map(k=>{const t=toolsMap[k];return '<button type="button" class="ds-tool '+(state.mode===k?'active':'')+'" data-ds-mode="'+k+'"><span class="ds-tool-icon">'+t.icon+'</span><b>'+t.title+'</b><span>'+t.desc+'</span></button>'}).join('')
      +'</div>'
      +'<div class="ds-workspace">'
      +'<div class="ds-panel"><h3>1. ارفع صورة المنتج</h3><p class="ds-hint">PNG أو JPG أو WEBP — الصور الكبيرة تُهيّأ تلقائيًا قبل الإرسال.</p>'
      +'<label class="ds-drop" id="dsDrop" for="dsFile"><input class="ds-file" id="dsFile" type="file" accept="image/png,image/jpeg,image/webp">'
      +'<div class="ds-empty-upload" id="dsEmptyUpload"><div class="icon">📷</div><b>اضغط لاختيار صورة</b><span>أو اسحب الصورة وأفلتها هنا<br>حتى 10 MB</span></div>'
      +'<div class="ds-preview" id="dsPreview"><img id="dsPreviewImg" alt="معاينة صورة المنتج"><div class="ds-preview-bar"><button type="button" data-ds-change>🔄 تغيير الصورة</button><button type="button" data-ds-remove>🗑️ إزالة</button></div></div>'
      +'</label></div>'
      +'<div class="ds-panel"><span class="ds-badge">'+selected.icon+' '+selected.title+'</span><h3 style="margin-top:12px">2. إعداد التصميم</h3>'
      +'<div class="ds-form-row"><label class="ds-preserve"><input id="dsPreserve" type="checkbox" '+(state.preserve?'checked':'')+'><span>🔒 الحفاظ على المنتج كما هو</span></label>'
      +'<div class="ds-warning">يحافظ هذا الخيار على العبوة والشعار والألوان والنصوص الأصلية قدر الإمكان، ويمنع إعادة تصميم المنتج نفسه.</div></div>'
      +'<div class="ds-form-row"><div class="ds-label"><span>التعليمات الإضافية</span><small>اختياري</small></div>'
      +'<textarea class="ds-textarea" id="dsPrompt" placeholder="'+esc(selected.placeholder)+'">'+esc(state.prompt)+'</textarea></div>'
      +'<div class="ds-form-row"><div class="ds-label"><span>مقاس التصميم</span></div><div class="ds-aspects">'
      +[['1:1','مربع'],['4:5','منشور'],['9:16','Story'],['16:9','أفقي']].map(a=>'<button type="button" class="ds-aspect '+(state.aspect===a[0]?'active':'')+'" data-ds-aspect="'+a[0]+'">'+a[1]+'<br>'+a[0]+'</button>').join('')
      +'</div></div>'
      +'<button type="button" class="ds-generate" id="dsGenerate" '+(state.loading?'disabled':'')+'>'+(state.loading?'⏳ جارٍ الإنشاء...':'✨ إنشاء التصميم')+'</button>'
      +'<div class="ds-phase-note">يتم إرسال الصورة بأمان إلى محرك الصور من خلال الخادم، ولا يظهر مفتاح الخدمة في المتصفح.</div>'
      +resultHtml()
      +'</div></div></div>'
      +'<div class="ds-history '+(state.view==='history'?'active':'')+'" id="dsHistory">'+historyHtml()+'</div>'
      +'</section>';
  }

  function cleanupPreview(){
    if(state.previewOwned&&state.previewUrl){
      try{URL.revokeObjectURL(state.previewUrl)}catch(_){}
    }
    state.previewUrl=null;state.previewOwned=false;
  }

  function restorePreview(){
    if(!state.previewUrl) return;
    const preview=document.getElementById('dsPreview');
    const img=document.getElementById('dsPreviewImg');
    const empty=document.getElementById('dsEmptyUpload');
    if(preview&&img&&empty){
      img.src=state.previewUrl;
      preview.classList.add('has-image');
      empty.style.display='none';
    }
  }

  function restoreResults(){
    if(state.resultDataUrl){
      const img=document.getElementById('dsResultImg');
      if(img)img.src=state.resultDataUrl;
    }
    document.querySelectorAll('[data-ds-history-img]').forEach(img=>{
      const item=state.history[Number(img.dataset.dsHistoryImg)];
      if(item)img.src=item.dataUrl;
    });
  }

  function mountStudio(){
    const app=document.getElementById('app');
    const tabs=app&&app.querySelector('.tabs');
    if(!app||!tabs) return;
    setActiveTabVisual();
    let nav=app.querySelector('.nav');
    let node=tabs.nextSibling;
    while(node&&node!==nav){
      const next=node.nextSibling;
      node.remove();
      node=next;
    }
    const wrap=document.createElement('div');
    wrap.innerHTML=studioHtml();
    const studio=wrap.firstElementChild;
    if(nav)app.insertBefore(studio,nav);else app.appendChild(studio);
    bindStudio();
    restorePreview();
    restoreResults();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function captureFields(){
    const prompt=document.getElementById('dsPrompt');
    const preserve=document.getElementById('dsPreserve');
    if(prompt)state.prompt=prompt.value;
    if(preserve)state.preserve=preserve.checked;
  }

  function rerenderStudio(){
    captureFields();
    const old=document.getElementById('dxnDesignStudio');
    if(!old)return mountStudio();
    const wrap=document.createElement('div');
    wrap.innerHTML=studioHtml();
    old.replaceWith(wrap.firstElementChild);
    bindStudio();
    restorePreview();
    restoreResults();
  }

  function acceptFile(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type||'')){studioToast('الملف يجب أن يكون صورة PNG أو JPG أو WEBP.','error');return;}
    if(file.size>10*1024*1024){studioToast('حجم الصورة أكبر من 10 MB. اختر صورة أصغر.','error');return;}
    cleanupPreview();
    state.file=file;
    state.previewUrl=URL.createObjectURL(file);
    state.previewOwned=true;
    state.resultDataUrl=null;
    state.error='';
    restorePreview();
  }

  function removeFile(){
    cleanupPreview();
    state.file=null;state.resultDataUrl=null;state.error='';
    const p=document.getElementById('dsPreview');
    const e=document.getElementById('dsEmptyUpload');
    if(p)p.classList.remove('has-image');
    if(e)e.style.display='';
  }

  function readAsDataUrl(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error||new Error('تعذر قراءة الصورة.'));
      reader.readAsDataURL(blob);
    });
  }

  function canvasBlob(canvas,type,quality){
    return new Promise((resolve,reject)=>{
      canvas.toBlob(b=>b?resolve(b):reject(new Error('تعذر تجهيز الصورة.')),type,quality);
    });
  }

  async function imageBitmapFor(file){
    if(window.createImageBitmap)return createImageBitmap(file);
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{
        const el=new Image();
        el.onload=()=>resolve(el);
        el.onerror=()=>reject(new Error('تعذر فتح الصورة.'));
        el.src=url;
      });
      return img;
    }finally{
      URL.revokeObjectURL(url);
    }
  }

  async function prepareImageData(file){
    const target=2.15*1024*1024;
    if(file.size<=target)return readAsDataUrl(file);

    const bitmap=await imageBitmapFor(file);
    const originalW=bitmap.width||bitmap.naturalWidth;
    const originalH=bitmap.height||bitmap.naturalHeight;
    let scale=Math.min(1,1800/Math.max(originalW,originalH));

    for(let round=0;round<4;round++){
      const w=Math.max(320,Math.round(originalW*scale));
      const h=Math.max(320,Math.round(originalH*scale));
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:true});
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(bitmap,0,0,w,h);

      for(const q of [0.9,0.82,0.74,0.64]){
        const blob=await canvasBlob(canvas,'image/webp',q);
        if(blob.size<=target){
          if(bitmap&&typeof bitmap.close==='function')bitmap.close();
          return readAsDataUrl(blob);
        }
      }
      scale*=0.78;
    }
    if(bitmap&&typeof bitmap.close==='function')bitmap.close();
    throw new Error('تعذر ضغط الصورة ضمن الحجم المطلوب. جرّب صورة أصغر.');
  }

  function dataUrlToFile(dataUrl){
    const m=String(dataUrl||'').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if(!m)throw new Error('صيغة النتيجة غير صالحة.');
    const bin=atob(m[2]);
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    return new File([bytes],'design-result.webp',{type:m[1]});
  }

  function saveDataUrl(dataUrl,name){
    const a=document.createElement('a');
    a.href=dataUrl;
    a.download=name||('dxn-design-'+Date.now()+'.webp');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function generateDesign(){
    captureFields();
    if(!state.file){studioToast('ارفع صورة المنتج أولًا.','error');return;}
    const token=String(localStorage.getItem('dxn_session')||'');
    if(!token){studioToast('انتهت جلسة الدخول. أعد تسجيل الدخول.','error');return;}

    state.loading=true;
    state.error='';
    state.resultDataUrl=null;
    rerenderStudio();

    try{
      const imageData=await prepareImageData(state.file);
      const r=await fetch('/api/design-image',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({
          token,
          image_data:imageData,
          mode:state.mode,
          aspect:state.aspect,
          preserve:state.preserve,
          prompt:state.prompt
        })
      });
      const text=await r.text();
      let data=null;try{data=text?JSON.parse(text):null}catch(_){}
      if(!r.ok||!data?.ok)throw new Error(data?.error||'تعذر إنشاء الصورة الآن.');

      state.resultDataUrl=String(data.image_data||'');
      if(!state.resultDataUrl)throw new Error('لم تصل صورة صالحة من المحرك.');
      state.history.unshift({
        dataUrl:state.resultDataUrl,
        mode:state.mode,
        aspect:state.aspect,
        prompt:state.prompt,
        preserve:state.preserve,
        createdAt:Date.now()
      });
      state.history=state.history.slice(0,6);
      studioToast('تم إنشاء التصميم بنجاح.');
    }catch(e){
      state.error=String(e&&e.message||e||'تعذر إنشاء التصميم.');
      studioToast(state.error,'error');
    }finally{
      state.loading=false;
      rerenderStudio();
      const result=document.querySelector('.ds-result.visible');
      if(result)setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'center'}),100);
    }
  }

  function useResult(dataUrl,item){
    try{
      const file=dataUrlToFile(dataUrl);
      cleanupPreview();
      state.file=file;
      state.previewUrl=dataUrl;
      state.previewOwned=false;
      state.resultDataUrl=null;
      state.error='';
      if(item){
        state.mode=item.mode||state.mode;
        state.aspect=item.aspect||state.aspect;
        state.prompt=item.prompt||'';
        state.preserve=item.preserve!==false;
      }
      state.view='create';
      rerenderStudio();
      studioToast('تم اعتماد التصميم كنقطة بداية لتعديل جديد.');
    }catch(e){studioToast(String(e.message||e),'error');}
  }

  function bindStudio(){
    document.querySelectorAll('[data-ds-view]').forEach(b=>b.addEventListener('click',()=>{captureFields();state.view=b.dataset.dsView;rerenderStudio()}));
    document.querySelectorAll('[data-ds-mode]').forEach(b=>b.addEventListener('click',()=>{captureFields();state.mode=b.dataset.dsMode;state.resultDataUrl=null;state.error='';rerenderStudio()}));
    document.querySelectorAll('[data-ds-aspect]').forEach(b=>b.addEventListener('click',()=>{captureFields();state.aspect=b.dataset.dsAspect;rerenderStudio()}));

    const preserve=document.getElementById('dsPreserve');
    if(preserve)preserve.addEventListener('change',()=>state.preserve=preserve.checked);
    const prompt=document.getElementById('dsPrompt');
    if(prompt)prompt.addEventListener('input',()=>state.prompt=prompt.value);

    const input=document.getElementById('dsFile');
    if(input)input.addEventListener('change',()=>acceptFile(input.files&&input.files[0]));

    const drop=document.getElementById('dsDrop');
    if(drop){
      ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
      ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
      drop.addEventListener('drop',e=>acceptFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]));
    }

    const change=document.querySelector('[data-ds-change]');
    if(change)change.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();input&&input.click()});
    const remove=document.querySelector('[data-ds-remove]');
    if(remove)remove.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();removeFile()});

    const generate=document.getElementById('dsGenerate');
    if(generate)generate.addEventListener('click',generateDesign);
    document.querySelector('[data-ds-retry]')?.addEventListener('click',generateDesign);
    document.querySelector('[data-ds-regenerate]')?.addEventListener('click',generateDesign);
    document.querySelector('[data-ds-download]')?.addEventListener('click',()=>state.resultDataUrl&&saveDataUrl(state.resultDataUrl));
    document.querySelector('[data-ds-use-result]')?.addEventListener('click',()=>state.resultDataUrl&&useResult(state.resultDataUrl));

    document.querySelectorAll('[data-ds-history-use]').forEach(b=>b.addEventListener('click',()=>{
      const item=state.history[Number(b.dataset.dsHistoryUse)];
      if(item)useResult(item.dataUrl,item);
    }));
    document.querySelectorAll('[data-ds-history-download]').forEach(b=>b.addEventListener('click',()=>{
      const item=state.history[Number(b.dataset.dsHistoryDownload)];
      if(item)saveDataUrl(item.dataUrl,'dxn-design-'+item.createdAt+'.webp');
    }));
  }

  function openStudio(){
    state.active=true;
    syncBodyMode();
    try{sessionStorage.setItem('dxn_design_studio_active','1')}catch(_){}
    if(typeof window.render==='function')window.render();else sync();
  }

  function sync(){
    syncBodyMode();
    injectTab();
    if(state.active)mountStudio();
  }

  const originalSwitch=typeof window.switchTab==='function'?window.switchTab:null;
  if(originalSwitch){
    window.switchTab=function(next){
      if(next==='design'){openStudio();return;}
      state.active=false;
      syncBodyMode();
      try{sessionStorage.removeItem('dxn_design_studio_active')}catch(_){}
      return originalSwitch.apply(this,arguments);
    };
  }

  const originalRender=typeof window.render==='function'?window.render:null;
  if(originalRender){
    window.render=function(){
      const out=originalRender.apply(this,arguments);
      Promise.resolve().then(sync);
      return out;
    };
  }

  window.__DXN_OPEN_DESIGN_STUDIO__=openStudio;
  try{state.active=sessionStorage.getItem('dxn_design_studio_active')==='1'}catch(_){}

  const obs=new MutationObserver(()=>{injectTab();if(state.active&&!document.getElementById('dxnDesignStudio'))mountStudio()});
  function boot(){
    if(document.body)obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(sync,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();