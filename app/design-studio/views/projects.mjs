/* مشاريعي (لوحة المشاريع مع فلاتر وبحث) + مكتبة القوالب. */
import { h, button, toast, sheet, downloadBlob, formatDate } from '../core/dom.mjs';
import { projects, FILTERS } from '../core/projects.mjs';
import { TEMPLATES } from '../templates.mjs';
import { header, chips, emptyState, downloadDataUrl } from './components.mjs';
import { projectCard, templateCard, TYPE_LABELS, STATUS_LABELS } from './home.mjs';

const ps = { filter: 'all', search: '' };

function openProject(ctx, p, refresh) {
  const exportAsset = (p.assets || []).find(a => a.kind === 'export' || a.kind === 'generated');
  const preview = exportAsset && exportAsset.blob
    ? h('video', { src: URL.createObjectURL(exportAsset.blob), controls: true, playsInline: true, class: 'ds-preview-video' })
    : exportAsset && exportAsset.dataUrl ? h('img', { src: exportAsset.dataUrl, alt: p.title, class: 'ds-preview-img' })
      : p.thumbnail ? h('img', { src: p.thumbnail, alt: p.title, class: 'ds-preview-img' }) : null;
  let s = null;
  const body = h('div', { class: 'ds-project-detail' },
    preview,
    h('p', { text: `${TYPE_LABELS[p.type] || p.type} · ${STATUS_LABELS[p.status] || p.status}` }),
    h('small', { class: 'ds-muted', text: `أُنشئ ${formatDate(p.created_at)} · آخر تعديل ${formatDate(p.updated_at)}` }),
    h('div', { class: 'ds-actions' },
      exportAsset ? button('تنزيل', () => { if (exportAsset.blob) downloadBlob(exportAsset.blob, `${p.id}.${String(exportAsset.mime || '').includes('mp4') ? 'mp4' : 'webm'}`); else downloadDataUrl(exportAsset.dataUrl, `${p.id}.jpg`); }, { variant: 'primary', icon: '⬇️' }) : null,
      button('حذف المشروع', async () => { if (await projects().remove(p.id)) { toast('تم حذف المشروع.'); s.close(); refresh(); } }, { variant: 'danger', icon: '🗑️' })));
  s = sheet(p.title, body);
}

export function projectsView(ctx, params = {}) {
  const root = h('div', { class: 'ds-studio' }, header(ctx, '📁 مشاريعي', 'كل مشاريعك محفوظة على هذا الجهاز.'));
  const list = h('div', { class: 'ds-grid ds-grid-projects' });
  const refresh = async () => {
    const rows = await projects().list({ filter: ps.filter, search: ps.search });
    list.replaceChildren(...(rows.length ? rows.map(p => projectCard(ctx, p, rec => openProject(ctx, rec, refresh))) : [emptyState('📂', ps.search || ps.filter !== 'all' ? 'لا توجد مشاريع مطابقة.' : 'لم تنشئ أي مشروع بعد.', button('ابدأ الآن', () => ctx.navigate('home'), { variant: 'primary', icon: '✨' }))]));
  };
  const search = h('input', { type: 'search', class: 'ds-input', placeholder: 'ابحث باسم المشروع...', value: ps.search, attrs: { 'aria-label': 'بحث في المشاريع' } });
  search.addEventListener('input', () => { ps.search = search.value; refresh(); });
  root.append(
    h('div', { class: 'ds-toolbar' }, search, chips(Object.entries(FILTERS).map(([value, f]) => ({ value, label: f.label })), ps.filter, v => { ps.filter = v; refresh(); }, { label: 'تصفية المشاريع' })),
    list);
  refresh().then(async () => { if (params.open) { const p = await projects().get(params.open); if (p) openProject(ctx, p, refresh); } });
  return root;
}

export function templatesView(ctx) {
  const cats = ['الكل', ...new Set(TEMPLATES.map(t => t.category))];
  let cat = 'الكل';
  const grid = h('div', { class: 'ds-grid ds-grid-templates' });
  const render = () => grid.replaceChildren(...TEMPLATES.filter(t => cat === 'الكل' || t.category === cat).map(t => templateCard(ctx, t)));
  render();
  return h('div', { class: 'ds-studio' }, header(ctx, '🧩 القوالب', 'اختر قالبًا، أضف صورك ونصوصك، وأنشئ الفيديو.'),
    chips(cats.map(c => ({ value: c, label: c })), cat, v => { cat = v; render(); }, { label: 'تصنيف القوالب' }), grid);
}