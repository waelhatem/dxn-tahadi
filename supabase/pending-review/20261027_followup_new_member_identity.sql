-- REVIEW REQUIRED: apply after 20261027_followup_prospect_status.sql.
-- A complete new-member profile requires a real DXN membership number,
-- country and join date. The member's actual join date is distinct from
-- the follow-up record creation timestamp.

create or replace function public.followup_add_new_member(
  p_token uuid,
  p_name text,
  p_member_no text,
  p_country text,
  p_join_date date,
  p_assignee_user_id uuid default null,
  p_phone text default null,
  p_timezone_name text default 'Asia/Baghdad',
  p_contact_channel text default null,
  p_consent_confirmed boolean default false,
  p_notes text default null,
  p_next_due_at timestamptz default null,
  p_reminder_minutes integer default 30
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_contact_id uuid;
begin
  if trim(coalesce(p_member_no,'')) !~ '^[0-9]{6,15}$' then
    raise exception 'رقم عضوية DXN غير صالح';
  end if;
  if length(trim(coalesce(p_country,''))) < 2 then
    raise exception 'أدخل بلد انضمام العضو';
  end if;
  if p_join_date is null or p_join_date > current_date then
    raise exception 'أدخل تاريخ الانضمام الفعلي';
  end if;

  v_contact_id := public.followup_add(
    p_token => p_token,
    p_kind => 'new_member',
    p_name => p_name,
    p_assignee_user_id => p_assignee_user_id,
    p_phone => p_phone,
    p_country => p_country,
    p_member_no => trim(p_member_no),
    p_timezone_name => p_timezone_name,
    p_contact_channel => p_contact_channel,
    p_consent_confirmed => p_consent_confirmed,
    p_notes => p_notes,
    p_next_due_at => p_next_due_at,
    p_reminder_minutes => p_reminder_minutes
  );
  update public.followup_contacts
    set join_date=p_join_date, updated_at=now()
    where id=v_contact_id;
  return v_contact_id;
end;
$$;
revoke all on function public.followup_add_new_member(
  uuid,text,text,text,date,uuid,text,text,text,boolean,text,timestamptz,integer
) from public,anon,authenticated;
grant execute on function public.followup_add_new_member(
  uuid,text,text,text,date,uuid,text,text,text,boolean,text,timestamptz,integer
) to anon,authenticated;
