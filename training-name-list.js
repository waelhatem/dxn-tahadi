/* Training 5 name list — member-private digital equivalent of the three supplied PDF tables.
 * No automatic requests. Opens only from the training page on user action.
 * Persistence requires the matching SQL migration. Never cache prospects in localStorage.
 */
(function () {
  'use strict';
  if (window.__DXN_TRAINING_NAME_LIST__) return;
  window.__DXN_TRAINING_NAME_LIST__ = true;

  const sources = [
    ['family', 'العائلة'], ['neighbors', 'الجيران'], ['study', 'الدراسة'],
    ['work', 'العمل'], ['community', 'المجتمع'], ['professions', 'أصحاب المهن'],
    ['online', 'التواصل الاجتماعي'], ['other', 'أخرى']
  ];
  const tags = [
    [1, 'طموح', true], [2, 'تحسين الوضع المالي', true], [3, 'صحي', false],
    [4, 'تجاري', true], [5, 'وافد', true], [6, 'مديون', false],
    [7, 'مؤثر', true], [8, 'قريب من التقاعد', true], [9, 'مريض', false]
  ];
  const stages = [
    ['new', 'لم تبدأ الدعوة'], ['contacted', 'تم التواصل'],
    ['followup_48h', 'متابعة 48 ساعة'], ['followup_2', 'متابعة ثانية'],
    ['followup_3', 'متابعة ثالثة'], ['trial', 'تجربة'],
    ['consumer', 'مستهلك'], ['investor', 'مستثمر / عضو'],
    ['declined', 'رفض الفكرة']
  ];
  const followupStages = stages.slice(2);
  let root = null, contacts = [], followups = [], consumption = [];
  let tab = 'contacts', selectedContact = '', contactEdit = '', followupEdit = '', consumptionEdit = '';
  let query = '', sourceFilter = '', busy = false;

  function el(tag, cls, text) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined) x.textContent = String(text);
    return x;
  }
  function add(parent, tag, cls, text) { const x = el(tag, cls, text); parent.appendChild(x); return x; }
  function field(label, name, value, type, required, limit) {
    const wrapper = el('label', 'name-list-field');
    add(wrapper, 'span', '', label);
    const input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type || 'text';
    input.name = name;
    input.value = value == null ? '' : String(value);
    if (required) input.required = true;
    if (limit) input.maxLength = limit;
    if (type === 'textarea') input.rows = 2;
    wrapper.appendChild(input);
    return wrapper;
  }
  function optionList(wrapper, name, values, current) {
    const select = el('select');
    select.name = name;
    for (const [value, label] of values) {
      const opt = el('option', '', label);
      opt.value = value;
      select.appendChild(opt);
    }
    select.value = current || values[0][0];
    wrapper.appendChild(select);
    return select;
  }
  function selectField(label, name, values, current) {
    const wrapper = el('label', 'name-list-field');
    add(wrapper, 'span', '', label);
    optionList(wrapper, name, values, current);
    return wrapper;
  }
  function contactOptions() {
    return [['', 'اختر اسمًا من قائمتك']].concat(contacts.map(x => [x.id, x.full_name]));
  }
  function button(label, act, id, cls) {
    const b = el('button', 'name-list-btn ' + (cls || ''), label);
    b.type = 'button';
    b.dataset.act = act;
    if (id) b.dataset.id = id;
    return b;
  }
  function getContact(id) { return contacts.find(x => x.id === id); }
  function nameOf(id) { const c = getContact(id); return c ? c.full_name : 'غير موجود'; }
  function stageOf(id) { const s = stages.find(x => x[0] === id); return s ? s[1] : id; }
  function today() {
    const d = new Date();
    return String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function textBox(message, cls) { return add(el('div', 'name-list-' + (cls || 'empty')), 'p', '', message).parentNode; }
  function showStatus(message, isError) {
    const x = root && root.querySelector('.name-list-status');
    if (!x) return;
    x.textContent = message || '';
    x.classList.toggle('name-list-error', !!isError);
  }
  function close() {
    if (root) { root.remove(); root = null; }
    contacts = []; followups = []; consumption = [];
    tab = 'contacts'; selectedContact = ''; contactEdit = ''; followupEdit = ''; consumptionEdit = '';
    query = ''; sourceFilter = ''; busy = false;
    document.removeEventListener('keydown', onEscape);
  }
  function onEscape(e) { if (e.key === 'Escape' && root) close(); }
  async function rpc(fn, args) {
    const token = String(localStorage.getItem('dxn_session') || '').trim();
    if (!token) throw new Error('سجّل الدخول بحسابك للوصول إلى قائمتك الخاصة');
    const response = await fetch('/api/rpc', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({fn, args: Object.assign({p_token: token}, args || {})})
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    if (!response.ok) {
      const message = data && (data.message || data.error || data.hint);
      throw new Error(message || 'تعذر الاتصال بالخادم؛ تأكد من تفعيل قاعدة البيانات الخاصة بالتدريب');
    }
    return data;
  }
  async function load() {
    const data = await rpc('training_name_list_read');
    contacts = Array.isArray(data && data.contacts) ? data.contacts : [];
    followups = Array.isArray(data && data.followups) ? data.followups : [];
    consumption = Array.isArray(data && data.consumption) ? data.consumption : [];
    if (selectedContact && !getContact(selectedContact)) selectedContact = '';
  }
  async function write(action, payload) {
    if (busy) return;
    busy = true;
    showStatus('جارٍ حفظ البيانات…');
    try {
      await rpc('training_name_list_write', {p_action: action, p_data: payload});
      await load();
      contactEdit = ''; followupEdit = ''; consumptionEdit = '';
      render();
      showStatus('تم حفظ التغييرات بنجاح');
    } catch (error) {
      showStatus(error.message || String(error), true);
    } finally { busy = false; }
  }
  function metrics() {
    const area = el('div', 'name-list-metrics');
    const active = contacts.filter(x => x.stage !== 'new').length;
    const members = contacts.filter(x => x.stage === 'investor').length;
    const consumers = contacts.filter(x => x.stage === 'consumer').length;
    for (const [label, value] of [
      ['إجمالي المعارف', contacts.length], ['بدأ التواصل', active],
      ['مستهلكون', consumers], ['منضمون', members]
    ]) {
      const item = add(area, 'div', 'name-list-metric');
      add(item, 'strong', '', value);
      add(item, 'span', '', label);
    }
    return area;
  }
  function contactsForm() {
    const x = getContact(contactEdit) || {};
    const form = el('form', 'name-list-form');
    form.dataset.form = 'contact';
    add(form, 'h3', '', contactEdit ? 'تعديل بيانات الاسم' : 'إضافة اسم إلى مسودة المعارف');
    const cols = add(form, 'div', 'name-list-form-grid');
    cols.appendChild(field('الاسم *', 'full_name', x.full_name || '', 'text', true, 140));
    cols.appendChild(field('الهاتف (اختياري)', 'phone', x.phone || '', 'tel', false, 45));
    cols.appendChild(selectField('مصدر المعرفة', 'source', sources, x.source || 'other'));
    cols.appendChild(selectField('مرحلة التواصل', 'stage', stages, x.stage || 'new'));
    const flags = add(form, 'fieldset', 'name-list-flags');
    add(flags, 'legend', '', 'التصنيفات الواردة في الاستمارة الأصلية (اختيارية)');
    const flagrow = add(flags, 'div', 'name-list-flag-row');
    for (const [num, label, enabled] of tags) {
      const wrap = el('label', 'name-list-flag');
      const cb = el('input');
      cb.type = 'checkbox'; cb.name = 'tag'; cb.value = String(num);
      cb.disabled = !enabled;
      cb.checked = enabled && Array.isArray(x.tags) && x.tags.includes(num);
      wrap.appendChild(cb);
      add(wrap, 'span', '', num + ' — ' + label + (enabled ? '' : ' (غير محفوظ لحماية الخصوصية)'));
      flagrow.appendChild(wrap);
    }
    form.appendChild(field('ملاحظات العمل (بدون بيانات صحية أو ديون)', 'notes', x.notes || '', 'textarea', false, 1200));
    const actions = add(form, 'div', 'name-list-actions');
    const save = el('button', 'name-list-btn name-list-primary', contactEdit ? 'حفظ التعديلات' : 'إضافة الاسم');
    save.type = 'submit'; actions.appendChild(save);
    if (contactEdit) actions.appendChild(button('إلغاء التعديل', 'reset-contact'));
    return form;
  }
  function contactsTable() {
    const sec = el('section', 'name-list-section');
    add(sec, 'h3', '', 'المعارف المسجلون');
    const filter = add(sec, 'div', 'name-list-filter');
    const search = el('input'); search.type = 'search'; search.dataset.filter = 'query';
    search.placeholder = 'ابحث بالاسم أو الهاتف'; search.value = query; filter.appendChild(search);
    const s = el('select'); s.dataset.filter = 'source';
    optionList(filter, 'sourceFilter', [['', 'جميع فئات المعارف']].concat(sources), sourceFilter);
    filter.querySelector('select').dataset.filter = 'source';
    const grid = add(sec, 'div', 'name-list-scroll');
    const table = add(grid, 'table', 'name-list-table');
    const head = add(table, 'thead');
    const trh = add(head, 'tr');
    for (const n of ['الاسم', 'الهاتف', 'المصدر', 'المرحلة', 'الإجراءات']) add(trh, 'th', '', n);
    const body = add(table, 'tbody');
    const filtered = contacts.filter(x =>
      (!query || (x.full_name + ' ' + x.phone).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (!sourceFilter || x.source === sourceFilter));
    for (const c of filtered) {
      const tr = add(body, 'tr');
      add(tr, 'td', '', c.full_name);
      add(tr, 'td', '', c.phone || '—');
      add(tr, 'td', '', (sources.find(s => s[0] === c.source) || ['', 'أخرى'])[1]);
      add(tr, 'td', '', stageOf(c.stage));
      const actions = add(tr, 'td', 'name-list-row-actions');
      actions.appendChild(button('اختيار', 'select-contact', c.id));
      actions.appendChild(button('تعديل', 'edit-contact', c.id));
      actions.appendChild(button('حذف', 'delete-contact', c.id, 'name-list-danger'));
    }
    if (!filtered.length) { const tr = add(body, 'tr'); const td = add(tr, 'td', '', 'لا توجد أسماء مطابقة'); td.colSpan = 5; }
    return sec;
  }
  function followupsForm() {
    const item = followups.find(x => x.id === followupEdit) || {};
    const form = el('form', 'name-list-form');
    form.dataset.form = 'followup';
    add(form, 'h3', '', followupEdit ? 'تعديل المتابعة' : 'تسجيل نتيجة متابعة أو استقطاب');
    const cols = add(form, 'div', 'name-list-form-grid');
    const target = selectField('الاسم *', 'contact_id', contactOptions(), item.contact_id || selectedContact);
    target.querySelector('select').required = true;
    cols.appendChild(target);
    cols.appendChild(selectField('المرحلة', 'step', followupStages, item.step || 'followup_48h'));
    cols.appendChild(field('التاريخ', 'activity_date', item.activity_date || today(), 'date', true));
    form.appendChild(field('ملاحظات المتابعة', 'notes', item.notes || '', 'textarea', false, 1200));
    const acts = add(form, 'div', 'name-list-actions');
    const save = el('button', 'name-list-btn name-list-primary', followupEdit ? 'حفظ التعديل' : 'تسجيل المتابعة');
    save.type = 'submit'; acts.appendChild(save);
    if (followupEdit) acts.appendChild(button('إلغاء التعديل', 'reset-followup'));
    return form;
  }
  function consumptionForm() {
    const item = consumption.find(x => x.id === consumptionEdit) || {};
    const form = el('form', 'name-list-form');
    form.dataset.form = 'consumption';
    add(form, 'h3', '', consumptionEdit ? 'تعديل الاستهلاك' : 'تسجيل استهلاك منتج');
    const cols = add(form, 'div', 'name-list-form-grid');
    const target = selectField('اسم المستهلك *', 'contact_id', contactOptions(), item.contact_id || selectedContact);
    target.querySelector('select').required = true; cols.appendChild(target);
    cols.appendChild(field('المنتج المستهلك *', 'product', item.product || '', 'text', true, 160));
    cols.appendChild(field('التاريخ', 'consumed_on', item.consumed_on || today(), 'date', true));
    form.appendChild(field('ملاحظات الاستهلاك (دون ادعاءات علاجية)', 'notes', item.notes || '', 'textarea', false, 1200));
    const acts = add(form, 'div', 'name-list-actions');
    const save = el('button', 'name-list-btn name-list-primary', consumptionEdit ? 'حفظ التعديل' : 'حفظ الاستهلاك');
    save.type = 'submit'; acts.appendChild(save);
    if (consumptionEdit) acts.appendChild(button('إلغاء التعديل', 'reset-consumption'));
    return form;
  }
  function logTable(kind) {
    const isF = kind === 'followup';
    const list = isF ? followups : consumption;
    const sec = el('section', 'name-list-section');
    add(sec, 'h3', '', isF ? 'سجل متابعة الاستقطاب' : 'سجل متابعة المستهلكين');
    const wrap = add(sec, 'div', 'name-list-scroll');
    const table = add(wrap, 'table', 'name-list-table');
    const hr = add(add(table, 'thead'), 'tr');
    for (const label of isF ? ['الاسم', 'التاريخ', 'المرحلة', 'الملاحظات', 'الإجراءات'] :
      ['الاسم', 'التاريخ', 'المنتج', 'الملاحظات', 'الإجراءات']) add(hr, 'th', '', label);
    const body = add(table, 'tbody');
    for (const item of list) {
      const row = add(body, 'tr');
      add(row, 'td', '', nameOf(item.contact_id));
      add(row, 'td', '', isF ? item.activity_date : item.consumed_on);
      add(row, 'td', '', isF ? stageOf(item.step) : item.product);
      add(row, 'td', '', item.notes || '—');
      const actions = add(row, 'td', 'name-list-row-actions');
      actions.appendChild(button('تعديل', isF ? 'edit-followup' : 'edit-consumption', item.id));
      actions.appendChild(button('حذف', isF ? 'delete-followup' : 'delete-consumption', item.id, 'name-list-danger'));
    }
    if (!list.length) {
      const tr = add(body, 'tr'); const td = add(tr, 'td', '', 'لا توجد سجلات بعد'); td.colSpan = 5;
    }
    return sec;
  }
  function render() {
    if (!root) return;
    const panel = root.querySelector('.name-list-content');
    panel.replaceChildren(metrics());
    const tabs = add(panel, 'div', 'name-list-tabs');
    for (const [id, label] of [['contacts', 'قائمة الأسماء'], ['followups', 'نتائج الاستقطاب'], ['consumption', 'متابعة المستهلكين']]) {
      tabs.appendChild(button(label, 'tab-' + id, '', id === tab ? 'name-list-tab-active' : ''));
    }
    if (tab === 'contacts') {
      panel.appendChild(contactsForm());
      panel.appendChild(contactsTable());
    } else if (tab === 'followups') {
      panel.appendChild(followupsForm());
      panel.appendChild(logTable('followup'));
    } else {
      panel.appendChild(consumptionForm());
      panel.appendChild(logTable('consumption'));
    }
  }
  function formData(form) {
    const fd = new FormData(form);
    const result = {};
    for (const [k, v] of fd.entries()) result[k] = typeof v === 'string' ? v.trim() : v;
    return result;
  }
  async function submit(e) {
    const form = e.target;
    if (!form || !form.dataset.form || !root || !root.contains(form)) return;
    e.preventDefault();
    const data = formData(form);
    if (form.dataset.form === 'contact') {
      data.id = contactEdit || null;
      data.tags = Array.from(form.querySelectorAll('input[name="tag"]:checked')).map(x => Number(x.value));
      await write('save_contact', data);
    } else if (form.dataset.form === 'followup') {
      data.id = followupEdit || null;
      selectedContact = data.contact_id;
      await write('save_followup', data);
    } else if (form.dataset.form === 'consumption') {
      data.id = consumptionEdit || null;
      selectedContact = data.contact_id;
      await write('save_consumption', data);
    }
  }
  async function click(e) {
    if (e.target === root) { close(); return; }
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b) || busy) return;
    const act = b.dataset.act, id = b.dataset.id || '';
    if (act === 'close') return close();
    if (act.startsWith('tab-')) {
      tab = act.slice(4); contactEdit = ''; followupEdit = ''; consumptionEdit = ''; render(); return;
    }
    if (act === 'select-contact') { selectedContact = id; tab = 'followups'; render(); return; }
    if (act === 'edit-contact') { contactEdit = id; tab = 'contacts'; render(); root.querySelector('.name-list-form').scrollIntoView({block: 'start'}); return; }
    if (act === 'edit-followup') { followupEdit = id; tab = 'followups'; render(); return; }
    if (act === 'edit-consumption') { consumptionEdit = id; tab = 'consumption'; render(); return; }
    if (act.startsWith('reset-')) {
      if (act === 'reset-contact') contactEdit = '';
      if (act === 'reset-followup') followupEdit = '';
      if (act === 'reset-consumption') consumptionEdit = '';
      render(); return;
    }
    const removals = {
      'delete-contact': ['delete_contact', 'حذف الاسم وجميع سجلات متابعته واستهلاكه؟'],
      'delete-followup': ['delete_followup', 'حذف سجل المتابعة؟'],
      'delete-consumption': ['delete_consumption', 'حذف سجل الاستهلاك؟']
    };
    if (removals[act] && window.confirm(removals[act][1])) {
      await write(removals[act][0], {id});
    }
  }
  function filter(e) {
    const f = e.target && e.target.dataset.filter;
    if (!f) return;
    if (f === 'query') query = e.target.value;
    if (f === 'source') sourceFilter = e.target.value;
    const original = e.target;
    const start = f === 'query' ? original.selectionStart : 0;
    const focus = f;
    const table = root.querySelector('.name-list-section');
    if (table) table.replaceWith(contactsTable());
    const replacement = root.querySelector('[data-filter="' + focus + '"]');
    if (replacement) { replacement.focus(); if (f === 'query') replacement.setSelectionRange(start, start); }
  }

  window.nameListOpen = async function () {
    if (root) return;
    root = el('div', 'name-list-overlay');
    root.setAttribute('role', 'presentation');
    const modal = add(root, 'section', 'name-list-dialog');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'إدارة قوائم الأسماء للتدريب الخامس');
    const head = add(modal, 'header', 'name-list-header');
    const title = add(head, 'div', '');
    add(title, 'small', '', 'التدريب الاحترافي الخامس');
    add(title, 'h2', '', '📋 نظام إدارة قائمة الأسماء');
    head.appendChild(button('✕ إغلاق', 'close'));
    add(modal, 'p', 'name-list-intro',
      'حوّل مسودة المعارف إلى متابعة منظمة للمشروع والمستهلكين. البيانات خاصة بحسابك، ولا تُشارك مع القائد أو أعضاء آخرين.');
    add(modal, 'p', 'name-list-privacy',
      'تنبيه: لا تُدخل معلومات عن الأمراض أو الديون أو أي بيانات شخصية حساسة دون موافقة صاحبها. التصنيفات الحساسة في الملف الورقي معطّلة هنا.');
    add(modal, 'div', 'name-list-status').setAttribute('aria-live', 'polite');
    add(modal, 'div', 'name-list-content');
    document.body.appendChild(root);
    root.addEventListener('click', click);
    root.addEventListener('submit', submit);
    root.addEventListener('input', filter);
    root.addEventListener('change', filter);
    document.addEventListener('keydown', onEscape);
    showStatus('جارٍ جلب قائمتك من حسابك…');
    try { await load(); if (root) { render(); showStatus(''); } }
    catch (error) { if (root) showStatus(error.message || String(error), true); }
    const closeButton = root && root.querySelector('[data-act="close"]');
    if (closeButton) closeButton.focus();
  };
})();