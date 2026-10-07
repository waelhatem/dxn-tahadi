/* محولات المحركات على الخادم. كل محرك خارجي (GPU/Worker) يُعرَّف بعنوان ومفتاح في متغيرات البيئة فقط.
   بروتوكول العامل الموحد: POST {url}/jobs  → {jobId}
                          GET  {url}/jobs/{jobId} → {status, progress, stage, result, error}
                          POST {url}/jobs/{jobId}/cancel
   محولات ComfyUI/Remotion/HyperFrames/WhisperX/PyVideoTrans/OpenShorts/Postiz تتصل بخدمة وسيطة (Worker)
   تتبع هذا البروتوكول، فيمكن تغيير المحرك دون تغيير الواجهة. */
'use strict';
const crypto = require('crypto');

const PROVIDERS = Object.freeze({
  image: { comfyui: { url: 'COMFYUI_URL', key: 'COMFYUI_API_KEY', methods: ['process', 'workflow'] } },
  video: {
    remotion: { url: 'REMOTION_WORKER_URL', key: 'REMOTION_WORKER_KEY', methods: ['render'] },
    hyperframes: { url: 'HYPERFRAMES_WORKER_URL', key: 'HYPERFRAMES_WORKER_KEY', methods: ['render'] }
  },
  speech: { whisperx: { url: 'WHISPERX_WORKER_URL', key: 'WHISPERX_WORKER_KEY', methods: ['transcribe', 'align', 'detectLanguage'] } },
  translation: { pyvideotrans: { url: 'PYVIDEOTRANS_WORKER_URL', key: 'PYVIDEOTRANS_WORKER_KEY', methods: ['translate', 'dub'] } },
  shorts: { openshorts: { url: 'OPENSHORTS_WORKER_URL', key: 'OPENSHORTS_WORKER_KEY', methods: ['analyze', 'cut'] } },
  publishing: { postiz: { url: 'POSTIZ_URL', key: 'POSTIZ_API_KEY', methods: ['schedule'] } }
});
const ENGINES = ['image', 'video', 'speech', 'translation', 'shorts', 'content', 'publishing'];
const FLAG_NAMES = ['DESIGN_STUDIO_ENABLED', 'DESIGN_IMAGE_ENABLED', 'DESIGN_VIDEO_ENABLED', 'DESIGN_AUDIO_ENABLED', 'DESIGN_SHORTS_ENABLED', 'DESIGN_CONTENT_ENABLED', 'DESIGN_PUBLISHING_ENABLED', 'DESIGN_STUDIO_MOCK_MODE'];

function env(name) { return String(process.env[name] || '').trim(); }
function boolEnv(name) { const v = env(name).toLowerCase(); if (v === 'true' || v === '1') return true; if (v === 'false' || v === '0') return false; return undefined; }

function providerDef(engine, provider) { return (PROVIDERS[engine] && PROVIDERS[engine][provider]) || null; }
function isConfigured(engine, provider) { const d = providerDef(engine, provider); return !!(d && /^https:\/\//i.test(env(d.url))); }
function nativeCapabilities() {
  return {
    image: { openai: !!env('OPENAI_API_KEY'), fal: !!env('FAL_KEY') },
    video: { fal: !!env('FAL_KEY') }
  };
}
function nativeAvailable(engine, caps = nativeCapabilities()) {
  if (engine === 'image') return !!(caps.image.openai || caps.image.fal);
  if (engine === 'video') return !!caps.video.fal;
  return false;
}

/* الإعدادات العامة التي تُرسل للمتصفح: مفاتيح التشغيل + اسم المحرك المفعل لكل وحدة. بدون عناوين أو مفاتيح. */
function publicConfig() {
  const flags = {};
  for (const name of FLAG_NAMES) { const v = boolEnv(name); if (v !== undefined) flags[name] = v; }
  const providers = {};
  const capabilities = nativeCapabilities();
  for (const engine of ENGINES) {
    const chosen = env('DESIGN_' + engine.toUpperCase() + '_PROVIDER').toLowerCase();
    if (chosen === 'native' && nativeAvailable(engine, capabilities)) providers[engine] = 'native';
    else if (chosen && chosen !== 'local' && isConfigured(engine, chosen)) providers[engine] = chosen;
    else if (!chosen && nativeAvailable(engine, capabilities)) providers[engine] = 'native';
    else providers[engine] = 'local';
  }
  return { flags, providers, capabilities };
}

function secret() { return env('DESIGN_JOB_SIGNING_SECRET') || env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'); }
/* معرّف المهمة المُعاد للمتصفح موقَّع بهوية المستخدم، فلا يستطيع أحد متابعة أو إلغاء مهمة مستخدم آخر. */
function signJob(userId, engine, provider, workerJobId) {
  const payload = Buffer.from(JSON.stringify({ u: String(userId), e: engine, p: provider, j: String(workerJobId) })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyJob(token, userId) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !secret()) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data = null;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (_) { return null; }
  return data && data.u === String(userId) ? data : null;
}

class EngineError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status || 400; } }

async function callWorker(def, path, { method = 'GET', body } = {}) {
  const base = env(def.url).replace(/\/$/, '');
  const headers = { Accept: 'application/json' };
  const key = env(def.key);
  if (key) headers.Authorization = 'Bearer ' + key;
  if (body) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new EngineError('ENGINE_ERROR', (data && data.error) || 'تعذر إكمال المعالجة.', 502);
    return data || {};
  } catch (err) {
    if (err instanceof EngineError) throw err;
    throw new EngineError('ENGINE_UNAVAILABLE', 'المحرك غير متاح حاليًا.', 503);
  } finally { clearTimeout(timer); }
}

function requireProvider(engine, provider, method) {
  const def = providerDef(engine, provider);
  if (!def) throw new EngineError('BAD_REQUEST', 'محرك غير معروف.', 400);
  if (method && !def.methods.includes(method)) throw new EngineError('BAD_REQUEST', 'عملية غير مدعومة.', 400);
  if (!isConfigured(engine, provider)) throw new EngineError('ENGINE_UNAVAILABLE', 'هذه الأداة غير متاحة حاليًا.', 503);
  return def;
}

async function submit({ userId, engine, provider, method, input }) {
  const def = requireProvider(engine, provider, method);
  const data = await callWorker(def, '/jobs', { method: 'POST', body: { method, input, owner: String(userId) } });
  if (!data.jobId) throw new EngineError('ENGINE_ERROR', 'لم يرجع المحرك رقم مهمة.', 502);
  return { jobId: signJob(userId, engine, provider, data.jobId), status: 'queued' };
}
async function status({ userId, jobId }) {
  const job = verifyJob(jobId, userId);
  if (!job) throw new EngineError('NOT_FOUND', 'المهمة غير موجودة.', 404);
  const def = requireProvider(job.e, job.p);
  const d = await callWorker(def, '/jobs/' + encodeURIComponent(job.j));
  return { status: d.status || 'processing', progress: Number(d.progress) || 0, stage: d.stage || '', result: d.result || null, error: d.error || null };
}
async function cancel({ userId, jobId }) {
  const job = verifyJob(jobId, userId);
  if (!job) throw new EngineError('NOT_FOUND', 'المهمة غير موجودة.', 404);
  const def = requireProvider(job.e, job.p);
  await callWorker(def, '/jobs/' + encodeURIComponent(job.j) + '/cancel', { method: 'POST', body: {} });
  return { status: 'cancelled' };
}

module.exports = { PROVIDERS, ENGINES, publicConfig, isConfigured, nativeCapabilities, signJob, verifyJob, submit, status, cancel, EngineError };