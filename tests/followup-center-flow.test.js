const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'followup-center.js'), 'utf8');
const memberId = '11111111-1111-4111-8111-111111111111';

function harness(role, contacts = []) {
  const values = {
    followupName: { value: 'محمود علي' },
    followupCountry: { value: 'العراق' },
    followupPhone: { value: '+9647700000000' },
    followupChannel: { value: 'قناة مصرح بها' },
    followupMemberNo: { value: '123456789' },
    followupNotes: { value: '' },
    followupDue: { value: '2030-02-03T14:30' },
    followupConsent: { checked: true },
    followupReminder: { value: '15' },
    followupAssignee: { value: '' },
    followupResult: { value: 'registered' },
    followupRegisteredMemberNo: { value: '', required: false },
    followupRegistrationField: { hidden: true },
    followupProspectStatus: { value: 'new' },
    followupProspectMemberNo: { value: '', required: false },
    followupProspectMembership: { hidden: true },
    followupProspectStatusNote: { value: '' },
    followupResults: { innerHTML: '' },
    followupNextDue: { value: '' },
    followupActionNote: { value: '' }
  };
  const calls = [], toasts = [], modal = { innerHTML: '', remove() {} };
  const assignees = [{ id: memberId, name: 'أحمد سالم', member_no: '820000001' }];
  const root = {
    followupSession: { token: '11111111-1111-4111-8111-222222222222', role, tab: 'followup' },
    document: {
      getElementById: id => id === 'followupModal' ? modal : (values[id] || null),
      createElement: () => modal,
      body: { appendChild() {} }
    },
    toast: message => { toasts.push(message); },
    render() {},
    setInterval() {},
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'followup_list') return contacts;
      if (fn === 'followup_assignees') return assignees;
      if (fn === 'followup_add') return 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      if (fn === 'followup_history') return [];
      if (fn === 'followup_record_action') return { ok: true, new_member_contact_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
      if (fn === 'followup_set_prospect_status') return { ok: true, changed: true, new_member_contact_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
      throw new Error('unexpected RPC: ' + fn);
    }
  };
  vm.runInNewContext(source, { window: root, module: undefined });
  return { root, values, calls, toasts, modal, assignees };
}

test('leader must select a real responsible member, with no default first member', async () => {
  const h = harness('leader');
  await h.root.followupCenter.load();
  h.root.followupCenter.add();
  assert.match(h.modal.innerHTML, /العضو الذي أُحيل إليه المهتم/);
  assert.match(h.modal.innerHTML, /ابحث بالاسم أو رقم العضوية/);
  assert.match(h.modal.innerHTML, /<option value="" selected disabled>/);
  await h.root.followupCenter.save({ preventDefault() {} });
  assert.equal(h.calls.filter(c => c.fn === 'followup_add').length, 0);
  assert.match(h.toasts.at(-1), /اختر العضو المسؤول/);
});

test('leader assigns a prospect to its selected member, not to another account', async () => {
  const h = harness('leader');
  await h.root.followupCenter.load();
  h.values.followupAssignee.value = memberId;
  await h.root.followupCenter.save({ preventDefault() {} });
  const request = h.calls.find(c => c.fn === 'followup_add')?.args;
  assert.ok(request);
  assert.equal(request.p_kind, 'prospect');
  assert.equal(request.p_assignee_user_id, memberId);
  assert.equal(request.p_reminder_minutes, 15);
});

test('member adds a registered member to their own follow-up list, without reassigning', async () => {
  const h = harness('member');
  await h.root.followupCenter.load();
  h.root.followupCenter.changeKind('new_member');
  h.root.followupCenter.add();
  assert.match(h.modal.innerHTML, /العضو الذي سُجّل معه العضو الجديد/);
  assert.match(h.modal.innerHTML, /ستُحفظ هذه الحالة في قائمة متابعاتك الخاصة/);
  assert.doesNotMatch(h.modal.innerHTML, /id="followupAssignee"/);
  await h.root.followupCenter.save({ preventDefault() {} });
  const request = h.calls.find(c => c.fn === 'followup_add')?.args;
  assert.ok(request);
  assert.equal(request.p_kind, 'new_member');
  assert.equal(request.p_member_no, '123456789');
  assert.equal(request.p_assignee_user_id, null);
});

