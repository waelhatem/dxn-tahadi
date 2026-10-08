/* تحسين الصورة محليًا: إزالة تشويش خفيفة ← مستويات وتباين ← تصحيح ألوان ← (اختياري) Real-ESRGAN ← حدة. */
import { canvasOf, yieldFrame, throwIfAborted } from './runtime.mjs';
import { upscaleCanvas } from './upscale.mjs';

/* تنعيم يحافظ على الحواف: يأخذ متوسط الجيران القريبين في الإضاءة فقط. */
export function denoise(data, w, h, threshold = 16) {
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4, l0 = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + (dy * w + dx) * 4, l = src[j] * 0.299 + src[j + 1] * 0.587 + src[j + 2] * 0.114;
        if (Math.abs(l - l0) <= threshold) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; }
      }
      data[i] = r / n; data[i + 1] = g / n; data[i + 2] = b / n;
    }
  }
  return data;
}

/* مستويات تلقائية: يمد نطاق الإضاءة بين 0.5% و 99.5% بحد أقصى للمد حتى لا تتشوه الصورة. */
export function autoLevels(data, clip = 0.005, maxStretch = 1.6) {
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 8) continue; hist[(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0]++; count++; }
  if (!count) return data;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < count * clip) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < count * clip) hi--;
  if (hi - lo < 16) return data;
  const scale = Math.min(maxStretch, 255 / (hi - lo)), offset = (lo + hi) / 2 - 127.5 / scale;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (data[i] - offset) * scale; data[i + 1] = (data[i + 1] - offset) * scale; data[i + 2] = (data[i + 2] - offset) * scale;
  }
  return data;
}

/* توازن أبيض جزئي (Gray world بنسبة 50%) + تشبع خفيف. */
export function colorCorrect(data, { strength = 0.5, saturation = 1.08 } = {}) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) { if (data[i + 3] < 8) continue; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  if (!n) return data;
  const avg = (r + g + b) / (3 * n);
  const gain = v => Math.min(1.15, Math.max(0.85, 1 + ((avg / (v / n || 1)) - 1) * strength));
  const gr = gain(r), gg = gain(g), gb = gain(b);
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i] * gr, G = data[i + 1] * gg, B = data[i + 2] * gb;
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    data[i] = l + (R - l) * saturation; data[i + 1] = l + (G - l) * saturation; data[i + 2] = l + (B - l) * saturation;
  }
  return data;
}

/* Unsharp mask بنصف قطر 1. */
export function sharpen(data, w, h, amount = 0.45) {
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        const blur = (src[k - 4] + src[k + 4] + src[k - w * 4] + src[k + w * 4] + 4 * src[k]) / 8;
        data[k] = src[k] + (src[k] - blur) * amount;
      }
    }
  }
  return data;
}

/* canvas → canvas. aiUpscale=true يضيف Real-ESRGAN ×2 (يزيل التشويش ويحسن التفاصيل أيضًا). */
export async function enhanceCanvas(src, { aiUpscale = true, progress = () => {}, signal } = {}) {
  const work = canvasOf(src.width, src.height), x = work.getContext('2d');
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, work.width, work.height);
  progress(8, 'جاري إزالة التشويش...');
  await yieldFrame();
  denoise(img.data, work.width, work.height);
  throwIfAborted(signal);
  progress(14, 'جاري ضبط الإضاءة والتباين...');
  await yieldFrame();
  autoLevels(img.data);
  progress(18, 'جاري تصحيح الألوان...');
  colorCorrect(img.data);
  if (!aiUpscale) sharpen(img.data, work.width, work.height, 0.45);
  x.putImageData(img, 0, 0);
  if (!aiUpscale) { progress(95, 'اكتمل التحسين...'); return work; }
  const up = await upscaleCanvas(work, { factor: 2, progress, signal, from: 22, to: 90 });
  progress(93, 'جاري ضبط الحدة...');
  await yieldFrame();
  const ux = up.getContext('2d'), uimg = ux.getImageData(0, 0, up.width, up.height);
  sharpen(uimg.data, up.width, up.height, 0.2);
  ux.putImageData(uimg, 0, 0);
  return up;
}
