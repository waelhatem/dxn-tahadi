/* V1 — استوديو التصميم: محمِّل خفيف هو الشيء الوحيد الذي يُحمَّل مع الصفحة.
   كود الاستوديو (ES modules) والـCSS لا يُحمَّلان إلا عند فتح التبويب، والمحركات لا تُحمَّل إلا عند طلب الأداة. */
(function(){
  if(window.__DXN_DESIGN_STUDIO_LOADER_V1__)return;
  window.__DXN_DESIGN_STUDIO_LOADER_V1__=true;
  var VERSION='5';
  /* مفتاح تشغيل التبويب كاملًا (DESIGN_STUDIO_ENABLED). يمكن إيقافه بـ window.DXN_DESIGN_STUDIO_ENABLED=false قبل هذا الملف. */
  if(window.DXN_DESIGN_STUDIO_ENABLED!==false)window.DXN_DESIGN_STUDIO_ENABLED=true;
  var modulePromise=null;
  function ensureCss(){
    if(document.getElementById('dxnDesignStudioCss'))return;
    var l=document.createElement('link');
    l.id='dxnDesignStudioCss';l.rel='stylesheet';l.href='design-studio/studio.css?v='+VERSION;
    document.head.appendChild(l);
  }
  /* الاستوديو للحسابات المسجلة فقط (عضو أو قائد). */
  window.dxnDesignStudioAvailable=function(){
    var r=(typeof role!=='undefined')?role:null;
    return window.DXN_DESIGN_STUDIO_ENABLED!==false&&(r==='member'||r==='leader');
  };
  window.dxnMountDesignStudio=function(){
    var host=document.getElementById('designStudioHost');
    if(!host)return;
    ensureCss();
    modulePromise=modulePromise||import('./design-studio/index.mjs?v='+VERSION);
    modulePromise.then(function(m){
      if(host.isConnected)m.mount(host,{me:(typeof me!=='undefined'?me:null),role:(typeof role!=='undefined'?role:'')});
    }).catch(function(e){
      console.error('Design Studio',e);
      modulePromise=null;
      host.textContent='';
      var d=document.createElement('div');d.className='ds-error';d.setAttribute('role','alert');
      d.textContent='تعذر تحميل استوديو التصميم. تحقق من الاتصال ثم أعد المحاولة.';
      host.appendChild(d);
    });
  };
})();