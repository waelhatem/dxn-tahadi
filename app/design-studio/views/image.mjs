/* استوديو الصور + تصميم المنتج. نفس التدفق: رفع → معاينة → اختيار → تنفيذ → تقدم → نتيجة → حفظ/تنزيل. */
import { h, button, toast } from '../core/dom.mjs';
import { readAsDataURL } from '../core/files.mjs';
import { jobs } from '../core/jobs.mjs';
import { imageEngine } from '../engines/index.mjs';
import { getProvider, MESSAGES } from '../config.mjs';
import { header, uploader, chips, aspectPicker, field, textInput, jobPanel, beforeAfter, saveProject, downloadDataUrl, sampleBadge } from './components.mjs';

export const IMAGE_TOOLS = [
  { id: 'enhance', label: 'تحسين الصورة', icon: '✨' },
  { id: 'upscale', label: 'زيادة الدقة', icon: '🔍' },
  { id: 'lighting', label: 'تحسين الإضاءة', icon: '💡' },
  { id: 'colors', label: 'تحسين الألوان', icon: '🎨' },
  { id: 'removeBg', label: 'إزالة الخلفية', icon: '🧽', hint: 'تعمل بأفضل شكل مع الخلفيات السادة.' },
  { id: 'changeBg', label: 'تغيير الخلفية', icon: '🌄', hint: 'تعمل بأفضل شكل مع الخلفيات السادة.' },
  { id: 'cleanup', label: 'تنظيف الصورة', icon: '🧹' },
  { id: 'social', label: 'تصميم لمنصات التواصل', icon: '📣' },
  { id: 'removeObject', label: 'إزالة عناصر', icon: '✂️' },
  { id: 'addObject', label: 'إضافة عناصر', icon: '➕' },
  { id: 'productMarketing', label: 'صورة تسويقية للمنتج', icon: '🛒' },
  { id: 'freeEdit', label: 'تعديل حر بالذكاء الاصطناعي', icon: '🪄' },
  { id: 'ad', label: 'إنشاء إعلان احترافي', icon: '📢' },
  { id: 'generate', label: 'إنشاء صورة من وصف', icon: '🌟' }
];

export const SOCIAL_FORMATS = [
  { value: 'instagram-post', label: 'Instagram Post', aspect: '1:1' },
  { value: 'facebook-post', label: 'Facebook Post', aspect: '4:5' },
  { value: 'story', label: 'Story', aspect: '9:16' },
  { value: 'tiktok-cover', label: 'TikTok Cover', aspect: '9:16' },
  { value: 'youtube-thumb', label: 'YouTube Thumbnail', aspect: '16:9' },
  { value: 'whatsapp', label: 'صورة واتساب ترويجية', aspect: '1:1' }
];

const BG_OPTIONS = [
  ['studio', 'استوديو احترافي'], ['white', 'خلفية بيضاء'], ['luxury', 'متجر فاخر'], ['wood', 'طاولة خشبية'], ['kitchen', 'مطبخ'], ['office', 'مكتب'],
  ['nature', 'طبيعة'], ['lifestyle', 'Lifestyle'], ['social', 'إعلان Social Media'], ['minimal', 'Minimal'], ['cinematic', 'Cinematic']
].map(([value, label]) => ({ value, label }));

/* حالة العمل الحالية (تبقى عند إعادة رسم التبويب). */
const state = { original: null, current: null, history: [], tool: 'enhance', aspect: '1:1', social: 'instagram-post', headline: '', prompt: '', background: 'studio', jobId: null, result: null, projectId: null, fileName: '' };

const PROMPT_TOOLS = new Set(['removeObject','addObject','productMarketing','freeEdit','ad']);
function promptMeta(tool){
  if(tool==='removeObject')return ['العنصر المطلوب حذفه','مثال: احذف الكوب الموجود على اليمين'];
  if(tool==='addObject')return ['ما الذي تريد إضافته؟','مثال: أضف حبوب قهوة بجانب المنتج'];
  if(tool==='productMarketing'||tool==='ad')return ['وصف الإعلان (اختياري)','مثال: إعلان فاخر بإضاءة سينمائية ومساحة للنص'];
  return ['اكتب التعديل المطلوب','صف التعديل بدقة'];
}

function resetResult() { state.jobId = null; state.result = null; }

