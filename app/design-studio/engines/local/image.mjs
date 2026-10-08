/* محرك الصور المحلي: معالجة حقيقية داخل المتصفح عبر Canvas (تحسين، دقة، إضاءة، ألوان، خلفيات، مقاسات، تصميم المنتج).
   الأدوات التي تحتاج ذكاءً اصطناعيًا توليديًا (إزالة/إضافة عناصر، تحويل المنتج لصورة تسويقية) تُعلَن غير مدعومة محليًا. */
import { ASPECTS, IMAGE_MAX_SIDE, UPSCALE_MAX_SIDE } from '../../config.mjs';
import { loadImage } from '../../core/files.mjs';
import { steps } from '../../core/jobs.mjs';

export const LOCAL_IMAGE_TOOLS = new Set(['enhance', 'upscale', 'lighting', 'colors', 'removeBg', 'changeBg', 'cleanup', 'social', 'product']);

function canvasFor(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

function drawScaled(img, maxSide) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = canvasFor(w * s, h * s);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* تعديل البكسلات: brightness/contrast/saturation (1 = بلا تغيير)، gamma، warmth. */
export function adjustPixels(data, { brightness = 1, contrast = 1, saturation = 1, gamma = 1, warmth = 0 } = {}) {
  const inv = 1 / gamma;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    r *= brightness; g *= brightness; b *= brightness;
    r = (r - 128) * contrast + 128; g = (g - 128) * contrast + 128; b = (b - 128) * contrast + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * saturation; g = l + (g - l) * saturation; b = l + (b - l) * saturation;
    r += warmth; b -= warmth;
    if (gamma !== 1) { r = 255 * Math.pow(Math.max(0, r) / 255, inv); g = 255 * Math.pow(Math.max(0, g) / 255, inv); b = 255 * Math.pow(Math.max(0, b) / 255, inv); }
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return data;
}

function sharpen(ctx, w, h, amount = 0.35) {
  const src = ctx.getImageData(0, 0, w, h), out = ctx.createImageData(w, h);
  const s = src.data, o = out.data, k = [0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let v = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx));
        v += s[(yy * w + xx) * 4 + c] * k[n++];
      }
      o[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    o[i + 3] = s[i + 3];
  }
  ctx.putImageData(out, 0, 0);
}

function applyAdjust(canvas, opts) {
  const x = canvas.getContext('2d');
  const img = x.getImageData(0, 0, canvas.width, canvas.height);
  adjustPixels(img.data, opts);
  x.putImageData(img, 0, 0);
  return canvas;
}

/* إزالة خلفية سادة: لون الحواف المتوسط يصبح شفافًا مع حافة ناعمة. تعمل جيدًا مع الخلفيات الموحدة. */
export function keyOutBackground(canvas, tolerance = 42) {
  const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const img = x.getImageData(0, 0, w, h), d = img.data;
  let r = 0, g = 0, b = 0, n = 0;
  const sample = (px, py) => { const i = (py * w + px) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; };
  for (let px = 0; px < w; px += Math.max(1, Math.floor(w / 40))) { sample(px, 0); sample(px, h - 1); }
  for (let py = 0; py < h; py += Math.max(1, Math.floor(h / 40))) { sample(0, py); sample(w - 1, py); }
  r /= n; g /= n; b /= n;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.sqrt((d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2);
    if (dist < tolerance) d[i + 3] = 0;
    else if (dist < tolerance * 1.6) d[i + 3] = Math.round(255 * (dist - tolerance) / (tolerance * 0.6));
  }
  x.putImageData(img, 0, 0);
  return canvas;
}

