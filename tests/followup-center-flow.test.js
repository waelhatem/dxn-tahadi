const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'followup-center.js'), 'utf8');
const memberId = '11111111-1111-4111-8111-111111111111';

function harness(role) {
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
    followupAssignee: { value: '' }
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
      if (fn === 'followup_list') return [];
      if (fn === 'followup_assignees') return assignees;
      if (fn === 'followup_add') return 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
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
