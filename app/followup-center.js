/*
 * DXN Follow-up Center — isolated feature branch.
 * Requires the reviewed followup_* RPCs to be installed before activation.
 * No automatic marketing messages are sent; reminders notify the responsible member.
 */
(function (root) {
  'use strict';

  const prospectStages = ['رسالة التعارف الأولى', 'المتابعة الأولى — 24 ساعة', 'المتابعة الثانية — اليوم الثالث', 'رسالة الإغلاق — اليوم السابع'];
  const memberStages = ['الترحيب — اليوم الأول', 'الاطمئنان — اليوم الثالث', 'متابعة التدريب — اليوم السابع',
    'مراجعة الاحتياجات — اليوم 14', 'الدعم والتشجيع — اليوم 21', 'مراجعة الشهر الأول — اليوم 30'];
  const terminal = new Set(['registered', 'refused', 'blocked', 'closed']);
  const resultLabels = {
    sent: 'تم التواصل', no_reply: 'لم يرد', interested: 'مهتم — موعد آخر',
    deferred: 'طلب التأجيل', registered: 'تم التسجيل', refused: 'رفض',
    blocked: 'أوقف التواصل', closed: 'إغلاق', consent_granted: 'تم تأكيد الموافقة'
  };
  const state = { kind: 'prospect', filter: 'today', contacts: [], assignees: [], loaded: false,
    loading: false, error: '', currentId: null, history: [], sessionToken: null };
  const notified = new Set();

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  function parseLeadCard(raw) {
    const result = { name: '', gender: '', country: '', phone: '', source: '' };
    const lines = String(raw || '').split(/\r?\n/).map(x =>
      x.trim().replace(/^[^\u0600-\u06FFa-zA-Z]+/i, '')
    ).filter(Boolean);
    const patterns = [
      ['name', /^(?:الاسم(?: الكامل)?|اسم(?: الشخص| المهتم)?|name|full name)\s*[:：\-]\s*(.+)$/i],
      ['gender', /^(?:الجنس|النوع|gender)\s*[:：\-]\s*(.+)$/i],
      ['country', /^(?:الدولة|البلد|country)\s*[:：\-]\s*(.+)$/i],
      ['phone', /^(?:رقم(?: الهاتف| الموبايل| الجوال| الواتساب)?|الهاتف|الموبايل|phone|mobile|whatsapp)\s*[:：\-]\s*(.+)$/i],
      ['source', /^(?:المصدر|الإعلان|source|ad)\s*[:：\-]\s*(.+)$/i]
    ];
    lines.forEach(line => patterns.forEach(([field, pattern]) => {
      const match = line.match(pattern);
      if (match) result[field] = match[1].trim();
    }));
    if (!result.phone) {
      const match = String(raw || '').match(/(?:\+|00)\d[\d\s()\-]{7,18}\d/);
      if (match) result.phone = match[0].replace(/[\s()\-]/g, '');
    }
    return result;
  }
  function countryTimezone(country) {
    const text = String(country || '').trim().toLowerCase();
    const known = [
      [['العراق', 'iraq'], 'Asia/Baghdad'], [['سوريا', 'syria'], 'Asia/Damascus'],
      [['مصر', 'egypt'], 'Africa/Cairo'], [['الأردن', 'jordan'], 'Asia/Amman'],
      [['السعودية', 'saudi'], 'Asia/Riyadh'], [['الإمارات', 'uae'], 'Asia/Dubai'],
      [['نيجيريا', 'nigeria'], 'Africa/Lagos'], [['باكستان', 'pakistan'], 'Asia/Karachi'],
      [['الهند', 'india'], 'Asia/Kolkata'], [['تركيا', 'turkey'], 'Europe/Istanbul'],
      [['لبنان', 'lebanon'], 'Asia/Beirut']
    ];
    return known.find(([names]) => names.some(n => text.includes(n)))?.[1] || null;
  }
  function ensureSession() {
    const current = root.followupSession?.token || '';
    if (state.sessionToken === current) return;
    state.sessionToken = current;
    state.contacts = []; state.assignees = [];
    state.loaded = false; state.loading = false;
    state.error = ''; state.currentId = null; state.history = [];
    notified.clear();
    root.document?.getElementById('followupModal')?.remove();
  }
  function stageLabel(contact) {
    if (terminal.has(contact.status)) return ({
      registered: 'تم التسجيل', refused: 'رفض التواصل', blocked: 'إيقاف التواصل', closed: 'أُغلقت المتابعة'
    })[contact.status];
    if (!contact.consent_confirmed) return 'بانتظار التحقق من الموافقة';
    const stages = contact.kind === 'prospect' ? prospectStages : memberStages;
    return stages[Math.min(Math.max(0, Number(contact.stage) || 0), stages.length - 1)];
  }
  function template(contact) {
    const name = String(contact.name || 'أستاذي الكريم').trim();
    if (contact.kind === 'new_member') {
      const templates = [
        `مرحبًا ${name} 🌷\nأهلًا بك في فريقنا. حبيت أطمئن أن دخولك إلى مجتمع الصحة والثراء والتدريبات الأساسية واضح. هل تحتاج مساعدتي في أي خطوة؟`,
        `أهلًا ${name} 🌿\nكيف كانت بدايتك معنا؟ هل تمكنت من فتح التدريبات، وهل واجهتك صعوبة أحب أساعدك فيها؟`,
        `مرحبًا ${name} 🌷\nأطمئن عليك بخصوص خطوات التدريب لهذا الأسبوع. هل لديك سؤال أو جزء تحب نشرحه معًا؟`,
        `أهلًا ${name} 🌿\nمرّ أسبوعان على بداية رحلتك. أحب أسمع رأيك بالتدريبات وما الدعم الذي تحتاجه حاليًا.`,
        `مرحبًا ${name} 🌷\nكيف تسير أمورك؟ إذا تحب نرتب لقاء قصير لمناقشة الأسئلة أو الصعوبات، أنا موجود.`,
        `أهلًا ${name} 🌿\nأكملنا تقريبًا الشهر الأول. أحب أعرف تقييمك للتجربة وما الخطوة المناسبة لك في الفترة القادمة.`
      ];
      return templates[Math.min(Number(contact.stage) || 0, templates.length - 1)];
    }
    const templates = [
      `مرحبًا ${name} 🌷\nمعك أحد أعضاء فريق وائل حاتم في DXN. وصلنا طلبك للتعرف على طبيعة نشاطنا من الإعلان الذي سجلت فيه اهتمامك. هل تفضل شرحًا مختصرًا بالرسائل أم موعدًا مناسبًا للمحادثة؟ وإذا لم تعد ترغب في المتابعة فلا مشكلة إطلاقًا.`,
      `مرحبًا ${name} 🌷\nأتمنى أن تكون بخير. تواصلت معك بخصوص طلبك للتعرف على DXN؛ ربما لم يكن الوقت مناسبًا. هل ما زلت ترغب بمعرفة الفكرة؟`,
      `مرحبًا ${name} 🌿\nنشاط DXN يقوم على التعرف على المنتجات ومهارات البيع المباشر والعمل التدريجي دون ضمان دخل محدد. إذا كان يهمك، يسعدني تقديم تعريف مختصر. هل ترغب بذلك؟`,
      `مرحبًا ${name} 🌷\nهذه رسالتي الأخيرة بخصوص طلب التعرف على DXN. سأغلق المتابعة احترامًا لوقتك، ولن أكرر التواصل بهذا الشأن. إذا رغبت مستقبلًا، يمكنك المبادرة بالتواصل. بالتوفيق دائمًا.`
    ];
    return templates[Math.min(Number(contact.stage) || 0, templates.length - 1)];
  }
  function scheduled(contact) {
    if (!contact.next_due_at) return 'لا يوجد موعد';
    const date = new Date(contact.next_due_at);
    if (!Number.isFinite(date.getTime())) return 'موعد غير صالح';
    const local = date.toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });
    let theirs = '';
    try {
      const theirZone = countryTimezone(contact.country);
      if (theirZone) theirs = date.toLocaleString('ar-IQ', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: theirZone
      });
    } catch (_error) { /* Timezone needs correction. */ }
    return `بتوقيتك: ${local}${theirs ? ` · توقيت بلد الشخص: ${theirs}` : ''}`;
  }
  function isClosed(contact) { return terminal.has(contact.status); }
  function dueLabel(contact) {
    if (!contact.next_due_at) return '';
    const left = new Date(contact.next_due_at).getTime() - Date.now();
    return left < 0 ? '⏰ متأخر' : left <= 3600000 ? '🔔 قريب' : '📅 مجدول';
  }
  function matchedContacts() {
    const rows = state.contacts.filter(c => c.kind === state.kind);
    const now = Date.now();
    return rows.filter(c => {
      if (state.filter === 'all') return true;
      if (state.filter === 'closed') return isClosed(c);
      if (state.filter === 'today' && !c.consent_confirmed && !isClosed(c)) return true;
      if (isClosed(c) || !c.next_due_at) return false;
      const due = new Date(c.next_due_at).getTime();
      if (state.filter === 'today') {
        const end = new Date(); end.setHours(23, 59, 59, 999);
        return due <= end.getTime();
      }
      return due > now;
    }).sort((a, b) => new Date(a.next_due_at || 8640000000000000) - new Date(b.next_due_at || 8640000000000000));
  }
  function row(contact) {
    const name = escapeHtml(contact.name);
    return `<div class="followup-person">
      <div class="followup-person-main"><strong>${name}</strong><span>${escapeHtml(contact.country || '—')} · ${escapeHtml(stageLabel(contact))}</span>
        <small>المسؤول: ${escapeHtml(contact.assigned_name || 'غير محدد')} · ${escapeHtml(scheduled(contact))}</small></div>
      <div class="followup-person-side"><span class="badge">${escapeHtml(dueLabel(contact) || 'محفوظ')}</span>
        <button type="button" class="primary" onclick="followupCenter.open('${escapeHtml(contact.id)}')">فتح البطاقة</button></div>
    </div>`;
  }
  function render() {
    ensureSession();
    if (!state.loaded && !state.loading && root.document) root.setTimeout(load, 0);
    const due = state.contacts.filter(c => !isClosed(c) && c.next_due_at &&
      new Date(c.next_due_at).getTime() <= Date.now()).length;
    const rows = matchedContacts();
    const kindBtn = (kind, text) => `<button type="button" class="followup-choice ${state.kind === kind ? 'selected' : ''}"
      onclick="followupCenter.changeKind('${kind}')">${text}</button>`;
    const filterBtn = (filter, text) => `<button type="button" class="${state.filter === filter ? 'primary' : ''}"
      onclick="followupCenter.changeFilter('${filter}')">${text}</button>`;
    return `<section class="followup-center card" aria-label="مركز المتابعة">
      <div class="followup-heading"><div><h2>📋 مركز المتابعة</h2><p>من أتابع؟ متى؟ وماذا أقول؟</p></div>
      <button type="button" class="primary" onclick="followupCenter.add()">＋ إضافة شخص</button></div>
      <div class="followup-type-tabs">${kindBtn('prospect','🌱 المهتمون')}${kindBtn('new_member','🤝 الأعضاء الجدد')}</div>
      <div class="followup-overview"><div><b>${state.contacts.filter(c => c.kind === state.kind && !isClosed(c)).length}</b><span>حالات نشطة</span></div>
      <div><b>${due}</b><span>مواعيد مستحقة في القسمين</span></div></div>
      <div class="followup-filters">${filterBtn('today','اليوم والمتأخر')}${filterBtn('upcoming','القادمة')}${filterBtn('all','الجميع')}${filterBtn('closed','المغلقة')}</div>
      ${state.loading ? '<p class="muted">جارٍ تحميل المهام…</p>' : ''}
      ${state.error ? `<p class="followup-error">${escapeHtml(state.error)}</p><button onclick="followupCenter.reload()">إعادة المحاولة</button>` : ''}
      ${!state.loading && !state.error ? (rows.length ? rows.map(row).join('') : '<div class="empty">لا توجد متابعات في هذه القائمة.</div>') : ''}
      <p class="muted followup-footnote">التنبيهات هنا تذكّر العضو المسؤول فقط. لا تُرسل رسائل تلقائية إلى المهتمين. تحقق من الموافقة قبل التواصل.</p>
      <button type="button" onclick="followupCenter.enableDeviceReminders()">🔔 السماح بتنبيه الجهاز أثناء فتح الموقع</button>
    </section>`;
  }
  async function load() {
    ensureSession();
    if (state.loading || !root.followupSession?.token) return;
    const requestToken = root.followupSession.token;
    state.loading = true;
    state.error = '';
    try {
      const [contacts, assignees] = await Promise.all([
        root.rpc('followup_list', { p_token: requestToken }),
        root.followupSession.role === 'leader' ? root.rpc('followup_assignees', { p_token: requestToken }) : Promise.resolve([])
      ]);
      if (root.followupSession.token !== requestToken) return;
      state.contacts = Array.isArray(contacts) ? contacts : [];
      state.assignees = Array.isArray(assignees) ? assignees : [];
      state.loaded = true;
    } catch (error) {
      if (root.followupSession.token === requestToken)
        state.error = 'مركز المتابعة قيد التجهيز. لم نُغيّر بيانات أي شخص. ' + (error.message || '');
    } finally {
      if (root.followupSession.token === requestToken) {
        state.loading = false;
        if (root.followupSession.tab === 'followup') root.render();
        checkReminders();
      }
    }
  }
  function changeKind(kind) {
    if (kind !== 'prospect' && kind !== 'new_member') return;
    state.kind = kind; state.filter = 'today'; root.render();
  }
  function changeFilter(filter) {
    if (!['today', 'upcoming', 'all', 'closed'].includes(filter)) return;
    state.filter = filter; root.render();
  }
  function modal(content) {
    if (!root.document) return;
    root.document.getElementById('followupModal')?.remove();
    const el = root.document.createElement('div');
    el.id = 'followupModal'; el.className = 'followup-modal';
    el.innerHTML = `<div class="followup-modal-sheet" role="dialog" aria-modal="true" aria-label="تفاصيل المتابعة">
      <div class="followup-modal-top"><b>📋 مركز المتابعة</b><button type="button" onclick="followupCenter.close()" aria-label="إغلاق">✕</button></div>
      ${content}</div>`;
    root.document.body.appendChild(el);
  }
  function close() { root.document?.getElementById('followupModal')?.remove(); }
  function assigneeOptions(members, selectedId) {
    const options = members.map(member => `<option value="${escapeHtml(member.id)}" ${member.id === selectedId ? 'selected' : ''}>${escapeHtml(member.name || 'عضو دون اسم')} — ${escapeHtml(member.member_no || 'لا يوجد رقم عضوية')}</option>`);
    return `<option value="" ${!selectedId ? 'selected' : ''} disabled>اختر العضو المسؤول عن المتابعة</option>${options.join('')}`;
  }
  function searchAssignees() {
    const input = root.document.getElementById('followupAssigneeSearch');
    const select = root.document.getElementById('followupAssignee');
    if (!input || !select) return;
    const query = input.value.trim().toLocaleLowerCase();
    const selectedId = select.value;
    const matches = state.assignees.filter(member =>
      `${member.name || ''} ${member.member_no || ''}`.toLocaleLowerCase().includes(query));
    select.innerHTML = assigneeOptions(matches, matches.some(m => m.id === selectedId) ? selectedId : '');
  }
  function add() {
    ensureSession();
    const assigneeTitle = state.kind === 'prospect' ? 'العضو الذي أُحيل إليه المهتم' : 'العضو الذي سُجّل معه العضو الجديد (السبونسر)';
    const assigneeControl = root.followupSession?.role === 'leader'
      ? `<div class="followup-assignee"><label>${assigneeTitle} <span aria-hidden="true">*</span>
        <input type="search" id="followupAssigneeSearch" oninput="followupCenter.searchAssignees()" placeholder="ابحث بالاسم أو رقم العضوية" autocomplete="off">
        <select id="followupAssignee" required>${assigneeOptions(state.assignees, '')}</select></label>
        <p class="muted">ستظهر هذه البطاقة للعضو المحدد في مركز المتابعة الخاص به.</p></div>`
      : `<p class="followup-self-assignee"><b>${assigneeTitle}:</b> أنت — ستُحفظ هذه الحالة في قائمة متابعاتك الخاصة.</p>`;
    modal(`<form id="followupAddForm" onsubmit="followupCenter.save(event)">
      <h3>إضافة ${state.kind === 'prospect' ? 'مهتم' : 'عضو مسجل'}</h3>
      ${state.kind === 'prospect' ? '<label>الصق بطاقة المهتم كاملة<textarea id="followupCard" placeholder="الاسم: ...\nالدولة: ...\nرقم الهاتف: ..." oninput="followupCenter.fillFromCard()"></textarea></label>' : ''}
      <label>الاسم<input id="followupName" required maxlength="160" placeholder="الاسم الكامل"></label>
      <div class="followup-form-grid"><label>الدولة<input id="followupCountry" maxlength="80"></label>
      <label>رقم التواصل<input id="followupPhone" maxlength="40" inputmode="tel"></label></div>
      ${state.kind === 'new_member' ? '<label>رقم عضوية DXN<input id="followupMemberNo" maxlength="30"></label>' : ''}
      ${assigneeControl}
      <div class="followup-form-grid"><label>القناة المسموح بها<input id="followupChannel" maxlength="80" placeholder="قناة متوافقة مع السياسات"></label>
      <label>تذكيري قبل الموعد<select id="followupReminder"><option value="30">30 دقيقة</option><option value="15">15 دقيقة</option></select></label></div>
      <label>موعد التواصل (بتوقيت جهازك)<input type="datetime-local" id="followupDue"></label>
      <label class="followup-checkbox"><input id="followupConsent" type="checkbox"> تم التحقق من موافقته على التواصل بهذه القناة</label>
      <label>ملاحظة مختصرة (اختياري)<textarea id="followupNotes" maxlength="2000"></textarea></label>
      <p class="muted">إذا لم تتأكد من الموافقة، تُحفظ البطاقة دون جدولة رسائل.</p>
      <div class="followup-actions"><button type="submit" class="primary">حفظ وإسناد</button><button type="button" onclick="followupCenter.close()">إلغاء</button></div>
    </form>`);
  }
  function fillFromCard() {
    const $ = id => root.document.getElementById(id);
    const raw = $('followupCard')?.value || '';
    const card = parseLeadCard(raw);
    if (card.name) $('followupName').value = card.name;
    if (card.country) $('followupCountry').value = card.country;
    if (card.phone) $('followupPhone').value = card.phone;
  }
  async function save(event) {
    event?.preventDefault();
    const $ = id => root.document.getElementById(id);
    const name = $('followupName')?.value.trim();
    if (!name) return root.toast('اكتب اسم الشخص أولًا.');
    const due = $('followupDue')?.value;
    if (due && Number.isNaN(new Date(due).getTime())) return root.toast('تأكد من صحة موعد المتابعة.');
    const card = parseLeadCard($('followupCard')?.value || '');
    const consent = !!$('followupConsent')?.checked;
    const leader = root.followupSession?.role === 'leader';
    const assigneeId = $('followupAssignee')?.value || null;
    if (leader && (!assigneeId || !state.assignees.some(m => m.id === assigneeId)))
      return root.toast('اختر العضو المسؤول عن هذه الحالة قبل الحفظ.');
    try {
      await root.rpc('followup_add', {
        p_token: root.followupSession.token, p_kind: state.kind, p_name: name,
        p_assignee_user_id: assigneeId,
        p_phone: $('followupPhone')?.value.trim() || null,
        p_country: $('followupCountry')?.value.trim() || null,
        p_gender: card.gender || null,
        p_member_no: $('followupMemberNo')?.value.trim() || null,
        p_source_label: card.source || 'إحالة يدوية',
        p_timezone_name: countryTimezone($('followupCountry')?.value) ||
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Baghdad',
        p_contact_channel: $('followupChannel')?.value.trim() || null,
        p_consent_confirmed: consent, p_consent_note: consent ? 'تأكيد مسؤول الحالة' : null,
        p_notes: $('followupNotes')?.value.trim() || null,
        p_next_due_at: due ? new Date(due).toISOString() : null,
        p_reminder_minutes: Number($('followupReminder')?.value || 30)
      });
      close(); root.toast('تم حفظ البطاقة.'); await reload();
    } catch (error) { root.toast(error.message || 'تعذر حفظ البطاقة'); }
  }
  async function open(id) {
    ensureSession();
    const contact = state.contacts.find(c => c.id === id);
    if (!contact) return;
    state.currentId = id;
    const stopped = isClosed(contact);
    const option = (result, label) => `<option value="${result}">${label}</option>`;
    modal(`<div class="followup-detail"><h3>${escapeHtml(contact.name)}</h3>
      <div class="muted">الدولة: ${escapeHtml(contact.country || '—')} · الهاتف: ${escapeHtml(contact.phone || 'لا يوجد رقم')}<br>
      المسؤول: ${escapeHtml(contact.assigned_name || '—')} · القناة: ${escapeHtml(contact.contact_channel || 'غير محددة')}<br>
      ${contact.member_no ? `رقم العضوية: ${escapeHtml(contact.member_no)} · ` : ''}
      ${contact.gender ? `الجنس: ${escapeHtml(contact.gender)} · ` : ''}
      المصدر: ${escapeHtml(contact.source_label || '—')}
      ${contact.notes ? `<div class="followup-shortnote">ملاحظة: ${escapeHtml(contact.notes)}</div>` : ''}</div>
      <div class="followup-stage"><b>${escapeHtml(stageLabel(contact))}</b><small>${escapeHtml(scheduled(contact))}</small></div>
      ${contact.consent_confirmed && !stopped ? `<h4>📝 رسالة المرحلة الحالية</h4>
        <div class="followup-template">${escapeHtml(template(contact)).replace(/\n/g, '<br>')}</div>
        <button type="button" onclick="followupCenter.copyTemplate()">نسخ الرسالة</button>` : ''}
      ${!contact.consent_confirmed && !stopped ? '<p class="followup-error">لا يجوز بدء التواصل قبل التأكد من الموافقة المناسبة والقناة المسموح بها.</p>' : ''}
      ${!stopped ? `<form onsubmit="followupCenter.record(event)"><h4>نتيجة المتابعة</h4>
        <label>ماذا حصل؟<select id="followupResult">
          ${!contact.consent_confirmed ? option('consent_granted','تم التحقق من الموافقة') : ''}
          ${contact.consent_confirmed ? `${option('sent','تم إرسال رسالة المرحلة')}${option('no_reply','لم يرد')}
          ${option('interested','مهتم — موعد جديد')}${option('deferred','طلب التأجيل')}` : ''}
          ${contact.kind === 'prospect' ? option('registered','تم تسجيل عضويته') : ''}
          ${option('refused','رفض التواصل')}${option('blocked','طلب إيقاف التواصل / حظر')}
          ${option('closed','إغلاق المتابعة')}
        </select></label>
        <label>موعد محدد للتواصل القادم (اختياري؛ إلزامي للتأجيل)<input type="datetime-local" id="followupNextDue"></label>
        <label>ملاحظة مختصرة<textarea id="followupActionNote" maxlength="2000"></textarea></label>
        <button type="submit" class="primary">حفظ النتيجة والموعد</button>
      </form>` : '<p class="muted">هذه الحالة مغلقة، ولن يصدر لها تذكير جديد.</p>'}
      <div class="followup-history"><h4>سجل المتابعة</h4><div id="followupHistory">جارٍ تحميل السجل…</div></div></div>`);
    try {
      const history = await root.rpc('followup_history', { p_token: root.followupSession.token, p_contact_id: id });
      if (state.currentId !== id) return;
      const el = root.document.getElementById('followupHistory');
      if (el) el.innerHTML = Array.isArray(history) && history.length ? history.map(h =>
        `<div class="followup-history-item"><b>${escapeHtml(resultLabels[h.result] || h.result)}</b>
         <small>${escapeHtml(new Date(h.created_at).toLocaleString('ar-IQ'))}</small>
         <span>${escapeHtml(h.note || '')}</span></div>`).join('') : '<p class="muted">لا توجد محاولات مسجلة بعد.</p>';
    } catch (_error) {
      const el = root.document.getElementById('followupHistory');
      if (el) el.textContent = 'تعذر تحميل سجل المتابعة.';
    }
  }
  async function record(event) {
    event?.preventDefault();
    const result = root.document.getElementById('followupResult')?.value;
    const next = root.document.getElementById('followupNextDue')?.value || '';
    if (['interested', 'deferred'].includes(result) && (!next || new Date(next).getTime() <= Date.now())) {
      return root.toast('حدد موعدًا مستقبليًا مناسبًا للشخص.');
    }
    try {
      await root.rpc('followup_record_action', {
        p_token: root.followupSession.token, p_contact_id: state.currentId, p_result: result,
        p_note: root.document.getElementById('followupActionNote')?.value.trim() || null,
        p_next_due_at: next ? new Date(next).toISOString() : null
      });
      close(); root.toast('تم حفظ النتيجة وتحديث موعد المتابعة.'); await reload();
    } catch (error) { root.toast(error.message || 'تعذر تسجيل النتيجة'); }
  }
  async function copyTemplate() {
    ensureSession();
    const contact = state.contacts.find(c => c.id === state.currentId);
    if (!contact || !contact.consent_confirmed || isClosed(contact)) return;
    try {
      await root.navigator.clipboard.writeText(template(contact));
      root.toast('نُسخت الرسالة. راجعها قبل إرسالها عبر قناة مسموحة.');
    } catch (_error) { root.toast('تعذر النسخ، حدّد النص يدويًا.'); }
  }
  async function reload() { state.loaded = false; await load(); }
  function checkReminders() {
    ensureSession();
    const now = Date.now();
    state.contacts.forEach(c => {
      if (isClosed(c) || !c.consent_confirmed || !c.next_due_at) return;
      const diff = new Date(c.next_due_at).getTime() - now;
      const before = Number(c.reminder_minutes || 30) * 60000;
      if (diff > before || diff < -86400000) return;
      const key = `${c.id}:${c.next_due_at}:${diff < 0 ? 'due' : 'before'}`;
      if (notified.has(key)) return;
      notified.add(key);
      const clock = new Date(c.next_due_at).toLocaleTimeString('ar-IQ', {
        hour: 'numeric', minute: '2-digit'
      });
      const message = `${c.name}: ${stageLabel(c)} — الساعة ${clock} — ${diff < 0 ? 'حان موعد المتابعة' : `تبقى ${Math.max(1, Math.ceil(diff / 60000))} دقيقة`}`;
      if (typeof root.toast === 'function') root.toast('🔔 ' + message);
      if (root.document?.hidden && root.Notification?.permission === 'granted') {
        try { new root.Notification('تذكير من مركز المتابعة', { body: message }); } catch (_error) { /* In-app only. */ }
      }
    });
  }
  function enableDeviceReminders() {
    if (!root.Notification || typeof root.Notification.requestPermission !== 'function')
      return root.toast('تنبيهات الجهاز غير متاحة في هذا المتصفح.');
    root.Notification.requestPermission().then(permission =>
      root.toast(permission === 'granted' ? 'تم السماح بالتنبيهات أثناء فتح الموقع.' : 'ستبقى التذكيرات داخل الموقع.')
    );
  }

  root.followupCenter = { render, load, reload, changeKind, changeFilter, add, searchAssignees, fillFromCard,
    save, open, close, record, copyTemplate, parseLeadCard, stageLabel, enableDeviceReminders };
  if (root.document && typeof root.setInterval === 'function') root.setInterval(checkReminders, 60000);
  if (typeof module !== 'undefined' && module.exports)
    module.exports = { parseLeadCard, stageLabel, template, escapeHtml, prospectStages, memberStages };
})(typeof window !== 'undefined' ? window : globalThis);
