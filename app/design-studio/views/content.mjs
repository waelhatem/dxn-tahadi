/* صناعة المحتوى + النشر والجدولة. */
import { h, button, toast } from '../core/dom.mjs';
import { jobs } from '../core/jobs.mjs';
import { contentEngine, publishingEngine } from '../engines/index.mjs';
import { getProvider } from '../config.mjs';
import { header, chips, field, textInput, jobPanel, saveProject } from './components.mjs';

const ACTIONS = [
  { value: 'caption', label: 'إنشاء منشور', icon: '📝' }, { value: 'hooks', label: 'إنشاء Hook', icon: '🪝' }, { value: 'cta', label: 'إنشاء CTA', icon: '👉' },
  { value: 'hashtags', label: 'إنشاء Hashtags', icon: '#️⃣' }, { value: 'script', label: 'إنشاء Script', icon: '🎬' }, { value: 'variants', label: 'إنشاء 3 نسخ', icon: '🧬' },
  { value: 'weekly', label: 'إنشاء محتوى أسبوعي', icon: '📅' }, { value: 'videoPlan', label: 'Script → خطة فيديو', icon: '🎞️' }
];
const cstate = { topic: '', audience: '', goal: '', tone: 'ملهم', action: 'caption', jobId: null, output: null, projectId: null };

function outputText(action, out) {
  if (Array.isArray(out)) return out.map(x => typeof x === 'string' ? x : x.part ? `${x.part}: ${x.text}` : x.day ? `${x.day} — ${x.type}: ${x.idea}` : x.scene ? `مشهد ${x.scene} (${x.shot}): ${x.text}` : JSON.stringify(x)).join(action === 'hashtags' ? ' ' : '\n\n');
  return String(out || '');
}

