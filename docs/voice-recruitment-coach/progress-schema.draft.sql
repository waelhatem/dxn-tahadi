-- ⚠️ مسودة للمراجعة فقط — لا تُطبَّق على Production.
-- 🎙️ مدرب الاستقطاب الصوتي: حفظ تقدم العضو في المرحلة الثانية.
-- موجودة خارج supabase/migrations عمدًا حتى لا تُطبَّق بالخطأ.
-- المرحلة الأولى تحفظ نفس الحقول على جهاز العضو فقط (localStorage: dxn_recruitment_coach_progress_v1).
-- لا يُخزَّن أي تسجيل صوتي ولا نص المحادثة الخام؛ فقط ملخص الجلسة والدرجات.

create table if not exists public.recruitment_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade, -- راجع اسم جدول/عمود العضو الفعلي قبل التطبيق
  persona_key text not null check (persona_key in ('employee_m','employee_f','homemaker','job_seeker','retiree')),
  goal text not null check (goal in ('rapport','discover_need','present_idea','invite','objection','follow_up','next_step')),
  level text not null check (level in ('beginner','intermediate','hard')),
  total smallint not null check (total between 0 and 100),
  scores jsonb not null,             -- {opening,questions,listening,need_discovery,presentation,objection_handling,no_pressure,confidence_clarity,closing} كل قيمة 0-10
  turns smallint not null default 0, -- عدد رسائل المتدرب
  outcome text check (outcome in ('ongoing','agreed_next_step','declined')),
  created_at timestamptz not null default now()
);

create index if not exists recruitment_coach_sessions_member_idx
  on public.recruitment_coach_sessions (member_id, created_at desc);

alter table public.recruitment_coach_sessions enable row level security;
-- لا سياسات قراءة/كتابة مباشرة للمتصفح: الكتابة والقراءة عبر RPC تتحقق من p_token مثل بقية المنصة.

-- مثال RPC للحفظ (يُستدعى من api/recruitment-coach.js بالمفتاح السري بعد verifyToken):
-- create or replace function public.save_recruitment_coach_session(p_token uuid, p_persona_key text, p_goal text,
--   p_level text, p_total int, p_scores jsonb, p_turns int, p_outcome text) returns uuid ...
-- ومثال للقراءة: public.recruitment_coach_progress(p_token uuid) يعيد آخر 50 جلسة للعضو نفسه فقط،
-- ويمكن للقائد لاحقًا رؤية ملخص فريقه عبر دالة منفصلة تتحقق من الدور.
