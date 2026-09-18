(function(){
  if(window.__DXN_PAGE_NAV__) return;
  window.__DXN_PAGE_NAV__=true;

  function init(){
    if(document.getElementById('dxn-page-navigation')) return;

    const nav=document.createElement('nav');
    nav.id='dxn-page-navigation';
    nav.setAttribute('aria-label','التنقل بين الصفحات');
    nav.innerHTML=
      '<button type="button" class="dxn-nav-btn dxn-nav-back" aria-label="الرجوع" title="الرجوع">←</button>'+
      '<button type="button" class="dxn-nav-btn dxn-nav-forward" aria-label="التقدم" title="التقدم">→</button>';

    const style=document.createElement('style');
    style.textContent=`
      #dxn-page-navigation{
        position:fixed;
        left:50%;
        bottom:max(16px,env(safe-area-inset-bottom));
        transform:translateX(-50%);
        z-index:99990;
        display:flex;
        align-items:center;
        gap:10px;
        direction:ltr;
        pointer-events:auto;
        font-family:Arial,"Segoe UI",sans-serif;
      }
      #dxn-page-navigation .dxn-nav-btn{
        width:48px;
        height:48px;
        min-width:48px;
        min-height:48px;
        border:1px solid rgba(15,81,63,.18);
        border-radius:50%;
        background:rgba(255,255,255,.94);
        color:#0f513f;
        font:900 31px/1 Arial,"Segoe UI",sans-serif;
        display:grid;
        place-items:center;
        padding:0;
        cursor:pointer;
        box-shadow:0 5px 16px rgba(0,0,0,.18);
        transition:transform .18s ease,opacity .18s ease,background .18s ease;
        -webkit-tap-highlight-color:transparent;
      }
      #dxn-page-navigation .dxn-nav-btn:hover:not(:disabled){
        transform:translateY(-2px) scale(1.04);
        background:#fff;
      }
      #dxn-page-navigation .dxn-nav-btn:active:not(:disabled){
        transform:scale(.96);
      }
      #dxn-page-navigation .dxn-nav-btn:focus-visible{
        outline:3px solid rgba(15,81,63,.35);
        outline-offset:3px;
      }
      #dxn-page-navigation .dxn-nav-btn:disabled{
        opacity:.28;
        cursor:default;
        box-shadow:none;
      }
      @media(max-width:700px){
        #dxn-page-navigation{bottom:max(12px,env(safe-area-inset-bottom));gap:8px}
        #dxn-page-navigation .dxn-nav-btn{
          width:44px;height:44px;min-width:44px;min-height:44px;font-size:28px;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(nav);

    const back=nav.querySelector('.dxn-nav-back');
    const forward=nav.querySelector('.dxn-nav-forward');

    function update(){
      const hasBack=history.length>1;
      back.disabled=!hasBack;
      forward.disabled=false;
    }
    back.addEventListener('click',function(){
      if(history.length>1) history.back();
    });
    forward.addEventListener('click',function(){
      history.forward();
    });
    window.addEventListener('popstate',update);
    update();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();