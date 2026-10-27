-- ISOLATED DATABASE ONLY. Run after BOTH followup SQL drafts, and after the
-- original followup-center-db-smoke.sql, within ONE transaction that ROLLS BACK.
do $status_smoke$
declare
  v_case uuid;
  v_member uuid;
  v_result json;
  v_before bigint;
  v_denied boolean := false;
begin
  v_case := public.followup_add(
    p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    p_kind => 'prospect', p_name => 'مهتم التصنيف', p_phone => '+9647705559999',
    p_consent_confirmed => true
  );
  if not exists (select 1 from public.followup_contacts
                 where id=v_case and prospect_status='new') then
    raise exception 'New prospect has an invalid initial classified status';
  end if;

  begin
    perform public.followup_set_prospect_status(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,v_case,'contacted');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Other member changed the prospect status'; end if;

  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'contacted','أجريت اتصالًا');
  if not exists (select 1 from public.followup_actions
                 where contact_id=v_case and result='status_updated'
                   and status_before='new' and status_after='contacted'
                   and note='أجريت اتصالًا') then
    raise exception 'Classified status history was not written';
  end if;

  v_before := (select count(*) from public.followup_actions where contact_id=v_case);
  v_result := public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'contacted');
  if v_result->>'changed' <> 'false' or
     (select count(*) from public.followup_actions where contact_id=v_case) <> v_before then
    raise exception 'Unchanged status created duplicate history';
  end if;

  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'no_whatsapp');
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'already_dxn');
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'no_response');
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'not_interested');
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'blocked_me');
  if not exists (select 1 from public.followup_contacts
                 where id=v_case and prospect_status='blocked_me' and next_due_at is null) then
    raise exception 'Blocked-me classification did not pause reminders';
  end if;
  if json_array_length(public.followup_list('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)) <> 1 then
    -- Member B owns one different case from the previous smoke test, not this one.
    raise exception 'Unexpected number of unrelated member B cases';
  end if;

  v_result := public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'registered',null,'990000077','2026-10-25'::date);
  v_member := (v_result->>'new_member_contact_id')::uuid;
  if v_member is null or not exists (select 1 from public.followup_contacts
    where id=v_member and kind='new_member' and origin_contact_id=v_case
      and assigned_user_id='22222222-2222-4222-8222-222222222222'::uuid
      and member_no='990000077' and not consent_confirmed) then
    raise exception 'Status-based registration failed to create linked follow-up';
  end if;
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'points_activated');
  v_result := public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'registered');
  if (select count(*) from public.followup_contacts where origin_contact_id=v_case) <> 1 then
    raise exception 'Status change duplicated the new member case';
  end if;
  if not exists (select 1 from public.followup_contacts
    where id=v_case and prospect_status='registered') then
    raise exception 'Registered classification was not persisted';
  end if;
  if not exists (select 1 from public.followup_actions
    where contact_id=v_case and result='status_updated'
      and status_before='points_activated' and status_after='registered') then
    raise exception 'Status history does not include reclassification';
  end if;
end $status_smoke$;
