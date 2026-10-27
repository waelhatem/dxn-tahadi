-- REVIEW REQUIRED. Do not apply to the production database without backup/restore sign-off.
-- Apply AFTER followup_prospect_status and followup_new_member_identity.
-- Each stage is completed manually only after its scheduled time. No messages are sent by SQL.

alter table public.followup_actions add column if not exists reaction_status text;
alter table public.followup_contacts add column if not exists latest_reaction text;
alter table public.followup_contacts add column if not exists sequence_started_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.followup_actions'::regclass
      and conname='followup_action_reaction_chk') then
    alter table public.followup_actions add constraint followup_action_reaction_chk check (
      reaction_status is null or reaction_status in
      ('new','contacted','no_whatsapp','already_dxn','registered','points_activated',
       'no_response','not_interested','blocked_me'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.followup_contacts'::regclass
      and conname='followup_latest_reaction_chk') then
    alter table public.followup_contacts add constraint followup_latest_reaction_chk check (
      latest_reaction is null or latest_reaction in
      ('new','contacted','no_whatsapp','already_dxn','registered','points_activated',
       'no_response','not_interested','blocked_me'));
  end if;
end $$;

create index if not exists followup_contacts_latest_reaction_idx
  on public.followup_contacts(assigned_user_id,latest_reaction);

-- The timeline starts when contact consent is established. Keep opened_at unchanged for audit.
create or replace function public.followup_list(p_token uuid)
returns json language plpgsql security definer set search_path=public as $$
declare v_uid uuid; v_role text; v_result json;
begin
  v_uid := public.app_current_user_id(p_token); v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  select coalesce(json_agg(row_to_json(c) order by c.next_due_at nulls last,c.created_at desc),'[]'::json)
    into v_result from (
    select f.id,f.assigned_user_id,f.kind,f.name,f.gender,f.country,f.phone,f.member_no,f.origin_contact_id,
      coalesce(f.join_date,d.join_date) as join_date,
      coalesce(m.member_no,case when u.login_no ~ '^[0-9]{6,15}$' then u.login_no end) as assigned_member_no,
      f.source_label,f.timezone_name,f.contact_channel,f.consent_confirmed,f.consent_note,
      f.status,f.prospect_status,f.stage,f.opened_at,f.sequence_started_at,f.next_due_at,
      f.latest_reaction,f.reminder_minutes,f.notes,f.updated_at,f.created_by_user_id,
      coalesce(m.name,u.login_no) as assigned_name,f.opened_at as created_at
    from public.followup_contacts f
    join public.app_users u on u.id=f.assigned_user_id
    left join public.members m on m.id=u.member_id
    left join public.dxn_team_members d on d.member_no=f.member_no and f.kind='new_member'
    where (v_role='leader' or f.assigned_user_id=v_uid)
  ) c;
  return v_result;
end;
$$;
revoke all on function public.followup_list(uuid) from public,anon,authenticated;
grant execute on function public.followup_list(uuid) to anon,authenticated;

create or replace function public.followup_confirm_consent(p_token uuid,p_contact_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid;
  v_role text;
  v_contact public.followup_contacts;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  select * into v_contact from public.followup_contacts
    where id=p_contact_id and (v_role='leader' or assigned_user_id=v_uid) for update;
  if not found or v_contact.status in ('registered','refused','blocked','closed') then
    raise exception 'المتابعة غير متاحة';
  end if;
  if v_contact.consent_confirmed then raise exception 'الموافقة مثبتة مسبقًا'; end if;
  update public.followup_contacts set
    consent_confirmed=true,status='active',sequence_started_at=clock_timestamp(),
    next_due_at=clock_timestamp()+case when kind='prospect' then interval '10 minutes'
                                     else interval '1 day' end,
    consent_note='تأكيد مسؤول الحالة',updated_at=clock_timestamp()
  where id=v_contact.id;
  insert into public.followup_actions (
    contact_id,actor_user_id,result,stage_before,stage_after,note,next_due_at
  ) select id,v_uid,'consent_granted',stage,stage,
      'تم التحقق من موافقة الشخص على التواصل.',next_due_at
    from public.followup_contacts where id=v_contact.id;
  return json_build_object('ok',true);
end;
$$;
revoke all on function public.followup_confirm_consent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.followup_confirm_consent(uuid,uuid) to anon,authenticated;

create or replace function public.followup_complete_stage(
  p_token uuid, p_contact_id uuid, p_stage integer, p_reaction text,
  p_note text default null, p_registered_member_no text default null, p_join_date date default null
)
returns json language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid;
  v_role text;
  v_contact public.followup_contacts;
  v_reaction text := btrim(coalesce(p_reaction,''));
  v_member_no text := btrim(coalesce(p_registered_member_no,''));
  v_stage_days integer[];
  v_next_stage integer;
  v_due timestamptz;
  v_status text := 'active';
  v_member_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  if v_reaction not in ('new','contacted','no_whatsapp','already_dxn','registered',
       'points_activated','no_response','not_interested','blocked_me') then
    raise exception 'ردة فعل غير صحيحة';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then raise exception 'الملاحظة طويلة جدًا'; end if;
  select * into v_contact from public.followup_contacts
    where id=p_contact_id and (v_role='leader' or assigned_user_id=v_uid) for update;
  if not found then raise exception 'البطاقة غير موجودة أو غير مصرح بها'; end if;
  if v_contact.status in ('registered','refused','blocked','closed') or
     not v_contact.consent_confirmed or v_contact.next_due_at is null then
    raise exception 'المرحلة مغلقة أو لا توجد موافقة على التواصل';
  end if;
  if p_stage is distinct from v_contact.stage then
    raise exception 'يجب إكمال المرحلة السابقة أولًا';
  end if;
  -- The initial prospect message is unlocked after 10 minutes, not immediately.
  v_due := v_contact.next_due_at;
  if v_contact.kind='prospect' and v_contact.stage=0 then
    v_due := greatest(v_due,coalesce(v_contact.sequence_started_at,v_contact.opened_at)+interval '10 minutes');
  end if;
  if v_now < v_due then raise exception 'لم يحِن موعد إرسال رسالة هذه المرحلة'; end if;
  v_stage_days := case when v_contact.kind='prospect' then array[0,1,3,7]
                       else array[1,3,7,14,21,30] end;
  v_next_stage := v_contact.stage;

  if v_contact.kind='prospect' and v_reaction='registered' then
    if v_member_no !~ '^[0-9]{6,15}$' or p_join_date is null or p_join_date>current_date then
      raise exception 'أدخل رقم العضوية وتاريخ الانضمام الفعلي';
    end if;
    if exists(select 1 from public.followup_contacts
              where kind='new_member' and member_no=v_member_no) then
      raise exception 'رقم العضوية مستخدم في بطاقة أخرى';
    end if;
    insert into public.followup_contacts (
      assigned_user_id,created_by_user_id,kind,name,gender,country,phone,member_no,
      join_date,origin_contact_id,source_label,timezone_name,contact_channel,
      consent_confirmed,consent_note,status,stage,opened_at,next_due_at,reminder_minutes
    ) values (
      v_contact.assigned_user_id,v_uid,'new_member',v_contact.name,v_contact.gender,
      v_contact.country,v_contact.phone,v_member_no,p_join_date,v_contact.id,
      v_contact.source_label,v_contact.timezone_name,v_contact.contact_channel,
      false,null,'consent_pending',0,v_now,null,v_contact.reminder_minutes
    ) returning id into v_member_id;
    v_status := 'registered'; v_due := null;
  elsif v_reaction in ('blocked_me','not_interested','already_dxn','no_response') then
    v_status := case v_reaction when 'blocked_me' then 'blocked'
                when 'not_interested' then 'refused' else 'closed' end;
    v_due := null;
  elsif v_contact.stage >= array_length(v_stage_days,1)-1 then
    v_status := 'closed'; v_due := null;
  else
    v_next_stage := v_contact.stage+1;
    v_due := coalesce(v_contact.sequence_started_at,v_contact.opened_at)
      + (v_stage_days[v_next_stage+1] || ' days')::interval;
  end if;

  update public.followup_contacts set
    stage=v_next_stage,status=v_status,next_due_at=v_due,
    latest_reaction=v_reaction,
    prospect_status=case when kind='prospect' then v_reaction else prospect_status end,
    updated_at=v_now
  where id=v_contact.id;

  insert into public.followup_actions (
    contact_id,actor_user_id,result,stage_before,stage_after,note,next_due_at,
    status_before,status_after,reaction_status
  ) values (
    v_contact.id,v_uid,'stage_completed',v_contact.stage,v_next_stage,
    nullif(btrim(coalesce(p_note,'')),''),v_due,
    coalesce(v_contact.latest_reaction,v_contact.prospect_status),v_reaction,v_reaction
  );
  return json_build_object('ok',true,'next_stage',v_next_stage,'status',v_status,
    'next_due_at',v_due,'new_member_contact_id',v_member_id);
end;
$$;
revoke all on function public.followup_complete_stage(uuid,uuid,integer,text,text,text,date)
  from public,anon,authenticated;
grant execute on function public.followup_complete_stage(uuid,uuid,integer,text,text,text,date)
  to anon,authenticated;

-- Retire unrestricted stage advancement; consent is still available through the narrow RPC.
revoke execute on function public.followup_record_action(uuid,uuid,text,text,timestamptz,text)
  from public,anon,authenticated;

-- Return per-stage actions to both the responsible member and leader; no direct table GRANT.
create or replace function public.followup_history(p_token uuid,p_contact_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare v_uid uuid; v_role text; v_history json;
begin
  v_uid := public.app_current_user_id(p_token); v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('leader','member') then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.followup_contacts c
      where c.id=p_contact_id and (v_role='leader' or c.assigned_user_id=v_uid)) then
    raise exception 'البطاقة غير متاحة';
  end if;
  select coalesce(json_agg(row_to_json(a) order by a.created_at desc),'[]'::json)
    into v_history from (
      select result,stage_before,stage_after,note,next_due_at,status_before,status_after,
             reaction_status,created_at
      from public.followup_actions where contact_id=p_contact_id
    ) a;
  return v_history;
end;
$$;
revoke all on function public.followup_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.followup_history(uuid,uuid) to anon,authenticated;

-- Do not enable background sends, messaging webhooks, or scheduler jobs.
