/* تشغيل نماذج ONNX داخل المتصفح. التشغيل الفعلي يتم داخل Worker حتى لا تتجمد الواجهة؛
   إذا لم يدعم المتصفح Worker نعمل في الصفحة نفسها كخيار احتياطي.
   لا يُحمَّل أي شيء هنا عند فتح الموقع أو الاستوديو؛ أول تحميل يحدث عند ضغط أداة تحتاج نموذجًا. */
import { MESSAGES } from '../../config.mjs';
import { fetchModel, sessionOptions, sizeLabel } from './model-store.mjs';

const ORT_VERSION = '1.30.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

/* قياسات العمليات (للتقرير وأدوات المطور). */
export const metrics = [];
/* ملخص آخر عملية لعرضه للمستخدم: حجم النموذج، وضع التشغيل، الأوقات. */
let runInfo = null;
export function resetRunInfo() { runInfo = { models: [], backend: null, fellBack: false, runMs: 0, heapBytes: null }; }
export function takeRunInfo() { const r = runInfo; runInfo = null; return r; }
function noteModel(model, info) {
  if (!runInfo) resetRunInfo();
  runInfo.models.push({ label: model.label, bytes: model.bytes + (model.externalData ? model.externalData.bytes : 0), cached: info.cached, downloadMs: info.downloadMs, initMs: info.initMs });
  runInfo.backend = info.backend;
}
function noteRun(ms, backend, fellBack, heapBytes) {
  if (!runInfo) resetRunInfo();
  runInfo.runMs += ms; runInfo.backend = backend; runInfo.fellBack = runInfo.fellBack || !!fellBack;
  if (heapBytes) runInfo.heapBytes = Math.max(runInfo.heapBytes || 0, heapBytes);
}

export function modeLabel(backend) { return backend === 'webgpu' ? 'WebGPU — كرت الشاشة' : 'WASM — المعالج'; }
export function modelSize(model) { return sizeLabel(model.bytes + (model.externalData ? model.externalData.bytes : 0)); }

export function browserAiSupported() {
  return typeof WebAssembly === 'object' && typeof fetch === 'function' && !!(globalThis.crypto && crypto.subtle);
}

let gpuPromise = null;
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

/* جهاز محدود: ذاكرة 4GB أو أقل وبدون WebGPU. نستخدمها لتقليل أحجام المعالجة وإظهار تنبيه. */
export async function isLowEndDevice() {
  const { gpu } = await gpuInfo();
  const mem = Number(navigator.deviceMemory) || 8;
  return !gpu && mem <= 4;
}

/* Tensor بسيط ينتقل إلى الـWorker كما هو (type, data, dims). */
class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }
const workerOrt = Object.freeze({ Tensor });

/* ===== عميل الـWorker ===== */
let worker = null, workerBroken = typeof Worker === 'undefined', seq = 0;
const pending = new Map();
function failAll(err) { for (const p of pending.values()) p.reject(err); pending.clear(); }
function getWorker() {
  if (workerBroken) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
      worker.onmessage = e => {
        const m = e.data || {}, p = pending.get(m.id);
        if (!p) return;
        if (!('ok' in m)) { if ('progress' in m && p.onProgress) p.onProgress(m.progress); return; }
        pending.delete(m.id);
        if (m.ok) p.resolve(m); else p.reject(Object.assign(new Error(m.error), { code: m.code }));
      };
      worker.onerror = ev => {
        if (ev && ev.preventDefault) ev.preventDefault();
        workerBroken = true; worker = null;
        failAll(Object.assign(new Error('WORKER_FAILED'), { code: 'WORKER' }));
      };
    } catch (_) { workerBroken = true; worker = null; return null; }
  }
  return worker;
}
function call(msg, { onProgress, signal } = {}) {
  const w = getWorker();
  if (!w) return Promise.reject(Object.assign(new Error('WORKER_FAILED'), { code: 'WORKER' }));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    if (signal) signal.addEventListener('abort', () => {
      w.postMessage({ op: 'abort', target: id });
      if (pending.has(id)) { pending.delete(id); reject(new Error(MESSAGES.cancelled)); }
    }, { once: true });
    w.postMessage({ ...msg, id });
  });
}

