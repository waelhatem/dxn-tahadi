# تعديل Code.gs — تأكيد حفظ اختبار Google Form

هذا التعديل يضيف تحققًا نهائيًا داخل Apps Script حتى لا يُرسل تقرير البريد الإلكتروني إلا بعد تأكيد أن Vercel/Supabase أعادا رقم سجل محفوظ، وأن الهوية تطابق النموذج والعضو.

## استبدل كتلة onSponsorTrainingSubmit الحالية بعد sendToBackend

ابحث عن:

```js
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
```

واستبدلها بـ:

```js
    const backendResult =
      sendToBackend(payload);

    /* -------------------------------------------
       تأكيد الحفظ والهوية قبل إرسال البريد
    -------------------------------------------- */

    if (
      !backendResult ||
      backendResult.ok !== true ||
      !backendResult.submissionId
    ) {
      throw new Error(
        'تم إرسال الاختبار للتقييم لكن لم يتم تأكيد حفظه في سجل الموقع.'
      );
    }

    if (
      String(backendResult.formId || '').trim() !== String(formId).trim()
    ) {
      throw new Error(
        'عدم تطابق Form ID بين Google Form وسجل الموقع.'
      );
    }

    if (
      String(backendResult.membershipNumber || '').trim().replace(/[\\s-]+/g, '') !==
      String(membershipNumber).trim().replace(/[\\s-]+/g, '')
    ) {
      throw new Error(
        'عدم تطابق رقم عضوية العضو بين Google Form وسجل الموقع.'
      );
    }

    Logger.log(
      'تم حفظ اختبار العضو بنجاح. Submission ID: ' +
      backendResult.submissionId
    );

    /* -------------------------------------------
       إرسال التقرير إلى Sponsor بعد تأكيد الحفظ
    -------------------------------------------- */

    if (backendResult.report) {
      sendSponsorReportEmail(
        sponsorEmail,
        memberName,
        membershipNumber,
        backendResult.report
      );
    }
```

## النتيجة

يبقى التسلسل الصحيح:

Form ID
→ Sponsor Email المحفوظ داخليًا
→ اسم العضو الجديد
→ رقم عضوية العضو الجديد
→ إجابات العضو
→ Vercel
→ Supabase
→ تأكيد Submission ID
→ إرسال التقرير إلى Sponsor

ولا يتم استخدام حساب القائد أو رقم عضوية القائد لتحديد هوية الاختبار.
