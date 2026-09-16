(function () {
  'use strict';
  const KEY = 'dxnDeviceMode';
  const VALID = new Set(['mobile', 'desktop']);

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
    bind();
    new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
