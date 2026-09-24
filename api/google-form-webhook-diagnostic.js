const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' });
  }

  const secret = String(process.env.GOOGLE_FORM_WEBHOOK_SECRET || '');
  const hash = crypto
    .createHash('sha256')
    .update(secret, 'utf8')
    .digest('hex');

  return res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').json({
    configured: Boolean(secret),
    length: secret.length,
    sha256: hash
  });
};
