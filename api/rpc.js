const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2Ri4AeUh';

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: 'no-store'
      });
      return res.status(200).json({ ok: true, supabase_http: r.status });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(body.fn || '').trim();
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    if (!/^[a-zA-Z0-9_]+$/.test(fn)) return res.status(400).json({ error: 'Invalid RPC name' });

    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(args),
      cache: 'no-store'
    });

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    return res.status(upstream.status).json(data ?? {});
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
};
