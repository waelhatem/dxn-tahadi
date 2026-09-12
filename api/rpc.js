const https = require('https');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_pD9m1Z3gN--2HAfhf_t2YA_2RiAeUh';

function request(url, method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      family: 4,
      timeout: 15000,
      headers: {
        apikey: SUPABASE_KEY,
        Accept: 'application/json',
        ...(payload ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} : {})
      }
    }, r => {
      let text = '';
      r.setEncoding('utf8');
      r.on('data', c => { text += c; });
      r.on('end', () => {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        resolve({status:r.statusCode || 502, data});
      });
    });
    req.on('timeout', () => req.destroy(new Error('Supabase connection timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const r = await request(`${SUPABASE_URL}/rest/v1/`, 'GET');
      return res.status(200).json({ok:true, supabase_http:r.status});
    } catch (e) {
      return res.status(502).json({ok:false, error:String(e?.message || e)});
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(body.fn || '').trim();
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    if (!/^[a-zA-Z0-9_]+$/.test(fn)) return res.status(400).json({error:'Invalid RPC name'});
    const r = await request(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, 'POST', args);
    return res.status(r.status).json(r.data ?? {});
  } catch (e) {
    return res.status(502).json({error:String(e?.message || e)});
  }
};
