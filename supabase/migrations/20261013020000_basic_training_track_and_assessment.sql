-- Basic DXN training bag: isolated progress and approved assessment #4.
-- This migration is proposal-only. DO NOT apply to production before review.
create table if not exists public.basic_training_progress (
  owner_user_id uuid not null references public.app_users(id) on delete cascade,
  training_no integer not null check(training_no between 1 and 4),
  max_watched_seconds integer not null default 0,
  video_duration_seconds integer not null default 0,
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(owner_user_id,training_no)
);
create table if not exists public.basic_training_question_bank (
  training_no integer primary key check(training_no between 1 and 4),
  questions jsonb not null check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)=20),
  version text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.basic_training_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete cascade,
  training_no integer not null check(training_no between 1 and 4),
  bank_version text not null,
  answers jsonb not null,
  score integer not null check(score between 0 and 20),
  taken_at timestamptz not null default now()
);
create index if not exists basic_training_attempts_owner_order
  on public.basic_training_attempts(owner_user_id,training_no,taken_at desc);
alter table public.basic_training_progress enable row level security;
alter table public.basic_training_question_bank enable row level security;
alter table public.basic_training_attempts enable row level security;
revoke all on table public.basic_training_progress from public, anon, authenticated;
revoke all on table public.basic_training_question_bank from public, anon, authenticated;
revoke all on table public.basic_training_attempts from public, anon, authenticated;

