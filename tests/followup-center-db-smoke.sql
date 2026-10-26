-- ISOLATED DATABASE ONLY. Run inside the same transaction as the draft schema.
-- Expected inputs: empty public.app_users/sessions and the followup_* draft objects.
-- The caller MUST ROLLBACK the enclosing transaction, including on failures.

insert into public.members (id, member_no, name) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '990000002', 'عضو اختبار أ'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '990000003', 'عضو اختبار ب');

insert into public.app_users (id, login_no, pin_hash, role, member_id, active) values
 ('11111111-1111-4111-8111-111111111111', '990000001', 'test-only', 'leader', null, true),
 ('22222222-2222-4222-8222-222222222222', '990000002', 'test-only', 'member',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true),
 ('33333333-3333-4333-8333-333333333333', '990000003', 'test-only', 'member',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);

insert into public.sessions (token, user_id, expires_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111', now() + interval '1 day'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222', now() + interval '1 day'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333', now() + interval '1 day');

do $smoke$
declare
  v_case uuid;
  v_new uuid;
  v_other uuid;
  v_blocked uuid;
  v_result json;
  v_denied boolean := false;
begin
  begin
    perform public.followup_assignees('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
    raise exception 'Non-leader got assignee directory';
  exception when others then
    if sqlerrm = 'Non-leader got assignee directory' then raise; end if;
  end;
  if json_array_length(public.followup_assignees('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)) <> 3 then
    raise exception 'Leader assignee directory is incomplete';
  end if;
  begin
    perform public.followup_add(
      p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
      p_kind => 'prospect', p_name => 'إسناد خاطئ',
      p_assignee_user_id => '33333333-3333-4333-8333-333333333333'::uuid
    );
    raise exception 'Member was allowed to reassign a case';
  exception when others then
    if sqlerrm = 'Member was allowed to reassign a case' then raise; end if;
  end;
  begin
    perform public.followup_add(
      p_token => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      p_kind => 'prospect', p_name => 'إسناد غير محدد'
    );
    raise exception 'Leader created a case without choosing assignee';
  exception when others then
    if sqlerrm = 'Leader created a case without choosing assignee' then raise; end if;
  end;

  v_case := public.followup_add(
    p_token => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    p_kind => 'prospect', p_name => 'مهتم تجريبي',
    p_assignee_user_id => '22222222-2222-4222-8222-222222222222'::uuid,
    p_country => 'العراق', p_consent_confirmed => true
  );

  if json_array_length(public.followup_list('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)) <> 1 then
    raise exception 'Member A cannot list their own case';
  end if;
  if json_array_length(public.followup_list('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)) <> 0 then
    raise exception 'Member B can see Member A case';
  end if;
  begin
    perform public.followup_record_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, v_case, 'no_reply'
    );
  exception when others then
    v_denied := true;
  end;
  if not v_denied then raise exception 'Member B changed Member A case'; end if;
  begin
    perform public.followup_history(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, v_case
    );
    raise exception 'Member B viewed Member A history';
  exception when others then
    if sqlerrm = 'Member B viewed Member A history' then raise; end if;
  end;

  v_result := public.followup_record_action(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    v_case, 'registered', null, null, '990000099'
  );
  v_new := (v_result ->> 'new_member_contact_id')::uuid;
  if v_new is null then raise exception 'No first-month case created'; end if;
  if not exists (
    select 1 from public.followup_contacts
    where id = v_case and status = 'registered' and next_due_at is null
  ) then raise exception 'Original prospect was not closed'; end if;
  if not exists (
    select 1 from public.followup_contacts
    where id = v_new
      and assigned_user_id = '22222222-2222-4222-8222-222222222222'::uuid
      and origin_contact_id = v_case and kind = 'new_member'
      and member_no = '990000099' and not consent_confirmed
      and status = 'consent_pending' and next_due_at is null
  ) then raise exception 'New member handoff is incorrect'; end if;
  if json_array_length(public.followup_list('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)) <> 2 then
    raise exception 'Member A cannot see their two linked cases';
  end if;
  if json_array_length(public.followup_list('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)) <> 0 then
    raise exception 'Member B accessed linked cases';
  end if;
  if has_table_privilege('anon', 'public.followup_contacts', 'select') then
    raise exception 'Direct SELECT is exposed to anon';
  end if;
  if has_table_privilege('authenticated', 'public.followup_contacts', 'insert') then
    raise exception 'Direct INSERT is exposed to authenticated';
  end if;
  if has_table_privilege('anon', 'public.followup_actions', 'select') then
    raise exception 'Direct history table is exposed to anon';
  end if;

  begin
    perform public.followup_record_action(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, v_new, 'sent'
    );
    raise exception 'Consent gate failed';
  exception when others then
    if sqlerrm = 'Consent gate failed' then raise; end if;
  end;

  v_other := public.followup_add(
    p_token => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    p_kind => 'prospect', p_name => 'مهتم تجريبي آخر',
    p_assignee_user_id => '33333333-3333-4333-8333-333333333333'::uuid,
    p_consent_confirmed => false
  );
  begin
    perform public.followup_record_action(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      v_other, 'registered', null, null, '990000099'
    );
    raise exception 'Duplicate membership allowed';
  exception when others then
    if sqlerrm = 'Duplicate membership allowed' then raise; end if;
  end;
  if not exists (
    select 1 from public.followup_contacts
    where id = v_other and status <> 'registered'
  ) then raise exception 'Duplicate did not roll back its action'; end if;

  v_blocked := public.followup_add(
    p_token => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    p_kind => 'prospect', p_name => 'شخص طلب الإيقاف',
    p_consent_confirmed => true
  );
  perform public.followup_record_action(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, v_blocked, 'blocked'
  );
  if not exists (
    select 1 from public.followup_contacts
    where id = v_blocked and status = 'blocked' and next_due_at is null
  ) then raise exception 'Blocked case still has a scheduled task'; end if;
  begin
    perform public.followup_record_action(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, v_blocked, 'sent'
    );
    raise exception 'Blocked case was restarted';
  exception when others then
    if sqlerrm = 'Blocked case was restarted' then raise; end if;
  end;
end $smoke$;