export function contentView(ctx) {
  const root = h('div', { class: 'ds-studio' }, header(ctx, '✍️ صناعة المحتوى', 'اكتب فكرتك واختر ما تريد إنشاءه.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());
  function run() {
    if (!cstate.topic.trim()) { toast('اكتب فكرة أو موضوعًا أولًا.'); return; }
    const input = { topic: cstate.topic, audience: cstate.audience, goal: cstate.goal, tone: cstate.tone };
    cstate.output = null;
    cstate.jobId = jobs.submit({ type: 'social', provider: getProvider('content'), input, run: c => contentEngine.run(cstate.action, input, c) });
    render();
  }
  function body() {
    const text = cstate.output ? outputText(cstate.output.action, cstate.output.output) : '';
    return [h('div', { class: 'ds-split' },
      h('div', { class: 'ds-panel' },
        field('الفكرة أو المنتج', textInput(cstate.topic, v => { cstate.topic = v; }, { placeholder: 'مثال: قهوة الجانوديرما وفوائدها', multiline: true, maxLength: 300 })),
        field('الجمهور (اختياري)', textInput(cstate.audience, v => { cstate.audience = v; }, { placeholder: 'مثال: الأمهات العاملات', maxLength: 120 })),
        field('الهدف (اختياري)', textInput(cstate.goal, v => { cstate.goal = v; }, { placeholder: 'مثال: راسلنا على واتساب', maxLength: 120 })),
        field('الأسلوب', chips(['ملهم', 'ودّي', 'رسمي', 'حماسي'].map(t => ({ value: t, label: t })), cstate.tone, v => { cstate.tone = v; })),
        field('ماذا تريد؟', chips(ACTIONS, cstate.action, v => { cstate.action = v; })),
        h('div', { class: 'ds-actions' }, button('إنشاء', run, { variant: 'primary', icon: '✨' })),
        cstate.jobId ? jobPanel(cstate.jobId, { onResult: res => { cstate.output = res; render(); } }) : null),
      h('div', { class: 'ds-preview ds-text-out' },
        text ? h('pre', { class: 'ds-output', text }) : h('p', { class: 'ds-muted', text: 'سيظهر المحتوى هنا.' }),
        text ? h('div', { class: 'ds-actions' },
          button('نسخ', () => { navigator.clipboard.writeText(text).then(() => toast('تم النسخ.'), () => toast('تعذر النسخ.')); }, { icon: '📋' }),
          button('حفظ', async () => { const rec = await saveProject({ id: cstate.projectId, title: 'محتوى — ' + cstate.topic.slice(0, 40), type: 'social', settings: { ...cstate, jobId: null, output: cstate.output }, assets: [] }); cstate.projectId = rec.id; }, { icon: '💾' }),
          button('جدولة النشر', () => ctx.navigate('publish', { text }), { variant: 'primary', icon: '📅' })) : null))];
  }
  render();
  root.appendChild(work);
  return root;
}

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn'];
const pub = { text: '', platforms: new Set(['Facebook', 'Instagram']), mode: 'now', date: '', time: '', jobId: null, result: null };

export function publishView(ctx, params = {}) {
  if (params.text) pub.text = params.text;
  const root = h('div', { class: 'ds-studio' }, header(ctx, '📅 النشر والجدولة', 'جهّز المنشور واختر المنصات والموعد.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());
  function submit() {
    if (!pub.text.trim()) { toast('اكتب نص المنشور أولًا.'); return; }
    if (!pub.platforms.size) { toast('اختر منصة واحدة على الأقل.'); return; }
    if (pub.mode === 'schedule' && (!pub.date || !pub.time)) { toast('اختر التاريخ والوقت.'); return; }
    const input = { text: pub.text, platforms: [...pub.platforms], when: pub.mode === 'schedule' ? `${pub.date}T${pub.time}` : null };
    pub.jobId = jobs.submit({ type: 'social', provider: getProvider('publishing'), input, run: c => publishingEngine.schedule(input, c) });
    render();
  }
  function body() {
    const connected = publishingEngine.isConnected();
    return [h('div', { class: 'ds-panel ds-panel-wide' },
      connected ? null : h('div', { class: 'ds-note', text: 'لم يتم ربط حسابات التواصل بعد. ستُحفظ خطة النشر في «مشاريعي» لتنشرها يدويًا، وسيتوفر النشر التلقائي بعد ربط الحسابات.' }),
      field('نص المنشور', textInput(pub.text, v => { pub.text = v; }, { multiline: true, maxLength: 2200, placeholder: 'اكتب المنشور أو أنشئه من «صناعة المحتوى»' })),
      field('المنصات', h('div', { class: 'ds-chips' }, PLATFORMS.map(p => h('label', { class: 'ds-chip' + (pub.platforms.has(p) ? ' is-active' : '') }, h('input', { type: 'checkbox', checked: pub.platforms.has(p), class: 'ds-visually-hidden', onChange: e => { e.target.checked ? pub.platforms.add(p) : pub.platforms.delete(p); render(); } }), p)))),
      field('الموعد', chips([{ value: 'now', label: 'نشر الآن' }, { value: 'schedule', label: 'جدولة' }], pub.mode, v => { pub.mode = v; render(); })),
      pub.mode === 'schedule' ? h('div', { class: 'ds-row' },
        field('التاريخ', h('input', { type: 'date', class: 'ds-input', value: pub.date, onChange: e => { pub.date = e.target.value; } })),
        field('الوقت', h('input', { type: 'time', class: 'ds-input', value: pub.time, onChange: e => { pub.time = e.target.value; } }))) : null,
      h('div', { class: 'ds-actions' }, button(pub.mode === 'schedule' ? 'حفظ الجدولة' : (connected ? 'نشر الآن' : 'تجهيز للنشر'), submit, { variant: 'primary', icon: '📤' })),
      pub.jobId ? jobPanel(pub.jobId, { onResult: async res => {
        pub.result = res;
        await saveProject({ title: 'منشور — ' + pub.text.slice(0, 40), type: 'social', status: res.status === 'scheduled' || res.status === 'ready' ? 'draft' : 'completed', settings: { publishing: res } });
        render();
      } }) : null,
      pub.result ? h('div', { class: 'ds-note ds-note-ok', text: pub.result.when ? `تم حفظ الجدولة: ${pub.result.when} على ${pub.result.platforms.join('، ')}.` : `المنشور جاهز للنشر على ${pub.result.platforms.join('، ')} وتم حفظه في «مشاريعي».` }) : null)];
  }
  render();
  root.appendChild(work);
  return root;
}