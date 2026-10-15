-- Separate advanced course from all existing basic/professional histories.
create table if not exists public.advanced_financial_lessons(
 lesson_no integer primary key check(lesson_no between 1 and 10),
 title text not null, video_id text not null check(video_id ~ '^[A-Za-z0-9_-]{11}$'),
 expected_duration_seconds integer not null default 0 check(expected_duration_seconds between 0 and 14400),
 active boolean not null default false, revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.advanced_financial_questions(
 lesson_no integer not null references public.advanced_financial_lessons(lesson_no),
 question_no integer not null check(question_no between 1 and 20),
 question text not null, options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
 correct_index integer not null check(correct_index between 0 and 3),
 primary key(lesson_no,question_no)
);
create table if not exists public.advanced_financial_progress(
 user_id uuid not null references public.app_users(id),
 lesson_no integer not null references public.advanced_financial_lessons(lesson_no),
 watch_seconds integer not null default 0 check(watch_seconds>=0),
 duration_seconds integer not null default 0,
 watch_completed boolean not null default false,
 best_score integer check(best_score between 0 and 20),
 passed boolean not null default false,
 passed_at timestamptz,
 last_report_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(user_id,lesson_no)
);
create table if not exists public.advanced_financial_attempts(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.app_users(id),
 lesson_no integer not null references public.advanced_financial_lessons(lesson_no),
 answers jsonb not null check(jsonb_typeof(answers)='array' and jsonb_array_length(answers)=20),
 score integer not null check(score between 0 and 20),
 passed boolean not null,
 revision integer not null,
 submitted_at timestamptz not null default now()
);
create index if not exists advanced_financial_attempts_user_idx on public.advanced_financial_attempts(user_id,lesson_no,submitted_at desc);
alter table public.advanced_financial_lessons enable row level security;
alter table public.advanced_financial_questions enable row level security;
alter table public.advanced_financial_progress enable row level security;
alter table public.advanced_financial_attempts enable row level security;
revoke all on public.advanced_financial_lessons,public.advanced_financial_questions,public.advanced_financial_progress,public.advanced_financial_attempts from anon,authenticated;
create or replace function public.advanced_financial_overview(p_token uuid) returns jsonb
language plpgsql security definer set search_path to public,pg_temp as $$
declare v_user uuid; v_role text;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة، سجل الدخول مجددًا'; end if;
 select role into v_role from public.app_users where id=v_user;
 return jsonb_build_object('role',v_role,'lessons',(
 select coalesce(jsonb_agg(jsonb_build_object(
 'lesson_no',l.lesson_no,'title',l.title,'video_id',l.video_id,
 'duration',l.expected_duration_seconds,'active',l.active,
 'published', (select count(*)=20 from public.advanced_financial_questions q where q.lesson_no=l.lesson_no),
 'watched',coalesce(p.watch_seconds,0),'completed',coalesce(p.watch_completed,false),
 'best_score',p.best_score,'passed',coalesce(p.passed,false),'passed_at',p.passed_at
 ) order by l.lesson_no),'[]'::jsonb)
 from public.advanced_financial_lessons l left join public.advanced_financial_progress p
 on p.user_id=v_user and p.lesson_no=l.lesson_no
 ),'watch_requirement',90,'pass_requirement',16);
end $$;
create or replace function public.advanced_financial_watch_update(
 p_token uuid,p_lesson_no integer,p_current integer,p_duration integer
) returns jsonb language plpgsql security definer set search_path to public,pg_temp as $$
declare v_user uuid; v_l public.advanced_financial_lessons%rowtype;
 v_p public.advanced_financial_progress%rowtype;
 v_now timestamptz:=clock_timestamp(); v_gap double precision;
 v_budget integer; v_added integer; v_new integer; v_done boolean;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة'; end if;
 select * into v_l from public.advanced_financial_lessons where lesson_no=p_lesson_no and active;
 if not found then raise exception 'التدريب لم يُنشر بعد'; end if;
 if (select count(*) from public.advanced_financial_questions where lesson_no=p_lesson_no)<>20
 then raise exception 'بنك أسئلة التدريب غير مكتمل'; end if;
 if v_l.expected_duration_seconds<60 then raise exception 'مدة الفيديو لم تُعتمد بعد'; end if;
 if p_lesson_no>1 and not exists(select 1 from public.advanced_financial_progress
  where user_id=v_user and lesson_no=p_lesson_no-1 and passed and watch_completed)
 then raise exception 'اجتز التدريب السابق أولاً'; end if;
 if p_current is null or p_duration is null or p_current<0
 or p_duration<v_l.expected_duration_seconds*0.85 or p_duration>v_l.expected_duration_seconds*1.15
 or p_current>p_duration+3 then raise exception 'مدة الفيديو أو التقدم غير صحيح'; end if;
 insert into public.advanced_financial_progress(user_id,lesson_no,duration_seconds)
 values(v_user,p_lesson_no,v_l.expected_duration_seconds)
 on conflict(user_id,lesson_no) do nothing;
 select * into v_p from public.advanced_financial_progress
 where user_id=v_user and lesson_no=p_lesson_no for update;
 v_gap:=case when v_p.last_report_at is null then 5 else extract(epoch from(v_now-v_p.last_report_at)) end;
 v_budget:=case when v_p.last_report_at is null then 5 when v_gap<3 then 0 else least(8,floor(v_gap)::integer+1) end;
 v_added:=least(greatest(p_current-v_p.watch_seconds,0),v_budget);
 v_new:=least(v_l.expected_duration_seconds,v_p.watch_seconds+v_added);
 v_done:=v_new*100>=v_l.expected_duration_seconds*90;
 update public.advanced_financial_progress set
 watch_seconds=v_new,duration_seconds=v_l.expected_duration_seconds,
 watch_completed=watch_completed or v_done,last_report_at=v_now,updated_at=v_now
 where user_id=v_user and lesson_no=p_lesson_no;
 return jsonb_build_object('lesson_no',p_lesson_no,'watched',v_new,
 'duration',v_l.expected_duration_seconds,'completed',v_done,'percent',round(100.0*v_new/v_l.expected_duration_seconds,1));
end $$;
create or replace function public.advanced_financial_get_quiz(
 p_token uuid,p_lesson_no integer
) returns jsonb language plpgsql security definer set search_path to public,pg_temp as $$
declare v_user uuid; v_l public.advanced_financial_lessons%rowtype;
 v_list jsonb;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة'; end if;
 select * into v_l from public.advanced_financial_lessons where lesson_no=p_lesson_no and active;
 if not found then raise exception 'التدريب لم يُنشر بعد'; end if;
 if p_lesson_no>1 and not exists(select 1 from public.advanced_financial_progress
 where user_id=v_user and lesson_no=p_lesson_no-1 and passed and watch_completed)
 then raise exception 'اجتز التدريب السابق أولاً'; end if;
 if not exists(select 1 from public.advanced_financial_progress
 where user_id=v_user and lesson_no=p_lesson_no and watch_completed)
 then raise exception 'أكمل مشاهدة 90%% من الفيديو'; end if;
 select jsonb_agg(jsonb_build_object('no',question_no,'question',question,'options',options)
 order by question_no) into v_list from public.advanced_financial_questions where lesson_no=p_lesson_no;
 if jsonb_array_length(coalesce(v_list,'[]'::jsonb))<>20 then raise exception 'بنك الأسئلة غير مكتمل'; end if;
 return jsonb_build_object('revision',v_l.revision,'questions',v_list);
end $$;
create or replace function public.advanced_financial_submit_quiz(
 p_token uuid,p_lesson_no integer,p_answers jsonb,p_revision integer
) returns jsonb language plpgsql security definer set search_path to public,pg_temp as $$
declare v_user uuid; v_l public.advanced_financial_lessons%rowtype;
 v_p public.advanced_financial_progress%rowtype;
 v_i integer;v_n integer;v_score integer;v_pass boolean;v_attempts integer;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة'; end if;
 select * into v_l from public.advanced_financial_lessons where lesson_no=p_lesson_no and active for share;
 if not found then raise exception 'التدريب لم يُنشر بعد'; end if;
 if p_revision is distinct from v_l.revision then raise exception 'تغيّر إصدار الأسئلة؛ أعد فتح الاختبار'; end if;
 if p_lesson_no>1 and not exists(select 1 from public.advanced_financial_progress
 where user_id=v_user and lesson_no=p_lesson_no-1 and passed and watch_completed)
 then raise exception 'اجتز التدريب السابق أولاً'; end if;
 select * into v_p from public.advanced_financial_progress
 where user_id=v_user and lesson_no=p_lesson_no for update;
 if not found or not v_p.watch_completed then raise exception 'أكمل مشاهدة 90%% من الفيديو'; end if;
 select count(*) into v_attempts from public.advanced_financial_attempts
 where user_id=v_user and lesson_no=p_lesson_no and submitted_at>now()-interval '1 hour';
 if v_attempts>=6 then raise exception 'تجاوزت 6 محاولات خلال ساعة'; end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>20
 then raise exception 'أجب عن الأسئلة العشرين'; end if;
 for v_i in 0..19 loop
 if jsonb_typeof(p_answers->v_i)<>'number' or
 (p_answers->>v_i) not in ('0','1','2','3')
 then raise exception 'الإجابات يجب أن تكون من الخيارات الأربعة'; end if;
 end loop;
 select count(*),count(*) filter(where (p_answers->>(question_no-1))::integer=correct_index)
 into v_n,v_score from public.advanced_financial_questions where lesson_no=p_lesson_no;
 if v_n<>20 then raise exception 'بنك الأسئلة غير مكتمل'; end if;
 v_pass:=v_score>=16;
 insert into public.advanced_financial_attempts(user_id,lesson_no,answers,score,passed,revision)
 values(v_user,p_lesson_no,p_answers,v_score,v_pass,p_revision);
 update public.advanced_financial_progress set best_score=greatest(coalesce(best_score,0),v_score),
 passed=passed or v_pass,
 passed_at=case when v_pass and passed_at is null then now() else passed_at end,updated_at=now()
 where user_id=v_user and lesson_no=p_lesson_no;
 return jsonb_build_object('score',v_score,'out_of',20,'passed',v_pass,'required',16);
end $$;
create or replace function public.advanced_financial_leader_member_profile(
 p_token uuid,p_member_id uuid
) returns jsonb language plpgsql security definer set search_path to public,pg_temp as $$
declare v_leader uuid; v_no text; v_user uuid; v_lessons jsonb;
begin
 v_leader:=public.app_current_user_id(p_token);
 if v_leader is null or not exists(select 1 from public.app_users
 where id=v_leader and active and role='leader') then
 raise exception 'يتطلب صلاحية القائد'; end if;
 select member_no into v_no from public.members where id=p_member_id;
 if not found then raise exception 'العضو غير موجود'; end if;
 select id into v_user from public.app_users where active
 and (member_id=p_member_id or (member_id is null and login_no=v_no))
 order by case when member_id=p_member_id then 0 else 1 end limit 1;
 select coalesce(jsonb_agg(jsonb_build_object(
 'lesson_no',l.lesson_no,'title',l.title,
 'watched',coalesce(p.watch_seconds,0),'duration',l.expected_duration_seconds,
 'completed',coalesce(p.watch_completed,false),'best_score',p.best_score,
 'passed',coalesce(p.passed,false),'passed_at',p.passed_at,
 'attempt_count',(select count(*) from public.advanced_financial_attempts a where a.user_id=v_user and a.lesson_no=l.lesson_no)
 ) order by l.lesson_no),'[]'::jsonb) into v_lessons
 from public.advanced_financial_lessons l
 left join public.advanced_financial_progress p on p.user_id=v_user and p.lesson_no=l.lesson_no;
 return jsonb_build_object('member_id',p_member_id,'account_linked',v_user is not null,'lessons',v_lessons);
end $$;
revoke all on function public.advanced_financial_overview(uuid),
public.advanced_financial_watch_update(uuid,integer,integer,integer),
public.advanced_financial_get_quiz(uuid,integer),
public.advanced_financial_submit_quiz(uuid,integer,jsonb,integer),
public.advanced_financial_leader_member_profile(uuid,uuid) from public;
grant execute on function public.advanced_financial_overview(uuid),
public.advanced_financial_watch_update(uuid,integer,integer,integer),
public.advanced_financial_get_quiz(uuid,integer),
public.advanced_financial_submit_quiz(uuid,integer,jsonb,integer),
public.advanced_financial_leader_member_profile(uuid,uuid) to anon,authenticated,service_role;
