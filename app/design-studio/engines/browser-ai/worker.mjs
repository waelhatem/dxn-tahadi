/* Worker للذكاء الاصطناعي: تنزيل النماذج وتشغيلها بعيدًا عن واجهة المستخدم حتى لا تتجمد الصفحة.
   WebGPU عند توفره، وإلا WASM. إذا فشل WebGPU أثناء التشغيل نعيد المحاولة تلقائيًا على WASM. */
import { fetchModel, sessionOptions } from './model-store.mjs';

const ORT_VERSION = '1.30.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

let ortPromise = null;
const sessions = new Map();
const downloads = new Map();

async function gpuAvailable() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (_) { return false; }
}

function loadOrt() {
  if (!ortPromise) ortPromise = (async () => {
    const gpu = await gpuAvailable();
    const ort = await import(ORT_BASE + (gpu ? 'ort.webgpu.min.mjs' : 'ort.min.mjs'));
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    ort.env.logLevel = 'error';
    return { ort, gpu };
  })().catch(err => { ortPromise = null; throw Object.assign(new Error('تعذر تحميل محرك الذكاء الاصطناعي في المتصفح. تحقق من الاتصال ثم أعد المحاولة.'), { code: 'NETWORK', cause: err }); });
  return ortPromise;
}

function plainMetadata(list) {
  try { return JSON.parse(JSON.stringify(list || [])); } catch (_) { return []; }
}

async function buildSession(model, preferGpu, { onProgress, signal } = {}) {
  const { ort, gpu } = await loadOrt();
  const t0 = performance.now();
  const files = await fetchModel(model, { onProgress, signal });
  const t1 = performance.now();
  const wantGpu = gpu && preferGpu;
  let session, backend = wantGpu ? 'webgpu' : 'wasm';
  try {
    session = await ort.InferenceSession.create(files.graph, sessionOptions(model, files.weights, wantGpu ? ['webgpu', 'wasm'] : ['wasm']));
  } catch (err) {
    if (!wantGpu) throw err;
    session = await ort.InferenceSession.create(files.graph, sessionOptions(model, files.weights, ['wasm']));
    backend = 'wasm';
  }
  return { ort, session, model, backend, cached: files.cached, downloadMs: Math.round(t1 - t0), initMs: Math.round(performance.now() - t1) };
}

function info(entry) {
  return {
    backend: entry.backend, cached: entry.cached, downloadMs: entry.downloadMs, initMs: entry.initMs,
    inputNames: [...entry.session.inputNames], outputNames: [...entry.session.outputNames],
    inputMetadata: plainMetadata(entry.session.inputMetadata),
    heapBytes: (performance.memory && performance.memory.usedJSHeapSize) || null
  };
}

function classify(err) {
  const text = String((err && err.message) || err || '');
  if (/memory|alloc|oom|out of range|RangeError/i.test(text) || (err && err.name === 'RangeError')) {
    return { code: 'MEMORY', error: 'ذاكرة الجهاز لا تكفي لهذه الصورة. جرّب صورة أصغر أو أغلق التبويبات الأخرى ثم أعد المحاولة.' };
  }
  return { code: (err && err.code) || 'ENGINE', error: (err && err.message) || 'تعذر إكمال المعالجة. يمكنك إعادة المحاولة.' };
}

/* نقل المخرجات دون نسخ إضافي عندما تكون المصفوفة تملك ذاكرتها كاملة. */
function exportTensor(t) {
  const d = t.data;
  const data = d.byteOffset === 0 && d.byteLength === d.buffer.byteLength ? d : d.slice();
  return { type: t.type, dims: [...t.dims], data };
}

self.onmessage = async e => {
  const msg = e.data || {};
  const { id, op } = msg;
  const post = (payload, transfer) => self.postMessage({ id, ...payload }, transfer || []);
  try {
    if (op === 'abort') { const c = downloads.get(msg.target); if (c) c.abort(); return; }
    if (op === 'session') {
      const key = `${msg.model.id}:${msg.preferGpu ? 'gpu' : 'cpu'}`;
      if (!sessions.has(key)) {
        const controller = new AbortController();
        downloads.set(id, controller);
        let last = -1;
        const pending = buildSession(msg.model, msg.preferGpu, {
          signal: controller.signal,
          onProgress: p => { const pct = Math.floor(p * 100); if (pct !== last) { last = pct; post({ progress: p }); } }
        });
        sessions.set(key, pending);
        pending.catch(() => sessions.delete(key)).finally(() => downloads.delete(id));
      }
      const entry = await sessions.get(key);
      post({ ok: true, key, info: info(entry) });
      return;
    }
    if (op === 'run') {
      let entry = await sessions.get(msg.key);
      if (!entry) throw new Error('انتهت جلسة النموذج. أعد المحاولة.');
      const feedsFor = ort => Object.fromEntries(Object.entries(msg.feeds).map(([n, t]) => [n, new ort.Tensor(t.type, t.data, t.dims)]));
      const t0 = performance.now();
      let result, fellBack = false;
      try {
        result = await entry.session.run(feedsFor(entry.ort));
      } catch (err) {
        if (entry.backend !== 'webgpu') throw err;
        /* فشل كرت الشاشة (ذاكرة أو فقدان الجهاز) ← نكمل على المعالج. */
        const fallback = await buildSession(entry.model, false);
        sessions.set(msg.key, Promise.resolve(fallback));
        entry = fallback;
        fellBack = true;
        result = await entry.session.run(feedsFor(entry.ort));
      }
      const outputs = {}, transfer = [];
      for (const name of Object.keys(result)) { const t = exportTensor(result[name]); outputs[name] = t; transfer.push(t.data.buffer); }
      post({ ok: true, outputs, backend: entry.backend, fellBack, runMs: Math.round(performance.now() - t0), heapBytes: (performance.memory && performance.memory.usedJSHeapSize) || null }, transfer);
      return;
    }
    throw new Error('عملية غير معروفة.');
  } catch (err) {
    post({ ok: false, ...classify(err) });
  }
};
