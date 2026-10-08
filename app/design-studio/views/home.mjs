/* الصفحة الرئيسية للاستوديو: إجراءات سريعة + الأقسام + المشاريع الأخيرة + القوالب المقترحة. */
import { h, formatDate } from '../core/dom.mjs';
import { projects } from '../core/projects.mjs';
import { isEnabled } from '../config.mjs';
import { TEMPLATES } from '../templates.mjs';

const QUICK = [
  { label: 'تحسين صورة', icon: '✨', view: 'image', params: { tool: 'enhance' }, flag: 'DESIGN_IMAGE_ENABLED' },
  { label: 'تصميم منتج', icon: '🛍️', view: 'product', flag: 'DESIGN_IMAGE_ENABLED' },
  { label: 'إنشاء صورة', icon: '🌟', view: 'image', params: { tool: 'generate' }, flag: 'DESIGN_IMAGE_ENABLED' },
  { label: 'إنشاء إعلان', icon: '📣', view: 'image', params: { tool: 'ad' }, flag: 'DESIGN_IMAGE_ENABLED' },
  { label: 'صورة إلى فيديو', icon: '✨', view: 'video', params: { mode: 'image-ai' }, flag: 'DESIGN_VIDEO_ENABLED' },
  { label: 'إنشاء Reel', icon: '🎞️', view: 'video', params: { preset: 'ig-reel' }, flag: 'DESIGN_VIDEO_ENABLED' },
  { label: 'إنشاء فيديو', icon: '🎬', view: 'video', params: { mode: 'slideshow' }, flag: 'DESIGN_VIDEO_ENABLED' },
  { label: 'إضافة ترجمة', icon: '💬', view: 'audio', params: { tab: 'subtitles' }, flag: 'DESIGN_AUDIO_ENABLED' },
  { label: 'فيديو إلى Shorts', icon: '✂️', view: 'shorts', flag: 'DESIGN_SHORTS_ENABLED' }
];

const SECTIONS = [
  { view: 'image', icon: '🖼️', title: 'الصور', text: 'تحسين، خلفيات، مقاسات السوشيال، وتصميم المنتجات.', flag: 'DESIGN_IMAGE_ENABLED' },
  { view: 'video', icon: '🎬', title: 'الفيديو', text: 'فيديو من الصور، Reels وShorts، مقدمة وخاتمة ونصوص.', flag: 'DESIGN_VIDEO_ENABLED' },
  { view: 'audio', icon: '🎙️', title: 'الصوت والترجمة', text: 'تحويل الصوت إلى نص، ترجمات الفيديو، والترجمة للغات أخرى.', flag: 'DESIGN_AUDIO_ENABLED' },
  { view: 'content', icon: '✍️', title: 'صناعة المحتوى', text: 'أفكار، Scripts، Captions، Hashtags وخطة أسبوعية.', flag: 'DESIGN_CONTENT_ENABLED' },
  { view: 'shorts', icon: '✂️', title: 'Shorts / Reels', text: 'حوّل الفيديو الطويل إلى مقاطع قصيرة جاهزة.', flag: 'DESIGN_SHORTS_ENABLED' },
  { view: 'publish', icon: '📅', title: 'النشر والجدولة', text: 'جهّز المنشور وحدد المنصات والموعد.', flag: 'DESIGN_PUBLISHING_ENABLED' },
  { view: 'projects', icon: '📁', title: 'مشاريعي', text: 'كل ما أنشأته في مكان واحد.' },
  { view: 'templates', icon: '🧩', title: 'القوالب', text: 'قوالب جاهزة للإعلانات والترحيب والإنجازات.', flag: 'DESIGN_VIDEO_ENABLED' }
];

