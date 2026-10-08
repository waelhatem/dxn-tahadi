/* إزالة العناصر (تجريبي): MI-GAN داخل المتصفح. المستخدم يرسم على العنصر، والنموذج يملأ المكان. */
import { MODELS } from './models.mjs';
import { getSession, canvasOf, throwIfAborted, downloadStage, metrics } from './runtime.mjs';

/* src: canvas، mask: canvas بنفس الحجم (البكسلات المرسومة = المطلوب حذفها). */
export async function inpaint(src, mask, { progress = () => {}, signal, from = 5, to = 92 } = {}) {
  const loadEnd = from + (to - from) * 0.7;
  const stage = downloadStage(MODELS.inpainter.label);
  /* MI-GAN يعمل بثبات على WASM؛ WebGPU لهذا النموذج ما زال تجريبيًا. */
  const { ort, session, backend } = await getSession(MODELS.inpainter, { signal, preferGpu: false, onProgress: p => progress(from + (loadEnd - from) * p, stage(p)) });
  throwIfAborted(signal);
  progress(loadEnd, 'جاري إزالة العنصر...');
  const W = src.width, H = src.height, plane = W * H;
  const px = src.getContext('2d').getImageData(0, 0, W, H).data;
  const mk = mask.getContext('2d').getImageData(0, 0, W, H).data;
  const image = new Uint8Array(3 * plane), known = new Uint8Array(plane);
  let painted = 0;
  for (let i = 0; i < plane; i++) {
    image[i] = px[i * 4]; image[plane + i] = px[i * 4 + 1]; image[2 * plane + i] = px[i * 4 + 2];
    /* اصطلاح MI-GAN: 255 = بكسل معروف يُحتفظ به، 0 = منطقة تُملأ. */
    const hole = mk[i * 4 + 3] > 24;
    known[i] = hole ? 0 : 255;
    if (hole) painted++;
  }
  if (!painted) throw new Error('ارسم على العنصر الذي تريد إزالته أولًا.');
  const [imgName, maskName] = session.inputNames;
  const t0 = performance.now();
  const result = await session.run({
    [imgName]: new ort.Tensor('uint8', image, [1, 3, H, W]),
    [maskName]: new ort.Tensor('uint8', known, [1, 1, H, W])
  });
  const inMs = Math.round(performance.now() - t0);
  const o = result[session.outputNames[0]].data;
  const out = canvasOf(W, H), x = out.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  for (let i = 0; i < plane; i++) { d[i * 4] = o[i]; d[i * 4 + 1] = o[plane + i]; d[i * 4 + 2] = o[2 * plane + i]; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  metrics.push({ type: 'run', model: MODELS.inpainter.id, backend, inMs, input: `${W}x${H}`, maskPixels: painted });
  progress(to, 'تمت الإزالة...');
  return out;
}
