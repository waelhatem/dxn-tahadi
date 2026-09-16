(function () {
  'use strict';

  // V86.63 — responsive default with manual Mobile/Desktop selector restored.
  // The page starts from the detected device layout, while the user may still
  // choose Mobile or Desktop from the existing selector at the top.

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
    `;
    document.head.appendChild(style);
  }

  function applyDetectedDefault() {
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;

    let saved = null;
    try { saved = localStorage.getItem('dxn_view_mode'); } catch (e) {}
    const mode = saved === 'mobile' || saved === 'desktop' ? saved : detectDeviceMode();
    const isDesktop = mode === 'desktop';

    root.dataset.deviceMode = mode;
    body.classList.toggle('desktop-mode', isDesktop);
    body.classList.toggle('mobile-mode', !isDesktop);
    body.classList.toggle('manual-desktop', isDesktop && saved === 'desktop');
    body.classList.toggle('manual-mobile', !isDesktop && saved === 'mobile');
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
    style.textContent = '#global-page-navigation{position:fixed;bottom:18px;left:18px;z-index:10000;display:flex;gap:8px;direction:ltr}#global-page-navigation button{width:46px;height:46px;border:0;border-radius:50%;background:rgba(255,255,255,.94);color:#0f513f;font:900 30px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 7px 20px rgba(0,0,0,.18);display:grid;place-items:center;transition:transform .15s ease,opacity .15s ease}#global-page-navigation button:hover{transform:scale(1.06)}#global-page-navigation button:active{transform:scale(.96)}@media(max-width:700px){#global-page-navigation{bottom:12px;left:12px;gap:6px}#global-page-navigation button{width:42px;height:42px;font-size:27px}}';
    document.head.appendChild(style);
    document.body.appendChild(wrap);
    document.getElementById('globalBack').addEventListener('click', function () { window.history.back(); });
    document.getElementById('globalForward').addEventListener('click', function () { window.history.forward(); });
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

  function refreshResponsiveDefault() {
    let saved = null;
    try { saved = localStorage.getItem('dxn_view_mode'); } catch (e) {}
    if (saved === 'mobile' || saved === 'desktop') return;
    applyDetectedDefault();
  }

  function init() {
    installDeviceCss();
    applyDetectedDefault();
    bindPreviousUserEntry();
    addNavigationButtons();

    window.addEventListener('resize', refreshResponsiveDefault, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(refreshResponsiveDefault, 100); }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
