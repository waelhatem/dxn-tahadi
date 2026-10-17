/*******************************************************
 * DXN Training Assessment - Google Forms Integration
 * Version: 3.0
 *
 * الوظائف:
 * 1) إنشاء Google Form مستقل لكل Sponsor
 * 2) عدم إظهار بريد Sponsor للعضو
 * 3) ربط Form ID ببريد Sponsor داخليًا
 * 4) إنشاء Trigger عند إرسال النموذج
 * 5) إرسال إجابات العضو إلى موقع DXN
 * 6) استقبال نتيجة التقييم من الموقع
 * 7) إرسال تقرير النتيجة إلى بريد Sponsor
 * 8) إنشاء رابط Pre-filled للعضو
 * 9) تمرير اسم العضو ورقم عضويته تلقائيًا من الموقع
 *******************************************************/


/* =====================================================
   إعدادات النظام
===================================================== */

const CONFIG = {

  BACKEND_URL:
    'https://dxn-tahadi.vercel.app/api/google-form-submit',

  WEBHOOK_SECRET:
    PropertiesService
      .getScriptProperties()
      .getProperty('GOOGLE_FORM_WEBHOOK_SECRET'),

  FORM_PREFIX:
    'DXN - اختبار الحقيبة التدريبية',

  QUESTIONS_COUNT: 12

};


/* =====================================================
   الأسئلة الـ 12 المعتمدة
===================================================== */

const TRAINING_QUESTIONS = [

  {
    number: 1,
    title: 'ماهي ال4 نصائح للاستفادة القصوى من الحقيبة التدريبية ؟'
  },

  {
    number: 2,
    title: 'ماهي المشاريع الذكية وماهي صفاتها ؟'
  },

  {
    number: 3,
    title: 'ما هو البيع المباشر نظام شركة دي اكس ان وماهي مزاياه ؟'
  },

  {
    number: 4,
    title: 'الفرق بين البيع المباشر والبيع التقليدي ؟'
  },

  {
    number: 5,
    title: 'ماهي عناصر قوة شركة دي اكس ان ؟'
  },

  {
    number: 6,
    title: 'ماهي اصناف منتجات دي اكس ان ؟'
  },

  {
    number: 7,
    title: 'ماهي مميزات العمل مع دي اكس ان ؟'
  },

  {
    number: 8,
    title: 'ماهي طرق الربح من دي اكس ان للاستفادة المالية ؟'
  },

  {
    number: 9,
    title: 'ماهي مميزات منتجات دي اكس ان ؟'
  },

  {
    number: 10,
    title: 'ماهو الفرق بين الPV و الSV ؟'
  },

  {
    number: 11,
    title: 'كيف تصل في الدي اكس ان الى مرتبة النجم ثم الياقوتي ثم الماسي ؟'
  },

  {
    number: 12,
    title: 'ماهي خطوات العمل الاحترافي للنجاح مع دي اكس ان ؟'
  }

];


/* =====================================================
   إنشاء نموذج خاص بسبونسر
===================================================== */

/**
 * الاستخدام:
 *
 * createSponsorTrainingForm('sponsor@gmail.com')
 *
 */

