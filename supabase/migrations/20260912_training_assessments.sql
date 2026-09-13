-- V86.44 — نظام اختبارات التدريبات والشروحات
-- مستقل عن نظام الأسئلة الشهرية.

create table if not exists public.training_assessments (
  id uuid primary key default gen_random_uuid(),
  lesson_no integer not null unique check (lesson_no between 1 and 8),
  lesson_title text not null,
  video_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.training_assessments(id) on delete cascade,
  question_no integer not null check (question_no between 1 and 10),
  question text not null,
  model_answer text not null default '',
  rubric text not null default '',
  points integer not null default 10 check (points between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, question_no)
);

create table if not exists public.training_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.training_questions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  attempt_no integer not null default 1 check (attempt_no > 0),
  answer text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','retry')),
  score integer not null default 0 check (score >= 0),
  reviewer_note text not null default '',
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(question_id, member_id, attempt_no)
);

create index if not exists idx_training_questions_assessment on public.training_questions(assessment_id, question_no);
create index if not exists idx_training_answers_member on public.training_answers(member_id, question_id);
create index if not exists idx_training_answers_status on public.training_answers(status);

alter table public.training_assessments enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_answers enable row level security;

insert into public.training_assessments(lesson_no,lesson_title,video_url) values
(1,'خطوات أساسية للعمل بشكل احترافي','https://youtu.be/tVim2H5Elck'),
(2,'ماهي منتجات DXN الصحية - استخداماتها وفوائدها','https://youtu.be/n7W9LoCMdPo'),
(3,'التدريب الثالث','https://youtu.be/fVpXZkx5RKs'),
(4,'ماهو مشروع DXN - حقق حريتك المالية من البيت','https://youtu.be/K_N80xZlxXw'),
(5,'المتابعة الفعالة خطوة بخطوة','https://youtu.be/m-y7OjeLHFA'),
(6,'أساسيات في بناء الفريق الفعال في صناعة البيع المباشر','https://youtu.be/t1rDKfEgNqM'),
(7,'المهام اليومية الرئيسية لرواد صناعة البيع المباشر - إقفال الدائرة','https://youtu.be/IrKGTDT4SbM'),
(8,'مقدمات هامة في بناء الفريق الفعال','https://youtu.be/05Kwsyg1mLw')
on conflict (lesson_no) do update set lesson_title=excluded.lesson_title,video_url=excluded.video_url,updated_at=now();

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
    'my_answers',case when s.role='member' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',ta.id,'question_id',ta.question_id,'attempt_no',ta.attempt_no,'answer',ta.answer,'status',ta.status,'score',ta.score,'reviewer_note',ta.reviewer_note,'created_at',ta.created_at,'reviewed_at',ta.reviewed_at
    ) order by ta.created_at desc) from training_answers ta where ta.member_id=s.member_id),'[]'::jsonb) else '[]'::jsonb end,
    'all_answers',case when s.role='leader' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',ta.id,'question_id',ta.question_id,'member_id',ta.member_id,'member_name',m.name,'member_no',m.member_no,
      'lesson_no',a.lesson_no,'lesson_title',a.lesson_title,'question_no',q.question_no,'question',q.question,
      'attempt_no',ta.attempt_no,'answer',ta.answer,'status',ta.status,'score',ta.score,'reviewer_note',ta.reviewer_note,
      'created_at',ta.created_at,'reviewed_at',ta.reviewed_at
    ) order by ta.created_at desc) from training_answers ta join members m on m.id=ta.member_id join training_questions q on q.id=ta.question_id join training_assessments a on a.id=q.assessment_id),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

grant execute on function public.training_assessment_bootstrap(uuid) to anon,authenticated;

create or replace function public.submit_training_answer(p_token uuid,p_question_id uuid,p_answer text,p_attempt_no integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  row public.training_answers;
begin
  select au.id as user_id, au.role, au.member_id into s
  from sessions ss join app_users au on au.id=ss.user_id
  where ss.token=p_token and ss.expires_at>now() and au.active=true limit 1;
  if not found or s.role<>'member' or s.member_id is null then raise exception using errcode='P0001',message='غير مصرح'; end if;
  if not exists(select 1 from training_questions where id=p_question_id and active=true) then raise exception using errcode='P0001',message='السؤال غير موجود'; end if;
  if length(trim(coalesce(p_answer,'')))<2 then raise exception using errcode='P0001',message='اكتب إجابة قبل الإرسال'; end if;
  insert into training_answers(question_id,member_id,attempt_no,answer,status,score,reviewer_note,reviewed_by,reviewed_at,updated_at)
  values(p_question_id,s.member_id,greatest(1,p_attempt_no),trim(p_answer),'pending',0,'',null,null,now())
  on conflict(question_id,member_id,attempt_no) do update set answer=excluded.answer,status='pending',score=0,reviewer_note='',reviewed_by=null,reviewed_at=null,updated_at=now()
  returning * into row;
  return jsonb_build_object('ok',true,'answer_id',row.id,'status',row.status);
end $$;

grant execute on function public.submit_training_answer(uuid,uuid,text,integer) to anon,authenticated;

create or replace function public.review_training_answer(p_token uuid,p_answer_id uuid,p_status text,p_score integer,p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
  st text:=lower(trim(coalesce(p_status,'')));
  sc integer:=greatest(0,least(100,coalesce(p_score,0)));
begin
  select au.id as user_id,au.role into s from sessions ss join app_users au on au.id=ss.user_id
  where ss.token=p_token and ss.expires_at>now() and au.active=true limit 1;
  if not found or s.role<>'leader' then raise exception using errcode='P0001',message='غير مصرح للقائد'; end if;
  if st not in ('approved','retry') then raise exception using errcode='P0001',message='حالة مراجعة غير صحيحة'; end if;
  update training_answers set status=st,score=sc,reviewer_note=coalesce(p_note,''),reviewed_by=s.user_id,reviewed_at=now(),updated_at=now() where id=p_answer_id;
  if not found then raise exception using errcode='P0001',message='الإجابة غير موجودة'; end if;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.review_training_answer(uuid,uuid,text,integer,text) to anon,authenticated;
