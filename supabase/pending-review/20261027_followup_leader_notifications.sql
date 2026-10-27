-- REVIEW REQUIRED: do not apply to production before backup/restore sign-off.
-- Depends on 20261026_followup_center_draft.sql,
-- 20261027_followup_prospect_status.sql,
-- 20261027_followup_new_member_identity.sql and 20261027_followup_stage_flow.sql.
-- Reuses the existing private app_notifications inbox; no new public tables.
-- Events are created by DB triggers, never trusted client claims.

create or replace function public.notify_followup_contact_to_leader()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_assignee text;
  v_assignee_member_no text;
  v_status text;
  v_stage text;
  v_label text;
  v_join_date date;
begin
  if tg_op='UPDATE' then
    if new.kind<>'new_member' or new.join_date is not distinct from old.join_date then
      return new;
    end if;
  end if;
  -- Leaders do not need alerts for cards that they created themselves.
  if exists(select 1 from public.app_users u
            where u.id=new.created_by_user_id and u.role='leader') then
    return new;
  end if;
  select coalesce(nullif(u.display_name,''),m.name,u.login_no),
    coalesce(m.member_no,case when u.login_no ~ '^[0-9]{6,15}$' then u.login_no end)
    into v_assignee,v_assignee_member_no
  from public.app_users u left join public.members m on m.id=u.member_id
  where u.id=new.assigned_user_id;
  v_label := case when new.kind='prospect' then 'مهتم' else 'عضو جديد' end;
  v_status := case when new.kind='prospect' then 'جديد' else 'بانتظار تأكيد الموافقة' end;
  v_stage := case when new.kind='prospect' then 'التعارف الأول' else 'الترحيب' end;
  if new.kind='new_member' then
    select coalesce(new.join_date,d.join_date) into v_join_date
      from (select 1) x left join public.dxn_team_members d on d.member_no=new.member_no;
  end if;

  insert into public.app_notifications (
    recipient_user_id,recipient_member_id,event_type,source_id,
    icon,title,body,action_tab,action_label
  )
  select u.id,u.member_id,'followup_contact_added',new.id,
    '📋',v_label||' جديد في مركز المتابعة',
    case when new.kind='new_member' then
      format('الاسم: %s | رقم العضوية: %s | البلد: %s | تاريخ الانضمام: %s | الراعي: %s | رقم عضوية الراعي: %s | الحالة: %s | المرحلة: %s | وقت التسجيل: %s (بغداد)',
        new.name,coalesce(new.member_no,'بانتظار التوثيق'),coalesce(new.country,'غير محدد'),
        coalesce(to_char(v_join_date,'DD/MM/YYYY'),'بانتظار التوثيق'),
        coalesce(v_assignee,'—'),coalesce(v_assignee_member_no,'—'),v_status,v_stage,
        to_char(new.opened_at at time zone 'Asia/Baghdad','DD/MM/YYYY HH24:MI'))
    else
      format('الاسم: %s | المسؤول: %s | الحالة: %s | المرحلة: %s | وقت التسجيل: %s (بغداد)',
        new.name,coalesce(v_assignee,'—'),v_status,v_stage,
        to_char(new.opened_at at time zone 'Asia/Baghdad','DD/MM/YYYY HH24:MI'))
    end,
    'followup','فتح البطاقة'
  from public.app_users u
  where u.role='leader' and u.active=true and u.id<>new.created_by_user_id
  on conflict(recipient_user_id,event_type,source_id)
    do update set body=excluded.body;
  return new;
end;
$$;
revoke all on function public.notify_followup_contact_to_leader() from public,anon,authenticated;
drop trigger if exists followup_notify_leader_on_contact on public.followup_contacts;
create trigger followup_notify_leader_on_contact
  after insert or update of join_date on public.followup_contacts
  for each row execute function public.notify_followup_contact_to_leader();

create or replace function public.notify_followup_action_to_leader()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_contact public.followup_contacts;
  v_assignee text;
  v_assignee_member_no text;
  v_status text;
  v_stage text;
  v_join_date date;
  v_event_type text;
  v_actor_role text;
  v_next_summary text;
