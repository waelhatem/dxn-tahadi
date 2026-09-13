-- V86.46.1 — إعادة إجابة السؤال تعدّل السجل السابق بدل إنشاء سجل جديد
-- الهدف: لكل عضو + سؤال يظهر سجل واحد فقط في إدارة القائد.
-- عند طلب الإعادة: نفس السجل يُحدّث، مع رفع رقم المحاولة.

-- تنظيف السجلات القديمة الناتجة عن النظام السابق، مع الاحتفاظ بأحدث إجابة لكل عضو وسؤال.
delete from public.training_answers ta
where ta.id in (
  select id
  from (
    select id,
           row_number() over (
             partition by question_id, member_id
             order by updated_at desc nulls last, created_at desc nulls last, id desc
           ) as rn
    from public.training_answers
  ) x
  where x.rn > 1
);

-- بعد التنظيف يصبح الضمان على مستوى السؤال + العضو فقط.
alter table public.training_answers
  drop constraint if exists training_answers_question_id_member_id_attempt_no_key;

alter table public.training_answers
  add constraint training_answers_question_id_member_id_key
  unique (question_id, member_id);

create or replace function public.submit_training_answer(
  p_token uuid,
  p_question_id uuid,
  p_answer text,
  p_attempt_no integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  row public.training_answers;
  next_attempt integer;
begin
  select au.id as user_id, au.role, au.member_id
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found or s.role <> 'member' or s.member_id is null then
    raise exception using errcode='P0001', message='غير مصرح';
  end if;

  if not exists (
    select 1 from public.training_questions q
    where q.id = p_question_id and q.active = true
  ) then
    raise exception using errcode='P0001', message='السؤال غير موجود';
  end if;

  if length(trim(coalesce(p_answer, ''))) < 2 then
    raise exception using errcode='P0001', message='اكتب إجابة قبل الإرسال';
  end if;

  -- إذا كان للسؤال سجل سابق، نعدّل نفس السجل.
  select * into row
  from public.training_answers
  where question_id = p_question_id
    and member_id = s.member_id
  order by updated_at desc nulls last, created_at desc nulls last, id desc
  limit 1
  for update;

  if found then
    if row.status = 'approved' then
      raise exception using errcode='P0001', message='الإجابة معتمدة بالفعل ولا تحتاج إلى إعادة إرسال';
    end if;

    -- لا نعتمد على p_attempt_no القادم من الواجهة لتجنب إنشاء محاولة جديدة كسجل جديد.
    -- يرتفع رقم المحاولة فقط عندما تكون الإجابة السابقة قد أُعيدت للعضو.
    next_attempt := case
      when row.status = 'retry' then greatest(row.attempt_no + 1, coalesce(p_attempt_no, row.attempt_no + 1))
      else greatest(1, row.attempt_no)
    end;

    update public.training_answers
    set answer = trim(p_answer),
        attempt_no = next_attempt,
        status = 'pending',
        score = 0,
        reviewer_note = '',
        reviewed_by = null,
        reviewed_at = null,
        updated_at = now()
    where id = row.id
    returning * into row;
  else
    insert into public.training_answers(
      question_id, member_id, attempt_no, answer, status, score,
      reviewer_note, reviewed_by, reviewed_at, updated_at
    )
    values(
      p_question_id, s.member_id, 1, trim(p_answer), 'pending', 0,
      '', null, null, now()
    )
    returning * into row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'answer_id', row.id,
    'status', row.status,
    'attempt_no', row.attempt_no,
    'updated', true
  );
end;
$$;

-- إعادة بناء بيانات الاختبارات بحيث لا يعرض القائد إلا آخر سجل لكل عضو + سؤال.
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
        'reviewer_note', case
          when ta.attempt_no >= 4 then coalesce(ta.reviewer_note, '')
          when ta.status = 'retry' then 'ركز في إجابتك. الإجابة تحتاج إلى مراجعة وإعادة.'
          else ''
        end,
        'created_at', ta.created_at,
        'updated_at', ta.updated_at,
        'reviewed_at', ta.reviewed_at
      ) order by ta.updated_at desc nulls last)
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
        'updated_at', ta.updated_at,
        'reviewed_at', ta.reviewed_at
      ) order by ta.updated_at desc nulls last)
      from public.training_answers ta
      join public.members m on m.id = ta.member_id
      join public.training_questions q on q.id = ta.question_id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into result;

  return result;
end;
$$;

revoke all on function public.submit_training_answer(uuid,uuid,text,integer) from public;
revoke all on function public.training_assessment_bootstrap(uuid) from public;
grant execute on function public.submit_training_answer(uuid,uuid,text,integer) to anon, authenticated;
grant execute on function public.training_assessment_bootstrap(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
