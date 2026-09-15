-- V86.46.13 — إخفاء نتائج اختبارات التدريب من لوحة القائد فقط.
-- لا يتم حذف الإجابة أو الدرجة أو الحالة من بيانات العضو.

alter table public.training_answers
  add column if not exists leader_hidden_at timestamptz;

create index if not exists idx_training_answers_leader_visible
  on public.training_answers(leader_hidden_at, updated_at desc);

create or replace function public.training_assessment_bootstrap(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  result jsonb;
begin
  select au.id as user_id, au.role, au.member_id
    into s
  from sessions ss join app_users au on au.id=ss.user_id
  where ss.token=p_token and ss.expires_at>now() and au.active=true
  limit 1;
  if not found then raise exception using errcode='P0001',message='جلسة غير صالحة أو منتهية'; end if;

  select jsonb_build_object(
    'role',s.role,
    'assessments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'lesson_no',a.lesson_no,'lesson_title',a.lesson_title,'video_url',a.video_url,'active',a.active,
      'questions',coalesce((select jsonb_agg(jsonb_build_object(
        'id',q.id,'question_no',q.question_no,'question',q.question,'points',q.points
      ) order by q.question_no) from training_questions q where q.assessment_id=a.id and q.active=true),'[]'::jsonb)
    ) order by a.lesson_no) from training_assessments a where a.active=true),'[]'::jsonb),
    'questions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.id,'lesson_no',a.lesson_no,'question_no',q.question_no,'question',q.question,'points',q.points
    ) order by a.lesson_no,q.question_no)
    from training_questions q join training_assessments a on a.id=q.assessment_id
    where q.active=true and a.active=true),'[]'::jsonb),
    'my_answers',case when s.role='member' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',ta.id,'question_id',ta.question_id,'attempt_no',ta.attempt_no,'answer',ta.answer,'status',ta.status,'score',ta.score,'reviewer_note',ta.reviewer_note,'created_at',ta.created_at,'reviewed_at',ta.reviewed_at
    ) order by ta.created_at desc) from training_answers ta where ta.member_id=s.member_id),'[]'::jsonb) else '[]'::jsonb end,
    'all_answers',case when s.role='leader' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',ta.id,'question_id',ta.question_id,'member_id',ta.member_id,'member_name',m.name,'member_no',m.member_no,
      'lesson_no',a.lesson_no,'lesson_title',a.lesson_title,'question_no',q.question_no,'question',q.question,
      'attempt_no',ta.attempt_no,'answer',ta.answer,'status',ta.status,'score',ta.score,'reviewer_note',ta.reviewer_note,
      'created_at',ta.created_at,'reviewed_at',ta.reviewed_at
    ) order by ta.created_at desc) from training_answers ta join members m on m.id=ta.member_id join training_questions q on q.id=ta.question_id join training_assessments a on a.id=q.assessment_id where ta.leader_hidden_at is null),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

grant execute on function public.training_assessment_bootstrap(uuid) to anon,authenticated;

create or replace function public.leader_hide_training_answer(p_token uuid,p_answer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
begin
  select au.id as user_id, au.role
    into s
  from sessions ss join app_users au on au.id=ss.user_id
  where ss.token=p_token and ss.expires_at>now() and au.active=true
  limit 1;

  if not found or s.role<>'leader' then
    raise exception using errcode='P0001',message='غير مصرح للقائد';
  end if;

  update training_answers
  set leader_hidden_at=coalesce(leader_hidden_at,now())
  where id=p_answer_id;

  if not found then
    raise exception using errcode='P0001',message='نتيجة الاختبار غير موجودة';
  end if;

  return jsonb_build_object('ok',true,'answer_id',p_answer_id);
end $$;

grant execute on function public.leader_hide_training_answer(uuid,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