function createSponsorTrainingForm(sponsorEmail) {

  if (!sponsorEmail) {
    throw new Error('يجب إدخال بريد السبونسر.');
  }

  sponsorEmail = sponsorEmail.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorEmail)) {
    throw new Error(
      'بريد السبونسر غير صحيح: ' + sponsorEmail
    );
  }


  /* -----------------------------------------------
     إنشاء النموذج
  ------------------------------------------------ */

  const form = FormApp.create(
    CONFIG.FORM_PREFIX + ' - ' + sponsorEmail
  );
  form.setIsQuiz(true);
  form.setPublishingSummary(false);
  form.setCollectEmail(false);
  form.setShuffleQuestions(false);


  /* -----------------------------------------------
     وصف النموذج
  ------------------------------------------------ */

  form.setDescription(
    'اختبار الحقيبة التدريبية\n\n' +
    'اختر إجابة واحدة صحيحة لكل سؤال من الأسئلة الاثني عشر.\n' +
    'بعد الإرسال اضغط «عرض النتيجة» داخل Google Forms لمعرفة درجتك من 100.\n\n' +
    'هذا النموذج مخصص للعضو الذي حصل على الرابط من السبونسر.'
  );


  /* -----------------------------------------------
     بيانات العضو
  ------------------------------------------------ */

  const memberName = form.addTextItem();

  memberName.setTitle(
    'اسم العضو الكامل'
  );

  memberName.setRequired(true);


  const membershipNumber = form.addTextItem();

  membershipNumber.setTitle(
    'رقم العضوية'
  );

  membershipNumber.setRequired(true);


  /* -----------------------------------------------
     الأسئلة الـ12
  ------------------------------------------------ */

  addRagwanMultipleChoiceItems(form);


  /* -----------------------------------------------
     إعدادات النموذج
  ------------------------------------------------ */

  form.setConfirmationMessage(
    '✅ تم إرسال إجاباتك بنجاح.\n' +
    'اضغط «عرض النتيجة» (View score) داخل Google Forms لمعرفة درجتك من 100.\n' +
    'يستمر إرسال تقرير الإجابات إلى بريد الراعي المعتمد.'
  );


  /* -----------------------------------------------
     حفظ العلاقة:

     Form ID
        ↓
     Sponsor Email
  ------------------------------------------------ */

  const properties =
    PropertiesService.getScriptProperties();


  properties.setProperty(
    'SPONSOR_' + form.getId(),
    sponsorEmail
  );


  properties.setProperty(
    'FORM_CREATED_' + form.getId(),
    new Date().toISOString()
  );


  /* -----------------------------------------------
     إنشاء Trigger
  ------------------------------------------------ */

  ScriptApp.newTrigger(
    'onSponsorTrainingSubmit'
  )
    .forForm(form)
    .onFormSubmit()
    .create();


  /* -----------------------------------------------
     عرض النتيجة
  ------------------------------------------------ */

  Logger.log(
    '=========================================='
  );

  Logger.log(
    'تم إنشاء نموذج السبونسر بنجاح'
  );

  Logger.log(
    '=========================================='
  );

  Logger.log(
    'Sponsor Email: ' + sponsorEmail
  );

  Logger.log(
    'Form ID:'
  );

  Logger.log(
    form.getId()
  );

  Logger.log(
    'رابط النموذج للعضو:'
  );

  Logger.log(
    form.getPublishedUrl()
  );

  Logger.log(
    'رابط تعديل النموذج:'
  );

  Logger.log(
    form.getEditUrl()
  );

  Logger.log(
    '=========================================='
  );


  return {

    success: true,

    formId:
      form.getId(),

    sponsorEmail:
      sponsorEmail,

    memberUrl:
      form.getPublishedUrl(),

    editUrl:
      form.getEditUrl()

  };

}


/* =====================================================
   استقبال إجابات العضو
===================================================== */

