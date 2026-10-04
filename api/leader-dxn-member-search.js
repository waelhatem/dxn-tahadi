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

    const rpcResult = await request(
      'POST',
      '/rest/v1/rpc/leader_dxn_member_search',
      {
        p_token: token,
        p_mode: mode,
        p_query: query,
        p_limit: 20
      },
      {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SECRET_KEY,
        Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
      }
    );

    if (!rpcResult.ok || !rpcResult.data) {
      throw new Error(
        (rpcResult.data && (rpcResult.data.message || rpcResult.data.error || rpcResult.data.hint)) ||
        rpcResult.text ||
        'تعذر البحث في سجل DXN.'
      );
    }

    const payload = rpcResult.data;
    if (Array.isArray(payload)) {
      return res.status(200).json({
        ok: true,
        mode,
        query,
        count: payload.length,
        rows: payload
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('leader-dxn-member-search:', error);
    return res.status(400).json({
      error: String(error && error.message || error)
    });
  }
};
