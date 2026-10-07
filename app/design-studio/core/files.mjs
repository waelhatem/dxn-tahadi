/* التحقق من الملفات: نوع MIME + توقيع الملف (magic bytes) + الحجم. لا يُعتمد على الامتداد وحده. */
import { FILE_RULES, MESSAGES } from '../config.mjs';

function ascii(bytes, start, len) { let s = ''; for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
const SIGNATURES = [
  { mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', test: b => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { mime: 'audio/wav', test: b => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE' },
  { mime: 'video/webm', test: b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: 'iso-bmff', test: b => ascii(b, 4, 4) === 'ftyp' },
  { mime: 'audio/mpeg', test: b => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) }
];

/* يكشف النوع الحقيقي من أول بايتات الملف. iso-bmff يشمل mp4/mov/m4a. */
export function sniff(bytes) {
  const hit = SIGNATURES.find(s => s.test(bytes));
  return hit ? hit.mime : '';
}

export function isCompatible(kind, declared, sniffed) {
  if (!sniffed) return false;
  if (kind === 'image') return sniffed === declared;
  if (kind === 'video') return sniffed === 'iso-bmff' || sniffed === 'video/webm';
  if (kind === 'audio') return sniffed === 'audio/mpeg' || sniffed === 'audio/wav' || sniffed === 'iso-bmff';
  return false;
}

/* يعيد {ok:true} أو {ok:false, error}. kind: image | video | audio. */
export async function validateFile(file, kind) {
  const rule = FILE_RULES[kind];
  if (!rule || !file) return { ok: false, error: MESSAGES.needFile };
  const declared = String(file.type || '').toLowerCase();
  if (!rule.mime.includes(declared)) return { ok: false, error: `${MESSAGES.unsupported} الأنواع المدعومة: ${rule.ext.join('، ')}.` };
  if (file.size > rule.maxBytes) return { ok: false, error: `${MESSAGES.tooLarge} الحد الأقصى ${Math.round(rule.maxBytes / 1024 / 1024)} MB.` };
  if (!file.size) return { ok: false, error: MESSAGES.uploadFailed };
  let bytes;
  try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch (_) { return { ok: false, error: MESSAGES.uploadFailed }; }
  if (!isCompatible(kind, declared, sniff(bytes))) return { ok: false, error: `${MESSAGES.unsupported} محتوى الملف لا يطابق نوعه.` };
  return { ok: true };
}

export function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(MESSAGES.uploadFailed));
    r.readAsDataURL(blob);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(MESSAGES.unsupported));
    img.src = src;
  });
}

/* مدة/أبعاد ملف فيديو أو صوت من البيانات الوصفية فقط. */
export function mediaInfo(src, kind) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
    el.preload = 'metadata';
    el.muted = true;
    const done = () => resolve({ duration: Number.isFinite(el.duration) ? el.duration : 0, width: el.videoWidth || 0, height: el.videoHeight || 0 });
    /* ملفات WebM المسجلة من المتصفح تُرجع مدة Infinity؛ القفز لنهاية الملف يكشف المدة الحقيقية. */
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return done();
      const timer = setTimeout(done, 4000);
      el.ontimeupdate = () => { if (!Number.isFinite(el.duration)) return; el.ontimeupdate = null; clearTimeout(timer); done(); };
      el.currentTime = 1e101;
    };
    el.onerror = () => reject(new Error(MESSAGES.unsupported));
    el.src = src;
  });
}