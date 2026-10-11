-- ⚠️ للمراجعة فقط — لا تُطبَّق على Production قبل موافقة صاحب المشروع.
-- موجودة خارج supabase/migrations عمدًا حتى لا تُطبَّق تلقائيًا.
--
-- الهدف: تمكين حساب القائد (leader) من تدريب متدربيه في «الخطة الاحترافية لرجوان نجاح»
-- بنفس قواعد الملكية الحالية، بدون تزوير دور member وبدون المساس بالبيانات الموجودة.
--
-- ما يتغير:
--   1) ragwan_current_sponsor: نفس الأعمدة، ويقبل الآن حساب القائد النشط أيضًا.
--      فرع العضو مطابق تمامًا للسلوك السابق (role='member' + سجل members نشط).
--      كل دوال رجوان تربط الملكية بـ sponsor_user_id = app_users.id، لذلك يرى القائد
--      ويعدّل متدربيه هو فقط، ولا يصل إلى متدربي أي سبونسر آخر.
--   2) ragwan_current_trainer_root_no (جديدة): رقم عضوية DXN الذي يبدأ منه فريق المدرب.
--      العضو: رقم عضويته (كما في السابق). القائد: app_users.team_root_member_no.
--   3) add_ragwan_trainee_by_member_no: نفس الدالة المطبقة حاليًا، مع ثلاثة فروق:
--      أ) مصدر رقم جذر الفريق (الدالة الجديدة أعلاه)، ب) رسالة الدور،
--      ج) لا تغيّر سجل عضو موجود في members: لا تعيد تفعيل عضو معطّل (يُرفض برسالة واضحة)،
--         ولا تستبدل اسمه؛ تملأ الاسم فقط إذا كان فارغًا. قاعدة «أي جيل ضمن فريق DXN» كما هي.
--   4) search_ragwan_trainees: فرع للقائد يبحث في متدربيه المسجلين (غير المؤرشفين) فقط،
--      لأن حساب القائد ليس عضوًا في جدول الفرق. فرع العضو كما هو بلا تغيير.
--      ملاحظة: الفحص على Supabase أظهر أن هذه الدالة غير موجودة حاليًا، فهذا الملف ينشئها.
--   5) الصلاحيات: ragwan_current_sponsor و search_ragwan_trainees و ragwan_current_trainer_root_no
--      و ragwan_leader_can_manage_training ودوال إدارة المتدربين الثمانية لـ service_role فقط.
--      api/ragwan-files.js يستدعيها كلها بالمفتاح السري، والواجهة لا تستدعي أيًا منها مباشرة،
--      وكل دوال رجوان التي تستدعي ragwan_current_sponsor هي SECURITY DEFINER فتعمل بصلاحيات مالكها.
--   6) وضع المطالعة: القائد «مدير تدريب» فقط إذا كان نشطًا وله team_root_member_no صالح (9 أرقام).
--      حساب قائد بلا جذر (مثل LEADER1 المخصص للمطالعة) يرى محتوى الخطة والأبواب، لكن تُرفض له
--      إضافة/بحث/اختيار/عرض/حفظ تقدم/إكمال/أرشفة/إعادة تسمية المتدربين وبيانات الشهادة: في قاعدة البيانات
--      (ragwan_current_sponsor)، وفي الخادم (api/ragwan-files.js)، ولا يمكن تجاوز الخادم بالمفتاح العام (البند 5).
--      لا يُستخدم أي رقم عضوية بديل، ولا يُغيَّر دور أو بيانات أي حساب، ولا تتأثر صلاحياته خارج خطة رجوان.
--
-- مبني على حالة Production المفحوصة (11 دالة لرجوان؛ search_ragwan_trainees و get_ragwan_plan_completions
-- و save_ragwan_success_plan_content غير موجودة). القسم 0 يتحقق من هذه الحالة ويوقف التطبيق كاملًا إن اختلفت.
--
-- لا يعدّل أي صف عند التطبيق. لا يغيّر الجداول ولا تقدم المتدربين ولا الشهادات.
-- التراجع: راجع supabase/pending-review/20261011120000_ragwan_leader_trainer_access.ROLLBACK.md
-- (المصدر الموثوق للتراجع هو تعريفات الدوال وصلاحياتها المحفوظة من Supabase قبل التطبيق، وليس ملفات المستودع).

