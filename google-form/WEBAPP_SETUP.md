# ربط اختبار الباب الرابع مع Google Apps Script

## 1) داخل مشروع Apps Script الحالي
أضف محتوى الملف:
google-form/apps-script-webapp-bridge.gs

ويجب أن يكون نفس المشروع الذي يحتوي أصلًا على:
- createSponsorTrainingForm(sponsorEmail)
- خصائص SPONSOR_<formId>

## 2) انشر المشروع كـ Web App
Deploy → New deployment → Web app

الإعدادات:
- Execute as: Me
- Who has access: Anyone

انسخ رابط Web App الذي ينتهي بـ /exec.

## 3) في Vercel
أضف Environment Variable:

Name:
GOOGLE_SPONSOR_FORM_WEBAPP_URL

Value:
رابط Web App المنتهي بـ /exec

ثم أعد النشر.

بعدها زر «✅ اعتماد الإيميل» في الباب الرابع يستخدم:
البريد → Apps Script → النموذج الخاص بالسبونسر → رابط الاختبار.

العضو لا يحتاج إلى كتابة بريد السبونسر داخل النموذج.
