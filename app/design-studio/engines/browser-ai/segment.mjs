/* إزالة الخلفية بالذكاء الاصطناعي داخل المتصفح.
   subject='person' ← MODNet (للأشخاص، صغير وسريع). subject='object' ← ORMBG (للمنتجات وأي عنصر). كلاهما Apache-2.0. */
import { MODELS } from './models.mjs';
import { getSession, gpuInfo, makeTensor, tensorToFloat, inputType, canvasOf, throwIfAborted, downloadStage, modeLabel, metrics } from './runtime.mjs';

/* WebGPU مع دعم fp16 ← نسخة fp16 على كرت الشاشة. غير ذلك ← نسخة int8 على المعالج (أصغر وأسرع على WASM). */
async function pickModel(subject) {
  const { gpu, f16 } = await gpuInfo();
  const fast = gpu && f16;
  /* MODNet على WASM دائمًا (نتيجته على WebGPU غير صحيحة). */
  if (subject === 'person') return { model: MODELS.portraitInt8, preferGpu: false };
  return fast ? { model: MODELS.segmenterFp16, preferGpu: true } : { model: MODELS.segmenterInt8, preferGpu: false };
}

/* أبعاد إدخال النموذج: ORMBG مربع 1024. MODNet أقصر ضلع 512 والأبعاد من مضاعفات 32. */
function inputSize(subject, w, h) {
  if (subject !== 'person') return [MODELS.segmenterInt8.size, MODELS.segmenterInt8.size];
  const s = 512 / Math.min(w, h);
  const round32 = v => Math.max(32, Math.round(v * s / 32) * 32);
  return [round32(w), round32(h)];
}

/* يعيد canvas بحجم الصورة: قناة alpha = احتمال أن البكسل جزء من العنصر الأساسي. */
export async function segmentMask(src, { subject = 'object', progress = () => {}, signal, from = 5, to = 90 } = {}) {
  const { model, preferGpu } = await pickModel(subject);
  const loadEnd = from + (to - from) * 0.6;
  const stage = downloadStage(model);
  const { ort, session, backend } = await getSession(model, { signal, preferGpu, onProgress: p => progress(from + (loadEnd - from) * p, stage(p)) });
  throwIfAborted(signal);
  progress(loadEnd, `جاري تحديد ${subject === 'person' ? 'الشخص' : 'العنصر'} (${modeLabel(backend)})...`);
  const [NW, NH] = inputSize(subject, src.width, src.height);
  const small = canvasOf(NW, NH), sx = small.getContext('2d');
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(src, 0, 0, NW, NH);
  const px = sx.getImageData(0, 0, NW, NH).data, plane = NW * NH, input = new Float32Array(3 * plane);
  /* ORMBG: 0..1. MODNet: (x/255 - 0.5) / 0.5 = -1..1. */
  const norm = subject === 'person' ? v => v / 127.5 - 1 : v => v / 255;
  for (let i = 0; i < plane; i++) { input[i] = norm(px[i * 4]); input[plane + i] = norm(px[i * 4 + 1]); input[2 * plane + i] = norm(px[i * 4 + 2]); }
  const t0 = performance.now();
  const result = await session.run({ [session.inputNames[0]]: makeTensor(ort, inputType(session), input, [1, 3, NH, NW]) });
  const inMs = Math.round(performance.now() - t0);
  const raw = tensorToFloat(result[session.outputNames[0]]);
  /* المخرج قد يكون احتمالات (0..1) أو قيمًا خامًا؛ نطبعه إلى 0..1 في الحالتين. */
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < plane; i++) { const v = raw[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const sigmoid = mn < -0.01 || mx > 1.01, range = sigmoid ? 1 : (mx - mn || 1);
  const maskSmall = sx.createImageData(NW, NH), m = maskSmall.data;
  for (let i = 0; i < plane; i++) {
    const v = sigmoid ? 1 / (1 + Math.exp(-raw[i])) : (raw[i] - mn) / range;
    m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = 255;
    m[i * 4 + 3] = Math.max(0, Math.min(255, v * 255));
  }
  sx.putImageData(maskSmall, 0, 0);
  const mask = canvasOf(src.width, src.height), mctx = mask.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, mask.width, mask.height);
  metrics.push({ type: 'run', model: model.id, backend, inMs, input: `${src.width}x${src.height}`, modelInput: `${NW}x${NH}`, rawRange: [+mn.toFixed(3), +mx.toFixed(3)] });
  progress(to, 'تم الفصل...');
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