function onSponsorTrainingSubmit(e) {

  if (!e || !e.source || !e.response) {

    throw new Error(
      'بيانات إرسال النموذج غير مكتملة.'
    );

  }


  /* -----------------------------------------------
     معرفة Form ID
  ------------------------------------------------ */

  const form =
    e.source;

  const formId =
    form.getId();


  /* -----------------------------------------------
     معرفة Sponsor Email
  ------------------------------------------------ */

  const properties =
    PropertiesService.getScriptProperties();


  const sponsorEmail =
    properties.getProperty(
      'SPONSOR_' + formId
    );


  if (!sponsorEmail) {

    throw new Error(
      'لم يتم العثور على Sponsor Email للنموذج: ' +
      formId
    );

  }


  /* -----------------------------------------------
     قراءة إجابات العضو
  ------------------------------------------------ */

  const response =
    e.response;

  const itemResponses =
    response.getItemResponses();


  const answers = [];

  let memberName = '';

  let membershipNumber = '';


  itemResponses.forEach(
    function(itemResponse) {

      const item =
        itemResponse.getItem();

      const title =
        item.getTitle();

      const answer =
        itemResponse.getResponse();


      if (
        title === 'اسم العضو الكامل'
      ) {

        memberName =
          String(answer || '').trim();

      }

      else if (
        title === 'رقم العضوية'
      ) {

        membershipNumber =
          String(answer || '').trim();

      }

      else {

        answers.push({

          question:
            title,

          answer:
            String(answer || '').trim()

        });

      }

    }
  );


  /* -----------------------------------------------
     التحقق من بيانات العضو
  ------------------------------------------------ */

  if (!memberName) {

    throw new Error(
      'اسم العضو غير موجود.'
    );

  }


  if (!membershipNumber) {

    throw new Error(
      'رقم العضوية غير موجود.'
    );

  }


  if (
    answers.length !==
    CONFIG.QUESTIONS_COUNT
  ) {

    throw new Error(
      'عدد الإجابات المستلمة هو ' +
      answers.length +
      ' بينما المتوقع هو ' +
      CONFIG.QUESTIONS_COUNT
    );

  }


  /* -----------------------------------------------
     تجهيز البيانات
  ------------------------------------------------ */

  // Preserve the approved question sequence even if layout changes.
  const orderByTitle = TRAINING_QUESTIONS.map(function(q) {
    return q.number + ') ' + q.title;
  });
  answers.sort(function(a,b) {
    return orderByTitle.indexOf(a.question) - orderByTitle.indexOf(b.question);
  });

  const payload = {

    source:
      'google_form',

    formId:
      formId,

    sponsorEmail:
      sponsorEmail,

    memberName:
      memberName,

    membershipNumber:
      membershipNumber,

    submittedAt:
      response
        .getTimestamp()
        .toISOString(),

    assessmentMode:
      isRagwanMultipleChoiceQuiz(form) ? 'ragwan_mcq_v1' : 'legacy_essay',

    answers:
      answers

  };


  Logger.log(
    'بيانات الاختبار:'
  );


  Logger.log(
    JSON.stringify(
      payload,
      null,
      2
    )
  );


  /* -----------------------------------------------
     إرسال البيانات إلى Backend
  ------------------------------------------------ */

  if (
    CONFIG.BACKEND_URL
  ) {

    const backendResult =
      sendToBackend(payload);


    /* -------------------------------------------
       إرسال التقرير إلى Sponsor
    -------------------------------------------- */

    if (
      backendResult &&
      backendResult.report
    ) {

      sendSponsorReportEmail(
        sponsorEmail,
        memberName,
        membershipNumber,
        backendResult.report
      );

    }

  }

}


/* =====================================================
   إرسال البيانات إلى موقع DXN
===================================================== */

/* =====================================================
   إرسال البيانات إلى موقع DXN
===================================================== */

function sendToBackend(payload) {

  /* -----------------------------------------------
     قراءة Secret مباشرة وقت الإرسال
     لتجنب استخدام قيمة قديمة محفوظة في CONFIG
  ------------------------------------------------ */

  const webhookSecret = String(
    PropertiesService
      .getScriptProperties()
      .getProperty('GOOGLE_FORM_WEBHOOK_SECRET') || ''
  ).trim();


  if (!webhookSecret) {

    throw new Error(
      'لم يتم العثور على GOOGLE_FORM_WEBHOOK_SECRET في Script Properties.'
    );

  }


  /* -----------------------------------------------
     تجهيز الطلب
  ------------------------------------------------ */

  const requestPayload = Object.assign(
    {},
    payload,
    {
      webhookSecret:
        webhookSecret
    }
  );


  const options = {

    method:
      'post',

    contentType:
      'application/json',

    headers: {

      'x-google-form-secret':
        webhookSecret

    },

    payload:
      JSON.stringify(
        requestPayload
      ),

    muteHttpExceptions:
      true

  };


  Logger.log(
    'إرسال الإجابات إلى Backend...'
  );


  const response =
    UrlFetchApp.fetch(
      CONFIG.BACKEND_URL,
      options
    );


  const statusCode =
    response.getResponseCode();


  const responseText =
    response.getContentText();


  Logger.log(
    'Backend Status: ' +
    statusCode
  );


  Logger.log(
    'Backend Response: ' +
    responseText
  );


  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {

    throw new Error(
      'فشل إرسال بيانات الاختبار إلى الموقع. HTTP ' +
      statusCode +
      ': ' +
      responseText
    );

  }


  /* -----------------------------------------------
     تحويل نتيجة Backend إلى JSON
  ------------------------------------------------ */

  let result;

  try {

    result =
      JSON.parse(
        responseText
      );

  }

  catch (error) {

    throw new Error(
      'استجابة Backend ليست JSON صحيحة: ' +
      responseText
    );

  }


  if (
    result &&
    result.ok === false
  ) {

    throw new Error(
      result.error ||
      'Backend رفض الطلب.'
    );

  }


  Logger.log(
    'تم استلام نتيجة التقييم من الموقع بنجاح.'
  );


  return result;

}



