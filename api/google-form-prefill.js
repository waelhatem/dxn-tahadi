const APPS_SCRIPT_URL = String(process.env.GOOGLE_SPONSOR_FORM_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbx_6YxocFdH7XCkRe1iXgp4MBgeY1ac62adyFV6Gt3FOaXPwLcVGbNPWGkpX-TgehEu/exec').trim();

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
    const memberName = String(body.memberName || '').trim();
    const membershipNumber = String(body.membershipNumber || '').trim().replace(/[\s-]+/g, '');

    if (!validEmail(sponsorEmail)) {
      return json(res, 400, { error: 'بريد الراعي غير صالح' });
    }

    if ((memberName && !membershipNumber) || (!memberName && membershipNumber)) {
      return json(res, 400, { error: 'بيانات العضو غير مكتملة.' });
    }

    if (membershipNumber && !/^\d{9}$/.test(membershipNumber)) {
      return json(res, 400, { error: 'رقم العضوية يجب أن يكون 9 أرقام.' });
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
      encodeURIComponent(sponsorEmail) +
      (memberName && membershipNumber
        ? '&memberName=' + encodeURIComponent(memberName) +
          '&membershipNumber=' + encodeURIComponent(membershipNumber)
        : '');

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
        error: (data && data.error) || text || 'تعذر الاتصال بخدمة Google Apps Script',
        upstreamStatus: response.status
      });
    }

    if (!data || !data.ok || !data.memberUrl) {
      return json(res, 502, {
        error: (data && data.error) || text || 'لم يرجع Apps Script رابط اختبار صحيح.'
      });
    }

    return json(res, 200, {
      ok: true,
      sponsorEmail,
      formId: String(data.formId || ''),
      prefilledUrl: data.memberUrl,
      prefilledMember: Boolean(data.prefilledMember)
    });
  } catch (error) {
    console.error('google-form-prefill proxy error:', error);
    return json(res, 500, { error: String(error?.message || error) });
  }
};