begin;

-- 0) تحقق مسبق من حالة Production. أي اختلاف يوقف الملف قبل أي تغيير (الملف كله داخل معاملة واحدة).
do $preconditions$
declare
  required text[] := array[
    'ragwan_current_sponsor','add_ragwan_trainee_by_member_no','archive_ragwan_trainee','get_ragwan_training_progress',
    'list_ragwan_trainees','record_ragwan_plan_completion_for_member','save_ragwan_training_step',
    'select_ragwan_trainee','update_ragwan_trainee_display_name'
  ];
  missing text[];
  bad text[];
begin
  select array_agg(x) into missing
  from unnest(required) x
  where not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=x
  );
  if missing is not null then
    raise exception 'ragwan precondition: دوال مطلوبة غير موجودة: %', array_to_string(missing,', ');
  end if;

  -- create or replace يفشل إن اختلف نوع الإرجاع أو أسماء المعاملات؛ نوقف برسالة واضحة بدل ذلك.
  if to_regprocedure('public.ragwan_current_sponsor(uuid)') is null
     or pg_get_function_result('public.ragwan_current_sponsor(uuid)'::regprocedure)
        <> 'TABLE(user_id uuid, member_id uuid, team_id uuid, member_name text)' then
    raise exception 'ragwan precondition: توقيع ragwan_current_sponsor على Supabase مختلف عن الملف';
  end if;
  if to_regprocedure('public.add_ragwan_trainee_by_member_no(uuid,text)') is null
     or pg_get_function_arguments('public.add_ragwan_trainee_by_member_no(uuid,text)'::regprocedure)
        <> 'p_token uuid, p_trainee_member_no text'
     or pg_get_function_result('public.add_ragwan_trainee_by_member_no(uuid,text)'::regprocedure) <> 'json' then
    raise exception 'ragwan precondition: توقيع add_ragwan_trainee_by_member_no على Supabase مختلف عن الملف';
  end if;

  -- دوال بيانات خاصة بلا فحص «مدير التدريب». غير موجودة على Production؛ إن ظهرت فالملف يحتاج مراجعة.
  select array_agg(p.proname::text) into bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('get_ragwan_plan_completions','save_ragwan_success_plan_content');
  if bad is not null then
    raise exception 'ragwan precondition: دوال لم يُبنَ الملف على وجودها: % — أعد المراجعة قبل التطبيق', array_to_string(bad,', ');
  end if;
  -- search_ragwan_trainees غير موجودة؛ يُسمح فقط بالتوقيع الذي ينشئه هذا الملف (إعادة التشغيل).
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='search_ragwan_trainees'
      and (p.oid::regprocedure::text <> 'search_ragwan_trainees(uuid,text)' or pg_get_function_result(p.oid) <> 'json')
  ) then
    raise exception 'ragwan precondition: توجد نسخة أخرى من search_ragwan_trainees — أعد المراجعة قبل التطبيق';
  end if;

  -- الأعمدة والقيود التي تعتمد عليها add_ragwan_trainee_by_member_no و search_ragwan_trainees.
  select array_agg(c) into missing
  from unnest(array[
    'app_users.team_root_member_no','app_users.role','app_users.active','app_users.member_id',
    'members.member_no','members.name','members.team_id','members.active',
    'dxn_team_members.member_no','dxn_team_members.member_name','dxn_team_members.sponsor_member_no',
    'ragwan_training_enrollments.trainee_display_name','ragwan_training_enrollments.archived_at',
    'ragwan_training_enrollments.trainee_member_no','ragwan_training_enrollments.last_activity_at',
    'ragwan_training_progress.enrollment_id','ragwan_training_progress.step','ragwan_training_progress.status'
  ]) c
  where not exists(
    select 1 from information_schema.columns ic
    where ic.table_schema='public' and ic.table_name=split_part(c,'.',1) and ic.column_name=split_part(c,'.',2)
  );
  if missing is not null then
    raise exception 'ragwan precondition: أعمدة غير موجودة: %', array_to_string(missing,', ');
  end if;
  if not exists(
    select 1 from pg_index i
    where i.indrelid='public.ragwan_training_enrollments'::regclass and i.indisunique
      and (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
           where a.attrelid=i.indrelid and a.attnum=any(i.indkey)) = array['sponsor_user_id','trainee_member_id']
  ) then
    raise exception 'ragwan precondition: لا يوجد قيد فريد على (sponsor_user_id, trainee_member_id)';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    raise exception 'ragwan precondition: الدور service_role غير موجود';
  end if;
