/* طبقة المحركات (Service Layer): الواجهة تستدعي هذه الدوال فقط ولا تعرف أي محرك يعمل خلفها.
   يُختار المزود من config.getProvider(engine): 'local' أو محول خارجي (comfyui, remotion, ...). */
import { getProvider } from '../config.mjs';
import { remoteAdapter } from './remote.mjs';
import { NativeImageAdapter, NativeVideoAdapter } from './native.mjs';

const lazy = { image: () => import('./local/image.mjs'), video: () => import('./local/video.mjs'), media: () => import('./local/media.mjs'), content: () => import('./local/content.mjs') };
const nativeImage = new NativeImageAdapter();
const nativeVideo = new NativeVideoAdapter();

function remote(engine) {
  const provider = getProvider(engine);
  return provider === 'local' || provider === 'native' ? null : remoteAdapter(engine, provider);
}

const AI_QUALITY_IMAGE_TOOLS = new Set(['enhance','upscale']);
/* أدوات تعمل مجانًا بنماذج ذكاء اصطناعي داخل المتصفح (لا تحتاج أي مفاتيح API على الخادم).
   النماذج لا تُحمّل إلا عند تنفيذ الأداة. */
const BROWSER_AI_TOOLS = new Set(['enhance','upscale','removeBg','changeBg','product','removeObject']);
lazy.browserAi = () => import('./browser-ai/index.mjs');
function browserAiSupported() {
  return typeof WebAssembly === 'object' && typeof fetch === 'function' && !!(globalThis.crypto && crypto.subtle);
}
/* إزالة العناصر: برسم قناع ← محليًا (MI-GAN). بوصف نصي فقط ← OpenAI إن كان متاحًا. */
function useBrowserAi(input) {
  if (!BROWSER_AI_TOOLS.has(input.tool) || !browserAiSupported()) return false;
  if (input.tool === 'removeObject') return !!(input.options && input.options.mask);
  return true;
}

export const imageEngine = {
  async supports(tool) {
    const provider=getProvider('image');
    if(BROWSER_AI_TOOLS.has(tool)&&browserAiSupported())return true;
    if(provider==='native'&&nativeImage.supports(tool))return true;
    if(remote('image'))return true;
    if(AI_QUALITY_IMAGE_TOOLS.has(tool))return false;
    const m=await lazy.image();
    return m.LOCAL_IMAGE_TOOLS.has(tool);
  },
  /* هل تتوفر إزالة العناصر بالوصف النصي (OpenAI)؟ */
  supportsPromptErase() { return getProvider('image')==='native'&&nativeImage.supports('removeObject'); },
  async process(input, ctx) {
    if(useBrowserAi(input))return (await lazy.browserAi()).process(input,ctx);
    const provider=getProvider('image');
    if(provider==='native'&&nativeImage.supports(input.tool))return nativeImage.process(input,ctx);
    const r=remote('image');
    if(r)return r.run('process',input,ctx);
    if(AI_QUALITY_IMAGE_TOOLS.has(input.tool)) {
      const e=new Error('يتطلب تحسين الصورة وزيادة الدقة تفعيل محرك الذكاء الاصطناعي في بيئة Preview.');
      e.code='ENGINE_REQUIRED';
      throw e;
    }
    return (await lazy.image()).processImage(input,ctx);
  }
};

export const videoEngine = {
  async canRender() { if (remote('video')) return true; return (await lazy.video()).canRenderLocally(); },
  async preview(plan) { return (await lazy.video()).buildTimeline(plan); },
  async render(plan, ctx) { const r = remote('video'); if (r) return r.run('render', plan, ctx); return (await lazy.video()).renderVideo(plan, ctx); },
  supportsImageToVideo() { return getProvider('video')==='native'&&nativeVideo.available(); },
  imageToVideo(input,ctx) { return nativeVideo.imageToVideo(input,ctx); },
  getStatus(jobId) { const r = remote('video'); return r ? r.status(jobId) : Promise.resolve(null); },
  cancel(jobId) { const r = remote('video'); return r ? r.cancel(jobId) : Promise.resolve(false); }
};

export const speechEngine = {
  async detectLanguage(input, ctx) { const r = remote('speech'); if (r) return r.run('detectLanguage', input, ctx); return (await lazy.media()).detectLanguage(input, ctx); },
  async transcribe(input, ctx) { const r = remote('speech'); if (r) return r.run('transcribe', input, ctx); return (await lazy.media()).transcribe(input, ctx); },
  async align(input, ctx) { const r = remote('speech'); if (r) return r.run('align', input, ctx); return (await lazy.media()).align(input, ctx); },
  async generateSubtitles(segments, format) { return (await lazy.media()).generateSubtitles(segments, format); }
};

export const translationEngine = {
  async translate(input, ctx) { const r = remote('translation'); if (r) return r.run('translate', input, ctx); return (await lazy.media()).translate(input, ctx); },
  async dub(input, ctx) { const r = remote('translation'); if (r) return r.run('dub', input, ctx); const e = new Error('ENGINE_REQUIRED'); e.code = 'ENGINE_REQUIRED'; throw e; },
  supportsDubbing() { return !!remote('translation'); }
};

export const shortsEngine = {
  async analyze(input, ctx) { const r = remote('shorts'); if (r) return r.run('analyze', input, ctx); return (await lazy.media()).analyzeShorts(input, ctx); },
  supportsCutting() { return !!remote('shorts'); }
};

export const contentEngine = {
  async run(action, input, ctx) { const r = remote('content'); if (r) return r.run(action, input, ctx); return (await lazy.content()).generate({ action, input }, ctx); },
  generateScript(input, ctx) { return this.run('script', input, ctx); },
  generateCaption(input, ctx) { return this.run('caption', input, ctx); },
  generateHooks(input, ctx) { return this.run('hooks', input, ctx); },
  generateCTA(input, ctx) { return this.run('cta', input, ctx); },
  generateHashtags(input, ctx) { return this.run('hashtags', input, ctx); }
};

export const publishingEngine = {
  async schedule(input, ctx) { const r = remote('publishing'); if (r) return r.run('schedule', input, ctx); return (await lazy.content()).schedulePost(input, ctx); },
  isConnected() { return !!remote('publishing'); }
};