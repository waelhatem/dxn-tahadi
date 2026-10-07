/* استوديو الفيديو: فيديو من صور، Reel/Short/Story، مقدمة وخاتمة، نصوص متحركة، وقوالب. */
import { h, button, toast, downloadBlob, formatTime } from '../core/dom.mjs';
import { jobs } from '../core/jobs.mjs';
import { videoEngine } from '../engines/index.mjs';
import { getProvider, VIDEO_PRESETS, MESSAGES } from '../config.mjs';
import { getTemplate, templateToPlan, TEMPLATE_FIELD_LABELS } from '../templates.mjs';
import { header, uploader, chips, field, textInput, jobPanel, saveProject, filesToDataUrls, sampleBadge, emptyState } from './components.mjs';

const vstate = { images: [], preset: 'ig-reel', intro: '', introSub: '', outro: 'تابعونا', captions: '', seconds: 2.5, motion: 'zoom', transition: 'fade', template: null, values: {}, jobId: null, result: null, projectId: null };

export function videoView(ctx, params = {}) {
  if (params.preset) vstate.preset = params.preset;
  if (params.template && (!vstate.template || vstate.template.templateId !== params.template)) { vstate.template = getTemplate(params.template); vstate.values = {}; vstate.result = null; vstate.jobId = null; }
  const tpl = vstate.template;
  const root = h('div', { class: 'ds-studio' }, header(ctx, tpl ? `🎬 قالب: ${tpl.title}` : '🎬 استوديو الفيديو', 'أضف الصور والنصوص ثم اضغط إنشاء الفيديو.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());

  function plan() {
    if (tpl) return templateToPlan(tpl, vstate.values, vstate.images);
    const preset = VIDEO_PRESETS.find(p => p.id === vstate.preset) || VIDEO_PRESETS[0];
    return { aspect: preset.aspect, images: vstate.images, secondsPerImage: vstate.seconds, intro: { title: vstate.intro, subtitle: vstate.introSub }, outro: { title: vstate.outro, subtitle: '' }, captions: vstate.captions.split('\n').map(s => s.trim()).filter(Boolean), motion: vstate.motion, transition: vstate.transition };
  }
  async function create() {
    if (!vstate.images.length) { toast(MESSAGES.needFile); return; }
    if (!(await videoEngine.canRender())) { toast(MESSAGES.browserUnsupported); return; }
    const p = plan();
    vstate.result = null;
    vstate.jobId = jobs.submit({ type: 'video', provider: getProvider('video'), input: { aspect: p.aspect, images: p.images.length }, run: c => videoEngine.render(p, c) });
    render();
  }
  function body() {
    const thumbs = h('div', { class: 'ds-thumbs' }, vstate.images.map((src, i) => h('div', { class: 'ds-thumb' }, h('img', { src, alt: `صورة ${i + 1}` }),
      h('button', { type: 'button', class: 'ds-thumb-x', attrs: { 'aria-label': `حذف الصورة ${i + 1}` }, text: '✕', onClick: () => { vstate.images.splice(i, 1); render(); } }))));
    const settings = tpl
      ? tpl.editableFields.filter(f => f !== 'images').map(f => field(TEMPLATE_FIELD_LABELS[f] || f, textInput(vstate.values[f] || '', v => { vstate.values[f] = v; }, { multiline: f === 'points' || f === 'benefits', maxLength: 300 })))
      : [
        field('المنصة والمقاس', chips(VIDEO_PRESETS.map(p => ({ value: p.id, label: `${p.label} (${p.aspect})` })), vstate.preset, v => { vstate.preset = v; })),
        field('المقدمة (Intro)', textInput(vstate.intro, v => { vstate.intro = v; }, { placeholder: 'عنوان البداية', maxLength: 40 })),
        field('عنوان فرعي للمقدمة', textInput(vstate.introSub, v => { vstate.introSub = v; }, { placeholder: 'اختياري', maxLength: 60 })),
        field('الخاتمة (Outro)', textInput(vstate.outro, v => { vstate.outro = v; }, { placeholder: 'مثال: تابعونا', maxLength: 40 })),
        field('نصوص على الصور (Captions)', textInput(vstate.captions, v => { vstate.captions = v; }, { placeholder: 'سطر لكل صورة', multiline: true, maxLength: 800 })),
        field('الحركة', chips([{ value: 'zoom', label: 'تكبير هادئ' }, { value: 'pan', label: 'تحريك' }, { value: 'none', label: 'ثابت' }], vstate.motion, v => { vstate.motion = v; })),
        field('الانتقال', chips([{ value: 'fade', label: 'تلاشي' }, { value: 'cut', label: 'قطع مباشر' }], vstate.transition, v => { vstate.transition = v; })),
        field('مدة كل صورة', chips([1.5, 2.5, 3.5, 5].map(s => ({ value: s, label: s + ' ث' })), vstate.seconds, v => { vstate.seconds = v; }))
      ];
    const timeline = h('small', { class: 'ds-hint', text: 'المدة المتوقعة: ...' });
    videoEngine.preview(plan()).then(t => { timeline.textContent = `المدة المتوقعة: ${formatTime(t.duration)} — ${t.items.length} مشهد`; });
    return [h('div', { class: 'ds-split' },
      h('div', { class: 'ds-preview' },
        vstate.result ? h('video', { src: vstate.result.url, controls: true, playsInline: true, class: 'ds-preview-video' }) : (vstate.images.length ? thumbs : emptyState('🎞️', 'أضف صورًا لإنشاء الفيديو.')),
        sampleBadge(vstate.result)),
      h('div', { class: 'ds-panel' },
        uploader({ kind: 'image', multiple: true, label: 'أضف صورًا للفيديو', onFiles: async fs => { vstate.images.push(...await filesToDataUrls(fs)); vstate.images = vstate.images.slice(0, 12); render(); } }),
        ...settings, timeline,
        h('div', { class: 'ds-actions' }, button('إنشاء الفيديو', create, { variant: 'primary', icon: '🎬' }), vstate.template ? button('بدون قالب', () => { vstate.template = null; ctx.navigate('video'); }, { variant: 'ghost', icon: '🧩' }) : null),
        h('small', { class: 'ds-hint', text: 'الموسيقى والتعليق الصوتي وتحريك الشعار تتوفر عند تفعيل محرك الفيديو المتقدم.' }),
        vstate.jobId ? jobPanel(vstate.jobId, { onResult: res => { vstate.result = res; render(); } }) : null,
        vstate.result ? h('div', { class: 'ds-actions ds-result-actions' },
          button('حفظ', async () => { const rec = await saveProject({ id: vstate.projectId, title: (tpl ? tpl.title : 'فيديو') + ' — ' + new Date().toLocaleDateString('ar-IQ'), type: plan().aspect === '9:16' ? 'short' : 'video', thumbnailSource: vstate.images[0], settings: { plan: { ...plan(), images: vstate.images.length } }, assets: [{ kind: 'export', blob: vstate.result.blob, mime: vstate.result.mime }] }); vstate.projectId = rec.id; }, { variant: 'primary', icon: '💾' }),
          button('تنزيل', () => downloadBlob(vstate.result.blob, `video-${Date.now()}.${vstate.result.mime.includes('mp4') ? 'mp4' : 'webm'}`), { icon: '⬇️' }),
          button('فيديو جديد', () => { vstate.images = []; vstate.result = null; vstate.jobId = null; vstate.projectId = null; render(); }, { variant: 'ghost', icon: '🔄' })) : null))];
  }
  render();
  root.appendChild(work);
  return root;
}