/* محولات المحركات الخارجية (Adapters). لا تتصل أي منها بالمحرك مباشرة من المتصفح:
   كل الطلبات تمر عبر /api/design-studio حيث العناوين والمفاتيح في متغيرات البيئة فقط.
   كل محول يقدّم: submit() → jobId، status(jobId) → {status, progress, result}، cancel(jobId). */
import { studioApi } from '../core/api.mjs';
import { MESSAGES } from '../config.mjs';

const POLL_MS = 2000;

export class RemoteAdapter {
  constructor(engine, provider) { this.engine = engine; this.provider = provider; }
  submit(method, input, signal) { return studioApi('submit', { engine: this.engine, provider: this.provider, method, input }, { signal }); }
  status(jobId, signal) { return studioApi('status', { engine: this.engine, provider: this.provider, jobId }, { signal }); }
  cancel(jobId) { return studioApi('cancel', { engine: this.engine, provider: this.provider, jobId }); }

  /* يرسل المهمة ثم يتابع حالتها حتى الاكتمال، ويحدّث التقدم في نظام المهام. */
  async run(method, input, { progress, signal }) {
    const { jobId } = await this.submit(method, input, signal);
    progress(10, 'تم إرسال المهمة...');
    for (;;) {
      if (signal && signal.aborted) { try { await this.cancel(jobId); } catch (_) { /* تجاهل */ } throw new Error(MESSAGES.cancelled); }
      await new Promise(r => setTimeout(r, POLL_MS));
      const s = await this.status(jobId, signal);
      if (s.status === 'completed') return s.result;
      if (s.status === 'failed') throw new Error(s.error || MESSAGES.processingFailed);
      if (s.status === 'cancelled') throw new Error(MESSAGES.cancelled);
      progress(Math.min(95, Number(s.progress) || 20), s.stage || 'جاري المعالجة...');
    }
  }
}

/* ComfyUI: محرك سير عمل الصور الرئيسي مستقبلًا. */
export class ComfyUIAdapter extends RemoteAdapter {
  constructor() { super('image', 'comfyui'); }
  submitWorkflow(input, signal) { return this.submit('workflow', input, signal); }
  getJob(jobId, signal) { return this.status(jobId, signal); }
  async getResult(jobId, signal) { const s = await this.status(jobId, signal); return s.result || null; }
  cancelJob(jobId) { return this.cancel(jobId); }
}
export class RemotionAdapter extends RemoteAdapter { constructor() { super('video', 'remotion'); } }
export class HyperFramesAdapter extends RemoteAdapter { constructor() { super('video', 'hyperframes'); } }
export class WhisperXAdapter extends RemoteAdapter { constructor() { super('speech', 'whisperx'); } }
export class PyVideoTransAdapter extends RemoteAdapter { constructor() { super('translation', 'pyvideotrans'); } }
export class OpenShortsAdapter extends RemoteAdapter { constructor() { super('shorts', 'openshorts'); } }
export class PostizAdapter extends RemoteAdapter { constructor() { super('publishing', 'postiz'); } }

export const REMOTE_ADAPTERS = Object.freeze({
  image: { comfyui: ComfyUIAdapter },
  video: { remotion: RemotionAdapter, hyperframes: HyperFramesAdapter },
  speech: { whisperx: WhisperXAdapter },
  translation: { pyvideotrans: PyVideoTransAdapter },
  shorts: { openshorts: OpenShortsAdapter },
  publishing: { postiz: PostizAdapter }
});
export function remoteAdapter(engine, provider) {
  const Cls = REMOTE_ADAPTERS[engine] && REMOTE_ADAPTERS[engine][provider];
  return Cls ? new Cls() : null;
}