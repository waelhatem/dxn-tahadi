const APPS_SCRIPT_URL = String(process.env.GOOGLE_SPONSOR_FORM_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycby-7XkGAsZ2UpMBsh0BSAopx59JyNUBtqpWKfAU8VWJrS9pDlBkE_9omwb25P3CjbGA/exec').trim();

function json(res, status, body) {
  return res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const sponsorEmail = String(body.sponsorEmail || '').trim();

    if (!validEmail(sponsorEmail)) {
      return json(res, 400, { error: 'بريد الراعي غير صالح' });
    }

    if (!APPS_SCRIPT_URL) {
      return json(res, 503, {
        error: 'لم يتم ربط Google Apps Script بعد. أضف GOOGLE_SPONSOR_FORM_WEBAPP_URL في Vercel.'
      });
    }

    const separator = APPS_SCRIPT_URL.includes('?') ? '&' : '?';
    const target = APPS_SCRIPT_URL +
      separator +
      'action=sponsor_form&email=' +
      encodeURIComponent(sponsorEmail);

    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'DXN-Tahadi/1.0' }
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}

    if (!response.ok) {
      return json(res, 502, {
        error: (data && data.error) || 'تعذر الاتصال بخدمة Google Apps Script',
        upstreamStatus: response.status
      });
    }

    if (!data || !data.ok || !data.memberUrl) {
      return json(res, 502, {
        error: (data && data.error) || 'لم يرجع Apps Script رابط اختبار صحيح.'
      });
    }

    return json(res, 200, {
      ok: true,
      sponsorEmail,
      prefilledUrl: data.memberUrl
    });
  } catch (error) {
    console.error('google-form-prefill proxy error:', error);
    return json(res, 500, { error: String(error?.message || error) });
  }
};
