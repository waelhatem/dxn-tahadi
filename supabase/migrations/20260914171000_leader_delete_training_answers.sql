-- V86.46.14 — حذف إجابات اختبار تدريب بالكامل بواسطة القائد فقط.
-- الحذف نهائي من training_answers، وبالتالي يختفي من القائد والعضو
-- ويستطيع العضو البدء بإجابة جديدة من الصفر.

create or replace function public.leader_delete_training_answers(
  p_token uuid,
  p_lesson_no integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  deleted_count integer := 0;
begin
  select au.id as user_id, au.role
    into s
  from sessions ss
  join app_users au on au.id=ss.user_id
  where ss.token=p_token
    and ss.expires_at>now()
    and au.active=true
  limit 1;

  if not found or s.role<>'leader' then
    raise exception using errcode='P0001',message='غير مصرح للقائد';
  end if;

  delete from training_answers ta
  using training_questions q, training_assessments a
  where ta.question_id=q.id
    and q.assessment_id=a.id
    and a.lesson_no=p_lesson_no;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'ok',true,
    'lesson_no',p_lesson_no,
    'deleted_count',deleted_count
  );
end $$;

grant execute on function public.leader_delete_training_answers(uuid,integer) to anon,authenticated;

notify pgrst, 'reload schema';