end
$preconditions$;

-- 1) المدرب الحالي: عضو (كما كان) أو قائد نشط.
create or replace function public.ragwan_current_sponsor(p_token uuid)
returns table(user_id uuid, member_id uuid, team_id uuid, member_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select au.id, au.member_id, m.team_id, trim(coalesce(m.name,''))
  from public.app_users au
  left join public.members m on m.id=au.member_id
  where au.id=public.app_current_user_id(p_token)
    and au.active=true
    and (
      (au.role='member' and m.id is not null and m.active=true)
      -- القائد مدير تدريب فقط إذا كان له جذر فريق DXN صالح. حساب المطالعة (team_root_member_no = NULL)
      -- لا يمر، فتُرفض له كل عمليات المتدربين في كل دوال رجوان التي تعتمد على هذه الدالة.
      or (au.role='leader' and coalesce(trim(au.team_root_member_no),'') ~ '^[0-9]{9}$')
    )
  limit 1;
end;
$$;

-- تُستدعى من دوال رجوان (SECURITY DEFINER) ومن الخادم فقط؛ لا حاجة لاستدعائها بالمفتاح العام.
revoke all on function public.ragwan_current_sponsor(uuid) from public, anon, authenticated;
grant execute on function public.ragwan_current_sponsor(uuid) to service_role;

-- 2) جذر فريق DXN للمدرب الحالي.
create or replace function public.ragwan_current_trainer_root_no(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_root text;
  v_member_no text;
begin
  select lower(trim(au.role)), trim(coalesce(au.team_root_member_no,'')), trim(coalesce(m.member_no::text,''))
    into v_role, v_root, v_member_no
  from public.app_users au
  left join public.members m on m.id=au.member_id
  where au.id=public.app_current_user_id(p_token)
    and au.active=true
  limit 1;

  if v_role='leader' then
    -- جذر الفريق الصريح فقط؛ لا رقم عضوية بديل لحساب بلا جذر.
    if v_root ~ '^[0-9]{9}$' then
      return v_root;
    end if;
    return null;
  end if;
  if v_role='member' then
    return nullif(v_member_no,'');
  end if;
  return null;
end;
$$;

revoke all on function public.ragwan_current_trainer_root_no(uuid) from public, anon, authenticated;
grant execute on function public.ragwan_current_trainer_root_no(uuid) to service_role;

-- 2ب) صلاحية إدارة التدريب للقائد، مثبتة من قاعدة البيانات (القاعدة الوحيدة المستخدمة في كل مكان):
--      قائد نشط + team_root_member_no صالح (9 أرقام). يستخدمها الخادم api/ragwan-files.js
--      لعمليات الملفات والإثباتات، وتستخدمها الدوال أدناه.
create or replace function public.ragwan_leader_can_manage_training(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.app_users au
    where au.id=public.app_current_user_id(p_token)
      and au.active=true
      and au.role='leader'
      and coalesce(trim(au.team_root_member_no),'') ~ '^[0-9]{9}$'
  );
$$;

revoke all on function public.ragwan_leader_can_manage_training(uuid) from public, anon, authenticated;
grant execute on function public.ragwan_leader_can_manage_training(uuid) to service_role;

