const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const base = `https://${req.headers.host}`;
  const url = new URL('/api/rpc', base);
  const body = JSON.stringify({fn:'login', args:{p_login_no:'__health_check__',p_pin:'__health_check__'}});
  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
        timeout: 15000
      }, x => {
        let text='';
        x.setEncoding('utf8');
        x.on('data', c => text += c);
        x.on('end', () => resolve({status:x.statusCode || 502, text}));
      });
      r.on('timeout', () => r.destroy(new Error('health request timeout')));
      r.on('error', reject);
      r.write(body);
      r.end();
    });
    let data=null;
    try { data=result.text ? JSON.parse(result.text) : null; } catch (_) { data=result.text; }
    return res.status(200).json({proxy_http:result.status, proxy_response:data});
  } catch (e) {
    return res.status(502).json({error:String(e?.message || e)});
  }
};
