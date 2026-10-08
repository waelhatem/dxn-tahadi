/* تشغيل نماذج ONNX داخل المتصفح: WebGPU عند توفره، وإلا WebAssembly.
   لا يُحمَّل أي شيء هنا عند فتح الموقع؛ أول تحميل يحدث عند ضغط أداة تحتاج نموذجًا. */
import { MESSAGES } from '../../config.mjs';

const ORT_VERSION = '1.30.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
/* لا يبدأ الاسم بـ dxn- لأن sw.js يحذف كل كاشات dxn-*. */
const CACHE_NAME = 'design-studio-models-v1';

let gpuPromise = null;
let ortPromise = null;
const sessions = new Map();
/* قياسات آخر العمليات (تُعرض في التقرير وأدوات المطور فقط). */
export const metrics = [];

export function browserAiSupported() {
  return typeof WebAssembly === 'object' && typeof fetch === 'function' && !!(globalThis.crypto && crypto.subtle);
}

export function gpuInfo() {
  if (!gpuPromise) gpuPromise = (async () => {
    try {
      if (!navigator.gpu) return { gpu: false, f16: false };
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { gpu: false, f16: false };
      return { gpu: true, f16: adapter.features.has('shader-f16') };
    } catch (_) { return { gpu: false, f16: false }; }
  })();
  return gpuPromise;
}

export function loadOrt() {
  if (!ortPromise) ortPromise = (async () => {
    const { gpu } = await gpuInfo();
    const ort = await import(ORT_BASE + (gpu ? 'ort.webgpu.min.mjs' : 'ort.min.mjs'));
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    ort.env.logLevel = 'error';
    return { ort, gpu };
  })().catch(err => { ortPromise = null; throw new Error('تعذر تحميل محرك الذكاء الاصطناعي في المتصفح. تحقق من الاتصال ثم أعد المحاولة.', { cause: err }); });
  return ortPromise;
}

function hex(buffer) { return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function openCache() {
  try { return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null; } catch (_) { return null; }
}

/* ينزّل النموذج مرة واحدة مع تقدم، يتحقق من الحجم والبصمة، ثم يحفظه في كاش المتصفح. */
export async function fetchModel(model, { onProgress, signal } = {}) {
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(model.url);
      if (hit) {
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (bytes.byteLength === model.bytes) { if (onProgress) onProgress(1); return { bytes, cached: true }; }
        await cache.delete(model.url);
      }
    } catch (_) { /* نكمل بالتنزيل */ }
  }
  let res;
  try { res = await fetch(model.url, { signal, mode: 'cors' }); }
  catch (err) {
    if (signal && signal.aborted) throw new Error(MESSAGES.cancelled);
    throw new Error(`تعذر تنزيل ${model.label}. تحقق من الاتصال ثم أعد المحاولة.`);
  }
  if (!res.ok) throw new Error(`تعذر تنزيل ${model.label} (${res.status}).`);
  const total = model.bytes;
  let bytes;
  if (res.body && res.body.getReader) {
    bytes = new Uint8Array(total);
    const reader = res.body.getReader();
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (loaded + value.length > total) throw new Error(`حجم ${model.label} غير متوقع.`);
      bytes.set(value, loaded);
      loaded += value.length;
      if (onProgress) onProgress(loaded / total);
    }
    if (loaded !== total) throw new Error(`لم يكتمل تنزيل ${model.label}. أعد المحاولة.`);
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength !== total) throw new Error(`حجم ${model.label} غير متوقع.`);
  }
  const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (digest !== model.sha256) throw new Error(`فشل التحقق من سلامة ${model.label}.`);
  if (cache) { try { await cache.put(model.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) { /* الكاش اختياري */ } }
  return { bytes, cached: false };
}

/* جلسة واحدة لكل نموذج طوال بقاء الصفحة مفتوحة. */
export function getSession(model, { onProgress, signal, preferGpu = true } = {}) {
  const key = `${model.id}:${preferGpu ? 'gpu' : 'cpu'}`;
  if (sessions.has(key)) return sessions.get(key);
  const pending = (async () => {
    const { ort, gpu } = await loadOrt();
    const t0 = performance.now();
    /* بعض النماذج أوزانها في ملف خارجي؛ التقدم يُوزّع على الملفين حسب الحجم. */
    const ext = model.externalData;
    const totalBytes = model.bytes + (ext ? ext.bytes : 0);
    const part = (offset, size) => p => { if (onProgress) onProgress((offset + size * p) / totalBytes); };
    const graph = await fetchModel(model, { onProgress: part(0, model.bytes), signal });
    const weights = ext ? await fetchModel({ ...ext, label: model.label }, { onProgress: part(model.bytes, ext.bytes), signal }) : null;
    const cached = graph.cached && (!weights || weights.cached);
    const t1 = performance.now();
    const wantGpu = gpu && preferGpu;
    const options = eps => ({ executionProviders: eps, graphOptimizationLevel: 'all', ...(weights ? { externalData: [{ path: ext.path, data: weights.bytes }] } : {}) });
    let session, backend = wantGpu ? 'webgpu' : 'wasm';
    try {
      session = await ort.InferenceSession.create(graph.bytes, options(wantGpu ? ['webgpu', 'wasm'] : ['wasm']));
    } catch (err) {
      if (!wantGpu) throw err;
      session = await ort.InferenceSession.create(graph.bytes, options(['wasm']));
      backend = 'wasm';
    }
    const info = { model: model.id, cached, backend, downloadMs: Math.round(t1 - t0), initMs: Math.round(performance.now() - t1) };
    metrics.push({ type: 'load', ...info });
    return { ort, session, ...info };
  })();
  sessions.set(key, pending);
  pending.catch(() => sessions.delete(key));
  return pending;
}

/* تحويلات fp16 للنماذج التي مدخلاتها/مخرجاتها float16. */
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 112, mant = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | (mant >>> 13);
}
function fromHalf(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 5.960464477539063e-8;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * Math.pow(2, e - 15);
}
export function makeTensor(ort, type, data, dims) {
  if (type === 'float16') {
    if (typeof Float16Array === 'function') return new ort.Tensor('float16', Float16Array.from(data), dims);
    const half = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) half[i] = toHalf(data[i]);
    return new ort.Tensor('float16', half, dims);
  }
  return new ort.Tensor(type, data, dims);
}
export function tensorToFloat(tensor) {
  if (tensor.type !== 'float16') return tensor.data;
  const d = tensor.data;
  if (typeof Float16Array === 'function' && d instanceof Float16Array) return Float32Array.from(d);
  const out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = fromHalf(d[i]);
  return out;
}
export function inputType(session, index = 0) {
  const meta = session.inputMetadata && session.inputMetadata[index];
  return (meta && meta.type) || 'float32';
}
export function inputShape(session, index = 0) {
  const meta = session.inputMetadata && session.inputMetadata[index];
  return meta && Array.isArray(meta.shape) ? meta.shape : null;
}

export function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
export function throwIfAborted(signal) { if (signal && signal.aborted) throw new Error(MESSAGES.cancelled); }
/* يعطي المتصفح فرصة لرسم شريط التقدم بين الدفعات. */
export function yieldFrame() { return new Promise(r => setTimeout(r, 0)); }
export function downloadStage(label) { return p => `جاري تنزيل ${label} لأول مرة... ${Math.round(p * 100)}%`; }