/* خلفيات جاهزة ترسم على Canvas (بدون ملفات خارجية). */
export const BACKGROUNDS = Object.freeze({
  white: { label: 'خلفية بيضاء', paint: (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); } },
  studio: { label: 'استوديو احترافي', paint: (x, w, h) => { const g = x.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.5, Math.max(w, h)); g.addColorStop(0, '#fafafa'); g.addColorStop(1, '#c9ccd1'); x.fillStyle = g; x.fillRect(0, 0, w, h); } },
  luxury: { label: 'متجر فاخر', paint: (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1a1410'); g.addColorStop(0.55, '#3b2a17'); g.addColorStop(1, '#0d0b09'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(212,175,55,.18)'; x.fillRect(0, h * 0.78, w, h * 0.22); } },
  wood: { label: 'طاولة خشبية', paint: (x, w, h) => { x.fillStyle = '#efe6da'; x.fillRect(0, 0, w, h * 0.68); for (let i = 0; i < 26; i++) { x.fillStyle = i % 2 ? '#a0703f' : '#8b5e34'; x.fillRect(0, h * 0.68 + i * (h * 0.32 / 26), w, h * 0.32 / 26 + 1); } } },
  kitchen: { label: 'مطبخ', paint: (x, w, h) => { x.fillStyle = '#f3f1ec'; x.fillRect(0, 0, w, h); x.fillStyle = '#dcd6cb'; const s = Math.max(24, w / 12); for (let yy = 0; yy < h * 0.7; yy += s) for (let xx = (yy / s) % 2 ? 0 : s / 2; xx < w; xx += s) x.fillRect(xx, yy, s - 2, s - 2); x.fillStyle = '#e9e4da'; x.fillRect(0, h * 0.7, w, h * 0.3); } },
  office: { label: 'مكتب', paint: (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#dfe7ef'); g.addColorStop(0.7, '#b9c6d3'); g.addColorStop(0.7, '#6f7a85'); g.addColorStop(1, '#565f68'); x.fillStyle = g; x.fillRect(0, 0, w, h); } },
  nature: { label: 'طبيعة', paint: (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#cfeaf7'); g.addColorStop(0.62, '#e9f5e1'); g.addColorStop(0.62, '#7fb069'); g.addColorStop(1, '#4f7d3a'); x.fillStyle = g; x.fillRect(0, 0, w, h); } },
  lifestyle: { label: 'Lifestyle', paint: (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#fde2cf'); g.addColorStop(1, '#f6c6d0'); x.fillStyle = g; x.fillRect(0, 0, w, h); } },
  social: { label: 'إعلان Social Media', paint: (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0f513f'); g.addColorStop(1, '#1f8a6b'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(w * 0.85, h * 0.15, w * 0.35, 0, Math.PI * 2); x.fill(); } },
  minimal: { label: 'Minimal', paint: (x, w, h) => { x.fillStyle = '#f2f0eb'; x.fillRect(0, 0, w, h); } },
  cinematic: { label: 'Cinematic', paint: (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7); g.addColorStop(0, '#2b3a4a'); g.addColorStop(1, '#05080c'); x.fillStyle = g; x.fillRect(0, 0, w, h); } }
});

function sizeForAspect(aspect, longSide = 1350) {
  const [a, b] = ASPECTS[aspect] || ASPECTS['1:1'];
  return a >= b ? [longSide, Math.round(longSide * b / a)] : [Math.round(longSide * a / b), longSide];
}

/* يضع الصورة داخل مقاس جديد: الخلفية نسخة مموهة من الصورة نفسها، والصورة كاملة في الوسط. */
function fitToAspect(src, aspect, headline) {
  const [W, H] = sizeForAspect(aspect);
  const c = canvasFor(W, H), x = c.getContext('2d');
  const sw = src.width, sh = src.height;
  const cover = Math.max(W / sw, H / sh);
  x.filter = 'blur(24px) brightness(0.85)';
  x.drawImage(src, (W - sw * cover) / 2, (H - sh * cover) / 2, sw * cover, sh * cover);
  x.filter = 'none';
  const fit = Math.min(W / sw, H / sh) * 0.92;
  x.drawImage(src, (W - sw * fit) / 2, (H - sh * fit) / 2, sw * fit, sh * fit);
  if (headline) drawHeadline(x, W, H, headline);
  return c;
}

function drawHeadline(x, W, H, text) {
  const size = Math.round(Math.min(W, H) * 0.06);
  x.font = `800 ${size}px Tahoma, Arial, sans-serif`;
  x.textAlign = 'center';
  x.direction = 'rtl';
  const pad = size * 0.6, barH = size + pad * 2;
  x.fillStyle = 'rgba(15,81,63,.86)';
  x.fillRect(0, H - barH - H * 0.05, W, barH);
  x.fillStyle = '#ffffff';
  x.fillText(String(text).slice(0, 60), W / 2, H - H * 0.05 - pad - size * 0.15);
}

/* تصميم المنتج: المنتج كما هو (الحفاظ على الشكل والشعار والألوان) فوق خلفية جاهزة مع ظل ناعم. */
function composeProduct(product, { background = 'studio', aspect = '1:1', removeBackground = true, headline = '' }) {
  const [W, H] = sizeForAspect(aspect);
  const c = canvasFor(W, H), x = c.getContext('2d');
  (BACKGROUNDS[background] || BACKGROUNDS.studio).paint(x, W, H);
  const p = canvasFor(product.width, product.height);
  p.getContext('2d').drawImage(product, 0, 0);
  if (removeBackground) keyOutBackground(p);
  const scale = Math.min(W * 0.72 / p.width, H * 0.62 / p.height);
  const pw = p.width * scale, ph = p.height * scale, px = (W - pw) / 2, py = H * 0.74 - ph;
  x.save();
  x.fillStyle = 'rgba(0,0,0,.28)';
  x.filter = 'blur(14px)';
  x.beginPath();
  x.ellipse(W / 2, H * 0.75, pw * 0.42, ph * 0.06 + 6, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  x.drawImage(p, px, py, pw, ph);
  if (headline) drawHeadline(x, W, H, headline);
  return c;
}

/* tool: enhance|upscale|lighting|colors|removeBg|changeBg|cleanup|social|product */
export async function processImage({ tool, source, options = {} }, { progress, signal }) {
  if (!LOCAL_IMAGE_TOOLS.has(tool)) { const e = new Error('ENGINE_REQUIRED'); e.code = 'ENGINE_REQUIRED'; throw e; }
  await steps(progress, signal, [[15, 'جاري قراءة الصورة...'], [30, 'جاري التحليل...']]);
  const img = await loadImage(source);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  let c = drawScaled(img, tool === 'upscale' ? UPSCALE_MAX_SIDE : IMAGE_MAX_SIDE);
  await steps(progress, signal, [[50, 'جاري المعالجة...']]);
  switch (tool) {
    case 'enhance':
      applyAdjust(c, { brightness: 1.07, contrast: 1.16, saturation: 1.13, gamma: 1.04, warmth: 2 });
      sharpen(c.getContext('2d'), c.width, c.height, 0.42);
      break;
    case 'upscale': {
      const f = Math.min(2, UPSCALE_MAX_SIDE / Math.max(c.width, c.height));
      const up = canvasFor(c.width * f, c.height * f), ux = up.getContext('2d');
      ux.imageSmoothingEnabled = true; ux.imageSmoothingQuality = 'high'; ux.drawImage(c, 0, 0, up.width, up.height);
      sharpen(ux, up.width, up.height, 0.42);
      c = up; break;
    }
    case 'lighting': applyAdjust(c, { brightness: 1.12, contrast: 1.05, gamma: 1.12 }); break;
    case 'colors': applyAdjust(c, { saturation: 1.3, contrast: 1.06, warmth: 6 }); break;
    case 'cleanup': { const t = canvasFor(c.width, c.height), tx = t.getContext('2d'); tx.filter = 'blur(0.6px)'; tx.drawImage(c, 0, 0); c = t; applyAdjust(c, { contrast: 1.04 }); break; }
    case 'removeBg': keyOutBackground(c); break;
    case 'changeBg': {
      const fg = keyOutBackground(c);
      const out = canvasFor(fg.width, fg.height), ox = out.getContext('2d');
      (BACKGROUNDS[options.background] || BACKGROUNDS.studio).paint(ox, out.width, out.height);
      ox.drawImage(fg, 0, 0); c = out; break;
    }
    case 'social': c = fitToAspect(c, options.aspect || '1:1', options.headline); break;
    case 'product': c = composeProduct(c, options); break;
    default: break;
  }
  if (options.aspect && tool !== 'social' && tool !== 'product') c = fitToAspect(c, options.aspect, options.headline);
  await steps(progress, signal, [[80, 'جاري تجهيز النتيجة...']]);
  const type = tool === 'removeBg' ? 'image/png' : 'image/jpeg';
  const resultSrc = c.toDataURL(type, 0.92);
  progress(95, 'اكتمل تقريبًا...');
  return { resultSrc, width: c.width, height: c.height, sourceWidth, sourceHeight, mime: type, sample: false, provider: 'local' };
}