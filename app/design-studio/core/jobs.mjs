/* نظام المهام: كل معالجة (محلية أو عبر محرك خارجي) تمر كمهمة لها حالة وتقدم وإلغاء وإعادة محاولة.
   الحالات: queued → processing → completed | failed | cancelled. */
import { JOB_TIMEOUT_MS, MESSAGES } from '../config.mjs';

let seq = 0;
export class JobManager {
  constructor({ timeoutMs = JOB_TIMEOUT_MS } = {}) {
    this.jobs = new Map();
    this.listeners = new Set();
    this.timeoutMs = timeoutMs;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(job) { const view = this.view(job); for (const fn of [...this.listeners]) { try { fn(view); } catch (_) { /* لا تكسر بقية المشتركين */ } } }
  view(job) { const { _run, _controller, ...rest } = job; return { ...rest }; }
  get(id) { const j = this.jobs.get(id); return j ? this.view(j) : null; }

  /* run({progress, signal}) تعيد النتيجة أو ترمي خطأ. */
  submit({ type, provider = 'local', input = {}, run }) {
    const id = `job_${Date.now().toString(36)}_${(++seq).toString(36)}`;
    const now = new Date().toISOString();
    const job = { id, type, provider, input, status: 'queued', progress: 0, stage: 'جاري التحضير...', result: null, error: null, createdAt: now, updatedAt: now, _run: run };
    this.jobs.set(id, job);
    this.emit(job);
    this._start(job);
    return id;
  }

  _update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.emit(job);
  }

  async _start(job) {
    const controller = new AbortController();
    job._controller = controller;
    let timer = null;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(MESSAGES.timeout)); }, this.timeoutMs); });
    this._update(job, { status: 'processing', progress: 5, stage: 'جاري التحضير...', error: null });
    const progress = (pct, stage) => {
      if (job.status !== 'processing') return;
      this._update(job, { progress: Math.max(job.progress, Math.min(99, Math.round(pct))), stage: stage || job.stage });
    };
    try {
      const result = await Promise.race([job._run({ progress, signal: controller.signal }), timeout]);
      if (job.status === 'cancelled') return;
      this._update(job, { status: 'completed', progress: 100, stage: 'اكتمل', result });
    } catch (err) {
      if (job.status === 'cancelled') return;
      this._update(job, { status: 'failed', stage: 'تعذر الإكمال', error: (err && err.message) || MESSAGES.processingFailed });
    } finally {
      clearTimeout(timer);
    }
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'queued' && job.status !== 'processing')) return false;
    if (job._controller) job._controller.abort();
    this._update(job, { status: 'cancelled', stage: MESSAGES.cancelled });
    return true;
  }

  /* يعيد تشغيل المهمة نفسها بالمدخلات نفسها (لا يضيع المشروع). */
  retry(id) {
    const job = this.jobs.get(id);
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return false;
    this._update(job, { progress: 0, result: null, error: null });
    this._start(job);
    return true;
  }
}

/* مراحل تقدم متدرّجة للمعالجات المحلية حتى يرى المستخدم مراحل واضحة. */
export function steps(progress, signal, list, delayMs = 260) {
  return list.reduce((p, [pct, label]) => p.then(() => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error(MESSAGES.cancelled));
    progress(pct, label);
    setTimeout(resolve, delayMs);
  })), Promise.resolve());
}

export const jobs = new JobManager();