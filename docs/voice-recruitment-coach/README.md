# 🎙️ مدرب الاستقطاب الصوتي

محاكاة تدريبية داخل نافذة المدرب وائل حاتم. لا اتصالات حقيقية ولا أرقام هواتف.

## المسار
صوت العضو → `/api/ai-agent-voice` (transcribe، OpenAI) → `/api/recruitment-coach` (turn/coach/evaluate) → الرد النصي → `speak` → `api/_voice-providers.js` (MiniMax، والاحتياطي OpenAI) → صوت mp3 بالبث.

## الملفات
| الملف | الدور |
|---|---|
| `recruitment-coach.js` | الواجهة (يُحمَّل من `app/index.html`) |
| `api/recruitment-coach.js` | الـendpoint |
| `api/_recruitment-coach-core.js` | الشخصيات، الأهداف، المستويات، التعليمات، التقييم |
| `api/_voice-providers.js` | طبقة مزوّدي الصوت: MiniMax ثم OpenAI |
| `progress-schema.draft.sql` | مسودة جدول التقدم للمرحلة الثانية (لا تُطبَّق الآن) |

## متغيرات بيئة Vercel (Preview أولًا)
| المتغير | إلزامي | الوصف |
|---|---|---|
| `MINIMAX_API_KEY` | نعم لاستخدام MiniMax | من MiniMax: Account Management > API Keys |
| `MINIMAX_COACH_VOICE_ID` | لصوت وائل حاتم | الـvoice_id الناتج عن `POST /v1/voice_clone` |
| `MINIMAX_API_HOST` | لا | الافتراضي `https://api.minimax.io`، والبديل `https://api-uw.minimax.io` |
| `MINIMAX_GROUP_ID` | لا | للحسابات التي ما زالت تتطلبه كـ query parameter |
| `MINIMAX_TTS_MODEL` | لا | الافتراضي `speech-2.8-turbo` |
| `MINIMAX_PERSONA_VOICES` | لا | JSON: `[{"key":"m4","gender":"male","voice_id":"...","pitch":0,"speed":1}]` |
| `VOICE_PROVIDER` | لا | `minimax` (الافتراضي) أو `openai` |
| `VOICE_SIGNING_SECRET` | لا | مفتاح توقيع النص المنطوق؛ الافتراضي مشتق من `SUPABASE_SECRET_KEY` |

بدون `MINIMAX_API_KEY` تعمل الميزة بصوت OpenAI الاحتياطي. وبدون `MINIMAX_COACH_VOICE_ID` يظهر في وضع المدرب: «صوت المدرب وائل حاتم لم يتم تفعيله بعد» ويُستخدم صوت تجريبي مؤقت.

## الأمان والخصوصية
- المتصفح لا يرى أي مفتاح أو voice_id: يرسل الدور (`coach`/`persona`) ومفتاح صوت من الكتالوج (`m1`…`f3`) فقط.
- `speak` لا يقبل إلا نصًا أنتجه الخادم وموقّعًا بـHMAC لمدة 30 دقيقة، فلا يمكن جعل صوت وائل حاتم المستنسخ ينطق نصًا عشوائيًا.
- تسجيل المتدرب يُرسل للتفريغ فقط ولا يُحفظ. التقدم (بدون صوت أو نص المحادثة) يُحفظ على الجهاز فقط في هذه المرحلة.
- MiniMax يحذف الصوت المستنسخ إذا لم يُستخدم 7 أيام.

## الترقية لاحقًا
- WebSocket ثنائي الاتجاه (`/ws/v1/t2a_v2_bidi`) يقلل زمن الانتظار أكثر، لكنه يحتاج خادمًا يدعم WebSocket (ليس Vercel Functions). طبقة المزوّد جاهزة لإضافة مزوّد جديد.
- مكتبة سيناريوهات على الخادم يمكنها تحديد مفتاح صوت لكل شخصية من نفس الكتالوج.
