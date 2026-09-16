(function () {
  'use strict';

  // V86.49 — Device-first interface selection.
  // No manual mobile/desktop choice is exposed. The current device decides the
  // interface, including when a phone browser requests the desktop site.

  function detectDeviceMode() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
    const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 9999;
    const screenWidth = screen.width || 9999;
    const touchDevice = Number(navigator.maxTouchPoints || 0) > 0;
    const compactTouchDevice = coarsePointer && noHover && Math.min(viewportWidth, screenWidth) <= 1366;
    const touchTabletOrPhone = touchDevice && viewportWidth <= 1100;
    return (mobileUA || compactTouchDevice || touchTabletOrPhone) ? 'mobile' : 'desktop';
  }

  function applyMode(mode) {
    const isDesktop = mode === 'desktop';
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;

    root.dataset.deviceMode = mode;
    body.classList.toggle('desktop-mode', isDesktop);
    body.classList.toggle('mobile-mode', !isDesktop);
    body.classList.toggle('manual-desktop', isDesktop);
    body.classList.toggle('manual-mobile', !isDesktop);

    // Remove any previously saved manual choice so it can never override detection.
    try { localStorage.removeItem('dxn_view_mode'); } catch (e) {}

    // Hide every legacy device selector, including dynamically rendered copies.
    document.querySelectorAll('.view-switch, .device-switch, #viewSwitch').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
    });

    document.querySelectorAll('.view-switch button, .device-switch button, #viewSwitch button').forEach(function (button) {
      button.disabled = true;
      button.setAttribute('tabindex', '-1');
      button.style.setProperty('display', 'none', 'important');
    });
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
      const target = event.target && event.target.closest
        ? event.target.closest('#mobilePreviousUser, #desktopPreviousUser, #previousUser')
        : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/app/index.html';
    }, true);
  }

  function hideSelectors() {
    document.querySelectorAll('.view-switch, .device-switch, #viewSwitch').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.view-switch button, .device-switch button, #viewSwitch button').forEach(function (button) {
      button.disabled = true;
      button.setAttribute('tabindex', '-1');
      button.style.setProperty('display', 'none', 'important');
    });
  }

  function watchDynamicInterface() {
    if (!window.MutationObserver || !document.body) return;
    const observer = new MutationObserver(function () {
      // Always reapply the detected mode: the legacy renderViewSwitch() can
      // otherwise overwrite the body class after a view/navigation change.
      applyMode(detectDeviceMode());
      hideSelectors();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function protectManualModeFunction() {
    // Keep the legacy function harmless even if old UI code calls it later.
    if (typeof window.setViewMode === 'function' && !window.setViewMode.__dxnDeviceFirst) {
      const automatic = function () {
        applyMode(detectDeviceMode());
      };
      automatic.__dxnDeviceFirst = true;
      window.setViewMode = automatic;
    }
  }

  function init() {
    applyMode(detectDeviceMode());
    bindPreviousUserEntry();
    addNavigationButtons();
    protectManualModeFunction();
    watchDynamicInterface();

    let lastMode = document.documentElement.dataset.deviceMode;
    const refreshMode = function () {
      const mode = detectDeviceMode();
      if (mode !== lastMode) {
        lastMode = mode;
        applyMode(mode);
      } else {
        hideSelectors();
      }
    };
    window.addEventListener('resize', refreshMode, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(refreshMode, 100); }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
