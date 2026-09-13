-- V86.44.7 — إدارة أسئلة اختبارات التدريبات للقائد
-- يسمح للقائد بتعديل نص السؤال والإجابة النموذجية ومعيار التقييم والدرجة وتفعيل السؤال.
-- لا يسمح للعضو باستخدام هذه الوظيفة.

create or replace function public.training_questions_admin(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  select au.id as user_id, au.role
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found or s.role <> 'leader' then
    raise exception using errcode='P0001', message='غير مصرح — هذه الوظيفة للقائد فقط';
  end if;

  return jsonb_build_object(
    'ok', true,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'lesson_no', q.lesson_no,
        'question_no', q.question_no,
        'question', q.question,
        'model_answer', q.model_answer,
        'rubric', q.rubric,
        'points', q.points,
        'active', q.active
      ) order by q.lesson_no, q.question_no)
      from public.training_questions q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_training_question(
  p_token uuid,
  p_question_id uuid,
  p_question text,
  p_model_answer text default '',
  p_rubric text default '',
  p_points integer default 100,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  r public.training_questions;
  q text := trim(coalesce(p_question, ''));
  ma text := trim(coalesce(p_model_answer, ''));
  rb text := trim(coalesce(p_rubric, ''));
  pts integer := greatest(1, least(100, coalesce(p_points, 100)));
begin
  select au.id as user_id, au.role
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found or s.role <> 'leader' then
    raise exception using errcode='P0001', message='غير مصرح — هذه الوظيفة للقائد فقط';
  end if;

  if length(q) < 5 then
    raise exception using errcode='P0001', message='نص السؤال قصير جدًا';
  end if;

  update public.training_questions
  set question = q,
      model_answer = ma,
      rubric = rb,
      points = pts,
      active = coalesce(p_active, true),
      updated_at = now()
  where id = p_question_id
  returning * into r;

  if not found then
    raise exception using errcode='P0001', message='السؤال غير موجود';
  end if;

  return jsonb_build_object(
    'ok', true,
    'question', jsonb_build_object(
      'id', r.id,
      'lesson_no', r.lesson_no,
      'question_no', r.question_no,
      'question', r.question,
      'model_answer', r.model_answer,
      'rubric', r.rubric,
      'points', r.points,
      'active', r.active
    )
  );
end;
$$;

revoke execute on function public.training_questions_admin(uuid) from public;
revoke execute on function public.update_training_question(uuid,uuid,text,text,text,integer,boolean) from public;
grant execute on function public.training_questions_admin(uuid) to anon, authenticated;
grant execute on function public.update_training_question(uuid,uuid,text,text,text,integer,boolean) to anon, authenticated;
