-- ISOLATED DATABASE ONLY; run after all four followup pending-review drafts,
-- then after the two existing follow-up smoke files in the same ROLLBACK transaction.
do $leader_smoke$
declare
  v_case uuid;
  v_self_case uuid;
  v_member_case uuid;
  v_notice_count integer;
  v_result json;
begin
  v_case := public.followup_add(
    p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    p_kind => 'prospect', p_name => 'مهتم إشعارات القائد',
    p_consent_confirmed => true
  );
  select count(*) into v_notice_count from public.app_notifications
    where source_id=v_case and event_type='followup_contact_added'
      and recipient_user_id='11111111-1111-4111-8111-111111111111'::uuid;
  if v_notice_count<>1 then raise exception 'Leader did not receive a contact-created notification'; end if;
  if exists(select 1 from public.app_notifications where source_id=v_case
    and recipient_user_id='33333333-3333-4333-8333-333333333333'::uuid) then
    raise exception 'A different member received a private leader notification';
  end if;

  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'contacted');
  perform public.followup_set_prospect_status(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,v_case,'no_whatsapp');
  select count(*) into v_notice_count from public.app_notifications
    where source_id=v_case and event_type like 'followup_action_%'
      and recipient_user_id='11111111-1111-4111-8111-111111111111'::uuid;
  if v_notice_count<>2 then raise exception 'Repeated status updates were deduplicated incorrectly'; end if;
  if not exists(select 1 from public.app_notifications
    where source_id=v_case and event_type like 'followup_action_%'
      and body like '%لا يمتلك واتساب%' and body like '%المرحلة:%'
      and body like '%آخر إجراء:%') then
    raise exception 'Leader notification is missing classification, stage or action time';
  end if;
  if not exists (select 1 from json_array_elements(
      public.list_notifications('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)) n
      where n->>'source_id'=v_case::text and n->>'action_tab'='followup') then
    raise exception 'Notification inbox did not expose a leader follow-up action';
  end if;
  if exists(select 1 from json_array_elements(
      public.list_notifications('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)) n
      where n->>'source_id'=v_case::text) then
    raise exception 'A non-leader can see private leader alerts';
  end if;

  -- Leader-created cards should not alert the leader about their own action.
  v_self_case := public.followup_add(
    p_token => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    p_kind => 'prospect', p_name => 'إضافة القائد',
    p_assignee_user_id => '22222222-2222-4222-8222-222222222222'::uuid
  );
  if exists(select 1 from public.app_notifications where source_id=v_self_case) then
    raise exception 'Leader was notified for their own contact creation';
  end if;

  v_member_case := public.followup_add_new_member(
    p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    p_name => 'نور عضو جديدة',
    p_member_no => '990000199',
    p_country => 'العراق',
    p_join_date => '2026-10-24'::date,
    p_consent_confirmed => true
  );
  select count(*) into v_notice_count from public.app_notifications
    where source_id=v_member_case and event_type='followup_contact_added'
      and recipient_user_id='11111111-1111-4111-8111-111111111111'::uuid
      and body like '%نور عضو جديدة%'
      and body like '%990000199%'
      and body like '%العراق%'
      and body like '%24/10/2026%'
      and body like '%عضو اختبار أ%'
      and body like '%990000002%';
  if v_notice_count<>1 then raise exception 'New-member notification is not a complete identity card'; end if;
  if not exists(select 1 from json_array_elements(
      public.followup_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)) n
      where n->>'id'=v_member_case::text and n->>'join_date'='2026-10-24'
        and n->>'assigned_member_no'='990000002') then
    raise exception 'Leader card does not include the join date and sponsor membership number';
  end if;
  perform public.followup_record_action(
    p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    p_contact_id => v_member_case, p_result => 'sent');
  if not exists(select 1 from public.app_notifications
      where source_id=v_member_case and event_type like 'followup_action_%'
        and body like '%رقم عضوية الراعي: 990000002%'
        and body like '%تاريخ الانضمام: 24/10/2026%') then
    raise exception 'New-member progress alert is missing the complete identity';
  end if;
  if has_table_privilege('anon','public.app_notifications','select') then
    raise exception 'Private notification rows are directly exposed';
  end if;
end $leader_smoke$;
