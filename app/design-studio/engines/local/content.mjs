/* محرك صناعة المحتوى المحلي: يولّد نصوصًا عربية من قوالب جاهزة (Script/Caption/Hook/CTA/Hashtags/خطة أسبوعية).
   مزود الذكاء الاصطناعي الحقيقي يأتي لاحقًا عبر الخادم بنفس الواجهة. */
import { steps } from '../../core/jobs.mjs';

function clean(v, fallback) { return String(v || '').trim().slice(0, 300) || fallback; }

export function hooks({ topic, audience }) {
  const t = clean(topic, 'هذه الفكرة'), a = clean(audience, 'كل شخص يريد التغيير');
  return [`هل تعرف السر الذي لا يخبرك به أحد عن ${t}؟`, `3 أخطاء تمنعك من النجاح في ${t}`, `إلى ${a}: هذه الدقيقة قد تغيّر طريقتك في ${t}`];
}
export function cta({ goal }) {
  const g = clean(goal, 'تواصل معنا');
  return [`👈 ${g} الآن واترك تعليقًا بكلمة «أريد»`, '📩 أرسل لنا رسالة لتعرف التفاصيل', '🔁 شارك المنشور مع من يحتاجه'];
}
export function hashtags({ topic }) {
  const words = clean(topic, 'نجاح').split(/\s+/).filter(Boolean).slice(0, 3).map(w => '#' + w.replace(/[^\p{L}\p{N}_]/gu, ''));
  return [...new Set([...words, '#صحة', '#ثراء', '#DXN', '#مجتمع_الصحة_والثراء', '#نجاح'])].filter(x => x.length > 1).slice(0, 8);
}
export function script({ topic, audience, tone = 'ملهم', seconds = 30 }) {
  const t = clean(topic, 'فكرتك');
  return [
    { part: 'Hook (0–3 ث)', text: hooks({ topic, audience })[0] },
    { part: 'المشكلة', text: `كثير من الناس يتعبون في ${t} بدون نتيجة واضحة.` },
    { part: 'الحل', text: `الخطوة الأولى بسيطة: ابدأ بخطة صغيرة وواضحة في ${t} وكرّرها كل يوم.` },
    { part: 'الدليل', text: 'هذه الطريقة جرّبها أعضاء مجتمعنا وحققوا نتائج ملموسة.' },
    { part: 'CTA', text: cta({})[0] }
  ].map(x => ({ ...x, tone, seconds }));
}
export function caption({ topic, goal }) {
  const t = clean(topic, 'فكرتك');
  return `✨ ${t}\n\nخطوة صغيرة اليوم تصنع فرقًا كبيرًا غدًا.\n\n${cta({ goal })[0]}\n\n${hashtags({ topic }).join(' ')}`;
}
export function weeklyPlan({ topic }) {
  const t = clean(topic, 'فكرتك');
  const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const kinds = ['Reel تعريفي', 'منشور نصائح', 'قصة نجاح', 'سؤال للمتابعين', 'فيديو تعليمي', 'عرض منتج', 'ملخص الأسبوع'];
  return days.map((d, i) => ({ day: d, type: kinds[i], idea: `${kinds[i]} عن ${t}` }));
}
export function variants({ topic, goal }) {
  return [caption({ topic, goal }), `${hooks({ topic })[1]}\n\n${cta({ goal })[1]}`, `${hooks({ topic })[2]}\n\n${cta({ goal })[2]}`];
}
export function videoPlan({ topic }) {
  return script({ topic }).map((s, i) => ({ scene: i + 1, shot: ['لقطة قريبة للوجه', 'لقطة للمشكلة', 'عرض الحل', 'لقطة نتيجة', 'شعار ودعوة'][i] || 'لقطة', text: s.text }));
}

/* action: script|caption|hooks|cta|hashtags|variants|weekly|videoPlan */
export async function generate({ action, input }, { progress, signal }) {
  await steps(progress, signal, [[35, 'جاري فهم الفكرة...'], [70, 'جاري كتابة المحتوى...']], 200);
  const map = { script, caption, hooks, cta, hashtags, variants, weekly: weeklyPlan, videoPlan };
  const fn = map[action];
  if (!fn) throw new Error('نوع المحتوى غير معروف.');
  return { action, output: fn(input || {}), sample: false };
}

/* النشر: لا توجد حسابات مربوطة في Phase 1، فتُحفظ خطة النشر داخل المشروع فقط. */
export async function schedulePost({ platforms = [], when = null, text = '' }, { progress, signal }) {
  await steps(progress, signal, [[50, 'جاري حفظ خطة النشر...']], 200);
  return { status: when ? 'scheduled' : 'ready', platforms, when, text, connected: false };
}