-- V86.44.2 — runtime for Phase-1 training assessments
-- Uses public.training_questions keyed by lesson_no.
-- Does NOT require public.training_assessments.

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
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into result;

  return result;
end;
$$;

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
  attempt integer := greatest(1, coalesce(p_attempt_no, 1));
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

  insert into public.training_answers(
    question_id, member_id, answer, attempt_no, status, score,
    reviewer_note, reviewed_by, reviewed_at, updated_at
  )
  values(
    p_question_id, s.member_id, trim(p_answer), attempt,
    'pending', 0, '', null, null, now()
  )
  on conflict(question_id, member_id, attempt_no)
  do update set
    answer = excluded.answer,
    status = 'pending',
    score = 0,
    reviewer_note = '',
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now()
  returning * into row;

  return jsonb_build_object(
    'ok', true,
    'answer_id', row.id,
    'status', row.status,
    'attempt_no', row.attempt_no
  );
end;
$$;

create or replace function public.review_training_answer(
  p_token uuid,
  p_answer_id uuid,
  p_status text,
  p_score integer default 0,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  st text := lower(trim(coalesce(p_status, '')));
  sc integer := greatest(0, least(100, coalesce(p_score, 0)));
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

  if st not in ('approved', 'retry') then
    raise exception using errcode='P0001', message='حالة مراجعة غير صحيحة';
  end if;

  update public.training_answers
  set status = st,
      score = sc,
      reviewer_note = coalesce(p_note, ''),
      reviewed_by = s.user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_answer_id;

  if not found then
    raise exception using errcode='P0001', message='الإجابة غير موجودة';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.training_assessment_bootstrap(uuid) from public;
revoke all on function public.submit_training_answer(uuid, uuid, text, integer) from public;
revoke all on function public.review_training_answer(uuid, uuid, text, integer, text) from public;
grant execute on function public.training_assessment_bootstrap(uuid) to anon, authenticated;
grant execute on function public.submit_training_answer(uuid, uuid, text, integer) to anon, authenticated;
 grant execute on function public.review_training_answer(uuid, uuid, text, integer, text) to anon, authenticated;

notify pgrst, 'reload schema';