test('registered prospect requires a membership number and saves its classified status', async () => {
  const prospectId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const h = harness('member', [{
    id: prospectId, name: 'محمود علي', kind: 'prospect', stage: 1, status: 'active',
    country: 'العراق', assigned_user_id: memberId, assigned_name: 'أحمد سالم',
    consent_confirmed: true, next_due_at: '2030-02-03T14:30:00Z'
  }]);
  await h.root.followupCenter.load();
  await h.root.followupCenter.open(prospectId);
  assert.match(h.modal.innerHTML, /id="followupProspectMembership" hidden/);
  assert.match(h.modal.innerHTML, /حالة المستقطَب/);
  assert.match(h.modal.innerHTML, /عمل لي حظرًا/);
  assert.doesNotMatch(h.modal.innerHTML, /طلب إيقاف التواصل \/ حظر/);

  h.values.followupProspectStatus.value = 'registered';
  h.root.followupCenter.toggleProspectMembership();
  assert.equal(h.values.followupProspectMembership.hidden, false);
  assert.equal(h.values.followupProspectMemberNo.required, true);
  await h.root.followupCenter.saveProspectStatus({ preventDefault() {} });
  assert.equal(h.calls.filter(c => c.fn === 'followup_set_prospect_status').length, 0);
  assert.match(h.toasts.at(-1), /أدخل رقم العضوية/);

  h.values.followupProspectMemberNo.value = '820469486';
  await h.root.followupCenter.saveProspectStatus({ preventDefault() {} });
  const request = h.calls.find(c => c.fn === 'followup_set_prospect_status')?.args;
  assert.ok(request);
  assert.equal(request.p_contact_id, prospectId);
  assert.equal(request.p_status, 'registered');
  assert.equal(request.p_registered_member_no, '820469486');
  assert.match(h.toasts.at(-1), /تم حفظ حالة المستقطَب/);
});

test('blocked me is a saved classification, never a user-block action', async () => {
  const prospectId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const h = harness('member', [{
    id: prospectId, name: 'علي حسن', phone: '+9647000000000',
    kind: 'prospect', status: 'active', prospect_status: 'contacted',
    consent_confirmed: true
  }]);
  await h.root.followupCenter.load();
  await h.root.followupCenter.open(prospectId);
  h.values.followupProspectStatus.value = 'blocked_me';
  await h.root.followupCenter.saveProspectStatus({ preventDefault() {} });
  const calls = h.calls.filter(c => c.fn === 'followup_set_prospect_status');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_status, 'blocked_me');
  assert.equal(h.calls.some(c => /block|ban/i.test(c.fn)), false);
});

test('prospect classification filter and name or telephone search work together', async () => {
  const h = harness('member', [
    { id: 'a', kind: 'prospect', name: 'علي سالم', phone: '+964770000', prospect_status: 'no_whatsapp' },
    { id: 'b', kind: 'prospect', name: 'أحمد حسن', phone: '+964780000', prospect_status: 'contacted' },
    { id: 'c', kind: 'prospect', name: 'علي آخر', phone: '+964790000', prospect_status: 'contacted' }
  ]);
  await h.root.followupCenter.load();
  h.root.followupCenter.changeStatusFilter('contacted');
  h.root.followupCenter.searchInput('+964780');
  assert.match(h.values.followupResults.innerHTML, /أحمد حسن/);
  assert.doesNotMatch(h.values.followupResults.innerHTML, /علي سالم|علي آخر/);
});

test('non-registration follow-up does not forward any new membership number', async () => {
  const prospectId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const h = harness('member', [{
    id: prospectId, name: 'محمود علي', kind: 'prospect', stage: 0,
    status: 'active', consent_confirmed: true
  }]);
  await h.root.followupCenter.load();
  await h.root.followupCenter.open(prospectId);
  h.values.followupResult.value = 'no_reply';
  h.values.followupRegisteredMemberNo.value = '820469486';
  h.root.followupCenter.toggleRegistrationField();
  assert.equal(h.values.followupRegistrationField.hidden, true);
  await h.root.followupCenter.record({ preventDefault() {} });
  const request = h.calls.find(c => c.fn === 'followup_record_action')?.args;
  assert.equal(request.p_result, 'no_reply');
  assert.equal(request.p_registered_member_no, null);
});