-- The test is from user's 123.docx, Q6 uses the user's final corrected wording.
-- No bank is seeded for 1-3 because their complete approved question wording
-- was not present in that file. Do not substitute any generated questions.
insert into public.basic_training_question_bank(training_no,questions,version)
values(4, '[{"question":"ما الموضوع الرئيسي للمحور الرابع من الحقيبة التدريبية الأساسية؟","options":["زراعة فطر الجانوديرما وتصنيعه.","الخطة التسويقية لشركة DXN وكيفية تحقيق دخل عالٍ بوقت مثالي.","تاريخ شركات البيع المباشر."],"answer":1,"source_time":"00:23–01:23"},{"question":"ما المقصود بأن خطة DXN المالية عالمية بحسب المحاضر؟","options":["أن العضو يمكنه الاستفادة من استهلاك الأشخاص الذين دلّهم على المنتجات في دول مختلفة.","أن الأرباح تأتي من المستهلكين الموجودين في بلد العضو فقط.","أن العضو لا يستفيد إلا من المستهلكين الذين يسافر لمقابلتهم."],"answer":0,"source_time":"01:23–02:26"},{"question":"كيف وصف المحاضر استفادة العضو من الجهد المبذول ضمن فريق العمل؟","options":["يستفيد العضو من جهده الشخصي فقط.","يستفيد من جهد فريقه دون أي جهد شخصي.","يستفيد من جهده وجهد فريق العمل الذين دلّهم على الفرصة."],"answer":2,"source_time":"02:26–02:47"},{"question":"ما الذي ذكر المحاضر أنه ضروري قبل الوصول إلى عوائد مالية كبيرة ومستمرة؟","options":["انتظار مرور الوقت دون القيام بأي عمل.","بذل الجهد والتعب وتأسيس العمل.","الاكتفاء بتسجيل العضوية في الشركة."],"answer":1,"source_time":"02:47–03:57"},{"question":"كيف شرح المحاضر مفهوم التوسع بالعمق في الفريق؟","options":["أن يدل العضو شخصًا على المشروع، ثم يدل ذلك الشخص شخصًا آخر، وتتواصل السلسلة.","أن يدل العضو عددًا من الأشخاص بصورة مباشرة فقط.","أن يشتري العضو المنتجات لنفسه دون أن يدل أحدًا عليها."],"answer":0,"source_time":"03:57–04:35"},{"question":"ما المقصود بالتوسع الأفقي في بناء فريق DXN، بحسب شرح المحاضر؟","options":["أن يقوم العضو بتسجيل الأشخاص الذين يعرفهم ويدعوهم مباشرة تحت رقم عضويته، مثل الأقارب والأصدقاء والزملاء.","أن يسجّل العضو شخصًا، ثم يقوم ذلك الشخص بتسجيل أشخاص آخرين تحت عضويته، وتتواصل العملية عبر الأجيال.","أن يكتفي العضو باستهلاك المنتجات دون تسجيل أعضاء جدد."],"answer":0,"source_time":"04:35–05:00"},{"question":"ما الذي ذكره المحاضر عن اشتراط إحضار شخصين ليُحضر كل واحد منهما شخصين آخرين؟","options":["إنه الشرط الأساسي الوحيد للعمل مع DXN.","إن خطة DXN لا تشترط هذا الأسلوب المحدد في بناء الفريق.","إنه شرط للحصول على رحلة الشركة السنوية."],"answer":1,"source_time":"05:00–05:32"},{"question":"على ماذا أكد المحاضر عند وصف DXN بأنها «شركة استهلاك»؟","options":["أن العمل يقوم على منتجات حقيقية واستهلاكها، وليس على بيع الأعضاء وشرائهم.","أن أساس العمل هو شراء وبيع العضويات.","أن الشركة لا تمتلك منتجات استهلاكية."],"answer":0,"source_time":"05:00–06:14"},{"question":"على أي أساس وصف المحاضر الخطة المالية بأنها عادلة؟","options":["الأسبقية في تاريخ التسجيل وحدها.","عدد السنوات التي يقضيها العضو دون نشاط.","الجهد والاجتهاد والإنتاجية والنمو، وليس مجرد الأسبقية الزمنية."],"answer":2,"source_time":"05:32–06:14"},{"question":"كم عدد النقاط الذي ذكره المحاضر بوصفه المستهدف في الخطة وقت تسجيل التدريب؟","options":["1000 نقطة.","100 نقطة.","200 نقطة."],"answer":1,"source_time":"06:14–06:40"},{"question":"ما القيمة التقريبية بالدولار التي ذكرها المحاضر مقابل مستهدف 100 نقطة؟","options":["70 إلى 80 دولارًا.","260 إلى 280 دولارًا.","10,000 إلى 20,000 دولار."],"answer":0,"source_time":"06:14–06:40"},{"question":"ماذا ذكر المحاضر بشأن تحقيق المبيعات المطلوبة وفق الخطة التي شرحها؟","options":["أنها تمنع العضو من الاستفادة من الأرباح.","أنها تلغي إمكانية التقدم في المناصب.","أنها تتيح الدخول في نظام الأرباح والتقدم في المناصب وفق الخطة."],"answer":2,"source_time":"06:40–07:18"},{"question":"من الفئات التي ذكر المحاضر أنها تستطيع العمل والاستفادة من خطة DXN؟","options":["الرجال الذين يعملون خارج المنزل فقط.","الرجال والنساء، ومن ضمنهم النساء اللاتي يعملن من منازلهن.","أصحاب الشركات الكبيرة فقط."],"answer":1,"source_time":"07:18–07:53"},{"question":"كيف يمكن لأصحاب المهن المختلفة الاستفادة من فرصة العمل بحسب المحاضر؟","options":["استثمار أوقات الفراغ بعد الدوام.","التوقف عن ممارسة مهنهم فور الانضمام.","العمل فقط أثناء ساعات الدوام الرسمي."],"answer":0,"source_time":"07:53–08:35"},{"question":"ماذا ذكر المحاضر عن إمكانية مشاركة كبار السن في DXN؟","options":["أن العمل متاح فقط لمن تقل أعمارهم عن 30 سنة.","أن العضوية تتوقف عند سن التقاعد.","أن هناك أعضاء تجاوزت أعمارهم 70 سنة."],"answer":2,"source_time":"08:35–09:11"},{"question":"كيف وصف المحاضر تركيب الخطة المالية في DXN؟","options":["خطة تعتمد على أسلوب واحد لا يتغير.","مزيج من الخطط الهادئة والمتحركة.","خطة تعتمد على الدعايات التلفزيونية فقط."],"answer":1,"source_time":"09:11–09:35"},{"question":"كم عدد المناصب الذي ذكره المحاضر في الخطة، باستثناء منصب الإكسكيوتيف؟","options":["14 منصبًا.","7 مناصب.","100 منصب."],"answer":0,"source_time":"09:11–09:35"},{"question":"ما الميزة التي ذكرها المحاضر بشأن السفر مع شركة DXN؟","options":["رحلة سياحية يومية لجميع الأعضاء.","رحلة سفر إجبارية لكل عضو جديد.","رحلة سياحية سنوية مجانية للمؤهلين لها."],"answer":2,"source_time":"09:35–10:14"},{"question":"أي مجموعة من المنتجات التالية ذكرها المحاضر عند حديثه عن الاستهلاك اليومي؟","options":["السيارات والأجهزة الصناعية والمعدات الثقيلة.","معجون الأسنان والصابون والقهوة والمكملات الغذائية ومنتجات العناية بالبشرة.","العقارات ومواد البناء والمعدات الزراعية."],"answer":1,"source_time":"10:19–11:34"},{"question":"ما الفكرة التي أكد عليها المحاضر عند حديثه عن المنتجات التي يشتريها الناس من الأسواق؟","options":["أن الناس يشترون هذه المنتجات أصلًا من أماكن مختلفة، وأن النظر إلى السعر الرخيص وحده قد يجعلهم يغفلون عن الجودة.","أن المنتجات اليومية لا يحتاج الناس إلى شرائها.","أن انخفاض السعر وحده هو المعيار الذي يجب اعتماده دائمًا عند الشراء."],"answer":0,"source_time":"11:34–12:28"}]'::jsonb, 'basic4-user-approved-q6-corrected-2026-10-13')
on conflict(training_no) do nothing;

