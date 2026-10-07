-- Let a Ragwan trainee who was added before joining the community register
-- later on the SAME public.members identity, without losing training progress.
--
-- Rules:
--   * A public.members row is the member identity used by Ragwan training.
--     It does NOT mean the person has a community account.
--   * A community account exists only when public.app_users is linked to the
--     membership (app_users.member_id = members.id, or app_users.login_no = member_no).
--   * Sign-up reuses an existing members.id that has no account, and only adds
--     the app_users row. ragwan_training_enrollments / ragwan_training_progress
--     are never touched, so all previous progress stays linked to the same id.
--   * Members without an account are hidden from the member_stats view.
--     Their members row is kept. team_stats is not changed here.
--   * member_stats below follows the repository definition (20261002090000);
--     it must be checked against the live view definition before applying.
--
-- add_ragwan_trainee_by_member_no keeps its rules and its recursive downline
-- exactly as in 20261005100000 (trainee must be in dxn_team_members and anywhere
-- in the sponsor's DXN downline, any generation, no account required).
-- The only change: its local variable sponsor_member_no is renamed to
-- v_sponsor_member_no. On PostgreSQL the old name collides with the
-- dxn_team_members.sponsor_member_no column inside the recursive CTE and every
-- call fails with: column reference "sponsor_member_no" is ambiguous.
--
-- register_verified_member (live definition, not previously in this repository)
-- keeps all its validation, the DXN check, PIN hashing and messages; only its
-- "members row exists" rejection is replaced by reusing that identity.
-- self_register (live definition) keeps its validation, team check, PIN hashing
-- and pending account (app_users.active=false, registration_status='pending').
-- A members row without an account is reused; its members.active is left as is
-- so the sponsor keeps access to the trainee's Ragwan record (select_ragwan_trainee
-- requires members.active=true).
-- reject_member_registration deletes only the pending account and keeps the
-- members identity whenever any table references it (Ragwan training included).
-- approve_member_registration is unchanged (it already keeps the same identity).

-- 0) Ragwan trainee enrollment: identical to 20261005100000 except the
--    v_sponsor_member_no rename (see header).
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

  -- The operation is available to a member/sponsor account only.
  select *
    into sponsor_row
  from public.ragwan_current_sponsor(p_token)
  limit 1;

  if sponsor_row.user_id is null then
    raise exception 'هذه العملية متاحة لحساب العضو فقط';
  end if;

  -- Resolve the sponsor's DXN membership number from the local member record.
  select trim(m.member_no)
    into v_sponsor_member_no
  from public.members m
  where m.id = sponsor_row.member_id
  limit 1;

  if v_sponsor_member_no is null or v_sponsor_member_no = '' then
    raise exception 'تعذر تحديد رقم عضوية السبونسر في سجل DXN';
  end if;

  -- Resolve the trainee from the authoritative DXN registry.
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

  /*
    Verify that the trainee belongs to the sponsor's COMPLETE downline.

    Direct sponsor is NOT required.
    Any generation is accepted.

    The path array prevents infinite recursion if the imported DXN data
    contains a sponsorship cycle.
  */
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

  -- Do not allow the sponsor to add himself as a trainee.
  if found_depth = 0 then
    raise exception 'لا يمكن إضافة حسابك كمتدرب في خطتك';
  end if;

  /*
    The training tables use public.members as their internal FK.
    If the DXN member is not yet materialized locally, create the minimum
    local member record. No app_user/login is created here.
  */
  select *
    into local_member
  from public.members m
  where trim(m.member_no) = normalized_no
  limit 1;

  if local_member.id is null then

    insert into public.members(
      member_no,
      name,
      team_id,
      active
    )
    values(
      normalized_no,
      target_dxn.member_name,
      sponsor_row.team_id,
      true
    )
    returning *
    into local_member;

  else

    -- Keep the local record usable for Ragwan while preserving its identity.
    update public.members
    set name = target_dxn.member_name,
        active = true
    where id = local_member.id;

    select *
      into local_member
    from public.members
    where id = local_member.id
    limit 1;

  end if;

  insert into public.ragwan_training_enrollments(
    sponsor_user_id,
    sponsor_member_id,
    trainee_member_id,
    trainee_name,
    trainee_member_no
  )
  values(
    sponsor_row.user_id,
    sponsor_row.member_id,
    local_member.id,
    target_dxn.member_name,
    normalized_no
  )
  on conflict(sponsor_user_id, trainee_member_id)
  do update set
    trainee_name = excluded.trainee_name,
    trainee_member_no = excluded.trainee_member_no,
    last_activity_at = now()
  returning *
    into enrollment_row;

  return json_build_object(
    'ok', true,
    'enrollment_id', enrollment_row.id,
    'member_id', enrollment_row.trainee_member_id,
    'name', enrollment_row.trainee_name,
    'member_no', enrollment_row.trainee_member_no,
    'depth_from_sponsor', found_depth,
    'started_at', enrollment_row.started_at,
    'last_activity_at', enrollment_row.last_activity_at,
    'completed_at', enrollment_row.completed_at
  );

