/* استوديو التصميم — الإعدادات المركزية: مفاتيح التشغيل، حدود الملفات، المقاسات، المحركات، والرسائل.
   لا توجد هنا أي مفاتيح API أو عناوين خوادم؛ هذه تبقى في متغيرات بيئة الخادم فقط. */

/* مفاتيح التشغيل (Feature Flags). يمكن للخادم تعديلها عبر /api/design-studio?action=config
   دون حذف أي كود. DESIGN_STUDIO_MOCK_MODE يعني استخدام المعالجة المحلية/التجريبية. */
export const FLAGS = Object.freeze({
  DESIGN_STUDIO_ENABLED: true,
  DESIGN_IMAGE_ENABLED: true,
  DESIGN_VIDEO_ENABLED: true,
  DESIGN_AUDIO_ENABLED: true,
  DESIGN_SHORTS_ENABLED: true,
  DESIGN_CONTENT_ENABLED: true,
  DESIGN_PUBLISHING_ENABLED: true,
  DESIGN_STUDIO_MOCK_MODE: true
});

let flags = { ...FLAGS };
export function getFlags() { return flags; }
export function isEnabled(name) { return flags[name] !== false; }

/* المحرك المستخدم لكل وحدة. 'local' = المعالجة داخل المتصفح (Phase 1).
   تُغيَّر من الخادم فقط عند تركيب محرك حقيقي، فلا تتغير الواجهة. */
export const DEFAULT_PROVIDERS = Object.freeze({
  image: 'local',
  video: 'local',
  speech: 'local',
  translation: 'local',
  shorts: 'local',
  content: 'local',
  publishing: 'local'
});
let providers = { ...DEFAULT_PROVIDERS };
let capabilities = { image: { openai: false, fal: false }, video: { fal: false } };
export function getProvider(engine) { return providers[engine] || 'local'; }
export function getCapabilities() { return capabilities; }
export function hasCapability(engine, provider) {
  return !!(capabilities && capabilities[engine] && capabilities[engine][provider]);
}

/* يطبّق إعدادات الخادم (مفاتيح تشغيل + المحركات المُعدّة). القيم غير المعروفة تُتجاهل. */
export function applyServerConfig(config) {
  if (!config || typeof config !== 'object') return;
  if (config.flags && typeof config.flags === 'object') {
    const next = { ...flags };
    for (const key of Object.keys(FLAGS)) {
      if (typeof config.flags[key] === 'boolean') next[key] = config.flags[key];
    }
    flags = next;
  }
  if (config.providers && typeof config.providers === 'object') {
    const next = { ...providers };
    for (const key of Object.keys(DEFAULT_PROVIDERS)) {
      if (typeof config.providers[key] === 'string' && config.providers[key]) next[key] = config.providers[key];
    }
    providers = next;
  }
  if (config.capabilities && typeof config.capabilities === 'object') {
    capabilities = {
      image: {
        openai: !!(config.capabilities.image && config.capabilities.image.openai),
        fal: !!(config.capabilities.image && config.capabilities.image.fal)
      },
      video: { fal: !!(config.capabilities.video && config.capabilities.video.fal) }
    };
  }
}
export function resetConfig() {
  flags = { ...FLAGS };
  providers = { ...DEFAULT_PROVIDERS };
  capabilities = { image: { openai: false, fal: false }, video: { fal: false } };
}

const MB = 1024 * 1024;
/* حدود الملفات قابلة للتعديل من هنا. يُتحقق من نوع MIME ومن توقيع الملف نفسه وليس الامتداد فقط. */
export const FILE_RULES = Object.freeze({
  image: { label: 'صورة', mime: ['image/jpeg', 'image/png', 'image/webp'], ext: ['jpg', 'jpeg', 'png', 'webp'], maxBytes: 15 * MB },
  video: { label: 'فيديو', mime: ['video/mp4', 'video/quicktime', 'video/webm'], ext: ['mp4', 'mov', 'webm'], maxBytes: 300 * MB },
  audio: { label: 'ملف صوت', mime: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'], ext: ['mp3', 'wav', 'm4a'], maxBytes: 100 * MB }
});

/* أقصى أبعاد للصور الناتجة محليًا حتى لا يتجمد الهاتف. */
export const IMAGE_MAX_SIDE = 2048;
export const UPSCALE_MAX_SIDE = 4096;
export const JOB_TIMEOUT_MS = 120000;
export const THUMB_SIDE = 360;

export const ASPECTS = Object.freeze({
  '1:1': [1, 1],
  '4:5': [4, 5],
  '9:16': [9, 16],
  '16:9': [16, 9],
  '3:4': [3, 4]
});

export const VIDEO_PRESETS = Object.freeze([
  { id: 'ig-reel', label: 'Instagram Reel', aspect: '9:16' },
  { id: 'tiktok', label: 'TikTok', aspect: '9:16' },
  { id: 'yt-short', label: 'YouTube Short', aspect: '9:16' },
  { id: 'fb-reel', label: 'Facebook Reel', aspect: '9:16' },
  { id: 'landscape', label: 'فيديو أفقي', aspect: '16:9' },
  { id: 'square', label: 'مربع', aspect: '1:1' },
  { id: 'portrait', label: 'عمودي 4:5', aspect: '4:5' }
]);

export const LANGUAGES = Object.freeze([
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ku', label: 'Kurdî' },
  { code: 'pl', label: 'Polski' }
]);

export const PROJECT_TYPES = Object.freeze(['image', 'product', 'video', 'short', 'audio', 'translation', 'social']);
export const PROJECT_STATUSES = Object.freeze(['draft', 'processing', 'completed', 'failed']);
export const JOB_STATUSES = Object.freeze(['queued', 'processing', 'completed', 'failed', 'cancelled']);

/* رسائل الأخطاء الموحدة بالعربية. */
export const MESSAGES = Object.freeze({
  uploadFailed: 'تعذر رفع الملف. حاول مرة أخرى.',
  unsupported: 'نوع الملف غير مدعوم.',
  tooLarge: 'حجم الملف أكبر من الحد المسموح.',
  processingFailed: 'تعذر إكمال المعالجة. يمكنك إعادة المحاولة دون فقدان المشروع.',
  network: 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.',
  engineUnavailable: 'هذه الأداة غير متاحة حاليًا. سيتم تفعيلها قريبًا.',
  timeout: 'استغرقت المعالجة وقتًا أطول من المتوقع. يمكنك إعادة المحاولة.',
  cancelled: 'تم إلغاء المعالجة.',
  saved: 'تم حفظ المشروع.',
  needFile: 'اختر ملفًا أولًا.',
  browserUnsupported: 'متصفحك لا يدعم هذه الميزة. جرّب متصفح Chrome أو Edge.'
});

/* وسم يظهر على نتائج المعالجة المحلية التي تعرض عينة وليس نتيجة محرك حقيقي. */
export const SAMPLE_LABEL = 'معاينة تجريبية';
