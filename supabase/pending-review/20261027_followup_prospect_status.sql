-- REVIEW REQUIRED: additive follow-up classification change.
-- Do not run on production until recovery checks and the new backup are approved.
-- Compatible with the 2026-10-26 followup_* RPC schema. No user rows are removed.

alter table public.followup_contacts
  add column if not exists prospect_status text not null default 'new';

do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid='public.followup_contacts'::regclass
      and conname='followup_prospect_status_chk') then
    alter table public.followup_contacts
      add constraint followup_prospect_status_chk check (
        prospect_status in (
          'new','contacted','no_whatsapp','already_dxn','registered',
          'points_activated','no_response','not_interested','blocked_me'
        )
      );
  end if;
end $$;

create index if not exists followup_contacts_prospect_status_idx
  on public.followup_contacts(assigned_user_id, prospect_status)
  where kind='prospect';

alter table public.followup_actions
  add column if not exists status_before text,
  add column if not exists status_after text;

-- Preserve membership/assignment scope from the existing read RPC.
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
           f.status, f.prospect_status, f.stage, f.opened_at, f.next_due_at,
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

-- Changing the classified status does not block the prospect's account.
-- All writes and membership handoffs are performed in one transaction.
create or replace function public.followup_set_prospect_status(
  p_token uuid,
  p_contact_id uuid,
  p_status text,
  p_note text default null,
  p_registered_member_no text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role text;
  v_contact public.followup_contacts;
  v_status text := btrim(coalesce(p_status,''));
  v_member_no text := btrim(coalesce(p_registered_member_no,''));
  v_new_member_id uuid;
begin
  v_uid := public.app_current_user_id(p_token);
  v_role := public.app_current_role(p_token);
  if v_uid is null or v_role not in ('member','leader') then
    raise exception 'غير مصرح';
  end if;
  if v_status not in (
    'new','contacted','no_whatsapp','already_dxn','registered',
    'points_activated','no_response','not_interested','blocked_me'
  ) then
    raise exception 'حالة المستقطب غير صحيحة';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then
    raise exception 'الملاحظة طويلة جدًا';
  end if;
  select * into v_contact
  from public.followup_contacts
  where id=p_contact_id and kind='prospect'
    and (v_role='leader' or assigned_user_id=v_uid)
  for update;
  if not found then raise exception 'المستقطب غير موجود أو غير مصرح به'; end if;

  if v_contact.prospect_status = v_status then
    return json_build_object('ok',true,'changed',false,'status',v_status);
  end if;

  -- First registration starts a separate first-month member case for the same owner.
  if v_status='registered' then
    select f.id into v_new_member_id
    from public.followup_contacts f
    where f.origin_contact_id = v_contact.id and f.kind='new_member';
    if v_new_member_id is null then
      if v_member_no !~ '^[0-9]{6,15}$' then
        raise exception 'أدخل رقم عضوية DXN الجديدة (6 إلى 15 رقمًا)';
      end if;
      if exists(select 1 from public.followup_contacts
                where kind='new_member' and member_no=v_member_no) then
        raise exception 'رقم العضوية موجود مسبقًا في متابعة الأعضاء الجدد';
      end if;
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
    update public.followup_contacts
      set status='registered',next_due_at=null
      where id=v_contact.id;
  elsif v_status in ('no_response','not_interested','blocked_me') then
    -- Pause reminders, not access to the contact. Never invoke a block operation.
    update public.followup_contacts set next_due_at=null where id=v_contact.id;
  end if;

  update public.followup_contacts
    set prospect_status=v_status,updated_at=now()
    where id=v_contact.id;
  insert into public.followup_actions (
    contact_id,actor_user_id,result,stage_before,stage_after,
    note,next_due_at,status_before,status_after
  ) values (
    v_contact.id,v_uid,'status_updated',v_contact.stage,v_contact.stage,
    nullif(btrim(coalesce(p_note,'')),''),
    case when v_status in ('registered','no_response','not_interested','blocked_me')
         then null else v_contact.next_due_at end,
    v_contact.prospect_status,v_status
  );
  return json_build_object('ok',true,'changed',true,'status',v_status,
                           'new_member_contact_id',v_new_member_id);
end;
$$;
revoke all on function public.followup_set_prospect_status(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.followup_set_prospect_status(uuid,uuid,text,text,text)
  to anon,authenticated;

-- History includes a structured previous/current status for every classification change.
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
    select result,stage_before,stage_after,note,next_due_at,
           status_before,status_after,created_at
    from public.followup_actions where contact_id=p_contact_id
  ) a;
  return v_history;
end;
$$;
revoke all on function public.followup_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.followup_history(uuid,uuid) to anon,authenticated;
