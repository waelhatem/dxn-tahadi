/* V86.70 — ترتيب أزرار أسفل الشاشة في الموبايل والتابلت فقط.
   - إخفاء السهمين الدائريين (#global-page-navigation) لأن وظيفتهما مكررة مع رجوع/تقدّم.
   - شريط رجوع/تقدّم (#dxnInAppNav) بزرين واضحين وكل زر يحتوي سهمه.
   - زر عائم واحد «🤖 المساعد الذكي» يفتح قائمة: المرشد الذكي / المدرب وائل حاتم.
   الأزرار الأصلية تبقى في الصفحة (مخفية فقط على الشاشات الصغيرة) ويتم الضغط عليها برمجيًا،
   لذلك يبقى منطق التنقل والمرشد والمدرب كما هو دون تغيير. نسخة الحاسوب لا تتأثر. */
(function(){
  if(window.__DXN_MOBILE_BOTTOM_CONTROLS_V8670__)return;
  window.__DXN_MOBILE_BOTTOM_CONTROLS_V8670__=true;

  var SMALL_SCREEN='(max-width:1024px), (hover:none) and (pointer:coarse) and (max-width:1366px)';
  var GAP_ABOVE_TABS=8;
  var GAP_ABOVE_BAR=10;
  var CONTENT_GAP=12;

  var STYLE=''+
    '#dxnAssistantFab,#dxnAssistantSheet,#dxnAssistantBackdrop{display:none}'+
    '@media '+SMALL_SCREEN+'{'+
      '#global-page-navigation,#aiGuideFab,#dxnAgentLauncher{display:none!important}'+
      /* V86.71 — «معاينة الموقع» للحاسوب فقط؛ المنطق الأساسي في eligible() داخل app/index.html وهذا احتياط إضافي. */
      '#globalPreviewLauncher{display:none!important}'+
      /* شريط رجوع/تقدّم */
      '.dxn-inapp-nav{left:12px!important;right:12px!important;bottom:var(--dxn-mbc-nav-bottom,calc(8px + env(safe-area-inset-bottom,0px)))!important;transform:none!important;max-width:520px;margin:0 auto;gap:8px!important;padding:6px!important;border-radius:16px!important}'+
      '.dxn-inapp-nav .dxn-nav-btn{flex:1 1 0;min-width:0!important;min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px!important;font-size:15px!important;color:#0f513f;border-radius:12px!important}'+
      '.dxn-inapp-nav .dxn-nav-ico{display:none}'+
      /* إلغاء طبقة button::before العامة (اللمعة) حتى يظهر السهم بجانب النص لا فوقه */
      '.dxn-inapp-nav .dxn-nav-btn::before,.dxn-inapp-nav .dxn-nav-btn::after{position:static!important;inset:auto!important;display:inline-block!important;width:auto!important;height:auto!important;margin:0!important;border:0!important;background:none!important;box-shadow:none!important;opacity:1!important;transform:none!important;animation:none!important;font:900 20px/1 Arial,sans-serif!important;color:inherit!important}'+
      '.dxn-inapp-nav .dxn-nav-back::before{content:"→"}'+
      '.dxn-inapp-nav .dxn-nav-forward::after{content:"←"}'+
      '.dxn-inapp-nav .dxn-nav-back::after,.dxn-inapp-nav .dxn-nav-forward::before{content:none!important}'+
      /* الزر العائم */
      '#dxnAssistantFab{display:flex;align-items:center;gap:6px;position:fixed;left:12px;bottom:var(--dxn-mbc-fab-bottom,calc('+GAP_ABOVE_BAR+'px + env(safe-area-inset-bottom,0px)));z-index:9999;min-height:46px;padding:10px 16px;border:0;border-radius:999px;background:linear-gradient(135deg,#0f513f,#1a8064);color:#fff;font-weight:800;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.22);cursor:pointer;direction:rtl}'+
      '#dxnAssistantFab[hidden]{display:none!important}'+
      '#dxnAssistantFab:focus-visible{outline:3px solid #2563eb;outline-offset:2px}'+
      /* القائمة السفلية */
      '#dxnAssistantBackdrop.show{display:block;position:fixed;inset:0;z-index:2147483006;background:rgba(0,0,0,.35)}'+
      '#dxnAssistantSheet.show{display:block;position:fixed;left:0;right:0;bottom:0;z-index:2147483007;max-width:560px;margin:0 auto;padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px));background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.18);direction:rtl}'+
      '.dxn-assistant-grip{width:42px;height:5px;margin:0 auto 10px;border-radius:9px;background:#d5e2dc}'+
      '.dxn-assistant-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'+
      '.dxn-assistant-head b{font-size:16px;color:#0f513f}'+
      '.dxn-assistant-close{width:36px;height:36px;border:0;border-radius:50%;background:#f1f7f4;color:#0f513f;font-size:18px;cursor:pointer}'+
      '.dxn-assistant-option{display:flex;align-items:center;gap:12px;width:100%;margin-top:8px;padding:12px 14px;border:1px solid #dce8e3;border-radius:14px;background:#f8fbfa;color:#18352c;text-align:right;cursor:pointer}'+
      '.dxn-assistant-option:disabled{opacity:.45;cursor:not-allowed}'+
      '.dxn-assistant-option .ico{font-size:24px}'+
      '.dxn-assistant-option b{display:block;font-size:15px}'+
      '.dxn-assistant-option small{display:block;color:#667085;font-size:12px;margin-top:2px}'+
      /* مساحة أسفل المحتوى حتى لا يغطيه الشريط والزر العائم */
      '#app{padding-bottom:var(--dxn-mbc-pad,calc(76px + env(safe-area-inset-bottom,0px)))!important}'+
    '}';

  var fab,sheet,backdrop,lastFocus=null,scheduled=false;
  var mq=window.matchMedia?window.matchMedia(SMALL_SCREEN):null;

  function isSmall(){return !!(mq&&mq.matches);}
  function guideBtn(){return document.getElementById('aiGuideFab');}
  function coachBtn(){return document.getElementById('dxnAgentLauncher');}

  function isShown(el){
    if(!el)return false;
    var cs=getComputedStyle(el);
    return cs.display!=='none'&&cs.visibility!=='hidden'&&el.getBoundingClientRect().height>0;
  }

  /* V86.72 — شريط التبويبات الرئيسي (.nav داخل #app) يُعاد إنشاؤه مع كل render، وعلى الموبايل يكون
     ثابتًا أسفل الشاشة وارتفاعه يتغير حسب التفاف الأزرار؛ لذلك نقيس موقعه الفعلي في كل مرة. */
  function bottomTabs(){
    var tabs=document.querySelector('#app .nav');
    if(!isShown(tabs)||getComputedStyle(tabs).position!=='fixed')return null;
    return tabs;
  }
  /* المسافة من أسفل الشاشة حتى الحافة العلوية للعنصر. */
  function coverFromBottom(el){
    return Math.max(0,Math.round(window.innerHeight-el.getBoundingClientRect().top));
  }

  /* الترتيب من الأسفل للأعلى: شريط التبويبات ← رجوع/تقدّم ← 🤖 المساعد الذكي.
     إذا لم يوجد شريط تبويبات يرجع رجوع/تقدّم إلى أسفل الشاشة مع مراعاة safe-area. */
  function layout(){
    scheduled=false;
    if(!fab)return;
    var root=document.documentElement.style;
    if(!isSmall()){
      ['--dxn-mbc-nav-bottom','--dxn-mbc-fab-bottom','--dxn-mbc-pad'].forEach(function(v){root.removeProperty(v);});
    }else{
      var tabs=bottomTabs();
      var tabsCover=tabs?coverFromBottom(tabs):0;
      if(tabs)root.setProperty('--dxn-mbc-nav-bottom',(tabsCover+GAP_ABOVE_TABS)+'px');
      else root.removeProperty('--dxn-mbc-nav-bottom');
      var nav=document.getElementById('dxnInAppNav');
      var stackCover=tabsCover;
      if(isShown(nav)){
        stackCover=coverFromBottom(nav);
        root.setProperty('--dxn-mbc-fab-bottom',(stackCover+GAP_ABOVE_BAR)+'px');
      }else if(tabs){
        root.setProperty('--dxn-mbc-fab-bottom',(tabsCover+GAP_ABOVE_BAR)+'px');
      }else{
        root.removeProperty('--dxn-mbc-fab-bottom');
      }
      if(isShown(fab))stackCover=Math.max(stackCover,coverFromBottom(fab));
      root.setProperty('--dxn-mbc-pad',(stackCover+CONTENT_GAP)+'px');
    }
    var hasGuide=!!guideBtn(),hasCoach=!!coachBtn();
    fab.hidden=!(hasGuide||hasCoach);
    sheet.querySelector('[data-target="guide"]').disabled=!hasGuide;
    sheet.querySelector('[data-target="coach"]').disabled=!hasCoach;
    if(!isSmall()&&sheet.classList.contains('show'))closeSheet(false);
  }
  function scheduleLayout(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(layout);
  }

  function openSheet(){
    lastFocus=document.activeElement;
    backdrop.classList.add('show');
    sheet.classList.add('show');
    fab.setAttribute('aria-expanded','true');
    var first=sheet.querySelector('.dxn-assistant-option:not(:disabled)');
    if(first)first.focus();
  }
  function closeSheet(restoreFocus){
    backdrop.classList.remove('show');
    sheet.classList.remove('show');
    fab.setAttribute('aria-expanded','false');
    if(restoreFocus!==false&&lastFocus&&lastFocus.focus)lastFocus.focus();
  }

  /* نضغط الزر الأصلي حتى تعمل نفس الدوال الحالية للمرشد والمدرب بلا أي تغيير. */
  function launch(target){
    closeSheet(false);
    var btn=target==='coach'?coachBtn():guideBtn();
    if(!btn)return;
    if(target==='coach'){
      var panel=document.getElementById('dxnAgentPanel');
      if(panel&&panel.classList.contains('show')){var input=document.getElementById('dxnAgentInput');if(input)input.focus();return;}
    }
    btn.click();
  }

  function mount(){
    if(document.getElementById('dxnAssistantFab'))return;
    var style=document.createElement('style');
    style.id='dxn-mobile-bottom-controls-v8670';
    style.textContent=STYLE;
    document.head.appendChild(style);

    fab=document.createElement('button');
    fab.id='dxnAssistantFab';fab.type='button';
    fab.setAttribute('aria-haspopup','dialog');fab.setAttribute('aria-expanded','false');fab.setAttribute('aria-controls','dxnAssistantSheet');
    fab.textContent='🤖 المساعد الذكي';

    backdrop=document.createElement('div');
    backdrop.id='dxnAssistantBackdrop';

    sheet=document.createElement('div');
    sheet.id='dxnAssistantSheet';
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','المساعد الذكي');
    sheet.innerHTML='<div class="dxn-assistant-grip" aria-hidden="true"></div>'+
      '<div class="dxn-assistant-head"><b>🤖 المساعد الذكي</b><button type="button" class="dxn-assistant-close" aria-label="إغلاق">✕</button></div>'+
      '<button type="button" class="dxn-assistant-option" data-target="guide"><span class="ico" aria-hidden="true">🧭</span><span><b>المرشد الذكي</b><small>إرشادات داخل الموقع حسب دورك</small></span></button>'+
      '<button type="button" class="dxn-assistant-option" data-target="coach"><span class="ico" aria-hidden="true">👨‍🏫</span><span><b>المدرب وائل حاتم</b><small>محادثة مع مدربك داخل المجتمع</small></span></button>';

    document.body.append(backdrop,sheet,fab);

    fab.addEventListener('click',function(){sheet.classList.contains('show')?closeSheet():openSheet();});
    backdrop.addEventListener('click',function(){closeSheet();});
    sheet.querySelector('.dxn-assistant-close').addEventListener('click',function(){closeSheet();});
    sheet.querySelectorAll('.dxn-assistant-option').forEach(function(b){
      b.addEventListener('click',function(){launch(b.getAttribute('data-target'));});
    });
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sheet.classList.contains('show'))closeSheet();});

    if(mq){if(mq.addEventListener)mq.addEventListener('change',scheduleLayout);else if(mq.addListener)mq.addListener(scheduleLayout);}
    window.addEventListener('resize',scheduleLayout);
    if(window.MutationObserver){
      var observer=new MutationObserver(scheduleLayout);
      observer.observe(document.body,{childList:true,attributes:true,attributeFilter:['class']});
      /* render() يستبدل محتوى #app (ومعه شريط التبويبات) مع كل تغيير تبويب. */
      var app=document.getElementById('app');
      if(app)observer.observe(app,{childList:true});
    }
    layout();
    setTimeout(layout,600);
    setTimeout(layout,2000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
