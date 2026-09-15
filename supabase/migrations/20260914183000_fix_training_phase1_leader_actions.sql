-- V86.46.20 — إصلاح إجراءات لوحة القائد لتعمل مع بنية Phase-1 الحالية.
-- لا تعتمد أي دالة هنا على public.training_assessments أو q.assessment_id.

-- إلغاء مسار الحذف الشامل القديم نهائيًا.
revoke execute on function public.leader_delete_training_answers(uuid,integer) from anon,authenticated;
drop function if exists public.leader_delete_training_answers(uuid,integer);

-- Bootstrap للقائد والعضو باستخدام training_questions.lesson_no مباشرة.
create or replace function public.training_assessment_bootstrap(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  result jsonb;
begin
  select au.id as user_id, au.role, au.member_id
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='جلسة غير صالحة أو منتهية';
  end if;

  select jsonb_build_object(
    'role', s.role,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'lesson_no', q.lesson_no,
        'question_no', q.question_no,
        'question', q.question,
        'points', q.points
      ) order by q.lesson_no, q.question_no)
      from public.training_questions q
      where q.active = true
    ), '[]'::jsonb),
    'my_answers', case when s.role = 'member' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ta.id,
        'question_id', ta.question_id,
        'member_id', ta.member_id,
        'attempt_no', ta.attempt_no,
        'answer', ta.answer,
        'status', ta.status,
        'score', ta.score,
        'reviewer_note', ta.reviewer_note,
        'created_at', ta.created_at,
        'reviewed_at', ta.reviewed_at
      ) order by ta.created_at desc)
      from public.training_answers ta
      where ta.member_id = s.member_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'all_answers', case when s.role = 'leader' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ta.id,
        'question_id', ta.question_id,
        'member_id', ta.member_id,
        'member_name', m.name,
        'member_no', m.member_no,
        'lesson_no', q.lesson_no,
        'question_no', q.question_no,
        'question', q.question,
        'model_answer', q.model_answer,
        'rubric', q.rubric,
        'attempt_no', ta.attempt_no,
        'answer', ta.answer,
        'status', ta.status,
        'score', ta.score,
        'reviewer_note', ta.reviewer_note,
        'created_at', ta.created_at,
        'reviewed_at', ta.reviewed_at
      ) order by ta.created_at desc)
      from public.training_answers ta
      join public.members m on m.id = ta.member_id
      join public.training_questions q on q.id = ta.question_id
      where coalesce(ta.leader_hidden_at, null) is null
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into result;

  return result;
end;
$$;

grant execute on function public.training_assessment_bootstrap(uuid) to anon,authenticated;

-- إخفاء سؤال واحد من لوحة القائد فقط.
create or replace function public.leader_hide_training_answer(
  p_token uuid,
  p_answer_id uuid
)
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
    raise exception using errcode='P0001', message='غير مصرح للقائد';
  end if;

  update public.training_answers
  set leader_hidden_at = coalesce(leader_hidden_at, now())
  where id = p_answer_id;

  if not found then
    raise exception using errcode='P0001', message='نتيجة الاختبار غير موجودة';
  end if;

  return jsonb_build_object('ok', true, 'answer_id', p_answer_id);
end;
$$;

grant execute on function public.leader_hide_training_answer(uuid,uuid) to anon,authenticated;

-- الحذف النهائي: عضو واحد + تدريب واحد فقط.
create or replace function public.leader_delete_member_training_answers(
  p_token uuid,
  p_member_id uuid,
  p_lesson_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  deleted_count integer := 0;
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
    raise exception using errcode='P0001', message='غير مصرح للقائد';
  end if;

  delete from public.training_answers ta
  using public.training_questions q
  where ta.member_id = p_member_id
    and ta.question_id = q.id
    and q.lesson_no = p_lesson_no;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'lesson_no', p_lesson_no,
    'deleted_count', deleted_count
  );
end;
$$;

grant execute on function public.leader_delete_member_training_answers(uuid,uuid,integer)
to anon,authenticated;

notify pgrst, 'reload schema';