create or replace function public.basic_training_overview(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
 uid := public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users where id=uid and active) then
  raise exception 'انتهت الجلسة';
 end if;
 return jsonb_build_object(
   'progress', coalesce((select jsonb_agg(jsonb_build_object(
       'training_no',p.training_no,'watched',p.max_watched_seconds,
       'duration',p.video_duration_seconds,'completed',p.completed_at is not null))
     from public.basic_training_progress p where p.owner_user_id=uid), '[]'::jsonb),
   'published_quizzes', coalesce((select jsonb_agg(q.training_no)
     from public.basic_training_question_bank q),'[]'::jsonb),
   'scores', coalesce((select jsonb_agg(jsonb_build_object('training_no',a.training_no,
        'score',a.score,'taken_at',a.taken_at))
      from (select distinct on (training_no) training_no,score,taken_at
           from public.basic_training_attempts where owner_user_id=uid
           order by training_no,taken_at desc) a),'[]'::jsonb));
end; $$;

-- Server-side upper bound on a checkpoint limits single-click seeking.
-- This does not assert that viewing/attention is cryptographically provable.
create or replace function public.basic_training_watch_update(
 p_token uuid,p_training_no integer,p_current integer,p_duration integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid; old_seconds integer; new_seconds integer; old_duration integer; completed_time timestamptz; prev_heartbeat timestamptz; max_growth integer;
begin
 uid := public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users where id=uid and active) then raise exception 'انتهت الجلسة';end if;
 if p_training_no>1 and not (
    exists(select 1 from public.basic_training_progress bp
      where bp.owner_user_id=uid and bp.training_no=p_training_no-1 and bp.completed_at is not null)
    and exists(select 1 from public.basic_training_attempts ba
      where ba.owner_user_id=uid and ba.training_no=p_training_no-1)
  ) then
    raise exception 'أكمل مشاهدة واختبار التدريب السابق أولًا';
  end if;
 if p_training_no not between 1 and 4 or p_duration not between 30 and 86400
 or p_current < 0 or p_current > p_duration+3 then raise exception 'بيانات مشاهدة غير صالحة';end if;
 insert into public.basic_training_progress(owner_user_id,training_no,max_watched_seconds,video_duration_seconds)
  values(uid,p_training_no,0,p_duration)
 on conflict(owner_user_id,training_no) do nothing;
 select max_watched_seconds,video_duration_seconds,completed_at,last_heartbeat_at into old_seconds,old_duration,completed_time,prev_heartbeat
 from public.basic_training_progress where owner_user_id=uid and training_no=p_training_no for update;
 if old_duration>0 and abs(old_duration-p_duration)>15 then raise exception 'تغير طول الفيديو بصورة غير متوقعة';end if;
 -- Enforce a chronological server-side time budget in addition to bounded increments.
 -- Paused sessions or huge seeks may not gain more than 12 seconds per heartbeat.
 max_growth := least(12,greatest(2,ceil(extract(epoch from (now()-coalesce(prev_heartbeat,now()))))::integer+2));
 new_seconds := case when p_current <= old_seconds+max_growth
  then greatest(old_seconds,p_current) else old_seconds end;
 update public.basic_training_progress
 set max_watched_seconds=new_seconds,video_duration_seconds=p_duration,
   completed_at=case when new_seconds >= p_duration-4 then coalesce(completed_at,now()) else completed_at end,
   updated_at=now(),last_heartbeat_at=now()
 where owner_user_id=uid and training_no=p_training_no;
 return jsonb_build_object('watched',new_seconds,'duration',p_duration,
     'completed',completed_time is not null or new_seconds >= p_duration-4);