end;
$$;

revoke all
on function public.add_ragwan_trainee_by_member_no(uuid,text)
from public, anon, authenticated;

grant execute
on function public.add_ragwan_trainee_by_member_no(uuid,text)
to anon, authenticated, service_role;

-- 1) Shared helper: resolve or create the member identity for a new account.
create or replace function public.resolve_member_identity_for_signup(
  p_member_no text,
  p_name text,
  p_team uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  no text := trim(coalesce(p_member_no, ''));
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
  existing_id uuid;
  new_id uuid;
begin
  if no = '' then
    raise exception using errcode = 'P0001', message = 'رقم العضوية مطلوب';
  end if;

  -- An account already exists for this membership: block a duplicate.
  if exists (
    select 1
    from public.app_users u
    left join public.members m on m.id = u.member_id
    where trim(u.login_no) = no
       or trim(m.member_no) = no
  ) then
    raise exception using errcode = 'P0001', message = 'رقم العضوية مستخدم مسبقاً';
  end if;

  -- Reuse the identity created earlier (e.g. by Ragwan trainee enrollment).
  select m.id
    into existing_id
  from public.members m
  where trim(m.member_no) = no
  order by m.created_at
  limit 1
  for update;

  if existing_id is not null then
    update public.members
    set name = coalesce(clean_name, name),
        team_id = coalesce(p_team, team_id),
        active = true
    where id = existing_id;
    return existing_id;
  end if;

  if clean_name is null then
    raise exception using errcode = 'P0001', message = 'اسم العضو مطلوب';
  end if;

  insert into public.members(member_no, name, team_id)
  values (no, clean_name, p_team)
  returning id into new_id;

  return new_id;
end;
$$;

-- Internal helper only: callable from other SECURITY DEFINER functions,
-- never directly through the public RPC proxy.
revoke all on function public.resolve_member_identity_for_signup(text, text, uuid)
  from public, anon, authenticated;

-- 2) Account status depends on app_users only, never on members alone.
create or replace function public.check_member_account_status(p_member_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  no text := trim(coalesce(p_member_no, ''));
  m public.members;
  u public.app_users;
begin
  if no = '' then
    raise exception using errcode = 'P0001', message = 'رقم العضوية مطلوب';
  end if;

  select * into m
  from public.members
  where trim(member_no) = no
  order by created_at
  limit 1;

  select * into u
  from public.app_users au
  where trim(au.login_no) = no
     or (m.id is not null and au.member_id = m.id)
  order by au.created_at
  limit 1;

  if u.id is not null then
    return jsonb_build_object(
      'registered', true,
      'member_id', coalesce(u.member_id, m.id),
      'name', coalesce(m.name, '')
    );
  end if;

  return jsonb_build_object('registered', false);
end;
$$;

revoke execute on function public.check_member_account_status(text) from public;
grant execute on function public.check_member_account_status(text) to anon, authenticated;

-- 3) Leader-created accounts reuse an existing account-less identity.
--    PIN rules, hashing and the leader check are unchanged. The leader check
--    calls public.app_current_role() (what current_role() wraps) because an
--    unqualified current_role(...) is the reserved SQL keyword CURRENT_ROLE.
create or replace function public.create_member(p_token uuid, p_member_no text, p_name text, p_pin text, p_team uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  x uuid;
begin
  if coalesce(public.app_current_role(p_token), '') <> 'leader' then raise exception 'صلاحية القائد فقط'; end if;
  if length(trim(p_pin)) < 4 then raise exception 'PIN يجب أن يكون 4 أرقام على الأقل'; end if;
  x := public.resolve_member_identity_for_signup(p_member_no, p_name, p_team);
  insert into app_users(login_no, pin_hash, role, member_id)
  values (trim(p_member_no), crypt(trim(p_pin), gen_salt('bf')), 'member', x);
  return x;
exception when unique_violation then raise exception 'رقم العضوية مستخدم مسبقاً';
end;
$$;

-- 3b) Self-service sign-up for verified DXN members.
--     Same as the live definition except the identity block: an existing
--     app_users row still blocks with the original message, but a members row
--     without an account is reused instead of rejected.
create or replace function public.register_verified_member(
  p_member_no text,
  p_name text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_no text := trim(coalesce(p_member_no, ''));
  v_name text := trim(coalesce(p_name, ''));
  v_pin text := trim(coalesce(p_pin, ''));
  x uuid;
begin
  if v_no !~ '^[0-9]{9}$' then
    raise exception 'رقم العضوية يجب أن يكون 9 أرقام بالضبط';
  end if;

  if length(v_name) < 2 then
    raise exception 'الاسم غير صحيح';
  end if;

  if length(v_pin) < 4 then
    raise exception 'PIN يجب أن يكون 4 أحرف أو أرقام على الأقل';
  end if;

  if not exists (
    select 1
    from public.dxn_team_members
    where member_no = v_no
  ) then
    raise exception 'هذه العضوية غير موجودة في سجل أعضاء DXN';
  end if;

  -- Only a real community account (app_users) blocks a new sign-up.
  if exists (
    select 1
    from public.app_users u
    left join public.members m on m.id = u.member_id
    where trim(u.login_no) = v_no
       or trim(m.member_no) = v_no
  ) then
    raise exception 'هذا الحساب موجود مسبقاً؛ استخدم تسجيل الدخول.';
  end if;

  -- Reuse an existing members identity (e.g. a Ragwan trainee), else create it
  -- with team_id NULL as before.
  x := public.resolve_member_identity_for_signup(v_no, v_name, null);

  insert into public.app_users(login_no, pin_hash, role, member_id)
  values(
    v_no,
    crypt(v_pin, gen_salt('bf')),
    'member',
    x
  );

  return x;

exception
  when unique_violation then
    raise exception 'رقم العضوية مستخدم مسبقاً';
end;
$function$;

-- 3c) Pending self-registration.
--     Same as the live definition except the identity block: an existing
--     app_users row still blocks, but a members row without an account is
--     reused (same members.id) instead of rejected. A brand-new identity is
--     still created with active=false exactly as before.
create or replace function public.self_register(
  p_member_no text,
  p_name text,
  p_pin text,
  p_team uuid
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  mid uuid;
  existing_team boolean;
begin
  if trim(coalesce(p_member_no,'')) !~ '^[0-9]{9}$' then
    raise exception 'رقم العضوية يجب أن يتكون من 9 أرقام بالضبط';
  end if;

  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'أدخل الاسم الكامل';
  end if;

  if length(trim(coalesce(p_pin,''))) < 4 then
    raise exception 'PIN يجب أن يكون 4 أحرف أو أرقام على الأقل';
  end if;

  if p_team is not null then
    select exists(
      select 1
      from public.teams
      where id=p_team and active=true
    ) into existing_team;

    if not existing_team then
      raise exception 'الفريق غير متاح';
    end if;
  end if;

  -- Only a real community account (app_users) blocks a new registration.
  if exists(
       select 1
       from public.app_users u
       left join public.members m on m.id=u.member_id
       where trim(u.login_no)=trim(p_member_no)
          or trim(m.member_no)=trim(p_member_no)
     ) then
    raise exception 'رقم العضوية مستخدم مسبقاً';
  end if;

  -- Reuse an identity created earlier (e.g. a Ragwan trainee) without an account.
  select m.id
    into mid
  from public.members m
  where trim(m.member_no)=trim(p_member_no)
  order by m.created_at
  limit 1
  for update;

  if mid is not null then
    update public.members
    set name=trim(p_name),
        team_id=coalesce(p_team,team_id)
    where id=mid;
  else
    insert into public.members(member_no,name,team_id,active)
    values(trim(p_member_no),trim(p_name),p_team,false)
    returning id into mid;
  end if;

  insert into public.app_users(
    login_no,
    pin_hash,
    role,
    member_id,
    active,
    registration_status
  )
  values(
    trim(p_member_no),
    public.crypt(trim(p_pin),public.gen_salt('bf')),
    'member',
    mid,
    false,
    'pending'
  );

  return json_build_object(
    'member_id',mid,
    'status','pending'
  );

exception when unique_violation then
  raise exception 'رقم العضوية مستخدم مسبقاً';
end;
$function$;

-- 3d) Rejecting a pending community registration rejects the ACCOUNT only.
--     Leader check and the pending condition match approve_member_registration.
--     The pending app_users row is deleted (so the person can apply again).
--     The members identity is deleted as before ONLY when no other row in the
--     database references it; the check reads every foreign key that points to
--     public.members from the catalog, so Ragwan enrollments/progress (and any
--     other dependent data) keep the identity alive and are never cascaded away.
--     NOTE: written from the live approve_member_registration and the described
--     live behaviour of this function; compare with its live text before applying.
create or replace function public.reject_member_registration(p_token uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid;
  u public.app_users;
  fk record;
  referenced boolean := false;
begin
  uid:=public.current_user_id(p_token);
  if uid is null or public.app_current_role(p_token)<>'leader' then
    raise exception 'صلاحية القائد فقط';
  end if;
  select * into u from public.app_users where member_id=p_member and role='member' for update;
  if u.id is null or u.registration_status<>'pending' then
    raise exception 'طلب التسجيل غير متاح';
  end if;

  delete from public.app_users where id=u.id;

  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f'
      and c.confrelid='public.members'::regclass
      and array_length(c.conkey,1)=1
      and c.conrelid<>'public.app_users'::regclass
  loop
    execute format('select exists(select 1 from %s where %I=$1)', fk.tbl, fk.col)
      into referenced
      using p_member;
    exit when referenced;
  end loop;

  if not referenced then
    delete from public.members where id=p_member;
  end if;
end;
$function$;

-- 4) member_stats shows only members linked to a community account.
--    Same columns and order as the current definition.
create or replace view public.member_stats as
select
  m.id,
  m.member_no,
  m.name,
  m.team_id,
  m.stars,
  m.active,
  t.name as team_name,
  coalesce((
    select p.public_url
    from public.member_profile_photos p
    where p.member_id = m.id
      and p.active = true
    order by p.created_at desc
    limit 1
  ), '') as profile_photo_url,
  coalesce((
    select p.storage_path
    from public.member_profile_photos p
    where p.member_id = m.id
      and p.active = true
    order by p.created_at desc
    limit 1
  ), '') as profile_photo_path,
  count(cs.id) filter (where cs.status='approved') as approved_challenges
from public.members m
left join public.teams t on t.id=m.team_id
left join public.challenge_submissions cs on cs.member_id=m.id
where exists (select 1 from public.app_users u where u.member_id = m.id)
group by m.id,t.name;

notify pgrst, 'reload schema';
