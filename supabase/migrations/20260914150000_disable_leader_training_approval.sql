-- V86.46.3 — اعتماد اختبارات التدريب أصبح تلقائيًا بالذكاء الاصطناعي.
-- القائد يستطيع الاطلاع على النتائج فقط، ولا يملك اعتمادًا أو إعادةً يدوية.

revoke all on function public.review_training_answer(uuid, uuid, text, integer, text) from public;
revoke all on function public.review_training_answer(uuid, uuid, text, integer, text) from anon;
revoke all on function public.review_training_answer(uuid, uuid, text, integer, text) from authenticated;

notify pgrst, 'reload schema';
