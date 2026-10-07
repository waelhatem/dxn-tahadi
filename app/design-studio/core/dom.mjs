/* أدوات بناء الواجهة بأمان: كل النصوص تمر عبر textContent ولا يُستخدم innerHTML مع بيانات المستخدم. */

/* h('div', {class:'x', onClick: fn, dataset:{id:1}, attrs:{'aria-label':'..'}}, child, ...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = String(value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'attrs') for (const [a, v] of Object.entries(value)) { if (v !== undefined && v !== null && v !== false) el.setAttribute(a, v === true ? '' : String(v)); }
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

export function button(label, onClick, { variant = '', icon = '', disabled = false, title = '', type = 'button' } = {}) {
  return h('button', {
    type, class: `ds-btn ${variant ? 'ds-btn-' + variant : ''}`.trim(), onClick, disabled,
    attrs: { title: title || null, 'aria-label': title || null }
  }, icon ? h('span', { class: 'ds-btn-icon', attrs: { 'aria-hidden': 'true' }, text: icon }) : null, h('span', { text: label }));
}

export function toast(message, kind = 'info') {
  if (typeof window !== 'undefined' && typeof window.toast === 'function') { window.toast(message); return; }
  const el = h('div', { class: `ds-toast ds-toast-${kind}`, attrs: { role: 'status' }, text: message });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* نافذة سفلية (Bottom sheet) على الهاتف وحوار وسطي على الشاشات الكبيرة. */
export function sheet(title, body, { onClose } = {}) {
  const close = () => { wrap.remove(); if (onClose) onClose(); };
  const wrap = h('div', { class: 'ds-sheet-wrap', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title } },
    h('div', { class: 'ds-sheet-backdrop', onClick: close }),
    h('div', { class: 'ds-sheet' },
      h('div', { class: 'ds-sheet-head' }, h('b', { text: title }), button('إغلاق', close, { variant: 'ghost', icon: '✕', title: 'إغلاق' })),
      h('div', { class: 'ds-sheet-body' }, body)));
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.appendChild(wrap);
  return { close, el: wrap };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(0) + ' KB';
  return (v / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function formatDate(iso) {
  try { return new Date(iso).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return String(iso || ''); }
}
