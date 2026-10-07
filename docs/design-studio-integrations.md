# استوديو التصميم — المحركات الخارجية والتراخيص

التراخيص مأخوذة من GitHub API ومن ملف LICENSE للمشروع بتاريخ 2026-10-08. يجب إعادة التحقق قبل أي دمج كود.

| الأداة | الغرض | الترخيص | استراتيجية الدمج | متطلبات النشر | GPU | الاستضافة المقترحة | الحالة |
|---|---|---|---|---|---|---|---|
| ComfyUI (Comfy-Org/ComfyUI) | محرك سير عمل الصور بالذكاء الاصطناعي | GPL-3.0 | خدمة منفصلة عبر API (Worker) — لا نسخ كود | خادم Python + نماذج | نعم | RunPod / Modal / خادم GPU خاص | محوّل جاهز (`ComfyUIAdapter`) — غير مفعّل |
| Remotion (remotion-dev/remotion) | تصيير فيديو من قوالب React | Remotion License: مجاني للأفراد والشركات الصغيرة، ترخيص شركة مطلوب لما فوق ذلك | Worker منفصل يستخدم Remotion Renderer | Node + Chromium + FFmpeg | لا (CPU) | Remotion Lambda / خادم Node | محوّل جاهز — يحتاج مراجعة الترخيص التجاري |
| HyperFrames (heygen-com/hyperframes) | قوالب فيديو HTML | Apache-2.0 | Worker منفصل أو مكتبة داخل Worker | Node/متصفح بلا واجهة | لا | خادم Node | محوّل جاهز — غير مفعّل |
| WhisperX (m-bain/whisperX) | تحويل الكلام إلى نص + مزامنة الكلمات | BSD-2-Clause | Worker منفصل (Python) | Python + PyTorch + FFmpeg | يُفضّل | Modal / RunPod | محوّل جاهز — غير مفعّل |
| PyVideoTrans (jianchang512/pyvideotrans) | ترجمة ودبلجة الفيديو | GPL-3.0 | خدمة منفصلة عبر API فقط — لا نسخ كود | Python + FFmpeg + نماذج صوت | يُفضّل | خادم GPU | محوّل جاهز — غير مفعّل |
| OpenShorts (faris-sait/openshorts) | تحويل الفيديو الطويل لمقاطع قصيرة | MIT | Worker منفصل (Docker) | Docker + FFmpeg | يُفضّل | خادم GPU / Docker | محوّل جاهز — غير مفعّل |
| Postiz (gitroomhq/postiz-app) | النشر والجدولة على المنصات | AGPL-3.0 | خدمة مستقلة عبر API فقط — **لا نسخ كود** | Docker + PostgreSQL + Redis | لا | خادم مستقل | محوّل جاهز — غير مفعّل |
| OpenCreator (krillinai/OpenCreator) | مرجع معماري لصناعة المحتوى | Apache-2.0 | مرجع فقط | — | — | — | لم يُدمج |
| MoneyPrinterTurbo (harry0703/MoneyPrinterTurbo) | توليد فيديو قصير من نص | MIT | مرجع / Worker مستقبلي | Python + FFmpeg | لا | خادم Python | لم يُدمج |
| NarratoAI (linyqh/NarratoAI) | تعليق صوتي وسرد للفيديو | MIT | مرجع / Worker مستقبلي | Python + FFmpeg | يُفضّل | خادم GPU | لم يُدمج |

## ملاحظات التراخيص
- **AGPL-3.0 (Postiz):** تعديل الكود وتشغيله كخدمة عبر الشبكة يُلزم بنشر الكود المعدّل. لذلك يُستخدم Postiz فقط كخدمة مستقلة غير معدّلة يتصل بها الموقع عبر API، ولا يُنسخ أي جزء منه داخل المشروع.
- **GPL-3.0 (ComfyUI, PyVideoTrans):** لا يُنسخ الكود داخل المشروع. التشغيل كخدمة منفصلة عبر API لا يجعل كود الموقع عملًا مشتقًا.
- **Remotion:** ليس ترخيصًا مفتوحًا تقليديًا؛ الاستخدام المجاني مشروط بحجم الجهة. يجب تحديد حجم الجهة قبل التفعيل في الإنتاج.
- **MIT / Apache-2.0 / BSD-2:** متساهلة، مع الالتزام بإشعارات الترخيص عند أي استخدام للكود.
- لم يُنسخ أي كود من هذه المشاريع في Phase 1.

## تفعيل محرك
1. شغّل Worker يتبع بروتوكول `api/_design/engines.js` (`POST /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`).
2. اضبط في Vercel: عنوان HTTPS والمفتاح (مثل `COMFYUI_URL`, `COMFYUI_API_KEY`).
3. اختر المحرك: `DESIGN_IMAGE_PROVIDER=comfyui` (وبالمثل `DESIGN_VIDEO_PROVIDER`, `DESIGN_SPEECH_PROVIDER`, `DESIGN_TRANSLATION_PROVIDER`, `DESIGN_SHORTS_PROVIDER`, `DESIGN_PUBLISHING_PROVIDER`).
4. لا تغيير في الواجهة: `config.providers` يُقرأ من `/api/design-studio` تلقائيًا.