/* محرك الصور المجاني داخل المتصفح: تحسين، زيادة دقة، إزالة/تغيير الخلفية، تصميم المنتج، إزالة العناصر.
   يُحمَّل هذا الملف فقط عند ضغط إحدى هذه الأدوات. */
import { loadImage } from '../../core/files.mjs';
import { MESSAGES } from '../../config.mjs';
import { canvasOf } from './runtime.mjs';

export const BROWSER_AI_TOOLS = Object.freeze(['enhance', 'upscale', 'removeBg', 'changeBg', 'product', 'removeObject']);
const MAX_SOURCE_SIDE = 2048;

async function toCanvas(source, maxSide = MAX_SOURCE_SIDE) {
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

export async function process({ tool, source, options = {} }, { progress, signal }) {
  if (!BROWSER_AI_TOOLS.includes(tool)) throw new Error(MESSAGES.engineUnavailable);
  progress(3, 'جاري قراءة الصورة...');
  if (tool === 'upscale') {
    const factor = Number(options.factor) === 4 ? 4 : 2;
    /* الحد يضمن ألا يتجاوز الناتج 4096 بكسل. */
    const base = await toCanvas(source, Math.floor(4096 / factor));
    const { upscaleCanvas } = await import('./upscale.mjs');
    const out = await upscaleCanvas(base.canvas, { factor, progress, signal });
    return finish(out, base);
  }
  if (tool === 'enhance') {
    const aiUpscale = options.aiUpscale !== false;
    const base = await toCanvas(source);
    const { enhanceCanvas } = await import('./enhance.mjs');
    const out = await enhanceCanvas(base.canvas, { aiUpscale, progress, signal });
    return finish(out, base);
  }
  if (tool === 'removeObject') {
    if (!options.mask) throw new Error('ارسم على العنصر الذي تريد إزالته أولًا.');
    const base = await toCanvas(source);
    const maskImg = await loadImage(options.mask);
    const mask = canvasOf(base.canvas.width, base.canvas.height);
    mask.getContext('2d').drawImage(maskImg, 0, 0, mask.width, mask.height);
    const { inpaint } = await import('./inpaint.mjs');
    const out = await inpaint(base.canvas, mask, { progress, signal });
    return finish(out, base);
  }
  /* removeBg / changeBg / product: قناع بالذكاء الاصطناعي ثم التركيب المحلي الموجود. */
  const base = await toCanvas(source);
  const { cutout } = await import('./segment.mjs');
  const cut = await cutout(base.canvas, { progress, signal, to: 85 });
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
