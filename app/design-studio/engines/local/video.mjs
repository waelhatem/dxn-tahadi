/* محرك الفيديو المحلي: يصنع فيديو قصيرًا حقيقيًا من الصور داخل المتصفح (Canvas + MediaRecorder)
   مع مقدمة/خاتمة نصية وانتقالات وحركة Ken Burns. المحركات الثقيلة (Remotion/HyperFrames) تأتي عبر الخادم. */
import { ASPECTS, MESSAGES } from '../../config.mjs';
import { loadImage } from '../../core/files.mjs';

/* 30 إطارًا في الثانية. */
const FRAME_MS = 1000 / 30;

export function recordingMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return options.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
}
export function canRenderLocally() { return !!recordingMime() && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype; }

function frameSize(aspect) {
  const [a, b] = ASPECTS[aspect] || ASPECTS['9:16'];
  return a >= b ? [1280, Math.round(1280 * b / a)] : [Math.round(1280 * a / b), 1280];
}

function textCard(x, W, H, title, subtitle, t) {
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f513f'); g.addColorStop(1, '#1f8a6b');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = Math.min(1, t * 2);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.direction = 'rtl';
  const size = Math.round(Math.min(W, H) * 0.075);
  x.font = `900 ${size}px Tahoma, Arial, sans-serif`;
  x.fillText(String(title || '').slice(0, 40), W / 2, H / 2 - size * 0.2 + (1 - Math.min(1, t * 2)) * 30);
  if (subtitle) { x.font = `600 ${Math.round(size * 0.5)}px Tahoma, Arial, sans-serif`; x.fillText(String(subtitle).slice(0, 60), W / 2, H / 2 + size * 0.9); }
  x.globalAlpha = 1;
}

function drawSlide(x, W, H, img, t, motion) {
  const zoom = motion === 'none' ? 1 : 1 + 0.08 * t;
  const cover = Math.max(W / img.width, H / img.height) * zoom;
  const dx = motion === 'pan' ? (t - 0.5) * W * 0.06 : 0;
  x.drawImage(img, (W - img.width * cover) / 2 + dx, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
}

function caption(x, W, H, text) {
  if (!text) return;
  const size = Math.round(Math.min(W, H) * 0.05);
  x.font = `800 ${size}px Tahoma, Arial, sans-serif`;
  x.textAlign = 'center'; x.direction = 'rtl';
  const tw = Math.min(W * 0.9, x.measureText(text).width + size);
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect((W - tw) / 2, H * 0.82 - size, tw, size * 1.5);
  x.fillStyle = '#fff';
  x.fillText(String(text).slice(0, 70), W / 2, H * 0.82 + size * 0.15);
}

/* plan: {images:[src], aspect, secondsPerImage, intro:{title,subtitle}, outro:{title,subtitle}, captions:[text], motion, transition} */
export function buildTimeline(plan) {
  const per = Math.min(6, Math.max(1.2, Number(plan.secondsPerImage) || 2.5));
  const items = [];
  if (plan.intro && plan.intro.title) items.push({ kind: 'card', dur: 1.6, ...plan.intro });
  (plan.images || []).forEach((src, i) => items.push({ kind: 'image', dur: per, src, caption: (plan.captions || [])[i] || '' }));
  if (plan.outro && plan.outro.title) items.push({ kind: 'card', dur: 1.6, ...plan.outro });
  return { items, duration: items.reduce((s, it) => s + it.dur, 0) };
}

export async function renderVideo(plan, { progress, signal }) {
  const mime = recordingMime();
  if (!mime || !canRenderLocally()) throw new Error(MESSAGES.browserUnsupported);
  const [W, H] = frameSize(plan.aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const { items, duration } = buildTimeline(plan);
  if (!items.length) throw new Error(MESSAGES.needFile);
  for (const it of items) if (it.kind === 'image') it.img = await loadImage(it.src);
  progress(12, 'جاري تجهيز المشاهد...');
  /* اللوحة تبقى متصلة بالصفحة (خارج الشاشة) أثناء التسجيل، وكل إطار يُدفع يدويًا عبر requestFrame،
     لأن بعض المتصفحات لا تلتقط إطارات من لوحة غير مرسومة فينتج ملف فارغ. */
  c.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(c);
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const pushFrame = () => { if (track && typeof track.requestFrame === 'function') track.requestFrame(); };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(resolve => { rec.onstop = resolve; });
  try {
    rec.start(250);
    const start = performance.now();
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal && signal.aborted) { reject(new Error(MESSAGES.cancelled)); return; }
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= duration) { resolve(); return; }
        let acc = 0, idx = 0;
        while (idx < items.length - 1 && elapsed >= acc + items[idx].dur) { acc += items[idx].dur; idx++; }
        const it = items[idx], t = (elapsed - acc) / it.dur;
        if (it.kind === 'card') textCard(x, W, H, it.title, it.subtitle, t);
        else { drawSlide(x, W, H, it.img, t, plan.motion || 'zoom'); caption(x, W, H, it.caption); }
        if (plan.transition !== 'cut' && t < 0.12) { x.fillStyle = `rgba(0,0,0,${0.6 * (1 - t / 0.12)})`; x.fillRect(0, 0, W, H); }
        pushFrame();
        progress(15 + 80 * (elapsed / duration), 'جاري إنشاء الفيديو...');
        setTimeout(tick, FRAME_MS);
      };
      tick();
    });
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await done;
    stream.getTracks().forEach(t => t.stop());
    c.remove();
  }
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  /* لا نعرض نجاحًا لملف فارغ أبدًا. */
  if (!blob.size) throw new Error('تعذر تسجيل الفيديو على هذا المتصفح. جرّب Chrome أو Edge ثم أعد المحاولة.');
  return { blob, url: URL.createObjectURL(blob), mime: blob.type, duration, width: W, height: H, sample: false };
}