const https = require('https');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co'
).trim().replace(/\/$/, '');

const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

const BUCKET = 'member-profiles';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const base = new URL(SUPABASE_URL);
    const payload = body == null
      ? null
      : Buffer.from(JSON.stringify(body));

    const req = https.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || 443,
      method,
      path,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Length': payload.length } : {}),
        ...headers
      },
      timeout: 15000
    }, res => {
      const chunks = [];

      res.on('data', c => chunks.push(c));

      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');

        let data = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch (_) {
          data = text;
        }

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          data,
          text
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('انتهت مهلة الطلب'));
    });

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

async function verifySession(token) {
  if (!token) {
    throw new Error('جلسة العضوية غير موجودة');
  }

  if (!SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  }

  const r = await request(
    'POST',
    '/rest/v1/rpc/bootstrap',
    {
      p_token: token
    },
    {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (!r.ok) {
    throw new Error(
      (r.data && (
        r.data.message ||
        r.data.error ||
        r.data.hint
      )) ||
      r.text ||
      'جلسة الدخول غير صالحة'
    );
  }

  const d = r.data || {};
  const role = String(d.role || '').trim().toLowerCase();

  if (!['member', 'leader'].includes(role)) {
    throw new Error('جلسة الدخول غير صالحة');
  }

  const own =
    role === 'member' && Array.isArray(d.members)
      ? d.members[0]
      : null;

  return {
    role,
    memberId: String(own && own.id || '').trim()
  };
}

async function ensureBucket() {
  const check = await request(
    'GET',
    '/storage/v1/bucket/' + encodeURIComponent(BUCKET),
    null,
    {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (check.ok) {
    const current = check.data || {};

    const currentTypes =
      Array.isArray(current.allowed_mime_types)
        ? current.allowed_mime_types
        : [];

    const missing = ALLOWED_MIME_TYPES.some(
      type => !currentTypes.includes(type)
    );

    if (
      Number(current.file_size_limit || 0) < MAX_BYTES ||
      missing ||
      current.public !== true
    ) {
      const update = await request(
        'PUT',
        '/storage/v1/bucket/' + encodeURIComponent(BUCKET),
        {
          file_size_limit: MAX_BYTES,
          public: true,
          allowed_mime_types: ALLOWED_MIME_TYPES
        },
        {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SECRET_KEY,
          Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
        }
      );

      if (!update.ok) {
        throw new Error('تعذر تحديث إعدادات صور الأعضاء');
      }
    }

    return;
  }

  if (check.status !== 404) {
    throw new Error('تعذر التحقق من مساحة صور الأعضاء');
  }

  const r = await request(
    'POST',
    '/storage/v1/bucket',
    {
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: ALLOWED_MIME_TYPES
    },
    {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (!r.ok && r.status !== 409) {
    throw new Error('تعذر إنشاء مساحة صور الأعضاء');
  }
}

function ext(type) {
  return type === 'image/png'
    ? '.png'
    : type === 'image/webp'
      ? '.webp'
      : '.jpg';
}

async function memberExists(id) {
  const r = await request(
    'GET',
    '/rest/v1/members?id=eq.' +
      encodeURIComponent(id) +
      '&active=eq.true&select=id',
    null,
    {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (!r.ok) {
    console.error(
      'memberExists failed:',
      r.status,
      r.text
    );
    return false;
  }

  return Array.isArray(r.data) && r.data.length > 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-DXN-Session'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const token = String(
      req.headers['x-dxn-session'] || ''
    ).trim();

    const session = await verifySession(token);

    const body = req.body || {};

    const requested = String(
      body.member_id || ''
    ).trim();

    const memberId =
      session.role === 'member'
        ? session.memberId
        : requested;

    if (!memberId) {
      throw new Error('لم يتم تحديد العضو');
    }

    if (
      session.role === 'member' &&
      requested &&
      requested !== session.memberId
    ) {
      throw new Error(
        'لا يمكنك تغيير صورة عضو آخر'
      );
    }

    if (!await memberExists(memberId)) {
      throw new Error(
        'العضو غير موجود أو غير نشط'
      );
    }

    const type = String(
      body.type || ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

    const size = Number(body.size || 0);

    if (!ALLOWED_MIME_TYPES.includes(type)) {
      throw new Error(
        'استخدم JPG أو PNG أو WEBP فقط'
      );
    }

    if (!size || size > MAX_BYTES) {
      throw new Error(
        'حجم الصورة يجب ألا يتجاوز 10 MB'
      );
    }

    await ensureBucket();

    const path =
      memberId +
      '/' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2, 10) +
      ext(type);

    const storagePath = path
      .split('/')
      .map(encodeURIComponent)
      .join('/');

    const sign = await request(
      'POST',
      '/storage/v1/object/upload/sign/' +
        BUCKET +
        '/' +
        storagePath,
      {
        upsert: false
      },
      {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SECRET_KEY,
        Authorization:
          'Bearer ' + SUPABASE_SECRET_KEY
      }
    );

    if (!sign.ok) {
      throw new Error(
        (sign.data && (
          sign.data.message ||
          sign.data.error ||
          sign.data.statusCode
        )) ||
        sign.text ||
        'تعذر إنشاء رابط رفع الصورة'
      );
    }

    const signed = sign.data || {};

    let uploadUrl = String(
      signed.signedUrl ||
      signed.signedURL ||
      signed.url ||
      ''
    ).trim();

    if (
      uploadUrl &&
      !/^https?:\/\//i.test(uploadUrl)
    ) {
      uploadUrl =
        SUPABASE_URL +
        '/storage/v1' +
        uploadUrl;
    }

    if (!uploadUrl) {
      throw new Error(
        'لم يتم إرجاع رابط رفع صالح'
      );
    }

    const publicUrl =
      SUPABASE_URL +
      '/storage/v1/object/public/' +
      storagePath;

    return res.status(200).json({
      ok: true,
      memberId,
      path,
      uploadUrl,
      publicUrl,
      type,
      size
    });

  } catch (error) {
    console.error(
      'member profile upload-url:',
      error
    );

    return res.status(400).json({
      error: String(
        error && error.message || error
      )
    });
  }
};
