/* الصوت والترجمة: تحويل الصوت إلى نص، محرر الترجمات (Subtitle Editor)، الترجمة والدبلجة. */
import { h, button, toast, downloadBlob, formatTime } from '../core/dom.mjs';
import { mediaInfo } from '../core/files.mjs';
import { jobs } from '../core/jobs.mjs';
import { speechEngine, translationEngine } from '../engines/index.mjs';
import { getProvider, LANGUAGES, MESSAGES } from '../config.mjs';
import { header, uploader, chips, field, jobPanel, saveProject, sampleBadge } from './components.mjs';

const CAPTION_STYLES = [{ value: 'classic', label: 'Classic' }, { value: 'modern', label: 'Modern' }, { value: 'bold', label: 'Bold' }, { value: 'minimal', label: 'Minimal' }, { value: 'karaoke', label: 'Karaoke' }];
const astate = { tab: 'subtitles', file: null, url: '', kind: '', duration: 0, language: 'ar', target: 'en', segments: [], translated: [], style: 'modern', jobId: null, sample: false, projectId: null };

export function audioView(ctx, params = {}) {
  if (params.tab) astate.tab = params.tab;
  const root = h('div', { class: 'ds-studio' }, header(ctx, '🎙️ الصوت والترجمة', 'ارفع فيديو أو ملف صوت، حوّله إلى نص، عدّل الترجمة، ثم صدّرها.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());

  function startTranscribe() {
    if (!astate.file) { toast(MESSAGES.needFile); return; }
    const input = { duration: astate.duration, language: astate.language };
    astate.jobId = jobs.submit({ type: 'audio', provider: getProvider('speech'), input, run: c => speechEngine.transcribe(input, c) });
    render();
  }
  function startTranslate() {
    if (!astate.segments.length) { toast('حوّل الصوت إلى نص أولًا.'); return; }
    const input = { segments: astate.segments, target: astate.target };
    astate.jobId = jobs.submit({ type: 'translation', provider: getProvider('translation'), input, run: c => translationEngine.translate(input, c) });
    render();
  }
  async function exportSubs(format, list) {
    const text = await speechEngine.generateSubtitles(list, format);
    downloadBlob(new Blob([text], { type: format === 'vtt' ? 'text/vtt' : 'application/x-subrip' }), `subtitles-${astate.tab === 'translate' ? astate.target : astate.language}.${format}`);
  }
  function onResult(res) {
    astate.jobId = null;
    astate.sample = !!(res && res.sample);
    if (res && res.target) astate.translated = res.segments; else if (res && res.segments) astate.segments = res.segments;
    render();
  }
  function editor(list, onChange) {
    const rows = list.map((s, i) => h('div', { class: 'ds-sub-row' },
      h('input', { class: 'ds-input ds-sub-time', type: 'number', min: 0, step: 0.1, value: s.start, attrs: { 'aria-label': `بداية ${i + 1}` }, onChange: e => { s.start = Number(e.target.value); onChange(); } }),
      h('input', { class: 'ds-input ds-sub-time', type: 'number', min: 0, step: 0.1, value: s.end, attrs: { 'aria-label': `نهاية ${i + 1}` }, onChange: e => { s.end = Number(e.target.value); onChange(); } }),
      h('input', { class: 'ds-input ds-sub-text', value: s.text, maxLength: 200, attrs: { 'aria-label': `نص ${i + 1}` }, onInput: e => { s.text = e.target.value; } }),
      h('button', { type: 'button', class: 'ds-icon-btn', attrs: { 'aria-label': `حذف ${i + 1}` }, text: '🗑️', onClick: () => { list.splice(i, 1); render(); } })));
    return h('div', { class: 'ds-subs' },
      h('div', { class: 'ds-sub-head' }, h('span', { text: 'البداية' }), h('span', { text: 'النهاية' }), h('span', { text: 'النص' }), h('span', { text: '' })),
      rows,
      button('إضافة سطر', () => { const last = list[list.length - 1]; const start = last ? last.end + 0.1 : 0; list.push({ id: 'c' + Date.now(), start: +start.toFixed(1), end: +(start + 2).toFixed(1), text: 'نص جديد' }); render(); }, { variant: 'ghost', icon: '➕' }));
  }
  function body() {
    const tabs = chips([{ value: 'subtitles', label: 'تحويل إلى نص وترجمة الفيديو' }, { value: 'translate', label: 'الترجمة والدبلجة' }], astate.tab, v => { astate.tab = v; render(); });
    if (!astate.file) return [tabs, uploader({ kind: 'video', label: 'ارفع فيديو (أو اختر ملف صوت بالأسفل)', onFiles: ([f]) => load(f, 'video') }), uploader({ kind: 'audio', label: 'أو ارفع ملف صوت (mp3, wav, m4a)', onFiles: ([f]) => load(f, 'audio') })];
    const media = astate.kind === 'video'
      ? h('video', { src: astate.url, controls: true, playsInline: true, class: 'ds-preview-video' + ' ds-cap-' + astate.style })
      : h('audio', { src: astate.url, controls: true, class: 'ds-preview-audio' });
    const list = astate.tab === 'translate' && astate.translated.length ? astate.translated : astate.segments;
    return [tabs, h('div', { class: 'ds-split' },
      h('div', { class: 'ds-preview' }, media, h('small', { class: 'ds-hint', text: `المدة: ${formatTime(astate.duration)}` }), astate.segments.length ? sampleBadge({ sample: astate.sample }) : null),
      h('div', { class: 'ds-panel' },
        field('لغة الملف', chips(LANGUAGES.map(l => ({ value: l.code, label: l.label })), astate.language, v => { astate.language = v; })),
        astate.tab === 'translate' ? field('الترجمة إلى', chips(LANGUAGES.filter(l => l.code !== astate.language).map(l => ({ value: l.code, label: l.label })), astate.target, v => { astate.target = v; })) : null,
        h('div', { class: 'ds-actions' },
          button('تحويل الصوت إلى نص', startTranscribe, { variant: astate.segments.length ? '' : 'primary', icon: '📝' }),
          astate.tab === 'translate' ? button('ترجمة', startTranslate, { variant: 'primary', icon: '🌐' }) : null,
          astate.tab === 'translate' ? button('دبلجة صوتية', () => toast(MESSAGES.engineUnavailable), { icon: '🗣️', disabled: !translationEngine.supportsDubbing(), title: translationEngine.supportsDubbing() ? '' : 'قريبًا' }) : null,
          button('ملف آخر', () => { if (astate.url) URL.revokeObjectURL(astate.url); Object.assign(astate, { file: null, url: '', segments: [], translated: [], jobId: null }); render(); }, { variant: 'ghost', icon: '🔄' })),
        astate.jobId ? jobPanel(astate.jobId, { onResult }) : null,
        list.length ? field('شكل الترجمة على الفيديو', chips(CAPTION_STYLES, astate.style, v => { astate.style = v; render(); })) : null,
        list.length ? editor(list, render) : null,
        list.length ? h('div', { class: 'ds-actions ds-result-actions' },
          button('تنزيل SRT', () => exportSubs('srt', list), { variant: 'primary', icon: '⬇️' }),
          button('تنزيل VTT', () => exportSubs('vtt', list), { icon: '⬇️' }),
          button('حفظ', async () => { const rec = await saveProject({ id: astate.projectId, title: (astate.tab === 'translate' ? 'ترجمة — ' : 'نص — ') + astate.file.name, type: astate.tab === 'translate' ? 'translation' : 'audio', status: 'completed', settings: { language: astate.language, target: astate.target, style: astate.style, segments: astate.segments, translated: astate.translated }, assets: [] }); astate.projectId = rec.id; }, { icon: '💾' })) : null))];
  }
  async function load(file, kind) {
    astate.file = file; astate.kind = kind; astate.url = URL.createObjectURL(file); astate.segments = []; astate.translated = []; astate.projectId = null;
    try { astate.duration = (await mediaInfo(astate.url, kind)).duration; } catch (_) { astate.duration = 0; }
    render();
  }
  render();
  root.appendChild(work);
  return root;
}