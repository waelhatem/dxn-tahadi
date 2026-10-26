-- REVIEWED AND APPLIED on 2026-10-26 to DXN Tahadi production database.
-- Tracked schema snapshot; this file is NOT an automatic migration.
-- Member authentication is custom: public.sessions + public.app_users, NOT Supabase Auth.
-- Direct table access is revoked; every RPC enforces app-session ownership.

create table if not exists public.followup_contacts (
  id uuid primary key default gen_random_uuid(),
  assigned_user_id uuid not null references public.app_users(id),
  created_by_user_id uuid not null references public.app_users(id),
  kind text not null check (kind in ('prospect', 'new_member')),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  gender text,
  country text,
  phone text,
  member_no text,
  origin_contact_id uuid unique references public.followup_contacts(id),
  source_label text,
  timezone_name text not null default 'Asia/Baghdad',
  contact_channel text,
  consent_confirmed boolean not null default false,
  consent_note text,
  status text not null default 'new'
    check (status in ('new','consent_pending','active','interested','deferred',
                     'registered','refused','blocked','closed')),
  stage integer not null default 0 check (stage between 0 and 5),
  opened_at timestamptz not null default now(),
  next_due_at timestamptz,
  reminder_minutes integer not null default 30 check (reminder_minutes in (15,30)),
  notes text,
  updated_at timestamptz not null default now(),
  constraint followup_member_stage_chk check (kind = 'new_member' or stage <= 3),
  constraint followup_no_due_when_stopped_chk check (
    status not in ('registered','refused','blocked','closed') or next_due_at is null
  )
);

create index if not exists followup_contacts_owner_due_idx
  on public.followup_contacts(assigned_user_id, next_due_at)
  where next_due_at is not null;
create index if not exists followup_contacts_kind_status_idx
  on public.followup_contacts(kind, status);
create index if not exists followup_contacts_created_by_idx
  on public.followup_contacts(created_by_user_id);
create unique index if not exists followup_new_member_number_unique_idx
  on public.followup_contacts(member_no)
  where kind='new_member' and member_no is not null;

create table if not exists public.followup_actions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.followup_contacts(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id),
  result text not null,
  stage_before integer not null,
  stage_after integer not null,
  note text,
  next_due_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists followup_actions_contact_created_idx
  on public.followup_actions(contact_id, created_at desc);
create index if not exists followup_actions_actor_idx
  on public.followup_actions(actor_user_id);

alter table public.followup_contacts enable row level security;
alter table public.followup_actions enable row level security;
revoke all on public.followup_contacts from public, anon, authenticated;
revoke all on public.followup_actions from public, anon, authenticated;

