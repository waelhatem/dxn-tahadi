# نسخة احتياطية مجانية قبل دمج التدريبات الأساسية

## أين نحن؟
- قاعدة البيانات الحالية هي `DXN Tahadi` على Supabase **Free**؛ لا فرع مدفوع ولا مشروع جديد.
- المستخدم وافق على تجهيز النسخة الاحتياطية. **لم يُنفّذ تصدير كامل من داخل جلسة ChatGPT**؛ أدوات Supabase المتاحة هنا لا تقدم تصدير ملفات `pg_dump`، ولا توجد بيانات اتصال PostgreSQL أو برنامج `pg_dump` في بيئة التنفيذ.
- لذا أُعدّ سكربت Windows مجاني: `scripts/backup-supabase-free.ps1`، يجب تشغيله من حاسوب مالك القاعدة فقط؛ لا يرسل كلمات مرور ولا يكتب على قاعدة البيانات.

## خطوات مجانية على Windows
1. ثبّت أدوات PostgreSQL المجانية (يجب أن يتوفر `pg_dump` و`pg_restore` من PowerShell)، دون أي شراء.
2. افتح لوحة Supabase لمشروع DXN Tahadi ثم **Connect**، وحدد بيانات **Session pooler** إذا لم يدعم اتصالك IPv6. احصل من هناك على host وport وusername وdatabase name. **لا ترسل معلومات الدخول أو كلمة مرور القاعدة إلى ChatGPT أو GitHub**.
3. على جهازك افتح PowerShell داخل مجلد المستودع وشغّل:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-supabase-free.ps1
   ```
4. أدخل host، port، user، database name، ثم كلمة مرور قاعدة البيانات عند الطلب المخفي.
5. يُحفظ الناتج داخل `Documents\DXN-Private-Backups`: ملف `.dump` وملف `.manifest.json` يحتوي الحجم وSHA256 من دون أي أسرار.
6. يجب أن تظهر رسالة نجاح بعد قراءة أرشيف النسخة بواسطة `pg_restore --list`. **فحص القائمة ليس اختبار استعادة شاملًا.** الأفضل اختبار الاستعادة إلى PostgreSQL محلي معزول قبل الاعتماد النهائي.
7. احتفظ بالنسخ خارج المستودع والمجلدات المنشورة. استمر في نسخ ملفات Supabase Storage منفصلة إذا كان مطلوبًا استرجاع الصور والمرفقات؛ `pg_dump` لا يحفظ الملفات الثنائية في Storage.

## ملاحظات مهمة
- السكربت يصدر كائنات قاعدة البيانات التي يمكن لحساب PostgreSQL الاتصال بها؛ إن كانت أذوناته ناقصة فلا تُعتمد نسخة غير مكتملة.
- لم يُستعمل `service_role` الخاص بواجهة Supabase كبديل عن بيانات اتصال PostgreSQL. مفتاح API لا يصلح مباشرة لتشغيل `pg_dump`.
- لا نضع ملف `.dump` في GitHub أو الدردشة.
- مراجع Supabase: https://supabase.com/docs/guides/platform/backups و https://supabase.com/docs/guides/self-hosting/restore-from-platform

## اعتماد مرحلة النسخ الاحتياطي
يُعدّ الملف `.dump` موجودًا فقط بعد قيام صاحب المشروع بتشغيل السكربت وتأكيد النجاح على جهازه. حتى ذلك الحين يبقى طلب السحب Draft وغير قابل للدمج النهائي.
