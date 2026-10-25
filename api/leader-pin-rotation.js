/*
 * Leader-only credential rotation for the app's custom app_users/sessions auth.
 * Deliberately disabled on Vercel Preview and until explicitly enabled in
 * production. Never log request bodies, PINs or session tokens.
 */
'use strict';

const DEFAULT_SUPABASE_URL = 'https://ryqpstkzppaifpvhezzn.supabase.co';

function isEnabled(env = process.env) {
  return env.VERCEL_ENV === 'production' &&
    env.DXN_LEADER_PIN_ROTATION_ENABLED === 'true';
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'طلب غير صالح';
  }
  const { token, current_pin: currentPin, new_pin: newPin } = body;
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(token)) {
    return 'جلسة القائد غير صالحة. أعد تسجيل الدخول';
  }
  if (typeof currentPin !== 'string' || !currentPin || Buffer.byteLength(currentPin, 'utf8') > 256) {
    return 'أدخل كلمة المرور الحالية';
  }
  if (typeof newPin !== 'string' || newPin.length < 12 || Buffer.byteLength(newPin, 'utf8') > 72) {
    return 'اختر كلمة مرور من 12 حرفًا على الأقل، وبحد أقصى 72 بايت';
  }
  if (currentPin === newPin) return 'يجب أن تختلف كلمة المرور الجديدة عن الحالية';
  return null;
}

function configuredSupabaseUrl(env = process.env) {
  const configured = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  return configured.toLowerCase() === DEFAULT_SUPABASE_URL.toLowerCase()
    ? configured : DEFAULT_SUPABASE_URL;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    return res.status(200).json({ enabled: isEnabled() });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'طريقة الطلب غير مسموحة' });
  }

  // Crucial: previews may point at the production Supabase database.
  // Never permit a Preview or disabled deployment to rotate real credentials.
  if (!isEnabled()) {
    return res.status(409).json({
      code: 'preview_only',
      error: 'هذا عرض تجريبي فقط. تغيير كلمة المرور غير مفعّل قبل الاعتماد النهائي.'
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'تعذر قراءة الطلب' });
  }

  const error = validate(body);
  if (error) return res.status(400).json({ error });

  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!secretKey) {
    return res.status(503).json({ error: 'خدمة تأمين الحساب غير مهيأة بعد' });
  }

  try {
    // Modern sb_secret_ keys identify the privileged caller by apikey only.
    // Legacy service_role JWTs may additionally be sent as Bearer tokens.
    // Sending an opaque sb_secret_ as Bearer is rejected by PostgREST.
    const headers = {
      apikey: secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (!secretKey.startsWith('sb_secret_')) {
      headers.Authorization = `Bearer ${secretKey}`;
    }
    const response = await fetch(`${configuredSupabaseUrl()}/rest/v1/rpc/leader_rotate_pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_token: body.token,
        p_current_pin: body.current_pin,
        p_new_pin: body.new_pin
      }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(503).json({ error: 'تحديث قاعدة البيانات الأمني لم يُعتمد بعد' });
      }
      const message = String(payload.message || payload.error || 'تعذر تغيير كلمة المرور');
      return res.status(response.status === 400 ? 400 : 502).json({ error: message });
    }
    if (!payload || payload.ok !== true || typeof payload.token !== 'string') {
      return res.status(502).json({ error: 'تعذر التحقق من الجلسة الجديدة، أعد تسجيل الدخول' });
    }
    return res.status(200).json({
      ok: true,
      token: payload.token,
      revoked_sessions: Number(payload.revoked_sessions) || 0
    });
  } catch (_) {
    // Do not log credentials or session tokens, including the failed request.
    return res.status(502).json({ error: 'تعذر الاتصال بخدمة تأمين الحساب. أعد المحاولة لاحقًا.' });
  }
}

module.exports = handler;
module.exports._test = { isEnabled, validate, configuredSupabaseUrl };
