'use strict';
/* اختبارات استوديو التصميم: الإعدادات، التحقق من الملفات، نظام المهام، المشاريع، القوالب، الترجمات، المحتوى، والخادم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

const DS = path.join(__dirname, '..', 'app', 'design-studio');
const load = rel => import(pathToFileURL(path.join(DS, rel)).href);
const noopCtx = () => ({ progress() {}, signal: new AbortController().signal });

test('config: flags default on, server config only accepts known keys', async () => {
  const c = await load('config.mjs');
  c.resetConfig();
  assert.equal(c.isEnabled('DESIGN_STUDIO_ENABLED'), true);
  c.applyServerConfig({ flags: { DESIGN_VIDEO_ENABLED: false, EVIL: true }, providers: { image: 'comfyui', bogus: 'x' } });
  assert.equal(c.isEnabled('DESIGN_VIDEO_ENABLED'), false);
  assert.equal(c.getFlags().EVIL, undefined);
  assert.equal(c.getProvider('image'), 'comfyui');
  assert.equal(c.getProvider('video'), 'local');
  c.resetConfig();
  assert.equal(c.getProvider('image'), 'local');
  for (const a of ['1:1', '4:5', '9:16', '16:9', '3:4']) assert.ok(c.ASPECTS[a], a);
  assert.deepEqual(c.LANGUAGES.map(l => l.code), ['ar', 'en', 'tr', 'ku', 'pl']);
});

test('files: magic bytes decide the real type, extension spoofing is rejected', async () => {
  const f = await load('core/files.mjs');
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const jpg = [0xff, 0xd8, 0xff, 0xe0];
  const mp4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
  const exe = [0x4d, 0x5a, 0x90, 0x00];
  assert.equal(f.sniff(png), 'image/png');
  assert.equal(f.sniff(jpg), 'image/jpeg');
  assert.equal(f.sniff(mp4), 'iso-bmff');
  assert.equal(f.sniff(exe), '');
  assert.equal(f.isCompatible('image', 'image/png', 'image/png'), true);
  assert.equal(f.isCompatible('image', 'image/png', 'image/jpeg'), false);
  assert.equal(f.isCompatible('video', 'video/mp4', 'iso-bmff'), true);
  assert.equal(f.isCompatible('video', 'video/mp4', ''), false);
  assert.equal(f.isCompatible('audio', 'audio/mpeg', 'audio/mpeg'), true);
});

test('files: validateFile enforces MIME, size and signature', async () => {
  const f = await load('core/files.mjs');
  const { FILE_RULES } = await load('config.mjs');
  const mk = (bytes, type, size) => ({ name: 'x', type, size: size || bytes.length, slice: () => new Blob([Uint8Array.from(bytes)]) });
  assert.equal((await f.validateFile(mk([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0], 'image/png'), 'image')).ok, true);
  assert.equal((await f.validateFile(mk([0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'image/png'), 'image')).ok, false);
  assert.equal((await f.validateFile(mk([0x89, 0x50, 0x4e, 0x47], 'image/gif'), 'image')).ok, false);
  assert.equal((await f.validateFile(mk([0x89, 0x50, 0x4e, 0x47], 'image/png', FILE_RULES.image.maxBytes + 1), 'image')).ok, false);
});

test('jobs: progress → completed, failure → retry, cancel', async () => {
  const { JobManager } = await load('core/jobs.mjs');
  const m = new JobManager({ timeoutMs: 2000 });
  const seen = [];
  m.subscribe(j => seen.push(j.status));
  const done = new Promise(r => m.subscribe(j => j.status === 'completed' && r(j)));
  const id = m.submit({ type: 'image', input: { a: 1 }, run: async ({ progress }) => { progress(50, 'half'); return { ok: true }; } });
  const job = await done;
  assert.equal(job.id, id);
  assert.deepEqual(job.result, { ok: true });
  assert.equal(job.progress, 100);
  assert.ok(seen.includes('processing'));
  assert.equal('_run' in job, false, 'internal fields are not exposed');

  let attempts = 0;
  const failed = new Promise(r => m.subscribe(j => j.status === 'failed' && r(j)));
  const fid = m.submit({ type: 'video', run: async () => { attempts++; if (attempts === 1) throw new Error('boom'); return 'second'; } });
  assert.equal((await failed).error, 'boom');
  const completed = new Promise(r => m.subscribe(j => j.id === fid && j.status === 'completed' && r(j)));
  assert.equal(m.retry(fid), true);
  assert.equal((await completed).result, 'second');

  const cid = m.submit({ type: 'audio', run: ({ signal }) => new Promise((res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(m.cancel(cid), true);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(m.get(cid).status, 'cancelled');
  assert.equal(m.cancel(cid), false);
});

test('jobs: a listener added while an event is emitted does not receive that event (no re-render loop)', async () => {
  const { JobManager } = await load('core/jobs.mjs');
  const m = new JobManager({ timeoutMs: 2000 });
  let nested = 0, added = 0;
  const done = new Promise(r => m.subscribe(j => {
    if (j.status !== 'completed') return;
    if (added < 50) { added++; m.subscribe(k => { if (k.status === 'completed') nested++; }); }
    r(j);
  }));
  m.submit({ type: 'image', run: async () => 'ok' });
  await done;
  assert.equal(added, 1, 'outer listener ran once for the completed event');
  assert.equal(nested, 0, 'listener subscribed during emit missed the in-flight event');
});

test('browser AI models: self-hosted files match size and SHA-256, remote files are pinned, licenses are permissive', async () => {
  const crypto = require('node:crypto');
  const { MODELS } = await load('engines/browser-ai/models.mjs');
  const files = [];
  for (const m of Object.values(MODELS)) {
    files.push({ url: m.url, bytes: m.bytes, sha256: m.sha256, license: m.license });
    if (m.externalData) files.push({ url: m.externalData.url, bytes: m.externalData.bytes, sha256: m.externalData.sha256, license: m.license });
  }
  for (const f of files) {
    assert.match(f.license, /^(MIT|Apache-2\.0|BSD-3-Clause)$/, `${f.url} license`);
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
    if (f.url.startsWith('file:')) {
      const buf = fs.readFileSync(new URL(f.url));
      assert.equal(buf.length, f.bytes, `${f.url} size`);
      assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), f.sha256, `${f.url} sha256`);
    } else {
      assert.match(f.url, /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[0-9a-f]{40}\//, `${f.url} must be pinned to a commit`);
    }
  }
  assert.ok(fs.existsSync(path.join(DS, 'models', 'LICENSE-real-esrgan.txt')), 'BSD-3 notice ships with the self-hosted model');
});

test('browser AI enhance: levels stretch a flat image, color correction pulls a color cast toward neutral', async () => {
  const { autoLevels, colorCorrect } = await load('engines/browser-ai/enhance.mjs');
  const flat = new Uint8ClampedArray(4 * 100);
  for (let i = 0; i < 100; i++) { const v = 90 + (i % 50); flat.set([v, v, v, 255], i * 4); }
  autoLevels(flat);
  let mn = 255, mx = 0;
  for (let i = 0; i < flat.length; i += 4) { mn = Math.min(mn, flat[i]); mx = Math.max(mx, flat[i]); }
  assert.ok(mx - mn > 49 * 1.3, 'contrast range widened');
  const warm = new Uint8ClampedArray(4 * 64);
  for (let i = 0; i < 64; i++) warm.set([200, 150, 110, 255], i * 4);
  colorCorrect(warm, { saturation: 1 });
  assert.ok(warm[0] - warm[2] < 200 - 110, 'red/blue gap reduced');
});

test('browser AI routing: free tools do not depend on server keys, object removal needs a painted mask', () => {
  const src = fs.readFileSync(path.join(DS, 'engines', 'index.mjs'), 'utf8');
  assert.match(src, /BROWSER_AI_TOOLS = new Set\(\['enhance','upscale','removeBg','changeBg','product','removeObject'\]\)/);
  assert.match(src, /if\(BROWSER_AI_TOOLS\.has\(tool\)&&browserAiSupported\(\)\)return true;/);
  assert.match(src, /input\.tool === 'removeObject'\) return !!\(input\.options && input\.options\.mask\)/);
  assert.match(src, /lazy\.browserAi = \(\) => import\('\.\/browser-ai\/index\.mjs'\)/, 'engine loaded only on demand');
});

test('jobs: the timeout counts from the last progress, so a slow but advancing job (model download) completes', async () => {
  const { JobManager } = await load('core/jobs.mjs');
  const m = new JobManager({ timeoutMs: 60 });
  const done = new Promise(r => m.subscribe(j => (j.status === 'completed' || j.status === 'failed') && r(j)));
  m.submit({ type: 'image', run: async ({ progress }) => {
    for (let i = 1; i <= 6; i++) { await new Promise(r => setTimeout(r, 35)); progress(10 * i, `download ${i}`); }
    return 'ok';
  } });
  const job = await done;
  assert.equal(job.status, 'completed', 'total run time (210ms) exceeds the 60ms limit but progress kept arriving');
  assert.equal(job.result, 'ok');
});

test('jobs: timeout fails the job with an Arabic message', async () => {
  const { JobManager } = await load('core/jobs.mjs');
  const { MESSAGES } = await load('config.mjs');
  const m = new JobManager({ timeoutMs: 30 });
  const failed = new Promise(r => m.subscribe(j => j.status === 'failed' && r(j)));
  m.submit({ type: 'image', run: () => new Promise(() => {}) });
  assert.equal((await failed).error, MESSAGES.timeout);
});

test('projects: save, list with filters and search, per-user isolation', async () => {
  const { ProjectRepository, MemoryStore } = await load('core/projects.mjs');
  const store = new MemoryStore();
  const mine = new ProjectRepository(store, 'u1');
  const other = new ProjectRepository(store, 'u2');
  const a = await mine.save({ title: 'إعلان القهوة', type: 'image', status: 'completed' });
  await new Promise(r => setTimeout(r, 5));
  await mine.save({ title: 'Reel الترحيب', type: 'short', status: 'draft' });
  await other.save({ title: 'مشروع آخر', type: 'video', status: 'completed' });
  assert.equal((await mine.list()).length, 2);
  assert.equal((await mine.list())[0].title, 'Reel الترحيب', 'newest first');
  assert.equal((await mine.list({ filter: 'image' })).length, 1);
  assert.equal((await mine.list({ filter: 'short' })).length, 1);
  assert.equal((await mine.list({ filter: 'completed' })).length, 1);
  assert.equal((await mine.list({ filter: 'draft' })).length, 1);
  assert.equal((await mine.list({ search: 'قهوة' })).length, 1);
  assert.equal(await other.get(a.id), null, 'cannot read another user project');
  await assert.rejects(other.save({ id: a.id, title: 'x' }));
  assert.equal(await other.remove(a.id), false);
  const updated = await mine.save({ id: a.id, title: 'إعلان القهوة 2', status: 'completed' });
  assert.equal(updated.created_at, a.created_at);
  assert.equal(await mine.remove(a.id), true);
  assert.equal((await mine.list()).length, 1);
  const bad = await mine.save({ title: '', type: 'evil', status: 'hacked' });
  assert.equal(bad.type, 'image');
  assert.equal(bad.status, 'draft');
});

test('templates: 10 templates with the required fields', async () => {
  const { TEMPLATES, templateToPlan, getTemplate } = await load('templates.mjs');
  assert.equal(TEMPLATES.length, 10);
  for (const t of TEMPLATES) {
    for (const k of ['templateId', 'title', 'category', 'thumbnail', 'aspectRatio', 'duration', 'engine', 'editableFields']) assert.ok(t[k] !== undefined, `${t.templateId}.${k}`);
  }
  const plan = templateToPlan(getTemplate('product-promotion'), { title: 'منتج' }, ['data:image/png;base64,x']);
  assert.equal(plan.images.length, 1);
  assert.ok(plan.aspect);
});

test('subtitles: SRT and VTT export, segments normalised', async () => {
  const m = await load('engines/local/media.mjs');
  const segs = [{ start: 3.5, end: 2, text: 'ثانيًا' }, { start: 0, end: 1.25, text: 'أولًا' }, { start: 5, end: 6, text: '   ' }];
  const srt = m.generateSubtitles(segs, 'srt');
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:01,250\nأولًا\n\n2\n00:00:03,500 --> 00:00:04,500\nثانيًا\n');
  const vtt = m.generateSubtitles(segs, 'vtt');
  assert.ok(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:01.250'));
  const tr = await m.transcribe({ duration: 12, language: 'ar' }, noopCtx());
  assert.equal(tr.sample, true, 'sample results are labelled');
  const shorts = await m.analyzeShorts({ duration: 300 }, noopCtx());
  assert.ok(shorts.clips.length > 0);
  for (const c of shorts.clips) {
    for (const k of ['start', 'end', 'duration', 'title', 'score']) assert.ok(c[k] !== undefined, k);
    assert.ok(c.end <= 300 && c.start < c.end);
  }
  const tiny = await m.analyzeShorts({ duration: 4 }, noopCtx());
  assert.deepEqual(tiny.clips.map(c => [c.start, c.end]), [[0, 4]], 'clips never exceed a short video');
});

test('content: every content action returns output, unknown action fails', async () => {
  const c = await load('engines/local/content.mjs');
  const input = { topic: 'قهوة صحية', audience: 'الأمهات', goal: 'راسلنا' };
  for (const action of ['script', 'caption', 'hooks', 'cta', 'hashtags', 'variants', 'weekly', 'videoPlan']) {
    const r = await c.generate({ action, input }, noopCtx());
    assert.ok(r.output && (Array.isArray(r.output) ? r.output.length : String(r.output).length), action);
  }
  await assert.rejects(c.generate({ action: 'unknown-action', input }, noopCtx()));
  const p = await c.schedulePost({ platforms: ['Facebook'], when: '2026-10-10T10:00', text: 'x' }, noopCtx());
  assert.equal(p.status, 'scheduled');
  assert.equal(p.connected, false);
});

test('frontend: no secrets, no engine names in visible UI text, no innerHTML', () => {
  const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(DS);
  files.push(path.join(__dirname, '..', 'app', 'design-studio-loader.js'));
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /sk-[A-Za-z0-9]{10,}|SUPABASE_SECRET|SERVICE_ROLE|OPENAI_API_KEY|FAL_KEY|COMFYUI_URL|https?:\/\/[^'"\s]*(runpod|modal|comfy)/i, file);
    assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|eval\(|new Function\(/, file);
  }
  const views = files.filter(f => f.includes(`${path.sep}views${path.sep}`));
  for (const file of views) {
    const strings = fs.readFileSync(file, 'utf8').match(/'[^'\n]*'|`[^`\n]*`/g) || [];
    for (const s of strings) assert.doesNotMatch(s, /ComfyUI|WhisperX|Remotion|HyperFrames|PyVideoTrans|OpenShorts|Postiz|ESRGAN|ORMBG|MI-GAN|ONNX|\bMock\b/i, `${path.basename(file)}: ${s}`);
  }
});

test('index.html: studio is lazy (loader only) and tab is whitelisted', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(html, /<script src="design-studio-loader\.js\?v=\d+"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+design-studio\/index\.mjs/);
  assert.doesNotMatch(html, /<link[^>]+design-studio\/studio\.css/);
  assert.match(html, /'academy','design','leader'\]\.includes\(x\.tab\)/);
  assert.match(html, /id=\\?"designStudioHost\\?"/);
});

const SERVER_ENV = {
  DESIGN_JOB_SIGNING_SECRET: 'test-only-signing-value',
  COMFYUI_URL: 'https://gpu.example.test',
  COMFYUI_API_KEY: 'test-only-key',
  DESIGN_IMAGE_PROVIDER: 'comfyui',
  DESIGN_VIDEO_PROVIDER: 'remotion',
  DESIGN_SHORTS_ENABLED: 'false'
};

test('server: job ids are signed per user, config exposes no URLs or keys', () => {
  const saved = {};
  for (const [k, v] of Object.entries(SERVER_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  try {
    const e = require('../api/_design/engines');
    const token = e.signJob('user-1', 'image', 'comfyui', 'w-42');
    assert.deepEqual(e.verifyJob(token, 'user-1'), { u: 'user-1', e: 'image', p: 'comfyui', j: 'w-42' });
    assert.equal(e.verifyJob(token, 'user-2'), null, 'another user cannot use the job id');
    const [payload] = token.split('.');
    assert.equal(e.verifyJob(payload + '.forged', 'user-1'), null);
    const cfg = e.publicConfig();
    assert.equal(cfg.providers.image, 'comfyui');
    assert.equal(cfg.providers.video, 'local', 'unconfigured engine falls back to local');
    assert.equal(cfg.flags.DESIGN_SHORTS_ENABLED, false);
    assert.doesNotMatch(JSON.stringify(cfg), /example\.test|test-only/);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) Reflect.deleteProperty(process.env, k); else process.env[k] = v; }
  }
});

test('server: endpoint rejects bad methods, unknown actions and missing sessions', async () => {
  const handler = require('../api/design-studio');
  const call = (method, body) => new Promise(resolve => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    handler({ method, body }, res);
  });
  assert.equal((await call('GET', null)).status, 405);
  assert.equal((await call('POST', { action: 'drop_tables', args: {} })).status, 400);
  const r = await call('POST', { action: 'config', args: { p_token: 'not-a-token' } });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /سجّل الدخول/);
});