begin
  select role into v_actor_role from public.app_users where id=new.actor_user_id;
  if v_actor_role='leader' then return new; end if;
  select * into v_contact from public.followup_contacts where id=new.contact_id;
  if not found then return new; end if;
  select coalesce(nullif(u.display_name,''),m.name,u.login_no),
    coalesce(m.member_no,case when u.login_no ~ '^[0-9]{6,15}$' then u.login_no end)
    into v_assignee,v_assignee_member_no
  from public.app_users u left join public.members m on m.id=u.member_id
  where u.id=v_contact.assigned_user_id;
  if v_contact.kind='new_member' then
    select coalesce(v_contact.join_date,d.join_date) into v_join_date
      from (select 1) x left join public.dxn_team_members d on d.member_no=v_contact.member_no;
  end if;

  v_status := case when v_contact.kind='prospect' then
    case v_contact.prospect_status
      when 'new' then 'جديد'
      when 'contacted' then 'تم التواصل'
      when 'no_whatsapp' then 'لا يمتلك واتساب'
      when 'already_dxn' then 'عضو في DXN'
      when 'registered' then 'سجّل عضوية'
      when 'points_activated' then 'فعّل نقاط'
      when 'no_response' then 'لا يرد نهائيًا'
      when 'not_interested' then 'لا يرغب بالعمل'
      when 'blocked_me' then 'عمل لي حظرًا'
      else 'جديد' end
    else case v_contact.status
      when 'new' then 'جديد'
      when 'consent_pending' then 'بانتظار تأكيد الموافقة'
      when 'active' then 'قيد المتابعة'
      when 'deferred' then 'مؤجل'
      when 'closed' then 'اكتملت المتابعة'
      when 'refused' then 'لا يرغب بالمتابعة'
      when 'blocked' then 'طلب إيقاف التواصل'
      else 'قيد المتابعة' end end;
  v_stage := case when v_contact.kind='prospect' then
    (array['التعارف الأول','المتابعة الأولى','المتابعة الثانية','المتابعة الختامية'])[least(greatest(v_contact.stage+1,1),4)]
    else (array['الترحيب','الاطمئنان','متابعة التدريب','مراجعة الاحتياجات','الدعم والتشجيع','مراجعة الشهر الأول'])[least(greatest(v_contact.stage+1,1),6)] end;
  v_next_summary := case when v_contact.next_due_at is not null then
    format(' | الإجراء القادم: رسالة المرحلة التالية | الموعد القادم: %s (بغداد)',
      to_char(v_contact.next_due_at at time zone 'Asia/Baghdad','DD/MM/YYYY HH24:MI'))
    else ' | الإجراء القادم: لا توجد رسالة مجدولة' end;

  -- The source_id stays the contact ID for deep-linking. Each action has its own
  -- stable event_type to avoid suppressing a later update on the same contact.
  v_event_type := 'followup_action_'||new.id::text;
  insert into public.app_notifications (
    recipient_user_id,recipient_member_id,event_type,source_id,
    icon,title,body,action_tab,action_label
  )
  select u.id,u.member_id,v_event_type,v_contact.id,
    '🔄',case when v_contact.kind='prospect' then 'تحديث حالة مهتم' else 'تقدم عضو جديد' end,
    case when v_contact.kind='new_member' then
      format('الاسم: %s | رقم العضوية: %s | البلد: %s | تاريخ الانضمام: %s | الراعي: %s | رقم عضوية الراعي: %s | الحالة: %s | المرحلة: %s | آخر إجراء: %s (بغداد)',
        v_contact.name,coalesce(v_contact.member_no,'بانتظار التوثيق'),
        coalesce(v_contact.country,'غير محدد'),
        coalesce(to_char(v_join_date,'DD/MM/YYYY'),'بانتظار التوثيق'),
        coalesce(v_assignee,'—'),coalesce(v_assignee_member_no,'—'),v_status,v_stage,
        to_char(new.created_at at time zone 'Asia/Baghdad','DD/MM/YYYY HH24:MI'))
    else
      format('الاسم: %s | المسؤول: %s | الحالة: %s | المرحلة: %s | آخر إجراء: %s (بغداد)',
        v_contact.name,coalesce(v_assignee,'—'),v_status,v_stage,
        to_char(new.created_at at time zone 'Asia/Baghdad','DD/MM/YYYY HH24:MI'))
    end || v_next_summary,
    'followup','فتح البطاقة'
  from public.app_users u
  where u.role='leader' and u.active=true and u.id<>new.actor_user_id
  on conflict(recipient_user_id,event_type,source_id) do nothing;
  return new;
end;
$$;
revoke all on function public.notify_followup_action_to_leader() from public,anon,authenticated;
drop trigger if exists followup_notify_leader_on_action on public.followup_actions;
create trigger followup_notify_leader_on_action
  after insert on public.followup_actions
  for each row execute function public.notify_followup_action_to_leader();

-- Notifications remain private through app_notifications RLS and its existing
-- session-scoped list_notifications / mark_notifications_read functions.
