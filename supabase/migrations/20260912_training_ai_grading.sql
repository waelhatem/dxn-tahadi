-- V86.45.1 — AI grading context + server-only grade application
-- The browser never receives the model answer/rubric from this RPC.

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
    q.id,q.question,q.model_answer,q.rubric,q.points,
    q.lesson_no,
    coalesce(nullif(trim(q.question),''),'') as lesson_title
    into q
  from public.training_questions q
  where q.id=p_question_id and q.active=true
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

-- Browser member calls the context through /api/rpc using the publishable key.
revoke execute on function public.training_ai_grade_context(uuid,uuid) from public;
grant execute on function public.training_ai_grade_context(uuid,uuid) to anon,authenticated;
-- Vercel backend uses the Supabase secret/service-role key.
grant execute on function public.training_ai_grade_context(uuid,uuid) to service_role;

-- This function is intentionally NOT executable by browser roles.
-- The Vercel backend calls it with the Supabase secret key after AI grading.
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
  st text:=lower(trim(coalesce(p_status,'')));
  sc integer:=greatest(0,least(100,coalesce(p_score,0)));
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

  select id,member_id into a
  from public.training_answers
  where id=p_answer_id
  limit 1;

  if not found or a.member_id<>s.member_id then
    raise exception using errcode='P0001',message='الإجابة غير موجودة أو لا تخص العضو';
  end if;

  update public.training_answers
  set status=st,
      score=sc,
      reviewer_note=coalesce(p_note,''),
      reviewed_by=null,
      reviewed_at=now(),
      updated_at=now()
  where id=p_answer_id and member_id=s.member_id;

  return jsonb_build_object('ok',true,'score',sc,'status',st,'note',coalesce(p_note,''));
end $$;

revoke execute on function public.ai_review_training_answer(uuid,uuid,text,integer,text) from public;
revoke execute on function public.ai_review_training_answer(uuid,uuid,text,integer,text) from anon;
revoke execute on function public.ai_review_training_answer(uuid,uuid,text,integer,text) from authenticated;
-- Only the Vercel server may apply the AI grade.
grant execute on function public.ai_review_training_answer(uuid,uuid,text,integer,text) to service_role;
