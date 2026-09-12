const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';

const handlers = {
  '/api/rpc': require('./api/rpc'),
  '/api/rpc-health': require('./api/rpc-health'),
  '/api/grade-training': require('./api/grade-training')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    let text = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      text += chunk;
      if (text.length > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!text) return resolve(null);
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (type.includes('application/json')) {
        try { return resolve(JSON.parse(text)); }
        catch (_) { return reject(new Error('Invalid JSON body')); }
      }
      resolve(text);
    });
    req.on('error', reject);
  });
}

function makeResponse(res) {
  const out = {
    status(code) { res.statusCode = code; return out; },
    setHeader(name, value) { res.setHeader(name, value); return out; },
    json(value) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(value == null ? null : value));
      return out;
    },
    send(value) {
      res.end(value == null ? '' : String(value));
      return out;
    },
    end(value) { res.end(value); return out; }
  };
  return out;
}

async function handleApi(req, res, pathname) {
  const handler = handlers[pathname];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'API route not found' }));
  }
  try {
    req.body = await parseBody(req);
    await handler(req, makeResponse(res));
    if (!res.writableEnded) res.end();
  } catch (e) {
    if (res.writableEnded) return;
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(e && e.message || e) }));
  }
}

function safeStaticPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (_) { return null; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function serveStatic(req, res, pathname) {
  let file = safeStaticPath(pathname);
  if (!file) {
    res.statusCode = 400;
    return res.end('Bad request');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // Client-side routes fall back to the main application shell.
    file = path.join(ROOT, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const ext = path.extname(file).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=300');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end('File read error');
    }
  }).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`DXN Tahadi Render server listening on ${HOST}:${PORT}`);
});