async function workerSession(model, { onProgress, signal, preferGpu }) {
  const res = await call({ op: 'session', model, preferGpu }, { onProgress, signal });
  const entry = { model, key: res.key, ...res.info };
  const session = {
    inputNames: res.info.inputNames,
    outputNames: res.info.outputNames,
    inputMetadata: res.info.inputMetadata,
    async run(feeds) {
      const payload = {};
      for (const [name, t] of Object.entries(feeds)) payload[name] = { type: t.type, dims: t.dims, data: t.data };
      const out = await call({ op: 'run', key: entry.key, feeds: payload });
      entry.backend = out.backend;
      noteRun(out.runMs, out.backend, out.fellBack, out.heapBytes);
      return out.outputs;
    }
  };
  return { ort: workerOrt, session, ...entry, inWorker: true };
}

/* ===== احتياطي: التشغيل في الصفحة نفسها ===== */
let ortPromise = null;
function loadOrt() {
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
async function pageSession(model, { onProgress, signal, preferGpu }) {
  const { ort, gpu } = await loadOrt();
  const t0 = performance.now();
  const files = await fetchModel(model, { onProgress, signal });
  const t1 = performance.now();
  const wantGpu = gpu && preferGpu;
  let raw, backend = wantGpu ? 'webgpu' : 'wasm';
  try { raw = await ort.InferenceSession.create(files.graph, sessionOptions(model, files.weights, wantGpu ? ['webgpu', 'wasm'] : ['wasm'])); }
  catch (err) {
    if (!wantGpu) throw err;
    raw = await ort.InferenceSession.create(files.graph, sessionOptions(model, files.weights, ['wasm']));
    backend = 'wasm';
  }
  const session = {
    inputNames: raw.inputNames, outputNames: raw.outputNames, inputMetadata: raw.inputMetadata,
    async run(feeds) {
      const t = performance.now();
      const real = Object.fromEntries(Object.entries(feeds).map(([n, x]) => [n, new ort.Tensor(x.type, x.data, x.dims)]));
      const out = await raw.run(real);
      noteRun(Math.round(performance.now() - t), backend, false, (performance.memory && performance.memory.usedJSHeapSize) || null);
      return out;
    }
  };
  return { ort: workerOrt, session, model, backend, cached: files.cached, downloadMs: Math.round(t1 - t0), initMs: Math.round(performance.now() - t1), inWorker: false };
}

/* جلسة واحدة لكل نموذج طوال بقاء الصفحة مفتوحة. */
const sessions = new Map();
export function getSession(model, { onProgress, signal, preferGpu = true } = {}) {
  const key = `${model.id}:${preferGpu ? 'gpu' : 'cpu'}`;
  if (!sessions.has(key)) {
    const pendingSession = (async () => {
      try { return await workerSession(model, { onProgress, signal, preferGpu }); }
      catch (err) { if (err && err.code === 'WORKER') return pageSession(model, { onProgress, signal, preferGpu }); throw err; }
    })();
    sessions.set(key, pendingSession);
    pendingSession.catch(() => sessions.delete(key));
  }
  return sessions.get(key).then(entry => {
    noteModel(model, entry);
    metrics.push({ type: 'load', model: model.id, backend: entry.backend, cached: entry.cached, downloadMs: entry.downloadMs, initMs: entry.initMs, inWorker: entry.inWorker });
    return entry;
  });
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
export function downloadStage(model) { const size = modelSize(model); return p => `جاري تنزيل ${model.label} (${size}) لأول مرة... ${Math.round(p * 100)}%`; }
