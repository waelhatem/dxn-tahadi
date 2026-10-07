/* طبقة المحركات (Service Layer): الواجهة تستدعي هذه الدوال فقط ولا تعرف أي محرك يعمل خلفها.
   يُختار المزود من config.getProvider(engine): 'local' أو محول خارجي (comfyui, remotion, ...). */
import { getProvider } from '../config.mjs';
import { remoteAdapter } from './remote.mjs';

const lazy = { image: () => import('./local/image.mjs'), video: () => import('./local/video.mjs'), media: () => import('./local/media.mjs'), content: () => import('./local/content.mjs') };

function remote(engine) {
  const provider = getProvider(engine);
  return provider === 'local' ? null : remoteAdapter(engine, provider);
}

export const imageEngine = {
  async supports(tool) { if (remote('image')) return true; const m = await lazy.image(); return m.LOCAL_IMAGE_TOOLS.has(tool); },
  async process(input, ctx) { const r = remote('image'); if (r) return r.run('process', input, ctx); return (await lazy.image()).processImage(input, ctx); }
};

export const videoEngine = {
  async canRender() { if (remote('video')) return true; return (await lazy.video()).canRenderLocally(); },
  async preview(plan) { return (await lazy.video()).buildTimeline(plan); },
  async render(plan, ctx) { const r = remote('video'); if (r) return r.run('render', plan, ctx); return (await lazy.video()).renderVideo(plan, ctx); },
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