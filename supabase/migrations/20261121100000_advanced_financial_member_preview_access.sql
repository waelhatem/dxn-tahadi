-- Member-specific, non-recording preview access for the advanced financial training.
create or replace function public.advanced_financial_preview_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
 select exists(
  select 1
  from public.app_users u
  join public.members m on m.id=u.member_id
  where u.id=p_user_id
    and u.active=true
    and u.role='member'
    and u.registration_status='approved'
    and m.active=true
    and m.member_no::text='820469486'
 )
$function$;
revoke all on function public.advanced_financial_preview_access(uuid) from public,anon,authenticated;

create or replace function public.advanced_financial_overview(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid; v_role text;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة، سجل الدخول مجددًا'; end if;
 select role into v_role from public.app_users where id=v_user;
 return jsonb_build_object(
  'role',v_role,
  'preview_access',public.advanced_financial_preview_access(v_user),
  'lessons',(
   select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_no',l.lesson_no,'title',l.title,'video_id',l.video_id,
    'duration',l.expected_duration_seconds,'active',l.active,
    'published',(select count(*)=20 from public.advanced_financial_questions q where q.lesson_no=l.lesson_no),
    'watched',coalesce(p.watch_seconds,0),'completed',coalesce(p.watch_completed,false),
    'best_score',p.best_score,'passed',coalesce(p.passed,false),'passed_at',p.passed_at
   ) order by l.lesson_no),'[]'::jsonb)
   from public.advanced_financial_lessons l
   left join public.advanced_financial_progress p on p.user_id=v_user and p.lesson_no=l.lesson_no
  ),
  'watch_requirement',90,
  'pass_requirement',16
 );
end
$function$;

create or replace function public.advanced_financial_get_quiz(p_token uuid,p_lesson_no integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid; v_l public.advanced_financial_lessons%rowtype;
 v_list jsonb; v_preview boolean;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة'; end if;
 v_preview:=public.advanced_financial_preview_access(v_user);
 select * into v_l from public.advanced_financial_lessons
 where lesson_no=p_lesson_no and active;
 if not found then raise exception 'التدريب لم يُنشر بعد'; end if;
 if not v_preview and p_lesson_no>1 and not exists(
  select 1 from public.advanced_financial_progress
  where user_id=v_user and lesson_no=p_lesson_no-1 and passed and watch_completed
 ) then raise exception 'اجتز التدريب السابق أولاً'; end if;
 if not v_preview and not exists(
  select 1 from public.advanced_financial_progress
  where user_id=v_user and lesson_no=p_lesson_no and watch_completed
 ) then raise exception 'أكمل مشاهدة 90%% من الفيديو'; end if;
 select jsonb_agg(jsonb_build_object('no',question_no,'question',question,'options',options)
  order by question_no) into v_list
  from public.advanced_financial_questions where lesson_no=p_lesson_no;
 if jsonb_array_length(coalesce(v_list,'[]'::jsonb))<>20 then
  raise exception 'بنك الأسئلة غير مكتمل';
 end if;
 return jsonb_build_object('revision',v_l.revision,'questions',v_list,'preview_only',v_preview);
end
$function$;

create or replace function public.advanced_financial_submit_quiz(
 p_token uuid,p_lesson_no integer,p_answers jsonb,p_revision integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid; v_l public.advanced_financial_lessons%rowtype;
 v_p public.advanced_financial_progress%rowtype;
 v_i integer;v_n integer;v_score integer;v_pass boolean;v_attempts integer;v_preview boolean;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null then raise exception 'انتهت الجلسة'; end if;
 v_preview:=public.advanced_financial_preview_access(v_user);
 select * into v_l from public.advanced_financial_lessons
 where lesson_no=p_lesson_no and active for share;
 if not found then raise exception 'التدريب لم يُنشر بعد'; end if;
 if p_revision is distinct from v_l.revision then
  raise exception 'تغيّر إصدار الأسئلة؛ أعد فتح الاختبار';
 end if;
 if not v_preview then
  if p_lesson_no>1 and not exists(
   select 1 from public.advanced_financial_progress
   where user_id=v_user and lesson_no=p_lesson_no-1 and passed and watch_completed
  ) then raise exception 'اجتز التدريب السابق أولاً'; end if;
  select * into v_p from public.advanced_financial_progress
  where user_id=v_user and lesson_no=p_lesson_no for update;
  if not found or not v_p.watch_completed then
   raise exception 'أكمل مشاهدة 90%% من الفيديو';
  end if;
  select count(*) into v_attempts from public.advanced_financial_attempts
  where user_id=v_user and lesson_no=p_lesson_no
    and submitted_at>now()-interval '1 hour';
  if v_attempts>=6 then raise exception 'تجاوزت 6 محاولات خلال ساعة'; end if;
 end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>20
 then raise exception 'أجب عن الأسئلة العشرين'; end if;
 for v_i in 0..19 loop
  if jsonb_typeof(p_answers->v_i)<>'number' or (p_answers->>v_i) not in ('0','1','2','3')
  then raise exception 'الإجابات يجب أن تكون من الخيارات الأربعة'; end if;
 end loop;
 select count(*),count(*) filter(where (p_answers->>(question_no-1))::integer=correct_index)
 into v_n,v_score from public.advanced_financial_questions where lesson_no=p_lesson_no;
 if v_n<>20 then raise exception 'بنك الأسئلة غير مكتمل'; end if;
 v_pass:=v_score>=16;
 if v_preview then
  return jsonb_build_object('score',v_score,'out_of',20,'passed',v_pass,'required',16,'preview_only',true);
 end if;
 insert into public.advanced_financial_attempts(user_id,lesson_no,answers,score,passed,revision)
 values(v_user,p_lesson_no,p_answers,v_score,v_pass,p_revision);
 update public.advanced_financial_progress set
  best_score=greatest(coalesce(best_score,0),v_score),
  passed=passed or v_pass,
  passed_at=case when v_pass and passed_at is null then now() else passed_at end,
  updated_at=now()
 where user_id=v_user and lesson_no=p_lesson_no;
 return jsonb_build_object('score',v_score,'out_of',20,'passed',v_pass,'required',16,'preview_only',false);
end
$function$;

revoke all on function public.advanced_financial_overview(uuid),
 public.advanced_financial_get_quiz(uuid,integer),
 public.advanced_financial_submit_quiz(uuid,integer,jsonb,integer) from public;
grant execute on function public.advanced_financial_overview(uuid),
 public.advanced_financial_get_quiz(uuid,integer),
 public.advanced_financial_submit_quiz(uuid,integer,jsonb,integer) to anon,authenticated,service_role;