/* =====================================================
   إرسال تقرير النتيجة إلى Sponsor
===================================================== */

function sendSponsorReportEmail(
  sponsorEmail,
  memberName,
  membershipNumber,
  report
) {

  if (!sponsorEmail) {

    throw new Error(
      'لا يوجد بريد Sponsor لإرسال التقرير.'
    );

  }


  const totalScore =
    Number(
      report.totalScore || 0
    );


  const totalQuestions =
    Number(
      report.totalQuestions ||
      CONFIG.QUESTIONS_COUNT
    );


  const approvedCount =
    Number(
      report.approvedCount || 0
    );


  const retryCount =
    Number(
      report.retryCount || 0
    );


  const overallStatus =
    report.overallStatus ===
    'approved'
      ? 'اجتاز الاختبار'
      : 'يحتاج إلى إعادة المحاولة';


  let html = '';

  html +=
    '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;">';


  html +=
    '<h2>تقرير اختبار الحقيبة التدريبية</h2>';


  html +=
    '<p><strong>اسم العضو:</strong> ' +
    escapeHtml(memberName) +
    '</p>';


  html +=
    '<p><strong>رقم العضوية:</strong> ' +
    escapeHtml(membershipNumber) +
    '</p>';


  html +=
    '<hr>';


  html +=
    '<h3>النتيجة العامة</h3>';


  html +=
    '<p><strong>الدرجة:</strong> ' +
    totalScore +
    ' / 100</p>';


  html +=
    '<p><strong>الحالة:</strong> ' +
    overallStatus +
    '</p>';


  html +=
    '<p><strong>الأسئلة المعتمدة:</strong> ' +
    approvedCount +
    ' من ' +
    totalQuestions +
    '</p>';


  html +=
    '<p><strong>الأسئلة التي تحتاج إعادة:</strong> ' +
    retryCount +
    '</p>';


  html +=
    '<hr>';


  html +=
    '<h3>تفاصيل الأسئلة</h3>';


  if (
    Array.isArray(
      report.results
    )
  ) {

    html +=
      '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">';

    html +=
      '<tr>' +
      '<th>السؤال</th>' +
      '<th>الدرجة</th>' +
      '<th>الحالة</th>' +
      '<th>ملاحظة التقييم</th>' +
      '</tr>';


    report.results.forEach(
      function(item) {

        const statusText =
          item.status ===
          'approved'
            ? 'معتمد'
            : 'إعادة المحاولة';


        html +=
          '<tr>' +

          '<td>' +
          escapeHtml(
            item.question || ''
          ) +
          '</td>' +

          '<td>' +
          Number(
            item.score || 0
          ) +
          '/' + Number(item.maxScore || 100) +
          '</td>' +

          '<td>' +
          statusText +
          '</td>' +

          '<td>' +
          escapeHtml(
            item.note || ''
          ) +
          '</td>' +

          '</tr>';

      }
    );


    html +=
      '</table>';

  }


  html +=
    '<br><p>هذا التقرير تم إنشاؤه تلقائيًا بواسطة نظام تدريب DXN.</p>';


  html +=
    '</div>';


  const subject =
    'تقرير اختبار الحقيبة التدريبية - ' +
    memberName;


  MailApp.sendEmail({

    to:
      sponsorEmail,

    subject:
      subject,

    htmlBody:
      html,

    body:
      buildPlainTextReport(
        memberName,
        membershipNumber,
        report
      )

  });


  Logger.log(
    'تم إرسال التقرير إلى: ' +
    sponsorEmail
  );

}


/* =====================================================
   تقرير نصي بديل للبريد
===================================================== */