-- Only the leader can view the list of potential assignees.
create or replace function public.followup_assignees(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_result json;
begin
  v_uid := public.app_current_user_id(p_token);
  if v_uid is null or public.app_current_role(p_token) <> 'leader' then
    raise exception 'غير مصرح';
  end if;
  select coalesce(json_agg(json_build_object(
    'id',u.id,'name',coalesce(m.name,u.login_no),'member_no',m.member_no
  ) order by coalesce(m.name,u.login_no)), '[]'::json)
  into v_result
  from public.app_users u
  left join public.members m on m.id=u.member_id
  where u.active and u.role in ('member','leader');
  return v_result;
end;
$$;
revoke all on function public.followup_assignees(uuid) from public,anon,authenticated;
grant execute on function public.followup_assignees(uuid) to anon,authenticated;

create or replace function public.followup_list(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role text;
  v_result json;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then
    raise exception 'انتهت الجلسة أو لا توجد صلاحية';
  end if;
  select coalesce(json_agg(row_to_json(c) order by c.next_due_at nulls last,c.created_at desc), '[]'::json)
  into v_result
  from (
    select f.id, f.assigned_user_id, f.kind, f.name, f.gender, f.country,
           f.phone, f.member_no, f.source_label, f.timezone_name,
           f.contact_channel, f.consent_confirmed, f.consent_note,
           f.status, f.stage, f.opened_at, f.next_due_at,
           f.reminder_minutes, f.notes, f.updated_at, f.created_by_user_id,
           coalesce(m.name,u.login_no) as assigned_name,
           f.opened_at as created_at
    from public.followup_contacts f
    join public.app_users u on u.id=f.assigned_user_id
    left join public.members m on m.id=u.member_id
    where (v_role='leader' or f.assigned_user_id=v_uid)
  ) c;
  return v_result;
end;
$$;
revoke all on function public.followup_list(uuid) from public,anon,authenticated;
grant execute on function public.followup_list(uuid) to anon,authenticated;

create or replace function public.followup_add(
  p_token uuid,
  p_kind text,
  p_name text,
  p_assignee_user_id uuid default null,
  p_phone text default null,
  p_country text default null,
  p_gender text default null,
  p_member_no text default null,
  p_source_label text default null,
  p_timezone_name text default 'Asia/Baghdad',
  p_contact_channel text default null,
  p_consent_confirmed boolean default false,
  p_consent_note text default null,
  p_notes text default null,
  p_next_due_at timestamptz default null,
  p_reminder_minutes integer default 30
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role text;
  v_owner uuid;
  v_id uuid;
  v_kind text := btrim(coalesce(p_kind,''));
  v_name text := btrim(coalesce(p_name,''));
  v_opened timestamptz := now();
  v_due timestamptz;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('member','leader') then raise exception 'غير مصرح'; end if;
  if v_kind not in ('prospect','new_member') then raise exception 'نوع الحالة غير صحيح'; end if;
  if char_length(v_name) not between 2 and 160 then raise exception 'اسم الشخص غير صحيح'; end if;
  if char_length(coalesce(p_phone,'')) > 40 or char_length(coalesce(p_notes,'')) > 2000
      or char_length(coalesce(p_consent_note,'')) > 500 then
    raise exception 'البيانات المدخلة طويلة جدًا';
  end if;
  if p_reminder_minutes not in (15,30) then raise exception 'وقت التذكير غير صحيح'; end if;
  if v_role='leader' and p_assignee_user_id is null then
    raise exception 'اختر العضو المسؤول عن الحالة قبل الحفظ';
  end if;
  v_owner := case when v_role='leader' then p_assignee_user_id else v_uid end;
  if v_role='member' and p_assignee_user_id is not null and p_assignee_user_id<>v_uid then
    raise exception 'لا يمكن إسناد حالات إلى عضو آخر';
  end if;
  if not exists(select 1 from public.app_users u where u.id=v_owner and u.active
                and u.role in ('member','leader')) then raise exception 'المسؤول غير موجود'; end if;
  -- No task is scheduled until the proper permission to contact is recorded.
  v_due := case when coalesce(p_consent_confirmed,false)
    then coalesce(p_next_due_at,
       case when v_kind='new_member' then v_opened+interval '1 day' else v_opened end)
    else null end;
  insert into public.followup_contacts (
    assigned_user_id,created_by_user_id,kind,name,gender,country,phone,member_no,
    source_label,timezone_name,contact_channel,consent_confirmed,consent_note,
    status,stage,opened_at,next_due_at,reminder_minutes,notes
  ) values (
    v_owner,v_uid,v_kind,v_name,nullif(btrim(coalesce(p_gender,'')),''),
    nullif(btrim(coalesce(p_country,'')),''),nullif(btrim(coalesce(p_phone,'')),''),
    nullif(btrim(coalesce(p_member_no,'')),''),nullif(btrim(coalesce(p_source_label,'')),''),
    coalesce(nullif(btrim(p_timezone_name),''),'Asia/Baghdad'),
    nullif(btrim(coalesce(p_contact_channel,'')),''),
    coalesce(p_consent_confirmed,false),nullif(btrim(coalesce(p_consent_note,'')),''),
    case when coalesce(p_consent_confirmed,false) then 'new' else 'consent_pending' end,
    0,v_opened,v_due,p_reminder_minutes,nullif(btrim(coalesce(p_notes,'')),'')
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.followup_add(uuid,text,text,uuid,text,text,text,text,text,text,text,boolean,text,text,timestamptz,integer)
  from public,anon,authenticated;
grant execute on function public.followup_add(uuid,text,text,uuid,text,text,text,text,text,text,text,boolean,text,text,timestamptz,integer)
  to anon,authenticated;

create or replace function public.followup_record_action(
  p_token uuid,
  p_contact_id uuid,
  p_result text,
  p_note text default null,
  p_next_due_at timestamptz default null,
  p_registered_member_no text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role text;
  v_contact public.followup_contacts;
  v_result text := btrim(coalesce(p_result,''));
  v_next_stage integer;
  v_next_due timestamptz;
  v_status text;
  v_days integer[];
  v_member_no text := btrim(coalesce(p_registered_member_no,''));
  v_new_member_id uuid;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  select * into v_contact from public.followup_contacts
  where id=p_contact_id and (v_role='leader' or assigned_user_id=v_uid)
  for update;
  if not found then raise exception 'الحالة غير موجودة أو غير مصرح بها'; end if;
  if v_contact.status in ('registered','refused','blocked','closed') then
    raise exception 'المتابعة متوقفة لهذه الحالة';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then raise exception 'الملاحظة طويلة جدًا'; end if;
  if v_result not in ('sent','no_reply','interested','deferred',
                      'registered','refused','blocked','closed','consent_granted') then
    raise exception 'نتيجة متابعة غير صحيحة';
  end if;
  if v_result='registered' then
    if v_contact.kind <> 'prospect' then
      raise exception 'تسجيل العضوية متاح للمهتمين فقط';
    end if;
    if v_member_no !~ '^[0-9]{6,15}$' then
      raise exception 'رقم العضوية الجديدة يجب أن يتكون من 6 إلى 15 رقمًا';
    end if;
    if exists(select 1 from public.followup_contacts
              where kind='new_member' and member_no=v_member_no) then
      raise exception 'رقم العضوية موجود مسبقًا في متابعة الأعضاء الجدد';
    end if;
  end if;
  v_next_stage := v_contact.stage;
  v_next_due := v_contact.next_due_at;
  v_status := v_contact.status;
  if v_result = 'consent_granted' then
    v_status := 'active';
    v_next_due := coalesce(p_next_due_at,now());
  elsif not v_contact.consent_confirmed and v_result not in ('refused','blocked','closed','registered') then
    raise exception 'لا يمكن التواصل قبل إثبات الموافقة المناسبة';
  elsif v_result in ('refused','blocked','closed','registered') then
    v_status := v_result;
    v_next_due := null;
  elsif v_result in ('deferred','interested') then
    if p_next_due_at is null or p_next_due_at <= now() then
      raise exception 'اختر موعد متابعة مستقبليًا';
    end if;
    v_status := case when v_result='interested' then 'interested' else 'deferred' end;
    v_next_due := p_next_due_at;
  else
    v_days := case when v_contact.kind='prospect' then array[0,1,3,7]
                   else array[1,3,7,14,21,30] end;
    if v_contact.stage >= array_length(v_days,1)-1 then
      v_status := 'closed';
      v_next_due := null;
    else
      v_next_stage := v_contact.stage+1;
      v_next_due := coalesce(p_next_due_at,
                    v_contact.opened_at+(v_days[v_next_stage+1]||' days')::interval);
      v_status := 'active';
    end if;
  end if;
  update public.followup_contacts
  set stage=v_next_stage,status=v_status,next_due_at=v_next_due,
      consent_confirmed=case when v_result='consent_granted' then true else consent_confirmed end,
      updated_at=now()
  where id=v_contact.id;
  insert into public.followup_actions(
    contact_id,actor_user_id,result,stage_before,stage_after,note,next_due_at
  ) values(
    v_contact.id,v_uid,v_result,v_contact.stage,v_next_stage,
    nullif(btrim(coalesce(p_note,'')),''),v_next_due
  );
  if v_result='registered' then
    -- Registration does not transfer the prospect's marketing consent to member onboarding.
    -- Keep the original owner and link the new record to its source, atomically.
    insert into public.followup_contacts (
      assigned_user_id,created_by_user_id,kind,name,gender,country,phone,member_no,
      origin_contact_id,source_label,timezone_name,contact_channel,
      consent_confirmed,consent_note,status,stage,opened_at,next_due_at,reminder_minutes
    ) values (
      v_contact.assigned_user_id,v_uid,'new_member',v_contact.name,v_contact.gender,
      v_contact.country,v_contact.phone,v_member_no,v_contact.id,
      v_contact.source_label,v_contact.timezone_name,v_contact.contact_channel,
      false,null,'consent_pending',0,now(),null,v_contact.reminder_minutes
    ) returning id into v_new_member_id;
  end if;
  return json_build_object('ok',true,'stage',v_next_stage,'status',v_status,
                           'next_due_at',v_next_due,
                           'new_member_contact_id',v_new_member_id);
end;
$$;
revoke all on function public.followup_record_action(uuid,uuid,text,text,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.followup_record_action(uuid,uuid,text,text,timestamptz,text)
  to anon,authenticated;

create or replace function public.followup_history(p_token uuid,p_contact_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role text;
  v_history json;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.followup_contacts c
                where c.id=p_contact_id and (v_role='leader' or c.assigned_user_id=v_uid)) then
    raise exception 'الحالة غير موجودة أو غير مصرح بها';
  end if;
  select coalesce(json_agg(row_to_json(a) order by a.created_at desc), '[]'::json)
  into v_history
  from (
    select result,stage_before,stage_after,note,next_due_at,created_at
    from public.followup_actions where contact_id=p_contact_id
  ) a;
  return v_history;
end;
$$;
revoke all on function public.followup_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.followup_history(uuid,uuid) to anon,authenticated;

-- No pg_cron scheduling or external messages are enabled in this draft.
-- A separate, audited reminder dispatcher must be reviewed before background push notifications.
