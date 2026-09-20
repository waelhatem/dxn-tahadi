(function () {
  'use strict';

  // V87 — global manual device mode. The visitor chooses mobile/desktop once and it persists across pages.

  function isMainHomepage() {
    const p = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/' || p === '/index.html' || p === '/landing.html';
  }

  function detectDeviceMode() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 9999;
    const screenWidth = (window.screen && window.screen.width) || 9999;
    const touchDevice = Number(navigator.maxTouchPoints || 0) > 0;
    const compactTouchDevice = coarsePointer && noHover && Math.min(viewportWidth, screenWidth) <= 1366;
    const touchTabletOrPhone = touchDevice && viewportWidth <= 1100;
    return (mobileUA || compactTouchDevice || touchTabletOrPhone) ? 'mobile' : 'desktop';
  }

  function installDeviceCss() {
    if (document.getElementById('dxn-device-first-css')) return;
    const style = document.createElement('style');
    style.id = 'dxn-device-first-css';
    style.textContent = `
      @media (max-width: 799px), (pointer: coarse) and (hover: none) and (max-width: 1100px) {
        html[data-device-mode="mobile"] body.desktop-mode .app,
        html[data-device-mode="mobile"] .app { max-width: 980px; padding: 14px 14px 85px; }
        html[data-device-mode="mobile"] body.desktop-mode .top { display:block; text-align:center; padding:18px 18px 25px; border-radius:0 0 36px 36px; }
        html[data-device-mode="mobile"] body.desktop-mode .top .logo { width:120px; height:120px; }
        html[data-device-mode="mobile"] body.desktop-mode .top h1 { margin:8px 0 4px; font-size:30px; }
        html[data-device-mode="mobile"] body.desktop-mode .tabs { position:static; padding:0; margin:14px 0; background:transparent; }
        html[data-device-mode="mobile"] body.desktop-mode .tabs .tab { min-width:115px; }
        html[data-device-mode="mobile"] body.desktop-mode .stats { grid-template-columns:repeat(2,1fr); gap:10px; }
        html[data-device-mode="mobile"] body.desktop-mode .card { padding:16px; margin-top:12px; }
        html[data-device-mode="mobile"] body.desktop-mode .nav { position:fixed; left:0; right:0; bottom:0; border-top:1px solid var(--line); background:#fff; padding:8px; gap:5px; }
        html[data-device-mode="mobile"] body.desktop-mode .nav button { background:transparent; border:0; border-radius:12px; max-width:180px; }
        html[data-device-mode="mobile"] body.desktop-mode .login { max-width:480px; margin:40px auto; }
        html[data-device-mode="mobile"] body.desktop-mode .challenge,
        html[data-device-mode="mobile"] body.desktop-mode .question { padding:14px; }
      }

      #dxn-global-device-switch {
        position:sticky;
        top:0;
        z-index:10050;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        width:100%;
        min-height:52px;
        padding:7px 10px;
        background:rgba(255,255,255,.96);
        border-bottom:1px solid rgba(15,81,63,.12);
        box-shadow:0 3px 12px rgba(0,0,0,.06);
        direction:rtl;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      }
      #dxn-global-device-switch button {
        border:1px solid #dce8e2;
        border-radius:999px;
        min-width:124px;
        min-height:38px;
        padding:8px 16px;
        background:#fff;
        color:#0f513f;
        font:800 14px/1.2 system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;
        cursor:pointer;
        transition:background .18s ease,color .18s ease,transform .18s ease,box-shadow .18s ease;
      }
      #dxn-global-device-switch button:hover{transform:translateY(-1px)}
      #dxn-global-device-switch button.active{
        color:#fff;
        background:linear-gradient(135deg,#0f513f,#176b55);
        border-color:#0f513f;
        box-shadow:0 5px 12px rgba(15,81,63,.20);
      }
      @media(max-width:700px){
        #dxn-global-device-switch{min-height:46px;padding:5px 8px;gap:4px}
        #dxn-global-device-switch button{min-width:105px;min-height:34px;padding:7px 12px;font-size:12px}
      }
    `;
    document.head.appendChild(style);
  }

  function installQuizCircularNav() {
    const p = (window.location.pathname || '/').replace(/\\/+$/, '') || '/';
    if (p !== '/03-pretest.html') return;
    if (document.getElementById('dxn-quiz-circular-nav-style')) return;

    document.body.classList.add('dxn-quiz-page');

    const style = document.createElement('style');
    style.id = 'dxn-quiz-circular-nav-style';
    style.textContent = `
      body.dxn-quiz-page #global-page-navigation,
      body.dxn-quiz-page .btns{display:none!important}

      body.dxn-quiz-page #dxn-quiz-next-arrow{
        position:fixed!important;
        left:50%!important;
        bottom:18px!important;
        z-index:99999!important;
        width:72px!important;
        height:46px!important;
        transform:translateX(-50%)!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        cursor:pointer!important;
        pointer-events:auto!important;
        background:transparent!important;
        border:0!important;
        padding:0!important;
        margin:0!important;
        filter:drop-shadow(0 0 4px rgba(0,255,120,.95))
               drop-shadow(0 0 12px rgba(0,255,120,.85))
               drop-shadow(0 0 24px rgba(0,255,120,.55))!important;
        animation:dxnQuizArrowMove 1.15s ease-in-out infinite!important;
      }
      body.dxn-quiz-page #dxn-quiz-next-arrow svg{
        width:68px!important;
        height:42px!important;
        display:block!important;
      }
      body.dxn-quiz-page #dxn-quiz-next-arrow.is-disabled{
        opacity:.25!important;
        animation:none!important;
      }
      @keyframes dxnQuizArrowMove{
        0%,100%{transform:translateX(-50%)}
        50%{transform:translateX(calc(-50% - 20px))}
      }
      @media(max-width:700px){
        body.dxn-quiz-page #dxn-quiz-next-arrow{
          bottom:12px!important;
          width:60px!important;
          height:40px!important;
        }
        body.dxn-quiz-page #dxn-quiz-next-arrow svg{
          width:56px!important;
          height:36px!important;
        }
      }
    `;
    document.head.appendChild(style);

    function createArrow(){
      document.querySelectorAll('body.dxn-quiz-page .btns').forEach(function(el){ el.remove(); });
      let arrow = document.getElementById('dxn-quiz-next-arrow');
      if (!arrow) {
        arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.id = 'dxn-quiz-next-arrow';
        arrow.setAttribute('aria-label','الانتقال إلى السؤال التالي');
        arrow.innerHTML = `
          <svg viewBox="0 0 140 70" aria-hidden="true">
            <path d="M130 35H38M42 9L14 35l28 26" fill="none" stroke="#00e879" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M130 35H38M42 9L14 35l28 26" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        document.body.appendChild(arrow);

        arrow.addEventListener('click', function(){
          const next = document.querySelector('.btns #next');
          if (next && !next.disabled) next.click();
        });
      }

      const next = document.querySelector('.btns #next');
      const disabled = !next || next.disabled;
      arrow.classList.toggle('is-disabled', disabled);
      arrow.setAttribute('aria-disabled', String(disabled));
    }

    createArrow();
    setInterval(createArrow, 250);

    if(window.MutationObserver){
      new MutationObserver(createArrow).observe(document.body,{
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['disabled','class']
      });
    }
  }

  function getSavedMode() {
    try {
      const saved = localStorage.getItem('dxn_selected_device_mode') || localStorage.getItem('dxn_view_mode');
      if (saved === 'mobile' || saved === 'desktop') {
        try { localStorage.setItem('dxn_selected_device_mode', saved); } catch (e) {}
        return saved;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function syncHomepageView(mode) {
    if (!isMainHomepage()) return;
    const mobileView = document.getElementById('mobileView');
    const desktopView = document.getElementById('desktopView');
    const mobileButton = document.getElementById('mobile');
    const desktopButton = document.getElementById('desktop');
    if (!mobileView || !desktopView) return;
    const isMobile = mode === 'mobile';
    mobileView.classList.toggle('hidden', !isMobile);
    desktopView.classList.toggle('hidden', isMobile);
    if (mobileButton) mobileButton.classList.toggle('active', isMobile);
    if (desktopButton) desktopButton.classList.toggle('active', !isMobile);
  }

  function applyMode(mode) {
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;
    const isDesktop = mode === 'desktop';
    root.dataset.deviceMode = mode;
    body.classList.toggle('desktop-mode', isDesktop);
    body.classList.toggle('mobile-mode', !isDesktop);
    body.classList.toggle('manual-desktop', isDesktop);
    body.classList.toggle('manual-mobile', !isDesktop);
    syncGlobalDeviceSwitch(mode);
    syncHomepageView(mode);

    try {
      document.querySelectorAll('.view-switch button,.device-switch button').forEach(function (button) {
        const text = (button.textContent || '').toLowerCase();
        const isMobileButton = /موبايل|الهاتف|mobile/.test(text);
        const active = (isMobileButton && mode === 'mobile') || (!isMobileButton && mode === 'desktop');
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    } catch (e) {}
  }

  function selectMode(mode) {
    try { localStorage.setItem('dxn_selected_device_mode', mode); } catch (e) {}
    applyMode(mode);
    try {
      if (typeof window.setViewMode === 'function' && !window.setViewMode.__dxnSharedDeviceSelector) {
        window.setViewMode(mode);
      }
    } catch (e) {}
  }

  function hasOwnDeviceSelector() {
    return !!document.querySelector('.view-switch,.device-switch,#viewSwitch,#deviceViewSwitch');
  }

  function removeAllDeviceSelectorsOnHomepage() {
    if (!isMainHomepage()) return;
    document.querySelectorAll('#dxn-global-device-switch,.view-switch,.device-switch,#viewSwitch,#deviceViewSwitch').forEach(function (el) {
      el.remove();
    });
  }

  function isDeviceSelectorExcludedPage() {
    const p = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    return p === '/02-pretest-intro.html';
  }

  function shouldCreateSharedSelector() {
    if (isMainHomepage() || isDeviceSelectorExcludedPage()) return false;
    return !hasOwnDeviceSelector() && !document.getElementById('dxn-global-device-switch');
  }

  function syncGlobalDeviceSwitch(mode) {
    const wrap = document.getElementById('dxn-global-device-switch');
    if (!wrap) return;
    const mobile = wrap.querySelector('[data-mode="mobile"]');
    const desktop = wrap.querySelector('[data-mode="desktop"]');
    const isMobile = mode === 'mobile';
    if (mobile) {
      mobile.classList.toggle('active', isMobile);
      mobile.setAttribute('aria-pressed', String(isMobile));
    }
    if (desktop) {
      desktop.classList.toggle('active', !isMobile);
      desktop.setAttribute('aria-pressed', String(!isMobile));
    }
  }

  function deduplicateDeviceSelectors() {
    if (isMainHomepage()) {
      removeAllDeviceSelectorsOnHomepage();
      return;
    }
    const ownSelectors = Array.from(document.querySelectorAll('.view-switch,.device-switch,#viewSwitch,#deviceViewSwitch'));
    const sharedSelectors = Array.from(document.querySelectorAll('#dxn-global-device-switch'));
    if (ownSelectors.length) {
      sharedSelectors.forEach(function (el) { el.remove(); });
      if (ownSelectors.length > 1) ownSelectors.slice(1).forEach(function (el) { el.remove(); });
      return;
    }
    if (sharedSelectors.length > 1) sharedSelectors.slice(1).forEach(function (el) { el.remove(); });
  }

  function ensureGlobalDeviceSelector() {
    deduplicateDeviceSelectors();
    if (!document.body || !shouldCreateSharedSelector()) return;
    const wrap = document.createElement('div');
    wrap.id = 'dxn-global-device-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'اختيار واجهة العرض');
    wrap.innerHTML =
      '<button type="button" data-mode="mobile" aria-pressed="false">📱 الموبايل</button>' +
      '<button type="button" data-mode="desktop" aria-pressed="false">💻 الحاسوب</button>';
    const anchor = document.body.firstElementChild;
    if (anchor) document.body.insertBefore(wrap, anchor);
    else document.body.appendChild(wrap);
    wrap.querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () {
        selectMode(button.getAttribute('data-mode'));
      });
    });
    syncGlobalDeviceSwitch(document.documentElement.dataset.deviceMode || detectDeviceMode());
  }

  function bindHomepageDeviceSelector() {
    if (!isMainHomepage() || document.documentElement.dataset.homepageDeviceSelectorBound === '1') return;
    document.documentElement.dataset.homepageDeviceSelectorBound = '1';
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('#mobile,#desktop') : null;
      if (!target) return;
      const mode = target.id === 'mobile' ? 'mobile' : 'desktop';
      selectMode(mode);
    }, true);
  }

  function bindExistingDeviceSelectors() {
    if (document.documentElement.dataset.existingDeviceSelectorBound === '1') return;
    document.documentElement.dataset.existingDeviceSelectorBound = '1';
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest
        ? event.target.closest('.view-switch button,.device-switch button')
        : null;
      if (!target) return;
      const label = (target.textContent || '').toLowerCase();
      const mode = /موبايل|الهاتف|mobile/.test(label) ? 'mobile' : 'desktop';
      selectMode(mode);
    }, true);
  }

  function bindPreviousUserEntry() {
    if (document.documentElement.dataset.previousUserEntryBound === '1') return;
    document.documentElement.dataset.previousUserEntryBound = '1';
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('#mobilePreviousUser, #desktopPreviousUser, #previousUser') : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/app/index.html';
    }, true);
  }

  function watchDynamicInterface() {
    if (!window.MutationObserver || !document.body) return;
    const observer = new MutationObserver(function () {
      deduplicateDeviceSelectors();
      const mode = getSavedMode() || detectDeviceMode();
      syncGlobalDeviceSwitch(mode);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function refreshResponsiveDefault() {
    const saved = getSavedMode();
    if (saved === 'mobile' || saved === 'desktop') return;
    applyDetectedDefault();
  }

  function applyDetectedDefault() {
    const saved = getSavedMode();
    const mode = saved || detectDeviceMode();
    applyMode(mode);
  }

  function addNavigationButtons() {
    if (document.getElementById('global-page-navigation')) return;
    const wrap = document.createElement('div');
    wrap.id = 'global-page-navigation';
    wrap.setAttribute('aria-label', 'التنقل بين الصفحات');
    wrap.innerHTML = '<button type="button" id="globalBack" title="العودة إلى الصفحة السابقة" aria-label="العودة إلى الصفحة السابقة">‹</button>' +
      '<button type="button" id="globalForward" title="التقدم إلى الصفحة التالية" aria-label="التقدم إلى الصفحة التالية">›</button>';
    const style = document.createElement('style');
    style.id = 'global-page-navigation-style';
    style.textContent = '#global-page-navigation{position:fixed;bottom:18px;left:18px;z-index:10000;display:flex;gap:12px;direction:ltr;align-items:center}#global-page-navigation button{width:58px;height:58px;border:0;border-radius:50%;background:rgba(255,255,255,.96);color:#0f513f;font:900 38px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 7px 20px rgba(0,0,0,.18);display:grid;place-items:center;transition:transform .15s ease,box-shadow .15s ease}#global-page-navigation button:hover{transform:scale(1.06);box-shadow:0 9px 24px rgba(0,0,0,.22)}#global-page-navigation button:active{transform:scale(.96)}@media(max-width:700px){#global-page-navigation{bottom:12px;left:12px;gap:8px}#global-page-navigation button{width:52px;height:52px;font-size:34px}}';
    document.head.appendChild(style);
    document.body.appendChild(wrap);
    document.getElementById('globalBack').addEventListener('click', function () { window.history.back(); });
    document.getElementById('globalForward').addEventListener('click', function () { window.history.forward(); });
  }

  function init() {
    installDeviceCss();
    installQuizCircularNav();
    applyDetectedDefault();
    deduplicateDeviceSelectors();
    ensureGlobalDeviceSelector();
    bindHomepageDeviceSelector();
    bindExistingDeviceSelectors();
    bindPreviousUserEntry();
    addNavigationButtons();
    watchDynamicInterface();

    window.addEventListener('storage', function (event) {
      if (event.key === 'dxn_selected_device_mode' || event.key === 'dxn_view_mode') {
        applyDetectedDefault();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();