-- 3) إضافة متدرب: مطابقة للنسخة المطبقة (PR #105) مع مصدر جذر الفريق الجديد.
create or replace function public.add_ragwan_trainee_by_member_no(
  p_token uuid,
  p_trainee_member_no text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sponsor_row record;
  v_sponsor_member_no text;
  target_dxn record;
  local_member record;
  enrollment_row public.ragwan_training_enrollments%rowtype;
  normalized_no text := trim(coalesce(p_trainee_member_no, ''));
  found_depth integer := null;
begin
  if normalized_no = '' then
    raise exception 'أدخل رقم عضوية المتدرب أولًا';
  end if;
  if normalized_no !~ '^[0-9]{9}$' then
    raise exception 'رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;

  -- العضو أو القائد النشط فقط.
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;
  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو أو القائد فقط';
  end if;

  -- العضو: رقم عضويته. القائد: جذر فريقه في سجل DXN (team_root_member_no).
  v_sponsor_member_no := public.ragwan_current_trainer_root_no(p_token);
  if v_sponsor_member_no is null or v_sponsor_member_no = '' then
    raise exception 'تعذر تحديد رقم عضوية السبونسر في سجل DXN';
  end if;

  select
    trim(m.member_no) as member_no,
    trim(coalesce(m.member_name,'')) as member_name,
    trim(coalesce(m.sponsor_member_no,'')) as sponsor_member_no
  into target_dxn
  from public.dxn_team_members m
  where trim(m.member_no) = normalized_no
  limit 1;
  if target_dxn.member_no is null then
    raise exception 'لم يتم العثور على هذه العضوية في سجل DXN';
  end if;
  if target_dxn.member_name is null or target_dxn.member_name = '' then
    raise exception 'تم العثور على العضوية في DXN، لكن اسم العضو غير متوفر';
  end if;

  -- المتدرب ضمن فريق DXN الكامل للمدرب (أي جيل)، مع منع الحلقات.
  with recursive downline as (
    select
      trim(m.member_no) as member_no,
      0 as depth,
      array[trim(m.member_no)]::text[] as path
    from public.dxn_team_members m
    where trim(m.member_no) = v_sponsor_member_no
    union all
    select
      trim(d.member_no),
      dline.depth + 1,
      dline.path || trim(d.member_no)
    from public.dxn_team_members d
    join downline dline
      on trim(d.sponsor_member_no) = dline.member_no
    where not trim(d.member_no) = any(dline.path)
  )
  select d.depth
    into found_depth
  from downline d
  where d.member_no = normalized_no
  order by d.depth
  limit 1;
  if found_depth is null then
    raise exception 'هذا العضو موجود في سجل DXN لكنه ليس ضمن فريقك';
  end if;
  if found_depth = 0 then
    raise exception 'لا يمكن إضافة حسابك كمتدرب في خطتك';
  end if;

  select *
    into local_member
  from public.members m
  where trim(m.member_no) = normalized_no
  limit 1;
  if local_member.id is null then
    insert into public.members(member_no, name, team_id, active)
    values(normalized_no, target_dxn.member_name, sponsor_row.team_id, true)
    returning * into local_member;
  else
    /* لا نغيّر بيانات عضو موجود دون ضرورة:
       - لا نعيد تفعيل عضو معطّل؛ التعطيل قرار إداري، وإعادة التفعيل قد تعيد صلاحيات حسابه.
       - لا نستبدل اسمه؛ نملؤه فقط إذا كان فارغًا لأن select_ragwan_trainee يعرض members.name. */
    if local_member.active is distinct from true then
      raise exception 'هذا العضو غير نشط في المجتمع؛ لا يمكن إضافته متدربًا قبل إعادة تفعيله من القائد';
    end if;
    if trim(coalesce(local_member.name,'')) = '' then
      update public.members
      set name = target_dxn.member_name
      where id = local_member.id
      returning * into local_member;
    end if;
  end if;

  insert into public.ragwan_training_enrollments(
    sponsor_user_id, sponsor_member_id, trainee_member_id, trainee_name, trainee_member_no
  )
  values(
    sponsor_row.user_id, sponsor_row.member_id, local_member.id, target_dxn.member_name, normalized_no
  )
  on conflict(sponsor_user_id, trainee_member_id)
  do update set
    trainee_name = excluded.trainee_name,
    trainee_member_no = excluded.trainee_member_no,
    last_activity_at = now(),
    archived_at = null
  returning * into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'display_name', enrollment_row.trainee_display_name,
    'member_no', enrollment_row.trainee_member_no,
    'depth_from_sponsor', found_depth,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );
end;
$$;

-- 4) البحث: فرع القائد في متدربيه المسجلين فقط؛ فرع العضو كما هو.
create or replace function public.search_ragwan_trainees(
  p_token uuid,
  p_query text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  q text := lower(trim(coalesce(p_query,'')));
  v_role text;
begin
  select * into s from public.ragwan_current_sponsor(p_token) limit 1;
  if s.user_id is null then raise exception 'هذه العملية متاحة لحساب السبونسر فقط'; end if;

  select lower(trim(au.role)) into v_role from public.app_users au where au.id=s.user_id limit 1;

  if v_role='leader' then
    return coalesce((
      select json_agg(x order by x.last_activity_at desc nulls last, x.name asc)
      from (
        select
          e.trainee_member_id as id,
          trim(coalesce(e.trainee_name,'')) as name,
          nullif(trim(coalesce(e.trainee_member_no,'')),'') as member_no,
          true as enrolled,
          coalesce((
            select count(*)::int from public.ragwan_training_progress p
            where p.enrollment_id=e.id and p.status='completed'
          ),0) as completed_count,
          coalesce((
            select max(p.step)::int from public.ragwan_training_progress p
            where p.enrollment_id=e.id and p.status='completed'
          ),0) as last_completed_step,
          e.last_activity_at
        from public.ragwan_training_enrollments e
        where e.sponsor_user_id=s.user_id
          and e.archived_at is null
          and (
            q=''
            or lower(coalesce(e.trainee_name,'')) like '%'||q||'%'
            or lower(coalesce(e.trainee_display_name,'')) like '%'||q||'%'
            or lower(coalesce(e.trainee_member_no,'')) like '%'||q||'%'
          )
        limit 30
      ) x
    ), '[]'::json);
  end if;

  return coalesce((
    select json_agg(x order by x.enrolled desc, x.name asc)
    from (
      select
        m.id,
        trim(coalesce(m.name,'')) as name,
        nullif(trim(coalesce(m.member_no::text,'')),'') as member_no,
        exists(
          select 1 from public.ragwan_training_enrollments e
          where e.sponsor_user_id=s.user_id and e.trainee_member_id=m.id
        ) as enrolled,
        coalesce((
          select count(*)::int from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id and p.trainee_member_id=m.id and p.status='completed'
        ),0) as completed_count,
        coalesce((
          select max(p.step)::int from public.ragwan_training_progress p
          where p.sponsor_user_id=s.user_id and p.trainee_member_id=m.id and p.status='completed'
        ),0) as last_completed_step,
        (
          select max(e2.last_activity_at)
          from public.ragwan_training_enrollments e2
          where e2.sponsor_user_id=s.user_id and e2.trainee_member_id=m.id
        ) as last_activity_at
      from public.members m
      where m.active=true
        and m.team_id=s.team_id
        and m.id<>s.member_id
        and (
          q=''
          or lower(coalesce(m.name,'')) like '%'||q||'%'
          or lower(coalesce(m.member_no::text,'')) like '%'||q||'%'
        )
      limit 30
    ) x
  ), '[]'::json);
end;
$$;

-- الدالة غير موجودة حاليًا على Supabase، فإنشاؤها يمنحها EXECUTE لـ PUBLIC افتراضيًا؛ نحصرها بالخادم.
revoke all on function public.search_ragwan_trainees(uuid,text) from public, anon, authenticated;
grant execute on function public.search_ragwan_trainees(uuid,text) to service_role;

-- 5) دوال إدارة المتدربين الثمانية الموجودة على Production: للخادم فقط.
--    على Production يمكن اليوم استدعاء بعضها بالمفتاح العام (anon) عبر /api/rpc أو مباشرة على Supabase،
--    فيصل حساب المطالعة إليها متجاوزًا رفض api/ragwan-files.js، وتكون الحماية معتمدة على أجسامها وحدها.
--    الواجهة لا تستدعي أيًا منها مباشرة؛ كل استدعاءاتها تمر عبر api/ragwan-files.js بالمفتاح السري
--    (service_role)، وهو المسار الذي يبقى يعمل. لا يتغير جسم أي منها.
--    تُعامل كل التواقيع الموجودة لكل اسم، فلا يعتمد هذا القسم على توقيع بعينه.
do $trainee_grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'add_ragwan_trainee_by_member_no','archive_ragwan_trainee','get_ragwan_training_progress',
        'list_ragwan_trainees','record_ragwan_plan_completion_for_member','save_ragwan_training_step',
        'select_ragwan_trainee','update_ragwan_trainee_display_name'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$trainee_grants$;

-- لا ينشئ هذا الملف get_ragwan_plan_completions ولا save_ragwan_success_plan_content (غير موجودتين على
-- Production، والقسم 0 يوقف التطبيق إن ظهرتا). قراءة محتوى الخطة وكل ما يعرض الأبواب العشرة لا يُمس.

notify pgrst, 'reload schema';

commit;
