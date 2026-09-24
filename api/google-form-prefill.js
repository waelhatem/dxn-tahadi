const FORM_URL = process.env.GOOGLE_TRAINING_FORM_URL || 'https://docs.google.com/forms/d/e/1FAIpQLSc8__IDY7MT6YU6rVKkwUfzIGbQkN9k5WgCRp3mHYwPd6a60Q/viewform';

function json(res, status, body) {
  return res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function firstEntryId(html) {
  const ids = [];
  const seen = new Set();
  const re = /entry\.(\d{5,})/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids[0] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const sponsorEmail = String(body.sponsorEmail || '').trim();

    if (!validEmail(sponsorEmail)) {
      return json(res, 400, { error: 'بريد الراعي غير صالح' });
    }

    const response = await fetch(FORM_URL, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      return json(res, 502, { error: 'تعذر الوصول إلى Google Form' });
    }

    const html = await response.text();
    const entryId = firstEntryId(html);

    if (!entryId) {
      return json(res, 502, { error: 'تعذر تحديد حقل Sponsor Email في Google Form' });
    }

    const url = FORM_URL + '?usp=pp_url&entry.' + entryId + '=' + encodeURIComponent(sponsorEmail);

    return json(res, 200, {
      ok: true,
      sponsorEmail,
      prefilledUrl: url
    });
  } catch (error) {
    console.error('google-form-prefill error:', error);
    return json(res, 500, { error: String(error?.message || error) });
  }
};