end; $$;

create or replace function public.basic_training_get_quiz(
 p_token uuid,p_training_no integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid; q jsonb; arr jsonb;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users where id=uid and active) then raise exception 'انتهت الجلسة';end if;
 if p_training_no>1 and not (
    exists(select 1 from public.basic_training_progress bp
      where bp.owner_user_id=uid and bp.training_no=p_training_no-1 and bp.completed_at is not null)
    and exists(select 1 from public.basic_training_attempts ba
      where ba.owner_user_id=uid and ba.training_no=p_training_no-1)
  ) then
    raise exception 'أكمل مشاهدة واختبار التدريب السابق أولًا';
  end if;
 if not exists(select 1 from public.basic_training_progress where owner_user_id=uid
  and training_no=p_training_no and completed_at is not null) then
  raise exception 'أكمل مشاهدة التدريب أولاً';
 end if;
 select questions into q from public.basic_training_question_bank where training_no=p_training_no;
 if q is null then raise exception 'الاختبار معتمد لكنه لم يُنشر إلكترونيًا بعد';end if;
 select jsonb_agg(jsonb_build_object('question',item->>'question','options',item->'options')
     order by ord) into arr
 from jsonb_array_elements(q) with ordinality as f(item,ord);
 return coalesce(arr,'[]'::jsonb);
end; $$;

create or replace function public.basic_training_submit_quiz(
 p_token uuid,p_training_no integer,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid;q jsonb; ver text;i integer;answer_num integer; right_answer integer;
  num_ok integer:=0; details jsonb:='[]'::jsonb;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or not exists(select 1 from public.app_users where id=uid and active) then raise exception 'انتهت الجلسة';end if;
 if p_training_no>1 and not (
    exists(select 1 from public.basic_training_progress bp
      where bp.owner_user_id=uid and bp.training_no=p_training_no-1 and bp.completed_at is not null)
    and exists(select 1 from public.basic_training_attempts ba
      where ba.owner_user_id=uid and ba.training_no=p_training_no-1)
  ) then
    raise exception 'أكمل مشاهدة واختبار التدريب السابق أولًا';
  end if;
 if not exists(select 1 from public.basic_training_progress where owner_user_id=uid
 and training_no=p_training_no and completed_at is not null) then
  raise exception 'أكمل مشاهدة التدريب أولاً';
 end if;
 select questions,version into q,ver from public.basic_training_question_bank where training_no=p_training_no;
 if q is null then raise exception 'الاختبار غير منشور بعد';end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>20 then
  raise exception 'يجب إجابة الأسئلة العشرين'; end if;
 for i in 0..19 loop
   if jsonb_typeof(p_answers->i)<>'number' or (p_answers->>i) not in ('0','1','2') then
     raise exception 'أجب عن جميع الأسئلة بأحد الخيارات الثلاثة';end if;
   answer_num:=(p_answers->>i)::integer;
   right_answer:=(q->i->>'answer')::integer;
   if answer_num=right_answer then num_ok:=num_ok+1;end if;
   details:=details||jsonb_build_array(jsonb_build_object('no',i+1,
        'chosen',answer_num,'correct',right_answer));
 end loop;
 insert into public.basic_training_attempts(owner_user_id,training_no,bank_version,answers,score)
 values(uid,p_training_no,ver,p_answers,num_ok);
 return jsonb_build_object('score',num_ok,'out_of',20,'details',details);
end; $$;
revoke all on function public.basic_training_overview(uuid) from public,anon,authenticated;
revoke all on function public.basic_training_watch_update(uuid,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.basic_training_get_quiz(uuid,integer) from public,anon,authenticated;
revoke all on function public.basic_training_submit_quiz(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.basic_training_overview(uuid) to anon,authenticated;
grant execute on function public.basic_training_watch_update(uuid,integer,integer,integer) to anon,authenticated;
grant execute on function public.basic_training_get_quiz(uuid,integer) to anon,authenticated;
grant execute on function public.basic_training_submit_quiz(uuid,integer,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
