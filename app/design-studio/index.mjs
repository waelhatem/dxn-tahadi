/* نقطة الدخول: تُحمَّل فقط عند فتح تبويب «استوديو التصميم» (dynamic import من app/index.html).
   Controller بسيط: يحتفظ بالحالة بين إعادة رسم الصفحة ويعرض القسم المطلوب. */
import { h, clear } from './core/dom.mjs';
import { applyServerConfig, isEnabled } from './config.mjs';
import { initProjects } from './core/projects.mjs';
import { studioApi } from './core/api.mjs';

const VIEWS = {
  home: () => import('./views/home.mjs').then(m => m.homeView),
  image: () => import('./views/image.mjs').then(m => m.imageView),
  product: () => import('./views/image.mjs').then(m => m.productView),
  video: () => import('./views/video.mjs').then(m => m.videoView),
  audio: () => import('./views/audio.mjs').then(m => m.audioView),
  content: () => import('./views/content.mjs').then(m => m.contentView),
  publish: () => import('./views/content.mjs').then(m => m.publishView),
  shorts: () => import('./views/shorts.mjs').then(m => m.shortsView),
  projects: () => import('./views/projects.mjs').then(m => m.projectsView),
  templates: () => import('./views/projects.mjs').then(m => m.templatesView)
};
const VIEW_FLAGS = { image: 'DESIGN_IMAGE_ENABLED', product: 'DESIGN_IMAGE_ENABLED', video: 'DESIGN_VIDEO_ENABLED', templates: 'DESIGN_VIDEO_ENABLED', audio: 'DESIGN_AUDIO_ENABLED', shorts: 'DESIGN_SHORTS_ENABLED', content: 'DESIGN_CONTENT_ENABLED', publish: 'DESIGN_PUBLISHING_ENABLED' };

const route = { view: 'home', params: {} };
let host = null, context = null, configLoaded = false, renderSeq = 0;

function navigate(view, params = {}) {
  document.querySelectorAll('.ds-sheet-wrap').forEach(s => s.remove());
  route.view = VIEWS[view] ? view : 'home';
  route.params = params || {};
  renderView();
  try { host && host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) { /* لا شيء */ }
}

async function renderView() {
  if (!host) return;
  const seq = ++renderSeq;
  const flag = VIEW_FLAGS[route.view];
  if (flag && !isEnabled(flag)) { route.view = 'home'; route.params = {}; }
  try {
    const view = await VIEWS[route.view]();
    if (seq !== renderSeq || !host.isConnected) return;
    clear(host).appendChild(view({ ...context, navigate }, route.params));
  } catch (err) {
    console.error('Design Studio view', err);
    if (seq === renderSeq) clear(host).appendChild(h('div', { class: 'ds-error', attrs: { role: 'alert' }, text: 'تعذر فتح هذا القسم. حدّث الصفحة وحاول مرة أخرى.' }));
  }
}

/* يُستدعى بعد كل render() للصفحة عندما يكون التبويب مفتوحًا. ctx: {me, role} */
export async function mount(target, ctx = {}) {
  host = target;
  context = { me: ctx.me || null, role: ctx.role || '' };
  initProjects(context);
  if (!isEnabled('DESIGN_STUDIO_ENABLED')) { clear(host).appendChild(h('div', { class: 'ds-empty', text: 'استوديو التصميم غير متاح حاليًا.' })); return; }
  if (!configLoaded) {
    configLoaded = true;
    studioApi('config').then(cfg => { applyServerConfig(cfg); renderView(); }).catch(() => { /* الإعدادات الافتراضية تكفي */ });
  }
  renderView();
}

export { navigate };