function buildPlainTextReport(
  memberName,
  membershipNumber,
  report
) {

  let text = '';

  text +=
    'تقرير اختبار الحقيبة التدريبية\n\n';


  text +=
    'اسم العضو: ' +
    memberName +
    '\n';


  text +=
    'رقم العضوية: ' +
    membershipNumber +
    '\n\n';


  text +=
    'الدرجة: ' +
    Number(
      report.totalScore || 0
    ) +
    ' / 100\n';


  text +=
    'الأسئلة المعتمدة: ' +
    Number(
      report.approvedCount || 0
    ) +
    '\n';


  text +=
    'الأسئلة التي تحتاج إعادة: ' +
    Number(
      report.retryCount || 0
    ) +
    '\n\n';


  if (
    Array.isArray(
      report.results
    )
  ) {

    report.results.forEach(
      function(item) {

        text +=
          '--------------------------------\n';

        text +=
          'السؤال ' +
          item.questionNo +
          '\n';

        text +=
          'الدرجة: ' +
          Number(
            item.score || 0
          ) +
          '/' + Number(item.maxScore || 100) + '\n';

        text +=
          'الحالة: ' +
          (
            item.status ===
            'approved'
              ? 'معتمد'
              : 'إعادة المحاولة'
          ) +
          '\n';

        text +=
          'الملاحظة: ' +
          (item.note || '') +
          '\n';

      }
    );

  }


  return text;

}


/* =====================================================
   حماية النصوص عند إنشاء HTML
===================================================== */

function escapeHtml(value) {

  return String(
    value == null
      ? ''
      : value
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );

}


/* =====================================================
   معرفة بيانات نموذج معين
===================================================== */

function getSponsorFormInfo(formId) {

  if (!formId) {

    throw new Error(
      'يجب إدخال Form ID.'
    );

  }


  const properties =
    PropertiesService
      .getScriptProperties();


  const sponsorEmail =
    properties.getProperty(
      'SPONSOR_' + formId
    );


  if (!sponsorEmail) {

    return {

      found:
        false,

      formId:
        formId

    };

  }


  const form =
    FormApp.openById(
      formId
    );


  return {

    found:
      true,

    formId:
      formId,

    sponsorEmail:
      sponsorEmail,

    memberUrl:
      form.getPublishedUrl(),

    editUrl:
      form.getEditUrl()

  };

}


/* =====================================================
   اختبار إنشاء نموذج
===================================================== */

/**
 * مهم:
 * هذه الدالة تنشئ نموذجًا جديدًا.
 *
 * لا تشغّلها الآن لأن لدينا نموذجًا موجودًا بالفعل.
 */

function testCreateSponsorForm() {

  const sponsorEmail =
    'waeldxn11@gmail.com';


  const result =
    createSponsorTrainingForm(
      sponsorEmail
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}


/* =====================================================
   فحص إعدادات الربط
===================================================== */

function checkBackendConfiguration() {

  const properties =
    PropertiesService
      .getScriptProperties();


  const secret =
    properties.getProperty(
      'GOOGLE_FORM_WEBHOOK_SECRET'
    );


  Logger.log(
    '=========================================='
  );


  Logger.log(
    'Backend URL:'
  );


  Logger.log(
    CONFIG.BACKEND_URL
  );


  Logger.log(
    'Webhook Secret موجود: ' +
    (
      secret
        ? 'YES'
        : 'NO'
    )
  );


  Logger.log(
    'عدد الأسئلة: ' +
    TRAINING_QUESTIONS.length
  );


  Logger.log(
    '=========================================='
  );


  if (!secret) {

    throw new Error(
      'GOOGLE_FORM_WEBHOOK_SECRET غير موجود في Script Properties.'
    );

  }


  return {

    backendUrl:
      CONFIG.BACKEND_URL,

    secretConfigured:
      true,

    questionsCount:
      TRAINING_QUESTIONS.length

  };

}


/* =====================================================
   عرض جميع روابط النماذج الموجودة
===================================================== */

function listSponsorForms() {

  const properties =
    PropertiesService
      .getScriptProperties();


  const all =
    properties.getProperties();


  const forms = [];


  Object.keys(all)
    .forEach(
      function(key) {

        if (
          key.indexOf(
            'SPONSOR_'
          ) === 0
        ) {

          const formId =
            key.replace(
              'SPONSOR_',
              ''
            );


          try {

            const form =
              FormApp.openById(
                formId
              );


            forms.push({

              formId:
                formId,

              sponsorEmail:
                all[key],

              memberUrl:
                form.getPublishedUrl(),

              editUrl:
                form.getEditUrl()

            });

          }

          catch (error) {

            Logger.log(
              'تعذر فتح النموذج: ' +
              formId
            );

          }

        }

      }
    );


  Logger.log(
    JSON.stringify(
      forms,
      null,
      2
    )
  );


  return forms;

}


/* =====================================================
   اختبار معرفة بيانات Sponsor Form
===================================================== */

function testGetSponsorFormInfo() {

  const props =
    PropertiesService.getScriptProperties();

  const all =
    props.getProperties();


  const key =
    Object.keys(all)
      .find(
        function(k) {
          return k.indexOf('FORM_CREATED_') === 0;
        }
      );


  if (!key) {

    throw new Error(
      'لم يتم العثور على Form ID محفوظ في Script Properties.'
    );

  }


  const formId =
    key.replace(
      'FORM_CREATED_',
      ''
    );


  Logger.log(
    'Form ID: ' +
    formId
  );


  const result =
    getSponsorFormInfo(
      formId
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}


/* =====================================================
   فحص Webhook Secret
===================================================== */

function diagnoseWebhookSecret() {

  const secret =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'GOOGLE_FORM_WEBHOOK_SECRET'
      ) || '';


  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      secret,
      Utilities.Charset.UTF_8
    );


  const hash =
    bytes
      .map(
        function(b) {

          const v =
            b < 0
              ? b + 256
              : b;

          return (
            '0' +
            v.toString(16)
          ).slice(-2);

        }
      )
      .join('');


  Logger.log(
    'Secret configured: ' +
    (
      secret.length > 0
    )
  );

  Logger.log(
    'Secret length: ' +
    secret.length
  );

  Logger.log(
    'Secret SHA-256: ' +
    hash
  );

}


