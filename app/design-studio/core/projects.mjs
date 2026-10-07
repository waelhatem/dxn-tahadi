/* مستودع المشاريع (Repository Pattern). Phase 1: التخزين على جهاز المستخدم عبر IndexedDB
   (مع مخزن في الذاكرة كبديل). Phase 2: مستودع Supabase بنفس الواجهة بعد تطبيق ملف الهجرة. */
import { PROJECT_TYPES, PROJECT_STATUSES, THUMB_SIDE } from '../config.mjs';

/* مجموعات فلاتر «مشاريعي»: كل فلتر يطابق نوعًا أو أكثر، أو حالة. */
export const FILTERS = Object.freeze({
  all: { label: 'الكل' },
  image: { label: 'صور', types: ['image', 'product', 'social'] },
  video: { label: 'فيديو', types: ['video'] },
  short: { label: 'Shorts', types: ['short'] },
  audio: { label: 'صوت', types: ['audio', 'translation'] },
  completed: { label: 'مكتمل', status: 'completed' },
  draft: { label: 'مسودة', status: 'draft' }
});

export class MemoryStore {
  constructor() { this.map = new Map(); }
  async all() { return [...this.map.values()]; }
  async get(id) { return this.map.get(id) || null; }
  async put(rec) { this.map.set(rec.id, rec); return rec; }
  async delete(id) { this.map.delete(id); }
}

/* مخزن IndexedDB منفصل لكل مستخدم، فلا تظهر مشاريع مستخدم لمستخدم آخر على الجهاز نفسه. */
export class IndexedDbStore {
  constructor(userKey) { this.name = `dxn-design-studio-${String(userKey || 'guest').replace(/[^\w-]/g, '_')}`; this.db = null; }
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('projects', mode);
      const req = fn(t.objectStore('projects'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  async all() { return (await this.run('readonly', s => s.getAll())) || []; }
  async get(id) { return (await this.run('readonly', s => s.get(id))) || null; }
  async put(rec) { await this.run('readwrite', s => s.put(rec)); return rec; }
  async delete(id) { await this.run('readwrite', s => s.delete(id)); }
}

function newId() { return 'prj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export class ProjectRepository {
  constructor(store, userId) { this.store = store; this.userId = String(userId || 'guest'); }

  /* الحقول: id,user_id,title,type,status,thumbnail,settings,assets,created_at,updated_at */
  async save(project) {
    const now = new Date().toISOString();
    const existing = project.id ? await this.store.get(project.id) : null;
    if (existing && existing.user_id !== this.userId) throw new Error('لا يمكنك تعديل مشروع مستخدم آخر.');
    const rec = {
      id: (existing && existing.id) || project.id || newId(),
      user_id: this.userId,
      title: String(project.title || 'مشروع بدون عنوان').trim().slice(0, 120) || 'مشروع بدون عنوان',
      type: PROJECT_TYPES.includes(project.type) ? project.type : 'image',
      status: PROJECT_STATUSES.includes(project.status) ? project.status : 'draft',
      thumbnail: project.thumbnail || (existing && existing.thumbnail) || '',
      settings: project.settings || (existing && existing.settings) || {},
      assets: project.assets || (existing && existing.assets) || [],
      created_at: (existing && existing.created_at) || now,
      updated_at: now
    };
    return this.store.put(rec);
  }

  async get(id) {
    const rec = await this.store.get(id);
    return rec && rec.user_id === this.userId ? rec : null;
  }

  async list({ filter = 'all', search = '', limit = 0 } = {}) {
    const group = FILTERS[filter] || FILTERS.all;
    const q = String(search || '').trim().toLowerCase();
    let rows = (await this.store.all()).filter(p => p.user_id === this.userId);
    if (group.types) rows = rows.filter(p => group.types.includes(p.type));
    if (group.status) rows = rows.filter(p => p.status === group.status);
    if (q) rows = rows.filter(p => String(p.title).toLowerCase().includes(q));
    rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return limit ? rows.slice(0, limit) : rows;
  }

  async remove(id) {
    const rec = await this.get(id);
    if (!rec) return false;
    await this.store.delete(id);
    return true;
  }
}

/* صورة مصغرة صغيرة (JPEG) لعرضها في قائمة المشاريع. */
export async function makeThumbnail(source) {
  if (!source) return '';
  const img = typeof source === 'string'
    ? await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = source; })
    : source;
  const w = img.naturalWidth || img.videoWidth || img.width, hgt = img.naturalHeight || img.videoHeight || img.height;
  const scale = Math.min(1, THUMB_SIDE / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(hgt * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}

/* مفتاح المستخدم من بيانات الجلسة الحالية في الصفحة (رقم العضوية أو معرف المستخدم). */
export function currentUserKey(ctx) {
  const me = ctx && ctx.me;
  if (me && (me.member_no || me.id)) return String(me.member_no || me.id);
  if (ctx && ctx.userId) return String(ctx.userId);
  return 'guest';
}

let repo = null;
export function initProjects(ctx) {
  const key = currentUserKey(ctx);
  if (repo && repo.userId === key) return repo;
  const store = typeof indexedDB !== 'undefined' ? new IndexedDbStore(key) : new MemoryStore();
  repo = new ProjectRepository(store, key);
  return repo;
}
export function projects() { return repo || initProjects(null); }