export function imageView(ctx, params = {}) {
  if (params.tool) state.tool = params.tool;
  const root = h('div', { class: 'ds-studio' }, header(ctx, '🖼️ استوديو الصور', 'ارفع صورة، اختر الأداة، واضغط تنفيذ.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());
  const runTool = async () => {
    const needsSource = state.tool !== 'generate';
    if (needsSource && !state.current) { toast(MESSAGES.needFile); return; }
    if (state.tool === 'generate' && !String(state.prompt||'').trim()) { toast('اكتب وصف الصورة التي تريد إنشاءها.'); return; }
    if (PROMPT_TOOLS.has(state.tool) && (state.tool==='removeObject'||state.tool==='addObject'||state.tool==='freeEdit') && !String(state.prompt||'').trim()) { toast('اكتب التعديل المطلوب أولًا.'); return; }
    const supported = await imageEngine.supports(state.tool);
    if (!supported) { toast(MESSAGES.engineUnavailable); return; }
    const fmt = SOCIAL_FORMATS.find(f => f.value === state.social) || SOCIAL_FORMATS[0];
    const options = { aspect: state.tool === 'social' ? fmt.aspect : (state.aspect||'1:1'), headline: state.headline, prompt: state.prompt, background: state.background, preserveProduct: true };
    const input = { tool: state.tool, source: state.current || '', options };
    state.result = null;
    state.jobId = jobs.submit({ type: 'image', provider: getProvider('image'), input, run: c => imageEngine.process(input, c) });
    render();
  };
  function body() {
    if (!state.original && state.tool !== 'generate') return [
      uploader({ kind: 'image', onFiles: async ([f]) => { state.original = await readAsDataURL(f); state.current = state.original; state.history = []; state.fileName = f.name; state.projectId = null; resetResult(); render(); } }),
      h('div',{class:'ds-actions'},button('إنشاء صورة من وصف',()=>{state.tool='generate';state.result=null;state.jobId=null;render();},{icon:'🌟',variant:'ghost'}))
    ];
    if (!state.original && state.tool === 'generate') return [generatorBody()];
    const toolDef = IMAGE_TOOLS.find(t => t.id === state.tool) || IMAGE_TOOLS[0];
    const preview = state.result ? beforeAfter(state.current, state.result.resultSrc) : h('img', { src: state.current, alt: 'معاينة الصورة', class: 'ds-preview-img' });
    return [
      h('div', { class: 'ds-split' },
        h('div', { class: 'ds-preview' }, preview, sampleBadge(state.result)),
        h('div', { class: 'ds-panel' },
          field('الأداة', toolGrid()),
          toolDef.hint ? h('small', { class: 'ds-hint', text: toolDef.hint }) : null,
          state.tool === 'social' ? field('نوع التصميم', chips(SOCIAL_FORMATS.map(f => ({ value: f.value, label: f.label })), state.social, v => { state.social = v; })) : null,
          state.tool === 'changeBg' ? field('الخلفية', chips(BG_OPTIONS, state.background, v => { state.background = v; })) : null,
          state.tool !== 'social' ? aspectPicker(state.aspect || '1:1', v => { state.aspect = v; }) : null,
          PROMPT_TOOLS.has(state.tool) ? (()=>{const m=promptMeta(state.tool);return field(m[0], textInput(state.prompt, v => { state.prompt = v; }, { placeholder:m[1], multiline:true, maxLength:700 }));})() : null,
          (state.tool === 'social' || state.aspect) ? field('نص على الصورة (اختياري)', textInput(state.headline, v => { state.headline = v; }, { placeholder: 'مثال: عرض خاص هذا الأسبوع', maxLength: 60 })) : null,
          h('div', { class: 'ds-actions' },
            button('تنفيذ', runTool, { variant: 'primary', icon: '⚡' }),
            button('صورة أخرى', () => { state.original = null; state.current = null; resetResult(); render(); }, { variant: 'ghost', icon: '🔄' })),
          state.jobId ? jobPanel(state.jobId, { onResult: res => { state.result = res; render(); } }) : null,
          state.result ? resultActions() : null))
    ];
  }
  function generatorBody(){
    const preview=state.result?h('img',{src:state.result.resultSrc,alt:'الصورة المنشأة',class:'ds-preview-img'}):h('div',{class:'ds-empty'},h('div',{class:'ds-empty-icon',text:'🌟'}),h('p',{text:'اكتب وصفًا واضحًا للصورة التي تريد إنشاءها.'}));
    return h('div',{class:'ds-split'},
      h('div',{class:'ds-preview'},preview,sampleBadge(state.result)),
      h('div',{class:'ds-panel'},
        field('وصف الصورة',textInput(state.prompt,v=>{state.prompt=v;},{placeholder:'مثال: كوب قهوة فاخر على طاولة خشبية بإضاءة صباحية طبيعية',multiline:true,maxLength:900})),
        aspectPicker(state.aspect||'1:1',v=>{state.aspect=v;}),
        h('div',{class:'ds-actions'},
          button('إنشاء الصورة',runTool,{variant:'primary',icon:'🌟'}),
          button('العودة لرفع صورة',()=>{state.tool='enhance';state.result=null;state.jobId=null;render();},{variant:'ghost',icon:'🖼️'})),
        state.jobId?jobPanel(state.jobId,{onResult:res=>{state.result=res;render();}}):null,
        state.result?resultActions():null));
  }

  function toolGrid() {
    const grid = h('div', { class: 'ds-tool-grid' });
    IMAGE_TOOLS.forEach(t => {
      const btn = h('button', { type: 'button', class: 'ds-tool' + (t.id === state.tool ? ' is-active' : ''), onClick: () => { state.tool = t.id; resetResult(); render(); } }, h('span', { attrs: { 'aria-hidden': 'true' }, text: t.icon }), h('span', { text: t.label }));
      grid.appendChild(btn);
      imageEngine.supports(t.id).then(ok => { if (!ok) { btn.disabled = true; btn.classList.add('is-soon'); btn.appendChild(h('small', { class: 'ds-soon', text: 'قريبًا' })); btn.title = MESSAGES.engineUnavailable; } });
    });
    return grid;
  }
  function resultActions() {
    return h('div', { class: 'ds-actions ds-result-actions' },
      button('حفظ', async () => {
        const assets=[]; if(state.original)assets.push({kind:'source',dataUrl:state.original}); assets.push({kind:'generated',dataUrl:state.result.resultSrc});
        const rec = await saveProject({ id: state.projectId, title: (IMAGE_TOOLS.find(t => t.id === state.tool) || {}).label + ' — ' + (state.fileName || 'صورة'), type: state.tool === 'social' ? 'social' : 'image', thumbnailSource: state.result.resultSrc, settings: { tool: state.tool, aspect: state.aspect, social: state.social, prompt: state.prompt }, assets });
        state.projectId = rec.id;
      }, { variant: 'primary', icon: '💾' }),
      button('تنزيل', () => downloadDataUrl(state.result.resultSrc, `design-${Date.now()}.${state.result.mime === 'image/png' ? 'png' : 'jpg'}`), { icon: '⬇️' }),
      button('إنشاء نسخة', () => { if(state.current)state.history.push(state.current); state.current = state.result.resultSrc; if(!state.original)state.original=state.result.resultSrc; state.tool='enhance'; state.projectId = null; resetResult(); render(); toast('تم اعتماد النتيجة كنسخة جديدة يمكنك متابعة التعديل عليها.'); }, { icon: '🧬' }),
      state.original ? button('العودة للأصل', () => { state.current = state.original; state.history = []; resetResult(); render(); }, { variant: 'ghost', icon: '↩️' }) : null);
  }
  render();
  root.appendChild(work);
  return root;
}

/* تصميم المنتج: رفع → نوع التصميم → الخلفية → النمط → وصف اختياري → إنشاء → معاينة → تعديل → تصدير. */
const pstate = { source: null, aspect: '1:1', background: 'studio', style: 'clean', prompt: '', preserve: true, headline: '', jobId: null, result: null, projectId: null, fileName: '' };
const PRODUCT_PRESETS = [
  { value: 'luxury', label: 'متجر فاخر' }, { value: 'white', label: 'خلفية بيضاء' }, { value: 'studio', label: 'استوديو احترافي' }, { value: 'wood', label: 'طاولة خشبية' },
  { value: 'kitchen', label: 'مطبخ' }, { value: 'office', label: 'مكتب' }, { value: 'nature', label: 'طبيعة' }, { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'social', label: 'إعلان Social Media' }, { value: 'minimal', label: 'Minimal' }, { value: 'cinematic', label: 'Cinematic' }
];
const PRODUCT_TYPES = [{ value: '1:1', label: 'منشور مربع' }, { value: '4:5', label: 'منشور طولي' }, { value: '9:16', label: 'Story / Reel' }, { value: '16:9', label: 'بانر عرضي' }];

export function productView(ctx) {
  const root = h('div', { class: 'ds-studio' }, header(ctx, '🛍️ تصميم المنتج', 'ارفع صورة المنتج واختر الخلفية والنمط.'));
  const work = h('div', { class: 'ds-work' });
  const render = () => work.replaceChildren(...body());
  const generate = () => {
    if (!pstate.source) { toast(MESSAGES.needFile); return; }
    const input = { tool: 'product', source: pstate.source, options: { aspect: pstate.aspect, background: pstate.background, style: pstate.style, prompt: pstate.prompt, preserveProduct: pstate.preserve, removeBackground: true, headline: pstate.headline } };
    pstate.result = null;
    pstate.jobId = jobs.submit({ type: 'product', provider: getProvider('image'), input, run: c => imageEngine.process(input, c) });
    render();
  };
  function body() {
    if (!pstate.source) return [uploader({ kind: 'image', label: 'ارفع صورة المنتج', onFiles: async ([f]) => { pstate.source = await readAsDataURL(f); pstate.fileName = f.name; pstate.projectId = null; pstate.result = null; pstate.jobId = null; render(); } })];
    const preserveToggle = h('label', { class: 'ds-toggle' },
      h('input', { type: 'checkbox', checked: pstate.preserve, onChange: e => { pstate.preserve = e.target.checked; } }),
      h('span', { text: 'الحفاظ على المنتج الأصلي' }));
    return [h('div', { class: 'ds-split' },
      h('div', { class: 'ds-preview' }, pstate.result ? beforeAfter(pstate.source, pstate.result.resultSrc) : h('img', { src: pstate.source, alt: 'صورة المنتج', class: 'ds-preview-img' }), sampleBadge(pstate.result)),
      h('div', { class: 'ds-panel' },
        field('نوع التصميم', chips(PRODUCT_TYPES, pstate.aspect, v => { pstate.aspect = v; })),
        field('الخلفية', chips(PRODUCT_PRESETS, pstate.background, v => { pstate.background = v; })),
        field('النمط', chips([{ value: 'clean', label: 'نظيف' }, { value: 'bold', label: 'جريء' }, { value: 'soft', label: 'ناعم' }], pstate.style, v => { pstate.style = v; })),
        field('عنوان على التصميم (اختياري)', textInput(pstate.headline, v => { pstate.headline = v; }, { placeholder: 'مثال: قهوة صحية بجودة عالية', maxLength: 60 })),
        field('وصف إضافي (اختياري)', textInput(pstate.prompt, v => { pstate.prompt = v; }, { placeholder: 'صف الجو الذي تريده', multiline: true, maxLength: 400 }), 'يُستخدم مع محرك التصميم المتقدم عند تفعيله.'),
        field('حماية العلامة التجارية', preserveToggle, 'عند التفعيل لا يتغير شكل المنتج ولا الشعار ولا النصوص ولا العبوة ولا الألوان الأساسية.'),
        h('div', { class: 'ds-actions' }, button('إنشاء التصميم', generate, { variant: 'primary', icon: '⚡' }), button('منتج آخر', () => { pstate.source = null; pstate.result = null; pstate.jobId = null; render(); }, { variant: 'ghost', icon: '🔄' })),
        pstate.jobId ? jobPanel(pstate.jobId, { onResult: res => { pstate.result = res; render(); } }) : null,
        pstate.result ? h('div', { class: 'ds-actions ds-result-actions' },
          button('حفظ', async () => { const rec = await saveProject({ id: pstate.projectId, title: 'تصميم منتج — ' + (pstate.fileName || 'منتج'), type: 'product', thumbnailSource: pstate.result.resultSrc, settings: { aspect: pstate.aspect, background: pstate.background, style: pstate.style, preserve: pstate.preserve, prompt: pstate.prompt }, assets: [{ kind: 'source', dataUrl: pstate.source }, { kind: 'generated', dataUrl: pstate.result.resultSrc }] }); pstate.projectId = rec.id; }, { variant: 'primary', icon: '💾' }),
          button('تنزيل', () => downloadDataUrl(pstate.result.resultSrc, `product-${Date.now()}.jpg`), { icon: '⬇️' }),
          button('تعديل الإعدادات', () => { pstate.result = null; pstate.jobId = null; render(); }, { variant: 'ghost', icon: '✏️' })) : null))];
  }
  render();
  root.appendChild(work);
  return root;
}