/* =====================================================
   Web App Bridge
===================================================== */

/**
 * الوظيفة:
 *
 * 1) يستقبل بريد Sponsor من الموقع.
 * 2) يستقبل اسم العضو من حسابه.
 * 3) يستقبل رقم عضوية العضو من حسابه.
 * 4) يبحث عن نموذج Sponsor المرتبط بالبريد.
 * 5) إذا لم يوجد النموذج، ينشئه.
 * 6) ينشئ رابط Google Form مملوءًا تلقائيًا ببيانات العضو.
 *
 * الاستدعاء:
 *
 * ?action=sponsor_form
 * &email=sponsor@example.com
 * &memberName=اسم العضو
 * &membershipNumber=123456
 */

function doGet(e) {

  try {

    const params =
      (e && e.parameter) || {};


    const action =
      String(
        params.action || ''
      ).trim();


    /* -----------------------------------------------
       فحص Web App
    ------------------------------------------------ */

    if (
      action === 'health'
    ) {

      return jsonOutput({

        ok:
          true,

        service:
          'DXN Google Forms Bridge',

        version:
          '3.0'

      });

    }


    /* -----------------------------------------------
       التحقق من نوع الطلب
    ------------------------------------------------ */

    if (
      action !== 'sponsor_form'
    ) {

      return jsonOutput({

        ok:
          false,

        error:
          'الإجراء غير مدعوم.'

      });

    }


    /* -----------------------------------------------
       قراءة البيانات القادمة من الموقع
    ------------------------------------------------ */

    const sponsorEmail =
      String(
        params.email || ''
      )
        .trim()
        .toLowerCase();


    const memberName =
      String(
        params.memberName || ''
      )
        .trim();


    const membershipNumber =
      String(
        params.membershipNumber || ''
      )
        .trim();


    /* -----------------------------------------------
       التحقق من بريد Sponsor
    ------------------------------------------------ */

    if (!sponsorEmail) {

      return jsonOutput({

        ok:
          false,

        error:
          'لم يتم إرسال بريد Sponsor.'

      });

    }


    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        sponsorEmail
      )
    ) {

      return jsonOutput({

        ok:
          false,

        error:
          'بريد Sponsor غير صحيح.'

      });

    }


    /* -----------------------------------------------
       التحقق من اسم العضو
    ------------------------------------------------ */

    if (!memberName) {

      return jsonOutput({

        ok:
          false,

        error:
          'اسم العضو غير موجود في الطلب.'

      });

    }


    /* -----------------------------------------------
       التحقق من رقم العضوية
       الرقم هنا للتسجيل فقط.
       مصدره حساب العضو في الموقع.
    ------------------------------------------------ */

    if (!membershipNumber) {

      return jsonOutput({

        ok:
          false,

        error:
          'رقم عضوية العضو غير موجود في الطلب.'

      });

    }


    /* -----------------------------------------------
       البحث عن نموذج Sponsor الموجود
    ------------------------------------------------ */

    let form =
      findSponsorFormByEmail(
        sponsorEmail
      );


    /* -----------------------------------------------
       إذا لم يوجد النموذج يتم إنشاء نموذج واحد
    ------------------------------------------------ */

    if (!form) {

      const created =
        createSponsorTrainingForm(
          sponsorEmail
        );


      form =
        FormApp.openById(
          created.formId
        );

    }


    /* -----------------------------------------------
       إنشاء رابط Google Form مملوء تلقائيًا
    ------------------------------------------------ */

    const prefilledUrl =
      createMemberPrefilledUrl(
        form,
        memberName,
        membershipNumber
      );


    /* -----------------------------------------------
       إعادة البيانات إلى الموقع
    ------------------------------------------------ */

    return jsonOutput({

      ok:
        true,

      formId:
        form.getId(),

      sponsorEmail:
        sponsorEmail,

      memberName:
        memberName,

      membershipNumber:
        membershipNumber,

      memberUrl:
        prefilledUrl,

      prefilledUrl:
        prefilledUrl

    });

  }

  catch (error) {

    Logger.log(
      'Web App Bridge Error: ' +
      (
        error &&
        error.stack
          ? error.stack
          : error
      )
    );


    return jsonOutput({

      ok:
        false,

      error:
        (
          error &&
          error.message
        )
          ? error.message
          : String(error)

    });

  }

}


