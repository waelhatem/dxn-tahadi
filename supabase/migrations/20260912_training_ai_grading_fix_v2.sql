-- V86.45.6 — إصلاح سياق التقييم الذكي لهيكل قاعدة البيانات الفعلي
-- قاعدة البيانات الحالية تستخدم training_questions.lesson_no مباشرة، ولا تعتمد على training_assessments.

create or replace function public.training_ai_grade_context(
  p_token uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s record;
  q record;
begin
  select au.id as user_id, au.role, au.member_id
    into s
  from public.sessions ss
  join public.app_users au on au.id=ss.user_id
  where ss.token=p_token
    and ss.expires_at>now()
    and au.active=true
  limit 1;

  if not found or s.role<>'member' or s.member_id is null then
    raise exception using errcode='P0001',message='غير مصرح';
  end if;

  select
    q.id,
    q.question,
    q.model_answer,
    q.rubric,
    q.points,
    q.lesson_no,
    coalesce(nullif(trim(q.question),''),'') as lesson_title
    into q
  from public.training_questions q
  where q.id=p_question_id
    and q.active=true
  limit 1;

  if not found then
    raise exception using errcode='P0001',message='السؤال غير موجود';
  end if;

  return jsonb_build_object(
    'question_id',q.id,
    'lesson_no',q.lesson_no,
    'lesson_title',q.lesson_title,
    'question',q.question,
    'model_answer',q.model_answer,
    'rubric',q.rubric,
    'points',q.points
  );
end $$;

revoke execute on function public.training_ai_grade_context(uuid,uuid) from public;
grant execute on function public.training_ai_grade_context(uuid,uuid) to anon,authenticated,service_role;

grant execute on function public.ai_review_training_answer(uuid,uuid,text,integer,text) to service_role;
