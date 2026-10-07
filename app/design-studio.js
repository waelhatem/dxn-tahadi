
(function(){
  'use strict';
  if(window.__DXN_DESIGN_STUDIO_V1__) return;
  window.__DXN_DESIGN_STUDIO_V1__=true;

  const state={
    active:false,
    view:'create',
    mode:'enhance',
    aspect:'1:1',
    preserve:true,
    file:null,
    objectUrl:null
  };

  const toolsMap={
    enhance:{icon:'✨',title:'تحسين الصورة',desc:'وضوح، دقة، إضاءة وتنظيف مع الحفاظ على تفاصيل المنتج.'},
    background:{icon:'🖼️',title:'تغيير الخلفية',desc:'إزالة الخلفية أو إنشاء بيئة تسويقية احترافية حول المنتج.'},
    ad:{icon:'📣',title:'إنشاء إعلان',desc:'تجهيز صورة تسويقية جاهزة للنشر على وسائل التواصل.'},
    free:{icon:'🎨',title:'تصميم حر',desc:'اكتب التعديل المطلوب بلغتك وسيُنفذ وفق تعليماتك.'}
  };

  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function toast(msg){
    if(typeof window.toast==='function'){window.toast(msg);return;}
    const n=document.createElement('div');
    n.textContent=msg;
    n.style.cssText='position:fixed;z-index:99999;bottom:24px;left:50%;transform:translateX(-50%);background:#173c32;color:#fff;padding:11px 16px;border-radius:13px;font-weight:800;box-shadow:0 10px 30px #0003';
    document.body.appendChild(n);setTimeout(()=>n.remove(),2800);
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

  function studioHtml(){
    const selected=toolsMap[state.mode]||toolsMap.enhance;
    return '<section class="dxn-design-studio" id="dxnDesignStudio">'
      +'<div class="ds-hero"><span class="ds-kicker">✨ مدعوم بالذكاء الاصطناعي</span>'
      +'<h2>🎨 استوديو التصميم</h2>'
      +'<p>حوّل صور المنتجات إلى محتوى تسويقي احترافي من مكان واحد. النسخة الحالية هي واجهة العمل الأولى، وربط محرك تعديل الصور سيكون في المرحلة التالية.</p></div>'
      +'<div class="ds-subnav"><button type="button" data-ds-view="create" class="'+(state.view==='create'?'active':'')+'">➕ إنشاء تصميم</button>'
      +'<button type="button" data-ds-view="history" class="'+(state.view==='history'?'active':'')+'">🗂️ تصاميمي</button></div>'
      +'<div class="ds-create '+(state.view==='create'?'':'hidden')+'" id="dsCreate">'
      +'<div class="ds-tools">'
      +Object.keys(toolsMap).map(k=>{const t=toolsMap[k];return '<button type="button" class="ds-tool '+(state.mode===k?'active':'')+'" data-ds-mode="'+k+'"><span class="ds-tool-icon">'+t.icon+'</span><b>'+t.title+'</b><span>'+t.desc+'</span></button>'}).join('')
      +'</div>'
      +'<div class="ds-workspace">'
      +'<div class="ds-panel"><h3>1. ارفع صورة المنتج</h3><p class="ds-hint">PNG أو JPG أو WEBP — يفضّل استخدام صورة واضحة للمنتج.</p>'
      +'<label class="ds-drop" id="dsDrop" for="dsFile"><input class="ds-file" id="dsFile" type="file" accept="image/png,image/jpeg,image/webp">'
      +'<div class="ds-empty-upload" id="dsEmptyUpload"><div class="icon">📷</div><b>اضغط لاختيار صورة</b><span>أو اسحب الصورة وأفلتها هنا<br>الحد الأقصى 10 MB</span></div>'
      +'<div class="ds-preview" id="dsPreview"><img id="dsPreviewImg" alt="معاينة صورة المنتج"><div class="ds-preview-bar"><button type="button" data-ds-change>🔄 تغيير الصورة</button><button type="button" data-ds-remove>🗑️ إزالة</button></div></div>'
      +'</label></div>'
      +'<div class="ds-panel"><span class="ds-badge">'+selected.icon+' '+selected.title+'</span><h3 style="margin-top:12px">2. إعداد التصميم</h3>'
      +'<div class="ds-form-row"><label class="ds-preserve"><input id="dsPreserve" type="checkbox" '+(state.preserve?'checked':'')+'><span>الحفاظ على المنتج كما هو</span></label>'
      +'<div class="ds-warning">عند تفعيله: لا يتم تغيير الشعار أو شكل العبوة أو ألوانها أو النصوص الأصلية على المنتج.</div></div>'
      +'<div class="ds-form-row"><div class="ds-label"><span>التعليمات الإضافية</span><small>اختياري</small></div>'
      +'<textarea class="ds-textarea" id="dsPrompt" placeholder="مثال: اجعل الإضاءة صباحية، وضع المنتج على طاولة خشبية نظيفة، ولا تغيّر تفاصيل العبوة."></textarea></div>'
      +'<div class="ds-form-row"><div class="ds-label"><span>مقاس التصميم</span></div><div class="ds-aspects">'
      +[['1:1','مربع'],['4:5','منشور'],['9:16','Story'],['16:9','أفقي']].map(a=>'<button type="button" class="ds-aspect '+(state.aspect===a[0]?'active':'')+'" data-ds-aspect="'+a[0]+'">'+a[1]+'<br>'+a[0]+'</button>').join('')
      +'</div></div>'
      +'<button type="button" class="ds-generate" id="dsGenerate">✨ إنشاء التصميم</button>'
      +'<div class="ds-phase-note">الواجهة تعمل الآن للمعاينة وتجهيز الطلب؛ توليد الصورة الفعلي سيُربط في المرحلة الثانية.</div>'
      +'<div class="ds-result" id="dsResult"><b>✅ طلب التصميم جاهز</b><p>تم تجهيز الصورة والإعدادات بنجاح. الخطوة التالية هي ربط محرك الذكاء الاصطناعي ليعيد الصورة المعدلة داخل هذه المساحة.</p></div>'
      +'</div></div></div>'
      +'<div class="ds-history '+(state.view==='history'?'active':'')+'" id="dsHistory"><div class="ds-empty-history"><div><div class="icon">🗂️</div><b>لا توجد تصاميم محفوظة بعد</b><p>بعد ربط محرك الصور والتخزين، ستظهر هنا تصاميم العضو السابقة.</p></div></div></div>'
      +'</section>';
  }

  function mountStudio(){
    const app=document.getElementById('app');
    const tabs=app&&app.querySelector('.tabs');
    if(!app||!tabs) return;
    setActiveTabVisual();

    let nav=app.querySelector('.nav');
    let node=tabs.nextSibling;
    while(node && node!==nav){
      const next=node.nextSibling;
      node.remove();
      node=next;
    }
    const wrap=document.createElement('div');
    wrap.innerHTML=studioHtml();
    const studio=wrap.firstElementChild;
    if(nav) app.insertBefore(studio,nav); else app.appendChild(studio);
    bindStudio();
    restorePreview();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function rerenderStudio(){
    const old=document.getElementById('dxnDesignStudio');
    if(!old) return mountStudio();
    const wrap=document.createElement('div');wrap.innerHTML=studioHtml();
    old.replaceWith(wrap.firstElementChild);
    bindStudio();restorePreview();
  }

  function restorePreview(){
    if(!state.objectUrl) return;
    const preview=document.getElementById('dsPreview');
    const img=document.getElementById('dsPreviewImg');
    const empty=document.getElementById('dsEmptyUpload');
    if(preview&&img&&empty){
      img.src=state.objectUrl;preview.classList.add('has-image');empty.style.display='none';
    }
  }

  function acceptFile(file){
    if(!file) return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type||'')){toast('الملف يجب أن يكون صورة PNG أو JPG أو WEBP.');return;}
    if(file.size>10*1024*1024){toast('حجم الصورة أكبر من 10 MB.');return;}
    if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.file=file;state.objectUrl=URL.createObjectURL(file);
    restorePreview();
  }

  function removeFile(){
    if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.file=null;state.objectUrl=null;
    const p=document.getElementById('dsPreview');const e=document.getElementById('dsEmptyUpload');
    if(p)p.classList.remove('has-image');if(e)e.style.display='';
  }

  function bindStudio(){
    document.querySelectorAll('[data-ds-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.dsView;rerenderStudio()}));
    document.querySelectorAll('[data-ds-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.dsMode;rerenderStudio()}));
    document.querySelectorAll('[data-ds-aspect]').forEach(b=>b.addEventListener('click',()=>{state.aspect=b.dataset.dsAspect;rerenderStudio()}));

    const preserve=document.getElementById('dsPreserve');
    if(preserve) preserve.addEventListener('change',()=>state.preserve=preserve.checked);

    const input=document.getElementById('dsFile');
    if(input) input.addEventListener('change',()=>acceptFile(input.files&&input.files[0]));

    const drop=document.getElementById('dsDrop');
    if(drop){
      ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
      ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
      drop.addEventListener('drop',e=>acceptFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]));
    }

    const change=document.querySelector('[data-ds-change]');
    if(change) change.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();input&&input.click()});
    const remove=document.querySelector('[data-ds-remove]');
    if(remove) remove.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();removeFile()});

    const generate=document.getElementById('dsGenerate');
    if(generate) generate.addEventListener('click',()=>{
      if(!state.file){toast('ارفع صورة المنتج أولًا.');return;}
      const result=document.getElementById('dsResult');if(result)result.classList.add('visible');
      toast('تم تجهيز الطلب. ربط محرك الصور هو الخطوة التالية.');
    });
  }

  function openStudio(){
    state.active=true;
    syncBodyMode();
    try{sessionStorage.setItem('dxn_design_studio_active','1')}catch(_){}
    if(typeof window.render==='function') window.render();
    else sync();
  }

  function sync(){
    syncBodyMode();
    injectTab();
    if(state.active) mountStudio();
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
    if(document.body) obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(sync,0);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
