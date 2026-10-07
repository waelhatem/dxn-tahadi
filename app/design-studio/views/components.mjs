/* مكونات مشتركة بين أقسام الاستوديو. */
import { h, button, toast, downloadBlob } from '../core/dom.mjs';
import { validateFile, readAsDataURL } from '../core/files.mjs';
import { jobs } from '../core/jobs.mjs';
import { projects, makeThumbnail } from '../core/projects.mjs';
import { ASPECTS, FILE_RULES, MESSAGES, SAMPLE_LABEL } from '../config.mjs';

export function header(ctx, title, subtitle, { back = true } = {}) {
  return h('div', { class: 'ds-header' },
    back ? button('رجوع', () => ctx.navigate('home'), { variant: 'ghost', icon: '→', title: 'العودة إلى الاستوديو' }) : null,
    h('div', { class: 'ds-header-text' }, h('h2', { class: 'ds-title', text: title }), subtitle ? h('p', { class: 'ds-subtitle', text: subtitle }) : null));
}

/* منطقة رفع: سحب وإفلات + اختيار من الجهاز + الكاميرا على الهاتف. onFiles(files[]) بعد التحقق. */
export function uploader({ kind, multiple = false, onFiles, label }) {
  const rule = FILE_RULES[kind];
  const accept = rule.mime.join(',');
  const status = h('div', { class: 'ds-upload-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const input = h('input', { type: 'file', accept, multiple, class: 'ds-visually-hidden', attrs: { 'aria-label': label || `اختر ${rule.label}` } });
  const camera = kind === 'image' ? h('input', { type: 'file', accept: 'image/*', class: 'ds-visually-hidden', attrs: { capture: 'environment', 'aria-label': 'التقاط صورة' } }) : null;
  async function take(list) {
    const files = [...(list || [])].slice(0, multiple ? 12 : 1);
    if (!files.length) return;
    const ok = [];
    for (const f of files) {
      const v = await validateFile(f, kind);
      if (!v.ok) { status.textContent = `⚠️ ${f.name}: ${v.error}`; status.className = 'ds-upload-status is-error'; continue; }
      ok.push(f);
    }
    if (ok.length) { status.textContent = `✅ تم اختيار ${ok.length} ${rule.label}`; status.className = 'ds-upload-status is-ok'; onFiles(ok); }
  }
  input.addEventListener('change', () => { take(input.files); input.value = ''; });
  if (camera) camera.addEventListener('change', () => { take(camera.files); camera.value = ''; });
  const zone = h('div', { class: 'ds-dropzone', attrs: { tabindex: '0', role: 'button', 'aria-label': label || `ارفع ${rule.label}` } },
    h('div', { class: 'ds-dropzone-icon', attrs: { 'aria-hidden': 'true' }, text: kind === 'image' ? '🖼️' : kind === 'video' ? '🎬' : '🎙️' }),
    h('b', { text: label || `اسحب ${rule.label} هنا أو اضغط للاختيار` }),
    h('small', { text: `${rule.ext.join('، ')} — حتى ${Math.round(rule.maxBytes / 1024 / 1024)} MB` }));
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-over'); take(e.dataTransfer.files); });
  return h('div', { class: 'ds-uploader' }, zone, input, camera,
    camera ? h('div', { class: 'ds-upload-alt' }, button('التقاط بالكاميرا', () => camera.click(), { icon: '📷', variant: 'ghost' }), button('من الجهاز', () => input.click(), { icon: '📁', variant: 'ghost' })) : null,
    status);
}

export function chips(options, value, onChange, { label } = {}) {
  const wrap = h('div', { class: 'ds-chips', attrs: { role: 'radiogroup', 'aria-label': label || null } });
  const render = current => {
    wrap.replaceChildren(...options.map(o => h('button', {
      type: 'button', class: 'ds-chip' + (o.value === current ? ' is-active' : ''),
      attrs: { role: 'radio', 'aria-checked': String(o.value === current) },
      onClick: () => { render(o.value); onChange(o.value); }
    }, o.icon ? h('span', { attrs: { 'aria-hidden': 'true' }, text: o.icon + ' ' }) : null, o.label)));
  };
  render(value);
  return wrap;
}

export function aspectPicker(value, onChange) {
  return field('المقاس', chips(Object.keys(ASPECTS).map(a => ({ value: a, label: a })), value, onChange, { label: 'المقاس' }));
}

export function field(label, control, hint) {
  return h('div', { class: 'ds-field' }, h('div', { class: 'ds-field-label', text: label }), control, hint ? h('small', { class: 'ds-hint', text: hint }) : null);
}

export function textInput(value, onInput, { placeholder = '', multiline = false, maxLength = 500, label } = {}) {
  const el = h(multiline ? 'textarea' : 'input', { class: 'ds-input', value: value || '', placeholder, maxLength, attrs: { 'aria-label': label || placeholder } });
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

export function sampleBadge(result) {
  return result && result.sample ? h('span', { class: 'ds-sample', text: SAMPLE_LABEL }) : null;
}

/* لوحة متابعة المهمة: التقدم + إلغاء + إعادة المحاولة + عرض النتيجة. */
export function jobPanel(jobId, { onResult } = {}) {
  const bar = h('div', { class: 'ds-progress-bar' });
  const pct = h('b', { class: 'ds-progress-pct', text: '0%' });
  const stage = h('span', { class: 'ds-progress-stage', text: 'جاري التحضير...' });
  const actions = h('div', { class: 'ds-actions' });
  const panel = h('div', { class: 'ds-job', attrs: { role: 'status', 'aria-live': 'polite' } },
    h('div', { class: 'ds-progress-head' }, stage, pct), h('div', { class: 'ds-progress' }, bar), actions);
  /* مهمة منتهية مسبقًا لا تُسلَّم نتيجتها مرة ثانية (يمنع حلقة إعادة الرسم). */
  const initial = jobs.get(jobId);
  let delivered = !!(initial && initial.status === 'completed');
  const unsubscribe = jobs.subscribe(job => {
    if (job.id !== jobId) return;
    bar.style.width = job.progress + '%';
    pct.textContent = job.progress + '%';
    stage.textContent = job.status === 'failed' ? (job.error || MESSAGES.processingFailed) : job.stage;
    panel.dataset.status = job.status;
    if (job.status === 'processing' || job.status === 'queued') actions.replaceChildren(button('إلغاء', () => jobs.cancel(jobId), { variant: 'ghost', icon: '⏹' }));
    else if (job.status === 'failed' || job.status === 'cancelled') { delivered = false; actions.replaceChildren(button('إعادة المحاولة', () => jobs.retry(jobId), { icon: '🔁' })); }
    else if (job.status === 'completed') { actions.replaceChildren(); if (!delivered && onResult) { delivered = true; onResult(job.result, job); } }
    if (!panel.isConnected && job.status !== 'processing') unsubscribe();
  });
  const current = jobs.get(jobId);
  if (current) { bar.style.width = current.progress + '%'; pct.textContent = current.progress + '%'; stage.textContent = current.status === 'completed' ? '✅ اكتملت المعالجة' : current.status === 'failed' ? (current.error || MESSAGES.processingFailed) : current.stage; panel.dataset.status = current.status; }
  return panel;
}

/* مقارنة قبل/بعد بمنزلق. */
export function beforeAfter(before, after) {
  const afterImg = h('img', { src: after, alt: 'بعد', class: 'ds-ba-img' });
  const clip = h('div', { class: 'ds-ba-clip' }, h('img', { src: before, alt: 'قبل', class: 'ds-ba-img' }));
  const range = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'ds-ba-range', attrs: { 'aria-label': 'مقارنة قبل وبعد' } });
  const set = v => { clip.style.width = v + '%'; };
  range.addEventListener('input', () => set(range.value));
  set(50);
  return h('div', { class: 'ds-ba' }, h('div', { class: 'ds-ba-stage' }, afterImg, clip, h('span', { class: 'ds-ba-tag ds-ba-before', text: 'قبل' }), h('span', { class: 'ds-ba-tag ds-ba-after', text: 'بعد' })), range);
}

export async function dataUrlToBlob(dataUrl) { const r = await fetch(dataUrl); return r.blob(); }

/* حفظ مشروع مع الأصل والنتيجة. يعيد سجل المشروع. */
export async function saveProject({ id, title, type, status = 'completed', thumbnailSource, settings, assets }) {
  let thumbnail = '';
  try { thumbnail = thumbnailSource ? await makeThumbnail(thumbnailSource) : ''; } catch (_) { thumbnail = ''; }
  const rec = await projects().save({ id, title, type, status, thumbnail, settings, assets });
  toast(MESSAGES.saved);
  return rec;
}

export function downloadDataUrl(dataUrl, name) { dataUrlToBlob(dataUrl).then(b => downloadBlob(b, name)); }

export async function filesToDataUrls(files) { return Promise.all(files.map(readAsDataURL)); }

export function emptyState(icon, text, action) {
  return h('div', { class: 'ds-empty' }, h('div', { class: 'ds-empty-icon', attrs: { 'aria-hidden': 'true' }, text: icon }), h('p', { text }), action || null);
}