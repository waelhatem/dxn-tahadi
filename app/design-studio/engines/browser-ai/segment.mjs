/* إزالة الخلفية بالذكاء الاصطناعي داخل المتصفح (ORMBG). */
import { MODELS } from './models.mjs';
import { getSession, gpuInfo, makeTensor, tensorToFloat, inputType, canvasOf, throwIfAborted, downloadStage, metrics } from './runtime.mjs';

/* WebGPU مع دعم fp16 ← النسخة fp16 على كرت الشاشة. غير ذلك ← نسخة int8 على المعالج (أصغر وأسرع على WASM). */
async function pickModel() {
  const { gpu, f16 } = await gpuInfo();
  return gpu && f16 ? { model: MODELS.segmenterFp16, preferGpu: true } : { model: MODELS.segmenterInt8, preferGpu: false };
}

/* يعيد canvas بحجم الصورة: قناة alpha = احتمال أن البكسل جزء من العنصر الأساسي. */
export async function segmentMask(src, { progress = () => {}, signal, from = 5, to = 90 } = {}) {
  const { model, preferGpu } = await pickModel();
  const loadEnd = from + (to - from) * 0.6;
  const stage = downloadStage(model.label);
  const { ort, session, backend } = await getSession(model, { signal, preferGpu, onProgress: p => progress(from + (loadEnd - from) * p, stage(p)) });
  throwIfAborted(signal);
  progress(loadEnd, 'جاري تحليل الصورة وتحديد العنصر...');
  const N = model.size, small = canvasOf(N, N), sx = small.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(src, 0, 0, N, N);
  const px = sx.getImageData(0, 0, N, N).data, plane = N * N, input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { input[i] = px[i * 4] / 255; input[plane + i] = px[i * 4 + 1] / 255; input[2 * plane + i] = px[i * 4 + 2] / 255; }
  const t0 = performance.now();
  const result = await session.run({ [session.inputNames[0]]: makeTensor(ort, inputType(session), input, [1, 3, N, N]) });
  const inMs = Math.round(performance.now() - t0);
  const raw = tensorToFloat(result[session.outputNames[0]]);
  /* المخرج قد يكون احتمالات (0..1) أو قيمًا خامًا؛ نطبعه إلى 0..1 في الحالتين. */
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < plane; i++) { const v = raw[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const sigmoid = mn < -0.01 || mx > 1.01, range = sigmoid ? 1 : (mx - mn || 1);
  const maskSmall = sx.createImageData(N, N), m = maskSmall.data;
  for (let i = 0; i < plane; i++) {
    const v = sigmoid ? 1 / (1 + Math.exp(-raw[i])) : (raw[i] - mn) / range;
    m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = 255;
    m[i * 4 + 3] = Math.max(0, Math.min(255, v * 255));
  }
  sx.putImageData(maskSmall, 0, 0);
  const mask = canvasOf(src.width, src.height), mctx = mask.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, mask.width, mask.height);
  metrics.push({ type: 'run', model: model.id, backend, inMs, input: `${src.width}x${src.height}`, rawRange: [+mn.toFixed(3), +mx.toFixed(3)] });
  progress(to, 'تم تحديد العنصر...');
  return mask;
}

/* يقص العنصر ويعيد canvas بخلفية شفافة. */
export async function cutout(src, opts) {
  const mask = await segmentMask(src, opts);
  const out = canvasOf(src.width, src.height), x = out.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'source-over';
  return out;
}
