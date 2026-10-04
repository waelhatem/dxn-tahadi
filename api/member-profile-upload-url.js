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
   طلب إلى Supabase
   ========================================================= */

function request(method, path, body = null, headers = {}) {
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
                'Content-Type': 'application/json',
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
        new Error('انتهت مهلة الطلب')
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
   التحقق من جلسة المستخدم
   ========================================================= */

async function verifySession(token) {

  if (!token) {
    throw new Error(
      'جلسة العضوية غير موجودة'
    );
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

    throw new Error(
      (
        r.data &&
        (
          r.data.message ||
          r.data.error ||
          r.data.hint
        )
      ) ||
      r.text ||
      'جلسة الدخول غير صالحة'
    );
  }

  const d = r.data || {};

  const role = String(
    d.role || ''
  )
    .trim()
    .toLowerCase();

  if (
    !['member', 'leader'].includes(role)
  ) {
    throw new Error(
      'جلسة الدخول غير صالحة'
    );
  }

  /*
   * العضو:
   * نأخذ العضو مباشرة من bootstrap.
   *
   * لا نستعلم من جدول members هنا.
   */

  const own =
    role === 'member' &&
    Array.isArray(d.members)
      ? d.members[0]
      : null;

  const memberId = String(
    own && own.id || ''
  ).trim();

  if (
    role === 'member' &&
    !memberId
  ) {
    throw new Error(
      'لم يتم العثور على العضو المرتبط بجلسة الدخول'
    );
  }

  return {
    role,
    memberId
  };
}


/* =========================================================
   التأكد من وجود Bucket
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

    const current =
      check.data || {};

    const currentTypes =
      Array.isArray(
        current.allowed_mime_types
      )
        ? current.allowed_mime_types
        : [];

    const missing =
      ALLOWED_MIME_TYPES.some(
        type =>
          !currentTypes.includes(type)
      );

    const needsUpdate =
      Number(
        current.file_size_limit || 0
      ) < MAX_BYTES ||

      missing ||

      current.public !== true;

    if (needsUpdate) {

      const update = await request(
        'PUT',
        '/storage/v1/bucket/' +
          encodeURIComponent(BUCKET),

        {
          file_size_limit:
            MAX_BYTES,

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

        throw new Error(
          (
            update.data &&
            (
              update.data.message ||
              update.data.error ||
              update.data.hint
            )
          ) ||
          'تعذر تحديث إعدادات صور الأعضاء'
        );
      }
    }

    return;
  }


  if (check.status !== 404) {

    throw new Error(
      (
        check.data &&
        (
          check.data.message ||
          check.data.error
        )
      ) ||
      'تعذر التحقق من مساحة صور الأعضاء'
    );
  }


  const r = await request(
    'POST',
    '/storage/v1/bucket',

    {
      id: BUCKET,

      name: BUCKET,

      public: true,

      file_size_limit:
        MAX_BYTES,

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
    !r.ok &&
    r.status !== 409
  ) {

    throw new Error(
      (
        r.data &&
        (
          r.data.message ||
          r.data.error ||
          r.data.hint
        )
      ) ||
      'تعذر إنشاء مساحة صور الأعضاء'
    );
  }
}


/* =========================================================
   امتداد الصورة
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
   التحقق من عضو للقائد فقط
   ========================================================= */

async function memberExists(id) {

  const memberId =
    String(id || '').trim();

  if (!memberId) {

    return {
      exists: false,

      error:
        'معرّف العضو فارغ'
    };
  }


  const path =
    '/rest/v1/members' +
    '?id=eq.' +
    encodeURIComponent(memberId) +
    '&active=eq.true' +
    '&select=id,active';


  const r = await request(
    'GET',
    path,

    null,

    {
      apikey:
        SUPABASE_SECRET_KEY,

      Authorization:
        'Bearer ' +
        SUPABASE_SECRET_KEY
    }
  );


  if (!r.ok) {

    console.error(
      'memberExists Supabase error:',
      {
        status: r.status,

        data: r.data,

        text: r.text,

        memberId
      }
    );


    return {
      exists: false,

      error:
        (
          r.data &&
          (
            r.data.message ||
            r.data.error ||
            r.data.hint ||
            r.data.details
          )
        ) ||

        r.text ||

        'تعذر التحقق من بيانات العضو'
    };
  }


  const rows =
    Array.isArray(r.data)
      ? r.data
      : [];


  if (!rows.length) {

    return {
      exists: false,

      error:
        'العضو غير موجود أو غير نشط'
    };
  }


  const member =
    rows[0];


  if (
    member.active !== true
  ) {

    return {
      exists: false,

      error:
        'العضو غير نشط'
    };
  }


  return {
    exists: true,

    member
  };
}


/* =========================================================
   API Handler
   ========================================================= */

module.exports =
  async function handler(req, res) {

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
      return res
        .status(200)
        .end();
    }


    if (req.method !== 'POST') {

      return res
        .status(405)
        .json({
          error:
            'Method not allowed'
        });
    }


    try {

      /* ---------------------------------------------------
         جلسة المستخدم
         --------------------------------------------------- */

      const token =
        String(
          req.headers[
            'x-dxn-session'
          ] || ''
        ).trim();


      const session =
        await verifySession(token);


      /* ---------------------------------------------------
         بيانات الطلب
         --------------------------------------------------- */

      const body =
        req.body || {};


      const requested =
        String(
          body.member_id || ''
        ).trim();


      /* ---------------------------------------------------
         تحديد العضو
         --------------------------------------------------- */

      let memberId;


      if (
        session.role === 'member'
      ) {

        /*
         * مهم جداً:
         *
         * لا نستعلم من جدول members.
         *
         * memberId جاء من bootstrap
         * بعد التحقق من session token.
         */

        memberId =
          session.memberId;


        if (
          requested &&
          requested !== memberId
        ) {

          throw new Error(
            'لا يمكنك تغيير صورة عضو آخر'
          );
        }

      } else {

        /*
         * القائد فقط يستطيع تحديد
         * member_id مختلف.
         */

        memberId =
          requested;


        if (!memberId) {

          throw new Error(
            'لم يتم تحديد العضو'
          );
        }


        /*
         * التحقق من العضو مطلوب
         * للقائد فقط.
         */

        const memberCheck =
          await memberExists(
            memberId
          );


        if (
          !memberCheck.exists
        ) {

          throw new Error(
            memberCheck.error ||
            'العضو غير موجود أو غير نشط'
          );
        }
      }


      /* ---------------------------------------------------
         التحقق من نوع الصورة
         --------------------------------------------------- */

      const type =
        String(
          body.type || ''
        )
          .split(';')[0]
          .trim()
          .toLowerCase();


      if (
        !ALLOWED_MIME_TYPES.includes(
          type
        )
      ) {

        throw new Error(
          'استخدم JPG أو PNG أو WEBP فقط'
        );
      }


      /* ---------------------------------------------------
         التحقق من الحجم
         --------------------------------------------------- */

      const size =
        Number(
          body.size || 0
        );


      if (
        !size ||
        size > MAX_BYTES
      ) {

        throw new Error(
          'حجم الصورة يجب ألا يتجاوز 10 MB'
        );
      }


      /* ---------------------------------------------------
         التأكد من Bucket
         --------------------------------------------------- */

      await ensureBucket();


      /* ---------------------------------------------------
         إنشاء مسار فريد للصورة
         --------------------------------------------------- */

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
          .map(
            encodeURIComponent
          )
          .join('/');


      /* ---------------------------------------------------
         إنشاء رابط الرفع الموقّع
         --------------------------------------------------- */

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

        throw new Error(
          (
            sign.data &&
            (
              sign.data.message ||
              sign.data.error ||
              sign.data.statusCode
            )
          ) ||

          sign.text ||

          'تعذر إنشاء رابط رفع الصورة'
        );
      }


      /* ---------------------------------------------------
         قراءة الرابط الموقّع
         --------------------------------------------------- */

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
        !/^https?:\/\//i.test(
          uploadUrl
        )
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


      /* ---------------------------------------------------
         الرابط العام للصورة
         --------------------------------------------------- */

      const publicUrl =
        SUPABASE_URL +
        '/storage/v1/object/public/' +
        storagePath;


      /* ---------------------------------------------------
         النتيجة
         --------------------------------------------------- */

      return res
        .status(200)
        .json({

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
