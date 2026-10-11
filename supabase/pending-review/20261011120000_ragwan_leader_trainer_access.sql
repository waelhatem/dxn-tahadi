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
--      لـ service_role فقط. api/ragwan-files.js يستدعي الدوال بالمفتاح السري، وكل دوال رجوان
--      التي تستدعي ragwan_current_sponsor هي SECURITY DEFINER فتعمل بصلاحيات مالكها.
--
-- لا يعدّل أي صف عند التطبيق. لا يغيّر الجداول ولا تقدم المتدربين ولا الشهادات.
-- التراجع: راجع supabase/pending-review/20261011120000_ragwan_leader_trainer_access.ROLLBACK.md
-- (المصدر الموثوق للتراجع هو تعريفات الدوال المحفوظة من Supabase قبل التطبيق، وليس ملفات المستودع).

begin;

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
      or au.role='leader'
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
    return nullif(coalesce(nullif(v_root,''),v_member_no),'');
  end if;
  if v_role='member' then
    return nullif(v_member_no,'');
  end if;
  return null;
end;
$$;

revoke all on function public.ragwan_current_trainer_root_no(uuid) from public, anon, authenticated;
grant execute on function public.ragwan_current_trainer_root_no(uuid) to service_role;

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

notify pgrst, 'reload schema';

commit;
