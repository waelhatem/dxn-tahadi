# استوديو التصميم — المعمارية

```
Frontend (app/index.html)
  └─ design-studio-loader.js            ← الملف الوحيد الذي يُحمَّل مع الصفحة (صغير)
       └─ import('design-studio/index.mjs') عند فتح التبويب فقط
            ├─ views/*        واجهات الأقسام (تُحمَّل عند فتح القسم)
            ├─ core/          dom · files (MIME + توقيع الملف) · jobs · projects · api
            ├─ engines/index  Service Layer: imageEngine · videoEngine · speechEngine · translationEngine · shortsEngine · contentEngine · publishingEngine
            │    ├─ local/*   المعالجة داخل المتصفح (Phase 1)
            │    └─ remote    محولات: ComfyUI · Remotion · HyperFrames · WhisperX · PyVideoTrans · OpenShorts · Postiz
            └─ templates      نظام القوالب
Vercel
  └─ api/design-studio.js   ← التحقق من الجلسة + config + submit/status/cancel (Job control فقط)
       └─ api/_design/engines.js  ← محولات الخادم (العناوين والمفاتيح من متغيرات البيئة)
External Compute (Phase 2)
  └─ Workers: GPU / FFmpeg / WhisperX / ComfyUI / Remotion …
Supabase
  └─ قاعدة البيانات + Storage (bucket خاص design-studio) + حالة المهام — ملف الهجرة للمراجعة فقط
```

## المبادئ
- الواجهة لا تعرف المحرك: `getProvider(engine)` يختار `local` أو محولًا خارجيًا.
- لا مفاتيح ولا عناوين محركات في المتصفح؛ الخادم يرسل فقط أسماء المحركات المفعلة.
- معرّف المهمة الخارجية موقّع (HMAC) بهوية المستخدم؛ لا يمكن متابعة أو إلغاء مهمة مستخدم آخر.
- كل عملية = مهمة (`queued → processing → completed | failed | cancelled`) مع تقدم وإلغاء وإعادة محاولة ومهلة.
- لا يُحمَّل أي كود للاستوديو في الصفحة الرئيسية؛ والمحركات المحلية تُحمَّل عند طلب الأداة.

## مفاتيح التشغيل
`DESIGN_STUDIO_ENABLED`, `DESIGN_IMAGE_ENABLED`, `DESIGN_VIDEO_ENABLED`, `DESIGN_AUDIO_ENABLED`, `DESIGN_SHORTS_ENABLED`, `DESIGN_CONTENT_ENABLED`, `DESIGN_PUBLISHING_ENABLED`, `DESIGN_STUDIO_MOCK_MODE`
القيم الافتراضية في `app/design-studio/config.mjs`، ويمكن تغييرها من متغيرات بيئة Vercel بنفس الأسماء (`true`/`false`).

## المعالجة المحلية (Phase 1)
- الصور وتصميم المنتج: معالجة حقيقية عبر Canvas (تحسين، دقة، إضاءة، ألوان، خلفيات، مقاسات، خلفيات المنتج مع حماية المنتج).
- الفيديو: فيديو حقيقي من الصور عبر MediaRecorder (WebM/MP4 حسب المتصفح).
- الترجمات: محرر وتصدير SRT/VTT حقيقيان.
- تحويل الكلام إلى نص، الترجمة، واقتراح المقاطع: نتائج عيّنة مع وسم «معاينة تجريبية» حتى تفعيل المحركات.
- الأدوات التوليدية (إزالة/إضافة عناصر، الدبلجة، القص التلقائي، النشر الفعلي) تظهر بوسم «قريبًا».

## التخزين
- Phase 1: المشاريع في IndexedDB على جهاز المستخدم، قاعدة منفصلة لكل مستخدم.
- Phase 2: `supabase/migrations/20261008090000_design_studio_projects.sql` (للمراجعة) + bucket خاص `design-studio/{user}/{project}/{source|generated|exports|thumbnails}`.

## ملاحظة التخزين المؤقت
`?v=` يُرفع في `app/index.html` للمحمّل و`VERSION` داخل المحمّل للوحدات؛ وحدات ES الداخلية تُستورد بدون `?v=` لذا يجب رفع `VERSION` عند أي تعديل.