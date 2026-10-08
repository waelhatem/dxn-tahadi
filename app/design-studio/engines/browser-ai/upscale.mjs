/* زيادة الدقة بالذكاء الاصطناعي: Real-ESRGAN (×4) على مربعات صغيرة مع تداخل، ثم ×2 أو ×4. */
import { MODELS } from './models.mjs';
import { getSession, makeTensor, tensorToFloat, inputType, inputShape, canvasOf, throwIfAborted, yieldFrame, downloadStage, metrics } from './runtime.mjs';

export const MAX_OUTPUT_SIDE = 4096;
const DEFAULT_TILE = 192;
const PAD = 12;

function tileSize(session) {
  if (MODELS.upscaler.tile) return MODELS.upscaler.tile;
  const shape = inputShape(session);
  const h = shape && Number(shape[2]), w = shape && Number(shape[3]);
  return h > 0 && w > 0 ? [h, w] : [DEFAULT_TILE, DEFAULT_TILE];
}

/* لا يتجاوز الناتج 4096 بكسل. */
function fitSource(src, factor) {
  const s = Math.min(1, MAX_OUTPUT_SIDE / (Math.max(src.width, src.height) * factor));
  if (s >= 1) return src;
  const c = canvasOf(src.width * s, src.height * s), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function hasAlpha(data) { for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true; return false; }

/* source: canvas. يعيد canvas بحجم source × factor. */
export async function upscaleCanvas(source, { factor = 2, progress = () => {}, signal, from = 5, to = 95 } = {}) {
  const loadEnd = from + (to - from) * 0.3;
  const stage = downloadStage(MODELS.upscaler.label);
  const { ort, session, backend } = await getSession(MODELS.upscaler, { signal, onProgress: p => progress(from + (loadEnd - from) * p, stage(p)) });
  const src = fitSource(source, factor);
  const W = src.width, H = src.height, S = MODELS.upscaler.scale;
  const [TH, TW] = tileSize(session);
  const stepY = Math.max(1, TH - 2 * PAD), stepX = Math.max(1, TW - 2 * PAD);
  const pixels = src.getContext('2d').getImageData(0, 0, W, H).data;
  const alpha = hasAlpha(pixels);
  const out = canvasOf(W * factor, H * factor), ox = out.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  const tileCanvas = canvasOf(TW * S, TH * S), tx = tileCanvas.getContext('2d');
  const tileImage = tx.createImageData(TW * S, TH * S);
  const plane = TH * TW, input = new Float32Array(3 * plane);
  const type = inputType(session), inName = session.inputNames[0], outName = session.outputNames[0];
  const rows = Math.ceil(H / stepY), cols = Math.ceil(W / stepX), total = rows * cols;
  const t0 = performance.now();
  let done = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      throwIfAborted(signal);
      const cy = r * stepY, cx = c * stepX;
      const ch = Math.min(stepY, H - cy), cw = Math.min(stepX, W - cx);
      /* نافذة الإدخال حول الجزء الأساسي، تُزاح عند الأطراف وتُكرر البكسلات الحدية إذا كانت الصورة أصغر من المربع. */
      const iy = Math.max(0, Math.min(cy - PAD, H - TH)), ix = Math.max(0, Math.min(cx - PAD, W - TW));
      for (let y = 0; y < TH; y++) {
        const sy = Math.min(H - 1, iy + y);
        for (let x = 0; x < TW; x++) {
          const sx = Math.min(W - 1, ix + x), si = (sy * W + sx) * 4, di = y * TW + x;
          input[di] = pixels[si] / 255;
          input[plane + di] = pixels[si + 1] / 255;
          input[2 * plane + di] = pixels[si + 2] / 255;
        }
      }
      const result = await session.run({ [inName]: makeTensor(ort, type, input, [1, 3, TH, TW]) });
      const o = tensorToFloat(result[outName]), op = TH * S * TW * S, d = tileImage.data;
      for (let i = 0; i < op; i++) {
        const k = i * 4;
        d[k] = Math.max(0, Math.min(255, o[i] * 255 + 0.5));
        d[k + 1] = Math.max(0, Math.min(255, o[op + i] * 255 + 0.5));
        d[k + 2] = Math.max(0, Math.min(255, o[2 * op + i] * 255 + 0.5));
        d[k + 3] = 255;
      }
      tx.putImageData(tileImage, 0, 0);
      ox.drawImage(tileCanvas, (cx - ix) * S, (cy - iy) * S, cw * S, ch * S, cx * factor, cy * factor, cw * factor, ch * factor);
      done++;
      progress(loadEnd + (to - loadEnd) * done / total, `جاري زيادة الدقة بالذكاء الاصطناعي... ${done}/${total}`);
      if (done % 4 === 0) await yieldFrame();
    }
  }
  if (alpha) { ox.globalCompositeOperation = 'destination-in'; ox.drawImage(src, 0, 0, out.width, out.height); ox.globalCompositeOperation = 'source-over'; }
  metrics.push({ type: 'run', model: MODELS.upscaler.id, backend, tiles: total, inMs: Math.round(performance.now() - t0), input: `${W}x${H}`, output: `${out.width}x${out.height}` });
  return out;
}
