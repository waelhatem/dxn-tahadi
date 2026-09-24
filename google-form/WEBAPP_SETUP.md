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
البريد + بيانات العضو المسجل دخوله → Apps Script → النموذج الخاص بالسبونسر → رابط اختبار مُعبّأ مسبقًا.

في حساب العضو، يُعبّأ اسم العضو ورقم عضويته تلقائيًا في رابط Google Form. رقم العضوية هنا للتسجيل في سجل الاختبار فقط، بينما Sponsor Email يُعرف من Form ID الخاص بالسبونسر.

القائد يستطيع استخدام الرابط العادي للاختبار التجريبي؛ عند عدم إرسال بيانات عضو لا يتم إنشاء prefill للهوية.
