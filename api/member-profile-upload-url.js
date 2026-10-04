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

const BUCKET = 'member-profiles';

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

/* =========================================================
   HTTP REQUEST
========================================================= */

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const base = new URL(SUPABASE_URL);

    const payload =
      body == null
        ? null
        : Buffer.from(JSON.stringify(body));

    const req = https.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || 443,
        method,
        path,
        headers: {
          Accept: 'application/json',

          ...(payload
            ? {
                'Content-Length': payload.length
              }
            : {}),

          ...headers
        },
        timeout: 15000
      },
      res => {
        const chunks = [];

        res.on('data', chunk => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);

          const text = buffer.toString('utf8');

          let data = null;

          try {
            data = text ? JSON.parse(text) : null;
          } catch (_) {
            data = text;
          }

          resolve({
            ok:
              res.statusCode >= 200 &&
              res.statusCode < 300,

            status: res.statusCode || 0,

            data,

            text
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(
        new Error('انتهت مهلة الاتصال بقاعدة البيانات')
      );
    });

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

/* =========================================================
   VERIFY SESSION
========================================================= */

async function verifySession(token) {
  if (!token) {
    throw new Error('جلسة العضوية غير موجودة');
  }

  if (!SUPABASE_SECRET_KEY) {
    throw new Error(
      'SUPABASE_SECRET_KEY غير مضبوط في Vercel'
    );
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

      Authorization:
        'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (!r.ok) {
    const message =
      r.data &&
      (
        r.data.message ||
        r.data.error ||
        r.data.hint
      );

    throw new Error(
      message ||
      r.text ||
      'جلسة الدخول غير صالحة'
    );
  }

  const d = r.data || {};

  const role = String(
    d.role || ''
  ).trim().toLowerCase();

  if (!['member', 'leader'].includes(role)) {
    throw new Error(
      'جلسة الدخول غير صالحة'
    );
  }

  /*
    مهم:
    لا نعتمد على d.members[0].

    بالنسبة للعضو الحالي، bootstrap يعيد:
      current_member

    وهذا هو العضو المرتبط فعلياً بحساب تسجيل الدخول.
  */

  const currentMember =
    d.current_member &&
    typeof d.current_member === 'object'
      ? d.current_member
      : null;

  const memberId = String(
    currentMember &&
    currentMember.id
      ? currentMember.id
      : ''
  ).trim();

  return {
    role,
    memberId
  };
}

/* =========================================================
   ENSURE STORAGE BUCKET
========================================================= */

async function ensureBucket() {
  const check = await request(
    'GET',
    '/storage/v1/bucket/' +
      encodeURIComponent(BUCKET),
    null,
    {
      apikey: SUPABASE_SECRET_KEY,

      Authorization:
        'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  if (check.ok) {
    const current = check.data || {};

    const currentTypes =
      Array.isArray(current.allowed_mime_types)
        ? current.allowed_mime_types
        : [];

    const missing =
      ALLOWED_MIME_TYPES.some(
        type => !currentTypes.includes(type)
      );

    const currentLimit =
      Number(current.file_size_limit || 0);

    if (
      currentLimit < MAX_BYTES ||
      missing ||
      current.public !== true
    ) {
      const update = await request(
        'PUT',
        '/storage/v1/bucket/' +
          encodeURIComponent(BUCKET),
        {
          file_size_limit: MAX_BYTES,

          public: true,

          allowed_mime_types:
            ALLOWED_MIME_TYPES
        },
        {
          'Content-Type':
            'application/json',

          apikey:
            SUPABASE_SECRET_KEY,

          Authorization:
            'Bearer ' +
            SUPABASE_SECRET_KEY
        }
      );

      if (!update.ok) {
        const message =
          update.data &&
          (
            update.data.message ||
            update.data.error ||
            update.data.hint
          );

        throw new Error(
          message ||
          'تعذر تحديث إعدادات صور الأعضاء'
        );
      }
    }

    return;
  }

  if (check.status !== 404) {
    const message =
      check.data &&
      (
        check.data.message ||
        check.data.error ||
        check.data.hint
      );

    throw new Error(
      message ||
      'تعذر التحقق من مساحة صور الأعضاء'
    );
  }

  const create = await request(
    'POST',
    '/storage/v1/bucket',
    {
      id: BUCKET,

      name: BUCKET,

      public: true,

      file_size_limit: MAX_BYTES,

      allowed_mime_types:
        ALLOWED_MIME_TYPES
    },
    {
      'Content-Type':
        'application/json',

      apikey:
        SUPABASE_SECRET_KEY,

      Authorization:
        'Bearer ' +
        SUPABASE_SECRET_KEY
    }
  );

  if (
    !create.ok &&
    create.status !== 409
  ) {
    const message =
      create.data &&
      (
        create.data.message ||
        create.data.error ||
        create.data.hint
      );

    throw new Error(
      message ||
      'تعذر إنشاء مساحة صور الأعضاء'
    );
  }
}

/* =========================================================
   FILE EXTENSION
========================================================= */

function ext(type) {
  if (type === 'image/png') {
    return '.png';
  }

  if (type === 'image/webp') {
    return '.webp';
  }

  return '.jpg';
}

/* =========================================================
   CHECK MEMBER
========================================================= */

async function memberExists(id) {
  const r = await request(
    'GET',
    '/rest/v1/members?id=eq.' +
      encodeURIComponent(id) +
      '&active=eq.true&select=id',
    null,
    {
      apikey: SUPABASE_SECRET_KEY,

      Authorization:
        'Bearer ' + SUPABASE_SECRET_KEY
    }
  );

  /*
    لا نخفي خطأ Supabase.
    إذا كانت المشكلة في الاتصال أو الصلاحية
    يجب إظهار السبب الحقيقي.
  */

  if (!r.ok) {
    const message =
      r.data &&
      (
        r.data.message ||
        r.data.error ||
        r.data.hint
      );

    throw new Error(
      message ||
      r.text ||
      'تعذر التحقق من بيانات العضو'
    );
  }

  if (
    !Array.isArray(r.data) ||
    r.data.length === 0
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports = async function handler(req, res) {

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

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
    return res
      .status(405)
      .json({
        error: 'Method not allowed'
      });
  }

  try {

    /* -----------------------------------------------------
       SESSION
    ----------------------------------------------------- */

    const token = String(
      req.headers['x-dxn-session'] || ''
    ).trim();

    const session =
      await verifySession(token);

    /* -----------------------------------------------------
       REQUEST DATA
    ----------------------------------------------------- */

    const body =
      req.body &&
      typeof req.body === 'object'
        ? req.body
        : {};

    const requested =
      String(
        body.member_id || ''
      ).trim();

    /*
      العضو:
      - member:
        نستخدم العضو المرتبط بالجلسة فقط.

      - leader:
        نستخدم العضو المطلوب من الطلب.
    */

    const memberId =
      session.role === 'member'
        ? session.memberId
        : requested;

    if (!memberId) {
      throw new Error(
        'لم يتم تحديد العضو'
      );
    }

    /*
      منع العضو من إرسال طلب لصورة عضو آخر.
    */

    if (
      session.role === 'member' &&
      requested &&
      requested !== session.memberId
    ) {
      throw new Error(
        'لا يمكنك تغيير صورة عضو آخر'
      );
    }

    /* -----------------------------------------------------
       MEMBER VALIDATION
    ----------------------------------------------------- */

    const exists =
      await memberExists(memberId);

    if (!exists) {
      throw new Error(
        'العضو غير موجود أو غير نشط'
      );
    }

    /* -----------------------------------------------------
       IMAGE VALIDATION
    ----------------------------------------------------- */

    const type = String(
      body.type || ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

    const size =
      Number(body.size || 0);

    if (
      !ALLOWED_MIME_TYPES.includes(type)
    ) {
      throw new Error(
        'استخدم JPG أو PNG أو WEBP فقط'
      );
    }

    if (
      !size ||
      size <= 0 ||
      size > MAX_BYTES
    ) {
      throw new Error(
        'حجم الصورة يجب ألا يتجاوز 10 MB'
      );
    }

    /* -----------------------------------------------------
       STORAGE BUCKET
    ----------------------------------------------------- */

    await ensureBucket();

    /* -----------------------------------------------------
       STORAGE PATH
    ----------------------------------------------------- */

    const path =
      memberId +
      '/' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2, 10) +
      ext(type);

    const storagePath =
      path
        .split('/')
        .map(encodeURIComponent)
        .join('/');

    /* -----------------------------------------------------
       CREATE SIGNED UPLOAD URL
    ----------------------------------------------------- */

    const sign =
      await request(
        'POST',
        '/storage/v1/object/upload/sign/' +
          BUCKET +
          '/' +
          storagePath,
        {
          upsert: false
        },
        {
          'Content-Type':
            'application/json',

          apikey:
            SUPABASE_SECRET_KEY,

          Authorization:
            'Bearer ' +
            SUPABASE_SECRET_KEY
        }
      );

    if (!sign.ok) {

      const message =
        sign.data &&
        (
          sign.data.message ||
          sign.data.error ||
          sign.data.hint ||
          sign.data.statusCode
        );

      throw new Error(
        message ||
        sign.text ||
        'تعذر إنشاء رابط رفع الصورة'
      );
    }

    const signed =
      sign.data || {};

    let uploadUrl =
      String(
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

    /* -----------------------------------------------------
       PUBLIC URL
    ----------------------------------------------------- */

    const publicUrl =
      SUPABASE_URL +
      '/storage/v1/object/public/' +
      storagePath;

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

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

    return res
      .status(400)
      .json({
        error:
          String(
            error &&
            error.message ||
            error
          )
      });
  }
};
