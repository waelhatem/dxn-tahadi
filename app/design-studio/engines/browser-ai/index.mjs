/* محرك الصور المجاني داخل المتصفح: تحسين، زيادة دقة، إزالة/تغيير الخلفية، تصميم المنتج، إزالة العناصر.
   يُحمَّل هذا الملف فقط عند ضغط إحدى هذه الأدوات. */
import { loadImage } from '../../core/files.mjs';
import { MESSAGES } from '../../config.mjs';
import { canvasOf, resetRunInfo, takeRunInfo, isLowEndDevice } from './runtime.mjs';

export const BROWSER_AI_TOOLS = Object.freeze(['enhance', 'upscale', 'removeBg', 'changeBg', 'product', 'removeObject']);
/* الحد الأقصى لأطول ضلع للصورة المُعالَجة، ويقل على الأجهزة المحدودة حتى لا تنفد الذاكرة. */
const MAX_SOURCE_SIDE = 2048, LOW_END_SOURCE_SIDE = 1280, MAX_OUTPUT_SIDE = 4096, LOW_END_OUTPUT_SIDE = 2048;

async function toCanvas(source, maxSide) {
  const img = await loadImage(source);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = canvasOf(w * s, h * s), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, sourceWidth: w, sourceHeight: h };
}

function finish(canvas, { sourceWidth, sourceHeight }, type = 'image/jpeg') {
  const resultSrc = canvas.toDataURL(type, 0.93);
  return { resultSrc, mime: type, sample: false, provider: 'browser-ai', sourceWidth, sourceHeight, width: canvas.width, height: canvas.height };
}

/* رسالة مفهومة بدل انهيار الصفحة عند نفاد الذاكرة أو فشل كرت الشاشة. */
function friendly(err) {
  const text = String((err && err.message) || err || '');
  if ((err && err.code === 'MEMORY') || /memory|alloc|RangeError|Invalid array length|out of range/i.test(text)) {
    return Object.assign(new Error('ذاكرة الجهاز لا تكفي لهذه الصورة. جرّب صورة أصغر أو أغلق التبويبات الأخرى ثم أعد المحاولة.'), { code: 'MEMORY' });
  }
  return err instanceof Error ? err : new Error(MESSAGES.processingFailed);
}

async function run(tool, source, options, progress, signal, lowEnd) {
  const maxSide = lowEnd ? LOW_END_SOURCE_SIDE : MAX_SOURCE_SIDE;
  if (tool === 'upscale') {
    const factor = Number(options.factor) === 4 && !lowEnd ? 4 : 2;
    /* الحد يضمن ألا يتجاوز الناتج 4096 بكسل (2048 على الأجهزة المحدودة). */
    const base = await toCanvas(source, Math.floor((lowEnd ? LOW_END_OUTPUT_SIDE : MAX_OUTPUT_SIDE) / factor));
    const { upscaleCanvas } = await import('./upscale.mjs');
    return finish(await upscaleCanvas(base.canvas, { factor, progress, signal }), base);
  }
  if (tool === 'enhance') {
    const aiUpscale = options.aiUpscale !== false;
    const base = await toCanvas(source, aiUpscale ? Math.floor((lowEnd ? LOW_END_OUTPUT_SIDE : MAX_OUTPUT_SIDE) / 2) : maxSide);
    const { enhanceCanvas } = await import('./enhance.mjs');
    return finish(await enhanceCanvas(base.canvas, { aiUpscale, progress, signal }), base);
  }
  if (tool === 'removeObject') {
    if (!options.mask) throw new Error('ارسم على العنصر الذي تريد إزالته أولًا.');
    const base = await toCanvas(source, maxSide);
    const maskImg = await loadImage(options.mask);
    const mask = canvasOf(base.canvas.width, base.canvas.height);
    mask.getContext('2d').drawImage(maskImg, 0, 0, mask.width, mask.height);
    const { inpaint } = await import('./inpaint.mjs');
    return finish(await inpaint(base.canvas, mask, { progress, signal }), base);
  }
  /* removeBg / changeBg / product: قناع بالذكاء الاصطناعي ثم التركيب المحلي الموجود. تصميم المنتج دائمًا "عنصر". */
  const subject = tool === 'product' ? 'object' : (options.subject === 'object' ? 'object' : 'person');
  const base = await toCanvas(source, maxSide);
  const { cutout } = await import('./segment.mjs');
  const cut = await cutout(base.canvas, { subject, progress, signal, to: 85 });
  if (tool === 'removeBg') { progress(94, 'جاري تجهيز الصورة الشفافة...'); return finish(cut, base, 'image/png'); }
  const local = await import('../local/image.mjs');
  progress(90, 'جاري تركيب الخلفية...');
  if (tool === 'changeBg') {
    const out = canvasOf(cut.width, cut.height), x = out.getContext('2d');
    (local.BACKGROUNDS[options.background] || local.BACKGROUNDS.studio).paint(x, out.width, out.height);
    x.drawImage(cut, 0, 0);
    return finish(out, base);
  }
  const composed = await local.processImage({ tool: 'product', source: cut.toDataURL('image/png'), options: { ...options, removeBackground: false } }, { progress: () => {}, signal });
  return { ...composed, provider: 'browser-ai', sourceWidth: base.sourceWidth, sourceHeight: base.sourceHeight };
}

export async function process({ tool, source, options = {} }, { progress, signal }) {
  if (!BROWSER_AI_TOOLS.includes(tool)) throw new Error(MESSAGES.engineUnavailable);
  resetRunInfo();
  const lowEnd = await isLowEndDevice();
  progress(3, lowEnd ? 'جهازك محدود الموارد؛ سنعالج الصورة بحجم أصغر وقد تستغرق وقتًا أطول...' : 'جاري قراءة الصورة...');
  const t0 = performance.now();
  try {
    const result = await run(tool, source, options, progress, signal, lowEnd);
    const info = takeRunInfo() || {};
    return { ...result, ai: { ...info, totalMs: Math.round(performance.now() - t0), lowEnd } };
  } catch (err) {
    takeRunInfo();
    throw friendly(err);
  }
}
