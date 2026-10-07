/* /api/design-studio — التحكم بمهام استوديو التصميم (Job control) على Vercel.
   المعالجة الثقيلة (GPU / فيديو / WhisperX / ComfyUI) لا تعمل هنا؛ هذه الدالة تتحقق من الجلسة وتمرر المهمة لعامل خارجي.
   لا تُرسل أي عناوين أو مفاتيح للمتصفح. */
'use strict';
const https = require('https');
const engines = require('./_design/engines');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co').replace(/\/$/, '');
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/[\r\n]/g, '');
const MAX_BODY_CHARS = 4 * 1024 * 1024;
const ACTIONS = new Set(['config', 'submit', 'status', 'cancel']);

function bootstrap(token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ p_token: token });
    const url = new URL(SUPABASE_URL + '/rest/v1/rpc/bootstrap');
    const req = https.request({ protocol: url.protocol, hostname: url.hostname, path: url.pathname, method: 'POST', timeout: 10000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: SUPABASE_SECRET_KEY, Authorization: 'Bearer ' + SUPABASE_SECRET_KEY, 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => { text += c; });
      res.on('end', () => { let d = null; try { d = text ? JSON.parse(text) : null; } catch (_) { d = null; } resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: d }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

/* يتحقق من جلسة العضو/القائد ويعيد معرّف المستخدم. */
async function session(token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) return null;
  if (!SUPABASE_SECRET_KEY) throw new engines.EngineError('CONFIG', 'الخدمة غير مهيأة.', 500);
  const r = await bootstrap(token);
  if (!r.ok || !r.data) return null;
  const role = String(r.data.role || '').toLowerCase();
  if (role !== 'member' && role !== 'leader') return null;
  return { userId: String(r.data.user_id || (r.data.current_user && r.data.current_user.id) || ''), role };
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (_) { return Promise.resolve(null); } }
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > MAX_BODY_CHARS) { raw = ''; req.destroy(); resolve(null); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed' }); }
  const body = await readBody(req);
  if (!body || JSON.stringify(body).length > MAX_BODY_CHARS) return send(res, 413, { error: 'حجم الطلب أكبر من المسموح.' });
  const action = String(body.action || '');
  const args = body.args && typeof body.args === 'object' ? body.args : {};
  if (!ACTIONS.has(action)) return send(res, 400, { error: 'عملية غير معروفة.' });
  try {
    const s = await session(args.p_token);
    if (!s || !s.userId) return send(res, 401, { error: 'انتهت الجلسة. سجّل الدخول من جديد.' });
    if (action === 'config') return send(res, 200, engines.publicConfig());
    const engine = String(args.engine || ''), provider = String(args.provider || '');
    if (!engines.ENGINES.includes(engine) || !/^[a-z0-9-]{2,30}$/.test(provider)) return send(res, 400, { error: 'محرك غير صالح.' });
    if (action === 'submit') return send(res, 202, await engines.submit({ userId: s.userId, engine, provider, method: String(args.method || ''), input: args.input || {} }));
    if (action === 'status') return send(res, 200, await engines.status({ userId: s.userId, jobId: args.jobId }));
    return send(res, 200, await engines.cancel({ userId: s.userId, jobId: args.jobId }));
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    if (status >= 500 && !(err && err.code === 'ENGINE_UNAVAILABLE')) console.error('design-studio', err && err.message);
    return send(res, status, { error: (err && err.message) || 'تعذر إكمال الطلب.', code: (err && err.code) || 'ERROR' });
  }
};