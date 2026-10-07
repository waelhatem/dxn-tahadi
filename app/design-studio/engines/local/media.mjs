/* محركات الصوت والترجمة والمقاطع القصيرة المحلية (Phase 1).
   تفريغ الكلام والترجمة واقتراح المقاطع الحقيقية تحتاج محركات خارجية (WhisperX / PyVideoTrans / OpenShorts)،
   لذلك تُرجع هذه النسخة عينات واضحة الوسم (sample: true)، بينما تصدير SRT/VTT وتحرير الترجمة حقيقيان. */
import { SAMPLE_LABEL } from '../../config.mjs';
import { steps } from '../../core/jobs.mjs';

const SAMPLE_LINES = {
  ar: ['مرحبًا بكم في هذا المقطع.', 'سنتحدث اليوم عن فكرة مهمة.', 'تابعوا معنا حتى النهاية.', 'شاركوا المقطع مع أصدقائكم.', 'شكرًا لكم على المشاهدة.'],
  en: ['Welcome to this video.', 'Today we talk about an important idea.', 'Stay with us until the end.', 'Share this video with your friends.', 'Thank you for watching.'],
  tr: ['Bu videoya hoş geldiniz.', 'Bugün önemli bir fikirden bahsediyoruz.', 'Sonuna kadar bizimle kalın.', 'Videoyu arkadaşlarınızla paylaşın.', 'İzlediğiniz için teşekkürler.'],
  ku: ['Bi xêr hatin bo vê vîdyoyê.', 'Îro em li ser ramanek girîng diaxivin.', 'Heta dawiyê bi me re bin.', 'Vîdyoyê bi hevalên xwe re parve bikin.', 'Spas ji bo temaşekirinê.'],
  pl: ['Witamy w tym filmie.', 'Dziś mówimy o ważnym pomyśle.', 'Zostańcie z nami do końca.', 'Udostępnijcie film znajomym.', 'Dziękujemy za obejrzenie.']
};

export async function detectLanguage(_input, { progress, signal }) {
  await steps(progress, signal, [[40, 'جاري تحليل الصوت...'], [80, 'جاري تحديد اللغة...']]);
  return { language: 'ar', confidence: 0.6, sample: true, note: SAMPLE_LABEL };
}

/* يعيد مقاطع نصية موزعة على مدة الملف. */
export async function transcribe({ duration = 20, language = 'ar' }, { progress, signal }) {
  await steps(progress, signal, [[20, 'جاري تجهيز الملف...'], [45, 'جاري تحويل الصوت إلى نص...'], [75, 'جاري ضبط التوقيت...']]);
  const lines = SAMPLE_LINES[language] || SAMPLE_LINES.ar;
  const total = Math.max(5, Math.min(Number(duration) || 20, 600));
  const count = Math.max(2, Math.min(40, Math.round(total / 4)));
  const span = total / count;
  const segments = Array.from({ length: count }, (_, i) => ({
    id: 'c' + (i + 1),
    start: +(i * span).toFixed(2),
    end: +Math.min(total, (i + 1) * span - 0.1).toFixed(2),
    text: lines[i % lines.length]
  }));
  return { language, segments, sample: true, note: SAMPLE_LABEL };
}

export async function align({ segments }, { progress, signal }) {
  await steps(progress, signal, [[60, 'جاري مزامنة الكلام مع الفيديو...']]);
  return { segments: normalizeSegments(segments), sample: true };
}

/* ترتيب وتنظيف المقاطع: بدايات تصاعدية، لا نهاية قبل البداية، ونص بلا أسطر فارغة. */
export function normalizeSegments(segments) {
  return (segments || [])
    .map((s, i) => ({ id: s.id || 'c' + (i + 1), start: Math.max(0, Number(s.start) || 0), end: Math.max(0, Number(s.end) || 0), text: String(s.text || '').trim() }))
    .map(s => (s.end <= s.start ? { ...s, end: +(s.start + 1).toFixed(2) } : s))
    .filter(s => s.text)
    .sort((a, b) => a.start - b.start);
}

function stamp(seconds, sep) {
  const ms = Math.round((Number(seconds) || 0) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
}

/* تصدير حقيقي لملفات الترجمة. format: srt | vtt */
export function generateSubtitles(segments, format = 'srt') {
  const list = normalizeSegments(segments);
  if (format === 'vtt') return 'WEBVTT\n\n' + list.map(s => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text}`).join('\n\n') + '\n';
  return list.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}`).join('\n\n') + '\n';
}

export async function translate({ segments, target = 'en' }, { progress, signal }) {
  await steps(progress, signal, [[30, 'جاري تجهيز النص...'], [65, 'جاري الترجمة...'], [85, 'جاري المراجعة...']]);
  const lines = SAMPLE_LINES[target] || SAMPLE_LINES.en;
  return { target, segments: normalizeSegments(segments).map((s, i) => ({ ...s, text: lines[i % lines.length] })), sample: true, note: SAMPLE_LABEL };
}

/* المقاطع القصيرة: يقترح مقاطع من 15 إلى 45 ثانية موزعة على الفيديو مع تقييم وعنوان مقترح. */
export async function analyzeShorts({ duration = 60 }, { progress, signal }) {
  await steps(progress, signal, [[20, 'جاري تحليل الفيديو...'], [45, 'جاري البحث عن اللحظات المميزة...'], [70, 'جاري اقتراح المقاطع...']]);
  /* المقاطع لا تتجاوز طول الفيديو الحقيقي؛ الفيديو الأقصر من 15 ثانية = مقطع واحد بطوله. */
  const total = Number(duration) > 0 ? Number(duration) : 60;
  const len = Math.min(total, 45, Math.max(15, total / 4));
  const count = Math.max(1, Math.min(6, Math.floor(total / len)));
  const titles = ['أهم فكرة في المقطع', 'لحظة ملهمة', 'نصيحة سريعة', 'خلاصة في ثوانٍ', 'سؤال وجواب', 'الخطوة التالية'];
  const clips = Array.from({ length: count }, (_, i) => {
    const start = +(i * (total - len) / Math.max(1, count - 1 || 1)).toFixed(1);
    return { id: 's' + (i + 1), start, end: +Math.min(total, start + len).toFixed(1), duration: +Math.min(len, total - start).toFixed(1), title: titles[i % titles.length], score: Math.max(55, 92 - i * 7) };
  });
  return { clips, sample: true, note: SAMPLE_LABEL };
}