const https = require('https');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  'https://ryqpstkzppaifpvhezzn.supabase.co'
).trim().replace(/\/$/, '');

const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const base = new URL(SUPABASE_URL);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));

    const req = https.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || 443,
      method,
      path,
      headers: {
        Accept: 'application/json',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        } : {}),
        ...headers
      },
      timeout: 15000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; }
        catch (_) { data = text; }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          data,
          text
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الطلب')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function bootstrapSession(token) {
  if (!token) throw new Error('جلسة الدخول غير موجودة');
  if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');

  const r = await request(
    'POST',
    '/rest/v1/rpc/bootstrap',
    { p_token: token },
    {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (!r.ok) {
    throw new Error(
      (r.data && (r.data.message || r.data.error || r.data.hint)) ||
      r.text ||
      'جلسة الدخول غير صالحة'
    );
  }

  return r.data || {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DXN-Session');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = String(req.headers['x-dxn-session'] || '').trim();
    const session = await bootstrapSession(token);
    const role = String(session.role || '').trim().toLowerCase();

    if (role !== 'leader') {
      return res.status(403).json({ error: 'هذه العملية متاحة للقائد فقط.' });
    }

    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const mode = String(body.mode || 'number').trim().toLowerCase() === 'name'
      ? 'name'
      : 'number';

    const query = String(body.query || '').trim();

    if (!query) {
      throw new Error(
        mode === 'number'
          ? 'أدخل رقم العضوية.'
          : 'أدخل اسم العضو أو جزءًا منه.'
      );
    }

    if (mode === 'number' && !/^\d{9}$/.test(query)) {
      throw new Error('رقم العضوية يجب أن يتكوّن من 9 أرقام.');
    }

    const fields = [
      'member_no',
      'member_name',
      'sponsor_member_no',
      'sponsor_name',
      'generation',
      'rank',
      'dxn_status',
      'downline_status',
      'join_date',
      'personal_pv',
      'personal_group_pv',
      'total_group_pv',
      'accumulated_group_pv',
      'accumulated_promotion_pv',
      'diamond_group_pv',
      'accumulated_group_pv_masked',
      'accumulated_promotion_pv_masked',
      'diamond_group_pv_masked',
      'source',
      'source_updated_at',
      'created_at',
      'updated_at'
    ].join(',');

    let path =
      '/rest/v1/dxn_team_members?select=' +
      encodeURIComponent(fields) +
      '&limit=20&order=member_no.asc';

    if (mode === 'number') {
      path += '&member_no=eq.' + encodeURIComponent(query);
    } else {
      path += '&member_name=ilike.*' + encodeURIComponent(query) + '*';
    }

    const result = await request(
      'GET',
      path,
      null,
      {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
      }
    );

    if (!result.ok || !Array.isArray(result.data)) {
      throw new Error(
        (result.data && (result.data.message || result.data.error || result.data.hint)) ||
        result.text ||
        'تعذر البحث في سجل DXN.'
      );
    }

    return res.status(200).json({
      ok: true,
      mode,
      query,
      count: result.data.length,
      rows: result.data
    });
  } catch (error) {
    console.error('leader-dxn-member-search:', error);
    return res.status(400).json({
      error: String(error && error.message || error)
    });
  }
};
