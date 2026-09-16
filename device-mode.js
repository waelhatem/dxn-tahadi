(function () {
  'use strict';
  const KEY = 'dxnDeviceMode';
  const VALID = new Set(['mobile', 'desktop']);

  // Reload behavior: keep the user on the current page.
  // The selected device mode remains untouched in localStorage.

  // The new homepage owns the "مستخدم سابق" entry point.
  // Capture the click before any page-specific handler so the complete
  // previous interface opens as one unit, without changing the homepage file.
  function bindPreviousUserEntry() {
    if (document.documentElement.dataset.previousUserEntryBound === '1') return;
    document.documentElement.dataset.previousUserEntryBound = '1';
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest
        ? event.target.closest('#mobilePreviousUser, #desktopPreviousUser')
        : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/app/index.html';
    }, true);
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

    document.getElementById('globalBack').addEventListener('click', function () {
      window.history.back();
    });
    document.getElementById('globalForward').addEventListener('click', function () {
      window.history.forward();
    });
  }

  function readMode() {
    try {
      const value = localStorage.getItem(KEY);
      return VALID.has(value) ? value : 'desktop';
    } catch (_) {
      return 'desktop';
    }
  }

  function saveMode(mode) {
    if (!VALID.has(mode)) return;
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    applyMode(mode);
  }

  function applyMode(mode) {
    const isDesktop = mode === 'desktop';
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;

    root.dataset.deviceMode = mode;
    body.classList.toggle('desktop-mode', isDesktop);
    body.classList.toggle('manual-desktop', isDesktop);
    body.classList.toggle('manual-mobile', !isDesktop);

    document.querySelectorAll('.view-switch button, .device-switch button').forEach(function (button) {
      const id = (button.id || '').toLowerCase();
      const text = (button.textContent || '').toLowerCase();
      const buttonMode = id.includes('mobile') || text.includes('الموبايل') || text.includes('mobile') ? 'mobile'
        : id.includes('desktop') || text.includes('الحاسوب') || text.includes('desktop') ? 'desktop' : null;
      if (!buttonMode) return;
      const active = buttonMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function bind() {
    document.querySelectorAll('.view-switch button, .device-switch button').forEach(function (button) {
      if (button.dataset.globalDeviceBound === '1') return;
      button.dataset.globalDeviceBound = '1';
      button.addEventListener('click', function () {
        const id = (button.id || '').toLowerCase();
        const text = (button.textContent || '').toLowerCase();
        const mode = id.includes('mobile') || text.includes('الموبايل') || text.includes('mobile') ? 'mobile'
          : id.includes('desktop') || text.includes('الحاسوب') || text.includes('desktop') ? 'desktop' : null;
        if (mode) saveMode(mode);
      });
    });
  }

  function init() {
    applyMode(readMode());
    bindPreviousUserEntry();
    bind();
    addNavigationButtons();
    new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
