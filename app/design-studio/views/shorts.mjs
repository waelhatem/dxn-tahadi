/* تحويل الفيديو الطويل إلى مقاطع قصيرة: رفع → تحليل → اقتراح مقاطع → اختيار → 9:16 + ترجمة → تصدير. */
import { h, button, toast, downloadBlob, formatTime } from '../core/dom.mjs';
import { mediaInfo } from '../core/files.mjs';
import { jobs } from '../core/jobs.mjs';
import { shortsEngine } from '../engines/index.mjs';
import { getProvider, MESSAGES } from '../config.mjs';
import { header, uploader, field, jobPanel, saveProject, sampleBadge } from './components.mjs';

const sstate = { file: null, url: '', duration: 0, clips: [], selected: new Set(), jobId: null, sample: false, subtitles: true, projectId: null };

async function frameAt(url, t) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    v.onloadeddata = () => { v.currentTime = Math.min(t + 0.5, (v.duration || t + 1) - 0.1); };
    v.onseeked = () => { const c = document.createElement('canvas'); c.width = 180; c.height = Math.round(180 * (v.videoHeight / v.videoWidth || 1.77)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.7)); };
    v.onerror = () => resolve('');
  });
}

export function shortsView(ctx) {
  const root = h('div', { class: 'ds-studio' }, header(ctx, '✂️ تحويل الفيديو الطويل إلى مقاطع قصيرة', 'ارفع الفيديو وسنقترح عليك أفضل المقاطع.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());
  function analyze() {
    const input = { duration: sstate.duration };
    sstate.jobId = jobs.submit({ type: 'short', provider: getProvider('shorts'), input, run: c => shortsEngine.analyze(input, c) });
    render();
  }
  async function onResult(res) {
    sstate.jobId = null; sstate.sample = !!res.sample;
    sstate.clips = res.clips || [];
    sstate.selected = new Set(sstate.clips.slice(0, 2).map(c => c.id));
    render();
    for (const c of sstate.clips) { c.thumb = await frameAt(sstate.url, c.start); }
    render();
  }
  function exportPlan() {
    const chosen = sstate.clips.filter(c => sstate.selected.has(c.id));
    if (!chosen.length) { toast('اختر مقطعًا واحدًا على الأقل.'); return; }
    const plan = { aspect: '9:16', subtitles: sstate.subtitles, clips: chosen.map(({ thumb, ...c }) => c) };
    downloadBlob(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), `shorts-plan-${Date.now()}.json`);
    toast(shortsEngine.supportsCutting() ? 'تم إرسال المقاطع للتصدير.' : 'تم تنزيل خطة المقاطع. القص التلقائي يتوفر عند تفعيل محرك المقاطع.');
  }
  function body() {
    if (!sstate.file) return [uploader({ kind: 'video', label: 'ارفع الفيديو الطويل', onFiles: async ([f]) => { sstate.file = f; sstate.url = URL.createObjectURL(f); sstate.clips = []; sstate.projectId = null; try { sstate.duration = (await mediaInfo(sstate.url, 'video')).duration; } catch (_) { sstate.duration = 0; } render(); } })];
    const cards = sstate.clips.map(c => h('label', { class: 'ds-card ds-clip' + (sstate.selected.has(c.id) ? ' is-active' : '') },
      h('input', { type: 'checkbox', checked: sstate.selected.has(c.id), onChange: e => { e.target.checked ? sstate.selected.add(c.id) : sstate.selected.delete(c.id); render(); } }),
      c.thumb ? h('img', { src: c.thumb, alt: '', class: 'ds-clip-thumb' }) : h('div', { class: 'ds-clip-thumb ds-project-thumb-empty', text: '🎞️' }),
      h('b', { text: c.title }),
      h('small', { text: `${formatTime(c.start)} – ${formatTime(c.end)} · ${Math.round(c.duration)} ث` }),
      h('span', { class: 'ds-score', text: `التقييم ${c.score}` }),
      h('button', { type: 'button', class: 'ds-link', text: '▶ معاينة', onClick: e => { e.preventDefault(); const v = work.querySelector('video'); if (v) { v.currentTime = c.start; v.play(); } } })));
    return [h('div', { class: 'ds-split' },
      h('div', { class: 'ds-preview' }, h('video', { src: sstate.url, controls: true, playsInline: true, class: 'ds-preview-video' }), h('small', { class: 'ds-hint', text: `المدة: ${formatTime(sstate.duration)}` }), sstate.clips.length ? sampleBadge({ sample: sstate.sample }) : null),
      h('div', { class: 'ds-panel' },
        h('div', { class: 'ds-actions' }, button(sstate.clips.length ? 'إعادة التحليل' : 'تحليل الفيديو', analyze, { variant: 'primary', icon: '🔎' }), button('فيديو آخر', () => { URL.revokeObjectURL(sstate.url); Object.assign(sstate, { file: null, url: '', clips: [], jobId: null }); render(); }, { variant: 'ghost', icon: '🔄' })),
        sstate.jobId ? jobPanel(sstate.jobId, { onResult }) : null,
        sstate.clips.length ? h('div', { class: 'ds-grid ds-grid-clips' }, cards) : null,
        sstate.clips.length ? field('الإعدادات', h('label', { class: 'ds-toggle' }, h('input', { type: 'checkbox', checked: sstate.subtitles, onChange: e => { sstate.subtitles = e.target.checked; } }), h('span', { text: 'إضافة ترجمة تلقائية + قص 9:16' }))) : null,
        sstate.clips.length ? h('div', { class: 'ds-actions ds-result-actions' },
          button('تصدير المقاطع المختارة', exportPlan, { variant: 'primary', icon: '⬇️' }),
          button('حفظ', async () => { const thumb = (sstate.clips.find(c => c.thumb) || {}).thumb; const rec = await saveProject({ id: sstate.projectId, title: 'Shorts — ' + sstate.file.name, type: 'short', status: 'draft', thumbnailSource: thumb, settings: { clips: sstate.clips.map(({ thumb: t, ...c }) => c), selected: [...sstate.selected] }, assets: [] }); sstate.projectId = rec.id; }, { icon: '💾' })) : null))];
  }
  render();
  root.appendChild(work);
  return root;
}