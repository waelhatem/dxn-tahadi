/* Leader security panel for the custom PIN-based authentication system. */
(function () {
  'use strict';
  if (window.__DXN_LEADER_PIN_SECURITY__) return;
  window.__DXN_LEADER_PIN_SECURITY__ = true;

  const endpoint = '/api/leader-pin-rotation';
  const dialogId = 'dxnLeaderPinSecurityDialog';
  let enabled = false;
  let checking = false;

  const styles = document.createElement('style');
  styles.textContent = `
    .dxn-security-entry { border:1px solid #d3e6dc; background:#f5fbf8; margin:14px 0; }
    .dxn-security-entry .dxn-security-top { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
    .dxn-security-entry .dxn-security-title { font-weight:900; font-size:19px; color:#124c39; }
    .dxn-security-entry p { line-height:1.8; margin:9px 0 0; color:#35594b; }
    .dxn-security-entry button { border-radius:12px; background:#116e50; color:#fff; font:inherit; font-weight:800; padding:11px 16px; border:0; cursor:pointer; }
    .dxn-security-overlay { position:fixed; inset:0; z-index:100500; background:rgba(8,28,24,.7); display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; }
    .dxn-security-dialog { width:min(100%,480px); max-height:95vh; overflow:auto; background:#fff; color:#213b32; border-radius:22px; box-shadow:0 24px 60px rgba(0,0,0,.3); padding:24px; font-family:inherit; }
    .dxn-security-dialog h2 { margin:0 0 8px; color:#11513b; font-size:22px; }
    .dxn-security-dialog p { line-height:1.7; margin:0 0 16px; }
    .dxn-security-dialog label { display:block; font-weight:800; margin:15px 0 5px; }
    .dxn-security-dialog input { width:100%; padding:13px 14px; border:1px solid #abbeb4; border-radius:12px; font:inherit; background:#fff; color:#15281e; direction:ltr; text-align:left; }
    .dxn-security-dialog input:focus { outline:3px solid #c6e7d7; border-color:#116e50; }
    .dxn-security-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:20px; flex-wrap:wrap; }
    .dxn-security-actions button { padding:11px 16px; border-radius:12px; border:1px solid #bacdc0; background:#fff; color:#154b36; cursor:pointer; font:inherit; font-weight:800; }
    .dxn-security-actions button[type=submit] { background:#116e50; border-color:#116e50; color:#fff; }
    .dxn-security-actions button:disabled { cursor:not-allowed; opacity:.55; }
    .dxn-security-status { min-height:26px; font-weight:750; margin-top:12px; line-height:1.7; }
    .dxn-security-preview { padding:10px 12px; border-radius:10px; background:#fff5de; color:#744600; font-weight:750; }
    @media(max-width:600px){ .dxn-security-dialog{padding:18px;border-radius:16px} .dxn-security-actions button{flex:1} }
  `;
  document.head.appendChild(styles);

  function isLeader() {
    try {
      return typeof role !== 'undefined' && role === 'leader' &&
        Boolean(localStorage.getItem('dxn_session'));
    } catch (_) { return false; }
  }

  function insertEntry() {
    if (!isLeader() || typeof tab === 'undefined' || tab !== 'leader') return;
    if (document.getElementById('dxnLeaderSecurityEntry')) return;
    const tabs = document.querySelector('#app .tabs');
    if (!tabs) return;

    const entry = document.createElement('section');
    entry.id = 'dxnLeaderSecurityEntry';
    entry.className = 'card dxn-security-entry';
    entry.innerHTML = `
      <div class="dxn-security-top">
        <div class="dxn-security-title">🔐 أمان حساب القائد</div>
        <button type="button" id="dxnLeaderSecurityOpen">تغيير كلمة مرور القائد</button>
      </div>
      <p>غيّر كلمة المرور بعد التحقق من الرمز الحالي. عند الاعتماد النهائي، سيُنهي النظام جميع جلسات القائد السابقة ويمنحك جلسة جديدة.</p>`;
    tabs.insertAdjacentElement('afterend', entry);
    entry.querySelector('button').addEventListener('click', openDialog);

    // The legacy action still exists in the toolbar. Redirect it to this
    // secure dialog; never call the original change_pin RPC for leaders.
    for (const button of document.querySelectorAll('button[onclick="changePin()"]')) {
      button.textContent = '🔐 تغيير كلمة مرور القائد';
    }
  }

  function closeDialog() {
    const overlay = document.getElementById(dialogId);
    if (overlay) overlay.remove();
  }

  async function checkAvailability() {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      enabled = response.ok && data.enabled === true;
    } catch (_) { enabled = false; }
    finally { checking = false; }
  }

  async function openDialog() {
    if (!isLeader() || document.getElementById(dialogId)) return;

    const overlay = document.createElement('div');
    overlay.className = 'dxn-security-overlay';
    overlay.id = dialogId;
    overlay.innerHTML = `
      <div class="dxn-security-dialog" role="dialog" aria-modal="true" aria-labelledby="dxnSecurityTitle">
        <h2 id="dxnSecurityTitle">🔐 تغيير كلمة مرور القائد</h2>
        <p>سيُطلب الرمز الحالي للتأكد من هويتك. استخدم كلمة مرور فريدة لا تقل عن 12 حرفًا، واحفظها في مدير كلمات المرور.</p>
        <div class="dxn-security-preview" id="dxnSecurityAvailability" role="status">جارٍ فحص جاهزية الميزة…</div>
        <form id="dxnLeaderPinForm" autocomplete="on">
          <label for="dxnOldLeaderPin">كلمة المرور الحالية</label>
          <input id="dxnOldLeaderPin" name="current-password" type="password" autocomplete="current-password" required>
          <label for="dxnNewLeaderPin">كلمة المرور الجديدة</label>
          <input id="dxnNewLeaderPin" name="new-password" type="password" autocomplete="new-password" minlength="12" required>
          <label for="dxnConfirmLeaderPin">تأكيد كلمة المرور الجديدة</label>
          <input id="dxnConfirmLeaderPin" type="password" autocomplete="new-password" minlength="12" required>
          <div id="dxnSecurityStatus" class="dxn-security-status" aria-live="polite"></div>
          <div class="dxn-security-actions">
            <button type="button" id="dxnCancelSecurity">إلغاء</button>
            <button type="submit" id="dxnSaveSecurity" disabled>اعتماد التغيير</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dxnCancelSecurity').addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
    overlay.querySelector('#dxnLeaderPinForm').addEventListener('submit', submitRotation);
    overlay.querySelector('#dxnOldLeaderPin').focus();
    await checkAvailability();
    if (!overlay.isConnected) return;
    const availability = overlay.querySelector('#dxnSecurityAvailability');
    availability.textContent = enabled
      ? 'الميزة متاحة. ستُلغى جلسات القائد القديمة تلقائيًا بعد نجاح التغيير.'
      : 'وضع المعاينة فقط: يمكنك معاينة الحقول، لكن تغيير كلمة المرور معطّل لحماية بيانات الإنتاج.';
    overlay.querySelector('#dxnSaveSecurity').disabled = !enabled;
  }

  async function submitRotation(event) {
    event.preventDefault();
    if (!enabled || !isLeader()) return;
    const form = event.currentTarget;
    const current = form.querySelector('#dxnOldLeaderPin').value;
    const next = form.querySelector('#dxnNewLeaderPin').value;
    const confirm = form.querySelector('#dxnConfirmLeaderPin').value;
    const status = form.querySelector('#dxnSecurityStatus');
    const save = form.querySelector('#dxnSaveSecurity');
    status.style.color = '#9b3028';
    status.textContent = '';

    if (next.length < 12 || new TextEncoder().encode(next).length > 72) {
      status.textContent = 'يجب أن تكون كلمة المرور الجديدة من 12 حرفًا على الأقل، وبحد أقصى 72 بايت.';
      return;
    }
    if (current === next) { status.textContent = 'اختر كلمة مرور جديدة تختلف عن الحالية.'; return; }
    if (next !== confirm) { status.textContent = 'تأكيد كلمة المرور غير مطابق.'; return; }

    save.disabled = true;
    status.textContent = 'جارٍ التحقق والتغيير الآمن…';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          token: localStorage.getItem('dxn_session'),
          current_pin: current,
          new_pin: next
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.token) throw new Error(data.error || 'تعذر إتمام التغيير');

      // The server atomically replaced the session token. Reload the app so
      // every in-memory RPC caller reads the new, valid token.
      localStorage.setItem('dxn_session', data.token);
      localStorage.setItem('dxn_session_issued', String(Date.now()));
      form.reset();
      status.style.color = '#116e50';
      status.textContent = 'تم تأمين الحساب وإبطال الجلسات القديمة. جارٍ تحديث الجلسة…';
      window.setTimeout(() => location.reload(), 900);
    } catch (error) {
      form.querySelector('#dxnOldLeaderPin').value = '';
      status.textContent = String(error.message || 'تعذر إتمام العملية');
      save.disabled = !enabled;
    }
  }

  window.changePin = openDialog;
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById(dialogId)) closeDialog();
  });
  const observer = new MutationObserver(insertEntry);
  observer.observe(document.body, { childList: true, subtree: true });
  insertEntry();
})();