export function homeView(ctx) {
  const recent = h('div', { class: 'ds-grid ds-grid-projects' }, h('div', { class: 'ds-muted', text: 'جاري تحميل المشاريع...' }));
  projects().list({ limit: 4 }).then(rows => {
    recent.replaceChildren(...(rows.length ? rows.map(p => projectCard(ctx, p)) : [h('div', { class: 'ds-muted', text: 'لا توجد مشاريع بعد. ابدأ بأي أداة وسيظهر مشروعك هنا.' })]));
  }).catch(() => recent.replaceChildren(h('div', { class: 'ds-muted', text: 'تعذر تحميل المشاريع على هذا الجهاز.' })));

  return h('div', { class: 'ds-home' },
    h('div', { class: 'ds-hero' },
      h('h2', { class: 'ds-hero-title', text: 'استوديو التصميم' }),
      h('p', { class: 'ds-hero-sub', text: 'حوّل أفكارك وصورك وفيديوهاتك إلى محتوى احترافي من مكان واحد' }),
      h('div', { class: 'ds-quick' }, QUICK.filter(q => isEnabled(q.flag)).map(q => h('button', { type: 'button', class: 'ds-quick-btn', onClick: () => ctx.navigate(q.view, q.params || {}) }, h('span', { attrs: { 'aria-hidden': 'true' }, text: q.icon }), h('span', { text: q.label }))))),
    h('h3', { class: 'ds-section-title', text: 'ماذا تريد أن تنشئ؟' }),
    h('div', { class: 'ds-grid ds-grid-sections' }, SECTIONS.filter(s => !s.flag || isEnabled(s.flag)).map(s => h('button', { type: 'button', class: 'ds-card ds-section-card', onClick: () => ctx.navigate(s.view) },
      h('span', { class: 'ds-card-icon', attrs: { 'aria-hidden': 'true' }, text: s.icon }), h('b', { text: s.title }), h('small', { text: s.text })))),
    h('div', { class: 'ds-row-head' }, h('h3', { class: 'ds-section-title', text: 'المشاريع الأخيرة' }), h('button', { type: 'button', class: 'ds-link', onClick: () => ctx.navigate('projects'), text: 'عرض الكل' })),
    recent,
    isEnabled('DESIGN_VIDEO_ENABLED') ? h('div', { class: 'ds-row-head' }, h('h3', { class: 'ds-section-title', text: 'القوالب المقترحة' }), h('button', { type: 'button', class: 'ds-link', onClick: () => ctx.navigate('templates'), text: 'كل القوالب' })) : null,
    isEnabled('DESIGN_VIDEO_ENABLED') ? h('div', { class: 'ds-grid ds-grid-templates' }, TEMPLATES.slice(0, 4).map(t => templateCard(ctx, t))) : null);
}

export const TYPE_LABELS = { image: 'صورة', product: 'منتج', video: 'فيديو', short: 'Short', audio: 'صوت', translation: 'ترجمة', social: 'منشور' };
export const STATUS_LABELS = { draft: 'مسودة', processing: 'قيد المعالجة', completed: 'مكتمل', failed: 'فشل' };

export function projectCard(ctx, p, onOpen) {
  return h('button', { type: 'button', class: 'ds-card ds-project-card', onClick: () => (onOpen ? onOpen(p) : ctx.navigate('projects', { open: p.id })) },
    p.thumbnail ? h('img', { src: p.thumbnail, alt: '', class: 'ds-project-thumb', attrs: { loading: 'lazy' } }) : h('div', { class: 'ds-project-thumb ds-project-thumb-empty', attrs: { 'aria-hidden': 'true' }, text: '📄' }),
    h('b', { class: 'ds-project-title', text: p.title }),
    h('small', { text: `${TYPE_LABELS[p.type] || p.type} · ${STATUS_LABELS[p.status] || p.status} · ${formatDate(p.updated_at)}` }));
}

export function templateCard(ctx, t) {
  return h('button', { type: 'button', class: 'ds-card ds-template-card', onClick: () => ctx.navigate('video', { template: t.templateId }) },
    h('div', { class: 'ds-template-thumb', style: { background: t.thumbnail.color }, attrs: { 'aria-hidden': 'true' } }, h('span', { text: t.thumbnail.icon }), h('small', { text: t.aspectRatio })),
    h('b', { text: t.title }), h('small', { text: `${t.category} · ${t.duration} ث` }));
}