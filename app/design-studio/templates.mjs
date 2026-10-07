/* نظام القوالب: كل قالب يحدد المقاس والمدة والحقول القابلة للتعديل والمحرك. thumbnail لون/رمز يُرسم في الواجهة. */
export const TEMPLATES = Object.freeze([
  { templateId: 'product-promotion', title: 'ترويج منتج', category: 'إعلان', thumbnail: { icon: '🛍️', color: '#0f513f' }, aspectRatio: '9:16', duration: 15, engine: 'video', editableFields: ['title', 'subtitle', 'images', 'cta'] },
  { templateId: 'motivational-reel', title: 'Reel تحفيزي', category: 'تحفيز', thumbnail: { icon: '🔥', color: '#b45309' }, aspectRatio: '9:16', duration: 12, engine: 'video', editableFields: ['title', 'quote', 'images'] },
  { templateId: 'educational-reel', title: 'Reel تعليمي', category: 'تعليم', thumbnail: { icon: '📚', color: '#1d4ed8' }, aspectRatio: '9:16', duration: 20, engine: 'video', editableFields: ['title', 'points', 'images'] },
  { templateId: 'quote-video', title: 'فيديو اقتباس', category: 'تحفيز', thumbnail: { icon: '💬', color: '#6d28d9' }, aspectRatio: '1:1', duration: 8, engine: 'video', editableFields: ['quote', 'author', 'images'] },
  { templateId: 'before-after', title: 'قبل / بعد', category: 'نتائج', thumbnail: { icon: '↔️', color: '#0e7490' }, aspectRatio: '4:5', duration: 10, engine: 'video', editableFields: ['title', 'images'] },
  { templateId: 'new-member-welcome', title: 'ترحيب بعضو جديد', category: 'المجتمع', thumbnail: { icon: '🤝', color: '#15803d' }, aspectRatio: '9:16', duration: 10, engine: 'video', editableFields: ['name', 'title', 'images'] },
  { templateId: 'achievement', title: 'إنجاز', category: 'المجتمع', thumbnail: { icon: '🏆', color: '#a16207' }, aspectRatio: '1:1', duration: 10, engine: 'video', editableFields: ['name', 'achievement', 'images'] },
  { templateId: 'event-announcement', title: 'إعلان فعالية', category: 'إعلان', thumbnail: { icon: '📅', color: '#be123c' }, aspectRatio: '16:9', duration: 15, engine: 'video', editableFields: ['title', 'date', 'place', 'images'] },
  { templateId: 'training-announcement', title: 'إعلان تدريب', category: 'تعليم', thumbnail: { icon: '🎓', color: '#4338ca' }, aspectRatio: '9:16', duration: 12, engine: 'video', editableFields: ['title', 'date', 'images'] },
  { templateId: 'product-benefits', title: 'فوائد المنتج', category: 'إعلان', thumbnail: { icon: '✅', color: '#047857' }, aspectRatio: '4:5', duration: 15, engine: 'video', editableFields: ['title', 'benefits', 'images'] }
]);

export const TEMPLATE_FIELD_LABELS = Object.freeze({
  title: 'العنوان', subtitle: 'العنوان الفرعي', cta: 'الدعوة للتواصل', quote: 'الاقتباس', author: 'القائل',
  points: 'النقاط (سطر لكل نقطة)', name: 'الاسم', achievement: 'الإنجاز', date: 'التاريخ', place: 'المكان', benefits: 'الفوائد (سطر لكل فائدة)', images: 'الصور'
});

export function getTemplate(id) { return TEMPLATES.find(t => t.templateId === id) || null; }

/* يحوّل قيم القالب إلى خطة فيديو يفهمها videoEngine. */
export function templateToPlan(tpl, values, images) {
  const v = values || {};
  const lines = String(v.points || v.benefits || '').split('\n').map(s => s.trim()).filter(Boolean);
  const intro = { title: v.title || v.name || tpl.title, subtitle: v.subtitle || v.date || v.author || '' };
  const outro = { title: v.cta || v.achievement || v.place || 'تابعونا', subtitle: 'مجتمع الصحة والثراء' };
  const per = Math.max(1.5, (tpl.duration - 3.2) / Math.max(1, images.length));
  return { aspect: tpl.aspectRatio, images, secondsPerImage: per, intro, outro, captions: lines.length ? lines : (v.quote ? [v.quote] : []), motion: 'zoom', transition: 'fade' };
}