/* =====================================================
   البحث عن نموذج Sponsor بواسطة البريد
===================================================== */

function findSponsorFormByEmail(
  sponsorEmail
) {

  const properties =
    PropertiesService
      .getScriptProperties();


  const all =
    properties.getProperties();


  const normalizedEmail =
    String(
      sponsorEmail || ''
    )
      .trim()
      .toLowerCase();


  const keys =
    Object.keys(all)
      .filter(
        function(key) {

          return (
            key.indexOf(
              'SPONSOR_'
            ) === 0
          );

        }
      );


  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    const key =
      keys[i];


    const savedEmail =
      String(
        all[key] || ''
      )
        .trim()
        .toLowerCase();


    if (
      savedEmail !==
      normalizedEmail
    ) {

      continue;

    }


    const formId =
      key.replace(
        'SPONSOR_',
        ''
      );


    try {

      return FormApp.openById(
        formId
      );

    }

    catch (error) {

      Logger.log(
        'تعذر فتح النموذج المرتبط بـ ' +
        sponsorEmail +
        ': ' +
        formId
      );

    }

  }


  return null;

}


/* =====================================================
   إنشاء رابط Google Form مملوء تلقائيًا
===================================================== */

function createMemberPrefilledUrl(
  form,
  memberName,
  membershipNumber
) {

  if (!form) {

    throw new Error(
      'لم يتم العثور على نموذج Google Form.'
    );

  }


  const items =
    form.getItems();


  let nameItem =
    null;


  let numberItem =
    null;


  items.forEach(
    function(item) {

      const title =
        String(
          item.getTitle() || ''
        ).trim();


      if (
        title ===
        'اسم العضو الكامل'
      ) {

        nameItem =
          item;

      }


      if (
        title ===
        'رقم العضوية'
      ) {

        numberItem =
          item;

      }

    }
  );


  if (!nameItem) {

    throw new Error(
      'حقل "اسم العضو الكامل" غير موجود في نموذج Sponsor.'
    );

  }


  if (!numberItem) {

    throw new Error(
      'حقل "رقم العضوية" غير موجود في نموذج Sponsor.'
    );

  }


  const response =
    form.createResponse();


  response.withItemResponse(

    nameItem
      .asTextItem()
      .createResponse(
        memberName
      )

  );


  response.withItemResponse(

    numberItem
      .asTextItem()
      .createResponse(
        membershipNumber
      )

  );


  return response.toPrefilledUrl();

}


/* =====================================================
   إخراج JSON للـ Web App
===================================================== */

function jsonOutput(data) {

  return ContentService

    .createTextOutput(
      JSON.stringify(data)
    )

    .setMimeType(
      ContentService.MimeType.JSON
    );

}