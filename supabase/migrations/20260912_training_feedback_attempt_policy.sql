-- V86.45.12 — سياسة ملاحظات اختبارات التدريبات
-- المحاولات 1 و2 و3: للعضو رسالة عامة فقط عند طلب الإعادة.
-- من المحاولة 4 فصاعدًا: يمكن إظهار الملاحظة التفصيلية.

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
  a record;
  st text := lower(trim(coalesce(p_status, '')));
  sc integer := greatest(0, least(100, coalesce(p_score, 0)));
  final_note text := '';
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

  select id, attempt_no
    into a
  from public.training_answers
  where id = p_answer_id
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='الإجابة غير موجودة';
  end if;

  if a.attempt_no <= 3 then
    final_note := case
      when st = 'retry' then 'ركز في إجابتك. الإجابة تحتاج إلى مراجعة وإعادة.'
      else ''
    end;
  else
    final_note := left(coalesce(p_note, ''), 500);
  end if;

  update public.training_answers
  set status = st,
      score = sc,
      reviewer_note = final_note,
      reviewed_by = s.user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_answer_id;

  return jsonb_build_object('ok', true, 'note', final_note);
end;
$$;

create or replace function public.ai_review_training_answer(
  p_token uuid,
  p_answer_id uuid,
  p_status text,
  p_score integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  s record;
  a record;
  st text := lower(trim(coalesce(p_status,'')));
  sc integer := greatest(0,least(100,coalesce(p_score,0)));
  final_note text := '';
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
    raise exception using errcode='P0001',message='جلسة العضو غير صالحة';
  end if;

  if st not in ('approved','retry') then
    raise exception using errcode='P0001',message='حالة مراجعة غير صحيحة';
  end if;

  select id,member_id,attempt_no into a
  from public.training_answers
  where id=p_answer_id
  limit 1;

  if not found or a.member_id<>s.member_id then
    raise exception using errcode='P0001',message='الإجابة غير موجودة أو لا تخص العضو';
  end if;

  if a.attempt_no <= 3 then
    final_note := case
      when st='retry' then 'ركز في إجابتك. الإجابة تحتاج إلى مراجعة وإعادة.'
      else ''
    end;
  else
    final_note := left(coalesce(p_note,''),500);
  end if;

  update public.training_answers
  set status=st,
      score=sc,
      reviewer_note=final_note,
      reviewed_by=null,
      reviewed_at=now(),
      updated_at=now()
  where id=p_answer_id and member_id=s.member_id;

  return jsonb_build_object('ok',true,'score',sc,'status',st,'note',final_note);
end $$;

notify pgrst, 'reload schema';
