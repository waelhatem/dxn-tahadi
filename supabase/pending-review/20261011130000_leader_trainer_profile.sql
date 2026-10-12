-- ⚠️ للمراجعة فقط — لا تُطبَّق على Production قبل موافقة صاحب المشروع.
-- موجودة خارج supabase/migrations عمدًا حتى لا تُطبَّق تلقائيًا.
-- تُطبَّق بعد 20261011120000_ragwan_leader_trainer_access.sql (تعتمد على ragwan_leader_can_manage_training).
--
-- الهدف: بيانات عرض «المدرب» لحساب القائد (الاسم، رقم العضوية، الصفة) تظهر في حسابه وفي شهادة خطة رجوان.
--
-- القواعد:
--   - البيانات مرتبطة بمعرّف الحساب app_users.id فقط. لا تغيّر app_users.member_id ولا تربط حساب القائد بحساب العضو،
--     حتى لو كان رقم العضوية نفسه. ملكية المتدربين والتقدم والشهادات تبقى على sponsor_user_id = app_users.id.
--   - التعديل لحساب القائد «مدير التدريب» فقط (ragwan_leader_can_manage_training)، ويُتحقق منه هنا وفي الخادم.
--     LEADER1 (بلا جذر) لا يستطيع التعديل، ولا تُنشأ له بيانات.
--   - العضو العادي: بيانات المدرب هي اسمه ورقم عضويته من members، بلا تغيير.
--   - الجدول للخادم فقط: RLS مفعّل بلا سياسات، ولا صلاحيات لـ anon أو authenticated.
--
-- ما يكتبه عند التطبيق: صفًّا واحدًا جديدًا في الجدول الجديد لحساب القائد الذي جذر فريقه 820469486
-- (إن لم يكن له صف). لا يعدّل أي صف موجود في أي جدول آخر.
-- التراجع: 20261011130000_leader_trainer_profile.ROLLBACK.md

begin;

-- 0) تحقق مسبق.
do $preconditions$
begin
  if to_regprocedure('public.ragwan_leader_can_manage_training(uuid)') is null then
    raise exception 'leader profile precondition: طبّق 20261011120000_ragwan_leader_trainer_access.sql أولًا';
  end if;
  if to_regprocedure('public.app_current_user_id(uuid)') is null then
    raise exception 'leader profile precondition: الدالة app_current_user_id(uuid) غير موجودة';
  end if;
  if to_regclass('public.dxn_team_members') is null or to_regclass('public.app_users') is null or to_regclass('public.members') is null then
    raise exception 'leader profile precondition: جداول app_users أو members أو dxn_team_members غير موجودة';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    raise exception 'leader profile precondition: الدور service_role غير موجود';
  end if;
end
$preconditions$;

-- 1) بيانات عرض المدرب لكل حساب قائد (مفتاحها app_users.id).
create table if not exists public.leader_trainer_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  display_name text not null,
  member_no text not null,
  title text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id) on delete set null,
  constraint leader_trainer_profiles_name_check check (char_length(trim(display_name)) between 2 and 80),
  constraint leader_trainer_profiles_member_no_check check (member_no ~ '^[0-9]{9}$'),
  constraint leader_trainer_profiles_title_check check (title is null or char_length(title) <= 120)
);

alter table public.leader_trainer_profiles enable row level security;
revoke all on table public.leader_trainer_profiles from public, anon, authenticated;

-- 2) القيم الأولى لحساب القائد LEADER (جذر فريقه 820469486). لا يستبدل قيمًا عُدّلت لاحقًا.
insert into public.leader_trainer_profiles(user_id, display_name, member_no, title, updated_by)
select au.id, 'وائل حاتم', '820469486', 'مصمم مجتمع الصحة والثراء وقائده', null
from public.app_users au
where au.role = 'leader'
  and au.active = true
  and trim(coalesce(au.team_root_member_no,'')) = '820469486'
on conflict (user_id) do nothing;

-- 3) بيانات المدرب للحساب الحالي (قراءة). القائد: صفه في الجدول، وإلا رقم جذر فريقه فقط.
--    العضو: اسمه ورقم عضويته من members. لا يكشف بيانات أي حساب آخر.
create or replace function public.get_ragwan_trainer_identity(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u record;
  p record;
  m record;
begin
  select au.id, lower(trim(au.role)) as role, au.active, au.member_id,
         trim(coalesce(au.team_root_member_no,'')) as root
    into u
  from public.app_users au
  where au.id = public.app_current_user_id(p_token)
  limit 1;
  if u.id is null or u.active is distinct from true then
    raise exception 'انتهت الجلسة. سجّل الدخول من جديد.';
  end if;

  if u.role = 'leader' then
    select lp.display_name, lp.member_no, lp.title
      into p
    from public.leader_trainer_profiles lp
    where lp.user_id = u.id;
    return json_build_object(
      'type', 'leader',
      'name', p.display_name,
      'member_no', coalesce(p.member_no, case when u.root ~ '^[0-9]{9}$' then u.root end),
      'title', p.title,
      'can_edit', public.ragwan_leader_can_manage_training(p_token)
    );
  end if;

  if u.role = 'member' then
    select trim(coalesce(mm.name,'')) as name, trim(coalesce(mm.member_no::text,'')) as member_no
      into m
    from public.members mm
    where mm.id = u.member_id;
    return json_build_object(
      'type', 'member',
      'name', nullif(m.name,''),
      'member_no', nullif(m.member_no,''),
      'title', null,
      'can_edit', false
    );
  end if;

  raise exception 'غير مصرح';
end;
$$;

-- 4) تعديل بيانات المدرب: حساب القائد مدير التدريب فقط، لنفسه فقط.
create or replace function public.save_leader_trainer_profile(
  p_token uuid,
  p_display_name text,
  p_member_no text,
  p_title text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.app_current_user_id(p_token);
  v_name text := trim(coalesce(p_display_name,''));
  v_no text := trim(coalesce(p_member_no,''));
  v_title text := nullif(trim(coalesce(p_title,'')),'');
begin
  if v_uid is null or not public.ragwan_leader_can_manage_training(p_token) then
    raise exception 'تعديل بيانات المدرب متاح لحساب القائد المدير فقط';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'الاسم يجب أن يكون بين 2 و80 حرفًا';
  end if;
  if v_no !~ '^[0-9]{9}$' then
    raise exception 'رقم العضوية يجب أن يتكوّن من 9 أرقام';
  end if;
  if not exists(select 1 from public.dxn_team_members d where trim(d.member_no) = v_no) then
    raise exception 'رقم العضوية غير موجود في سجل DXN';
  end if;
  if v_title is not null and char_length(v_title) > 120 then
    raise exception 'الصفة يجب ألا تزيد على 120 حرفًا';
  end if;

  insert into public.leader_trainer_profiles(user_id, display_name, member_no, title, updated_at, updated_by)
  values(v_uid, v_name, v_no, v_title, now(), v_uid)
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    member_no = excluded.member_no,
    title = excluded.title,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return public.get_ragwan_trainer_identity(p_token);
end;
$$;

-- الخادم فقط (api/ragwan-files.js بالمفتاح السري).
revoke all on function public.get_ragwan_trainer_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_ragwan_trainer_identity(uuid) to service_role;
revoke all on function public.save_leader_trainer_profile(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.save_leader_trainer_profile(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
