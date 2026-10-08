/* تنزيل ملفات النماذج مرة واحدة: تقدم التنزيل، التحقق من الحجم والبصمة SHA-256، ثم الحفظ في كاش المتصفح.
   يعمل داخل الـWorker وفي الصفحة نفسها (احتياطًا للمتصفحات التي لا تدعم Worker). */

/* لا يبدأ الاسم بـ dxn- لأن sw.js يحذف كل كاشات dxn-*. */
export const CACHE_NAME = 'design-studio-models-v1';

function hex(buffer) { return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function openCache() {
  try { return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null; } catch (_) { return null; }
}

export function sizeLabel(bytes) { return `${(bytes / 1048576).toFixed(1)} MB`; }

/* file: {url, bytes, sha256, label}. يعيد {bytes: Uint8Array, cached}. */
export async function fetchModelFile(file, { onProgress, signal } = {}) {
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(file.url);
      if (hit) {
        const bytes = new Uint8Array(await hit.arrayBuffer());
        /* من الكاش: لا نعرض رسالة "تنزيل لأول مرة". */
        if (bytes.byteLength === file.bytes) return { bytes, cached: true };
        await cache.delete(file.url);
      }
    } catch (_) { /* نكمل بالتنزيل */ }
  }
  let res;
  try { res = await fetch(file.url, { signal, mode: 'cors' }); }
  catch (_) {
    if (signal && signal.aborted) throw Object.assign(new Error('تم إلغاء المعالجة.'), { code: 'CANCELLED' });
    throw Object.assign(new Error(`تعذر تنزيل ${file.label}. تحقق من الاتصال ثم أعد المحاولة.`), { code: 'NETWORK' });
  }
  if (!res.ok) throw Object.assign(new Error(`تعذر تنزيل ${file.label} (${res.status}).`), { code: 'NETWORK' });
  const total = file.bytes;
  let bytes;
  if (res.body && res.body.getReader) {
    bytes = new Uint8Array(total);
    const reader = res.body.getReader();
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (loaded + value.length > total) throw new Error(`حجم ${file.label} غير متوقع.`);
      bytes.set(value, loaded);
      loaded += value.length;
      if (onProgress) onProgress(loaded / total);
    }
    if (loaded !== total) throw Object.assign(new Error(`لم يكتمل تنزيل ${file.label}. أعد المحاولة.`), { code: 'NETWORK' });
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength !== total) throw new Error(`حجم ${file.label} غير متوقع.`);
  }
  const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (digest !== file.sha256) throw new Error(`فشل التحقق من سلامة ${file.label}.`);
  if (cache) { try { await cache.put(file.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) { /* الكاش اختياري */ } }
  return { bytes, cached: false };
}

/* النموذج + ملف الأوزان الخارجي إن وجد، مع تقدم موزّع حسب الحجم. */
export async function fetchModel(model, { onProgress, signal } = {}) {
  const ext = model.externalData;
  const totalBytes = model.bytes + (ext ? ext.bytes : 0);
  const part = (offset, size) => p => { if (onProgress) onProgress((offset + size * p) / totalBytes); };
  const graph = await fetchModelFile(model, { onProgress: part(0, model.bytes), signal });
  const weights = ext ? await fetchModelFile({ ...ext, label: model.label }, { onProgress: part(model.bytes, ext.bytes), signal }) : null;
  return { graph: graph.bytes, weights: weights ? weights.bytes : null, cached: graph.cached && (!weights || weights.cached) };
}

export function sessionOptions(model, weights, eps) {
  return { executionProviders: eps, graphOptimizationLevel: 'all', ...(weights ? { externalData: [{ path: model.externalData.path, data: weights }] } : {}) };
}
