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
  // تصنيف المستقطب مستقل عن نتائج محاولات التواصل وعن حظر المستخدمين.
  const prospectStatuses = {
    new: 'جديد', contacted: 'تم التواصل', no_whatsapp: 'لا يمتلك واتساب',
    already_dxn: 'عضو في DXN', registered: 'سجّل عضوية',
    points_activated: 'فعّل نقاط', no_response: 'لا يرد نهائيًا',
    not_interested: 'لا يرغب بالعمل', blocked_me: 'عمل لي حظرًا'
  };
  const stageDays = { prospect: [0, 1, 3, 7], new_member: [1, 3, 7, 14, 21, 30] };
  const nextActionTypes = { text: '💬 رسالة نصية' };
  const prospectPaused = new Set(['no_response', 'not_interested', 'blocked_me']);
  const resultLabels = {
    sent: 'تم التواصل', no_reply: 'لم يرد', interested: 'مهتم — موعد آخر',
    deferred: 'طلب التأجيل', registered: 'تم التسجيل', refused: 'رفض',
    blocked: 'طلب إيقاف التواصل', closed: 'إغلاق', consent_granted: 'تم تأكيد الموافقة',
    status_updated: 'تغيير حالة المستقطَب'
  };
  const state = { kind: 'prospect', filter: 'all', statusFilter: 'all', search: '',
    leaderKind: 'all', leaderAssignee: 'all', leaderStatus: 'all', leaderSearch: '', leaderLimit: 50,
    contacts: [], assignees: [], loaded: false,
    loading: false, error: '', currentId: null, history: [], sessionToken: null };
  const notified = new Set();
  let leaderNoticeInitialized = false;
  let leaderPolling = false;
  let leaderNoticeIds = new Set();
  let activeLoad = null;

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
    state.kind = root.followupSession?.role === 'leader' ? 'leader_dashboard' : 'prospect';
    state.leaderKind = 'all'; state.leaderAssignee = 'all';
    state.leaderStatus = 'all'; state.leaderSearch = ''; state.leaderLimit = 50;
    state.contacts = []; state.assignees = [];
    state.loaded = false; state.loading = false;
    activeLoad = null;
    state.error = ''; state.currentId = null; state.history = [];
    notified.clear();
    leaderNoticeInitialized = false; leaderNoticeIds = new Set();
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
  function template(contact, stageIndex = Number(contact.stage) || 0) {
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
      if (stageIndex > 0 && contact.latest_reaction === 'points_activated')
        return `مرحبًا ${name} 🌿\nلاحظت أنك بدأت بتفعيل نقاطك في DXN. كيف تسير أمورك مع المنتجات والتدريبات؟ هل تحتاج إلى توضيح حول أي خطوة؟`;
      return templates[Math.min(Math.max(0, stageIndex), templates.length - 1)];
    }
    const templates = [
      `مرحبًا ${name} 🌷\nمعك أحد أعضاء فريق وائل حاتم في DXN. وصلنا طلبك للتعرف على طبيعة نشاطنا من الإعلان الذي سجلت فيه اهتمامك. هل تفضل شرحًا مختصرًا بالرسائل أم موعدًا مناسبًا للمحادثة؟ وإذا لم تعد ترغب في المتابعة فلا مشكلة إطلاقًا.`,
      `مرحبًا ${name} 🌷\nأتمنى أن تكون بخير. تواصلت معك بخصوص طلبك للتعرف على DXN؛ ربما لم يكن الوقت مناسبًا. هل ما زلت ترغب بمعرفة الفكرة؟`,
      `مرحبًا ${name} 🌿\nنشاط DXN يقوم على التعرف على المنتجات ومهارات البيع المباشر والعمل التدريجي دون ضمان دخل محدد. إذا كان يهمك، يسعدني تقديم تعريف مختصر. هل ترغب بذلك؟`,
      `مرحبًا ${name} 🌷\nهذه رسالتي الأخيرة بخصوص طلب التعرف على DXN. سأغلق المتابعة احترامًا لوقتك، ولن أكرر التواصل بهذا الشأن. إذا رغبت مستقبلًا، يمكنك المبادرة بالتواصل. بالتوفيق دائمًا.`
    ];
    if (stageIndex === 1 && contact.prospect_status === 'contacted')
      return `مرحبًا ${name} 🌷\nأتابع معك بخصوص موضوع DXN الذي سبق أن تواصلنا بشأنه. هل لديك سؤال محدد أستطيع توضيحه، أم تفضل أن نترك الحديث إلى وقت يناسبك؟`;
    return templates[Math.min(Math.max(0, stageIndex), templates.length - 1)];
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
  function prospectStatusLabel(contact) {
    return prospectStatuses[contact.prospect_status || 'new'] || prospectStatuses.new;
  }
  function isClosed(contact) {
    return terminal.has(contact.status) ||
      (contact.kind === 'prospect' && prospectPaused.has(contact.prospect_status));
  }
  function dueLabel(contact) {
    if (!contact.next_due_at) return '';
    const due = stageDueAt(contact, Number(contact.stage) || 0);
    if (!due) return '';
    const left = due.getTime() - Date.now();
    return left < 0 ? '⏰ متأخر' : left <= 3600000 ? '🔔 قريب' : '📅 مجدول';
  }
  function matchedContacts() {
    const query = state.search.trim().toLocaleLowerCase();
    const rows = state.contacts.filter(c => c.kind === state.kind)
      .filter(c => state.kind !== 'prospect' || state.statusFilter === 'all' ||
        (c.prospect_status || 'new') === state.statusFilter)
      .filter(c => !query || `${c.name || ''} ${c.phone || ''} ${c.member_no || ''}`
        .toLocaleLowerCase().includes(query));
    const now = Date.now();
    return rows.filter(c => {
      if (state.filter === 'all') return true;
      if (state.filter === 'closed') return isClosed(c);
      if (state.filter === 'today' && !c.consent_confirmed && !isClosed(c)) return true;
      if (isClosed(c) || !c.next_due_at) return false;
      const due = stageDueAt(c, Number(c.stage) || 0)?.getTime() || Number.POSITIVE_INFINITY;
      if (state.filter === 'today') {
        const end = new Date(); end.setHours(23, 59, 59, 999);
        return due <= end.getTime();
      }
      return due > now;
    }).sort((a, b) => (stageDueAt(a, Number(a.stage) || 0)?.getTime() || Number.POSITIVE_INFINITY) -
      (stageDueAt(b, Number(b.stage) || 0)?.getTime() || Number.POSITIVE_INFINITY));
  }
  function row(contact) {
    const name = escapeHtml(contact.name);
    return `<div class="followup-person">
      <div class="followup-person-main"><strong>${name}</strong><span>${escapeHtml(contact.country || '—')} · ${escapeHtml(contact.kind === 'prospect' ? prospectStatusLabel(contact) : stageLabel(contact))}</span>
        <small>المسؤول: ${escapeHtml(contact.assigned_name || 'غير محدد')} · ${escapeHtml(scheduled(contact))}</small></div>
      <div class="followup-person-side"><span class="badge">${escapeHtml(dueLabel(contact) || 'محفوظ')}</span>
        <button type="button" class="primary" onclick="followupCenter.open('${escapeHtml(contact.id)}')">فتح البطاقة</button></div>
    </div>`;
  }
  function memberStatusLabel(contact) {
    return ({ new: 'جديد', consent_pending: 'بانتظار تأكيد الموافقة', active: 'قيد المتابعة',
      interested: 'مهتم بالمتابعة', deferred: 'مؤجل', registered: 'مسجّل',
      refused: 'لا يرغب بالمتابعة', blocked: 'طلب إيقاف التواصل', closed: 'اكتملت المتابعة'
    })[contact.status] || 'قيد المتابعة';
  }
  function actualStageLabel(contact) {
    const stages = contact.kind === 'prospect' ? prospectStages : memberStages;
    return stages[Math.min(Math.max(0, Number(contact.stage) || 0), stages.length - 1)];
  }
  function formatDate(value) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }
  function formatExactDateTime(value) {
    if (!value) return 'لم يُحدَّد الموعد بعد';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'موعد غير صالح';
    return date.toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
      ' — ' + date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  }
  function stageDueAt(contact, index) {
    const opened = new Date(contact.sequence_started_at || contact.opened_at || contact.created_at).getTime();
    const current = Math.max(0, Number(contact.stage) || 0);
    const days = stageDays[contact.kind] || stageDays.prospect;
    if (index === current && contact.next_due_at) {
      const stored = new Date(contact.next_due_at).getTime();
      // First introduction takes place 5–15 minutes after consent, not instantly.
      if (Number.isFinite(stored)) return new Date(index === 0 && contact.kind === 'prospect' &&
        Number.isFinite(opened) ? Math.max(stored, opened + 10 * 60000) : stored);
    }
    if (!Number.isFinite(opened) || index < 0 || index >= days.length) return null;
    return new Date(opened + days[index] * 86400000 +
      (contact.kind === 'prospect' && index === 0 ? 10 * 60000 : 0));
  }
  function stageReady(contact, index) {
    const due = stageDueAt(contact, index);
    return !isClosed(contact) && contact.consent_confirmed &&
      index === (Number(contact.stage) || 0) && !!contact.next_due_at &&
      !!due && due.getTime() <= Date.now();
  }
  function stageCardsHtml(contact, history = []) {
    const stages = contact.kind === 'prospect' ? prospectStages : memberStages;
    const current = Number(contact.stage) || 0;
    const statusOptions = selected => Object.entries(prospectStatuses).map(([key, label]) =>
      `<option value="${key}" ${key === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    return `<div class="followup-timeline" aria-label="مراحل المتابعة المتسلسلة">${stages.map((label, index) => {
      const recorded = history.find(h => Number(h.stage_before) === index &&
        (h.result === 'stage_completed' || Number(h.stage_after) > index));
      const finished = index < current || !!recorded;
      const ready = stageReady(contact, index);
      const due = contact.consent_confirmed && (index !== current || contact.next_due_at)
        ? stageDueAt(contact, index) : null;
      const status = finished ? 'مكتملة' : ready ? 'متاحة للتنفيذ' :
        index === current && !isClosed(contact) ? 'بانتظار موعدها أو الموافقة' : 'مغلقة';
      const selected = recorded?.reaction_status || recorded?.status_after ||
        (index === current ? contact.prospect_status || 'new' : 'new');
      const message = template(contact, index);
      return `<article class="followup-timeline-card ${finished ? 'is-done' : ready ? 'is-ready' : 'is-locked'}">
        <div class="followup-timeline-card-head"><strong>المرحلة ${index + 1}: ${escapeHtml(label)}</strong>
          <span>${finished ? '✅' : ready ? '🔔' : '🔒'} ${status}</span></div>
        <div class="followup-timeline-due"><b>📅 ${escapeHtml(finished ? 'موعد التنفيذ المسجل' : 'موعد التنفيذ')}</b>
          <span>${escapeHtml(recorded?.created_at ? formatExactDateTime(recorded.created_at) : due ? formatExactDateTime(due) : 'بانتظار توثيق الموافقة والجدولة')}</span>
          ${index > current ? '<small>توقيت متوقع، يتأكد بعد إكمال المراحل السابقة.</small>' : ''}</div>
        <p><b>الإجراء:</b> إرسال رسالة متابعة نصية مناسبة لهذه المرحلة.</p>
        <div class="followup-template">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
        <button type="button" ${!ready ? 'disabled' : ''} onclick="followupCenter.copyStage(${index})">📋 نسخ الرسالة</button>
        <div class="followup-stage-reaction"><b>حالة الشخص وردة فعله</b>
          ${ready ? `<form onsubmit="followupCenter.completeStage(event,${index})">
            <select id="followupReaction${index}" onchange="followupCenter.toggleStageMembership(${index})" required>
              ${statusOptions(contact.prospect_status || 'new')}</select>
            ${contact.kind === 'prospect' ? `<div id="followupStageMembership${index}" hidden>
              <label>رقم العضوية الجديدة<input id="followupStageMemberNo${index}" inputmode="numeric" pattern="[0-9]{6,15}" maxlength="15"></label>
              <label>تاريخ الانضمام<input id="followupStageJoinDate${index}" type="date"></label></div>` : ''}
            <label>ملاحظة الإجراء (اختياري)<textarea id="followupStageNote${index}" maxlength="2000"></textarea></label>
            <button class="primary" type="submit">تأكيد التنفيذ وحفظ ردة الفعل</button></form>` :
            `<select disabled aria-label="الحالة المسجلة للمرحلة ${index + 1}">${statusOptions(selected)}</select>`}
          ${recorded ? `<small>سُجل الإجراء: ${escapeHtml(formatDate(recorded.created_at))}${recorded.note ? ` — ${escapeHtml(recorded.note)}` : ''}</small>` : ''}
        </div></article>`;
    }).join('')}</div>`;
  }
  function nextStepHtml(contact) {
    const stopped = isClosed(contact);
    const due = stageDueAt(contact, Math.max(0, Number(contact.stage) || 0));
    const detail = template(contact);
    const flag = stopped ? 'المتابعة متوقفة' : !contact.consent_confirmed ? 'بانتظار الموافقة على التواصل'
      : stageReady(contact, Number(contact.stage) || 0) ? 'حان موعد التنفيذ' : 'بانتظار الموعد';
    return `<aside class="followup-next-step" aria-label="الإجراء القادم">
      <div class="followup-next-step-title"><b>📅 الخطوة القادمة</b><span>${escapeHtml(flag)}</span></div>
      <div><b>المرحلة:</b> ${escapeHtml(actualStageLabel(contact))}</div>
      <div><b>موعد التنفيذ بالتاريخ والوقت:</b><strong class="followup-next-step-date">${escapeHtml(stopped || !contact.consent_confirmed ? 'لا توجد متابعة مجدولة' : formatExactDateTime(due))}</strong>
        <small>بتوقيت جهازك</small></div>
      <div><b>نوع الإجراء:</b> ${escapeHtml(stopped ? 'لا يوجد' : nextActionTypes.text)}</div>
      <div><b>الرسالة المحددة تلقائيًا:</b><p>${escapeHtml(stopped ? 'أُوقفت المتابعة لهذه الحالة.' : detail)}</p></div>
    </aside>`;
  }
  function formatJoinDate(value) {
    const date = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'بانتظار التوثيق';
    const parsed = new Date(date + 'T12:00:00');
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'numeric', year: 'numeric' })
      : 'بانتظار التوثيق';
  }
  function memberIdentityCard(contact) {
    return `<section class="followup-member-identity" aria-label="البطاقة التعريفية للعضو الجديد">
      <h4>🪪 البطاقة التعريفية للعضو الجديد</h4>
      <div><span><b>الاسم:</b> ${escapeHtml(contact.name || '—')}</span>
      <span><b>رقم العضوية:</b> ${escapeHtml(contact.member_no || 'بانتظار التوثيق')}</span>
      <span><b>رقم الهاتف:</b> ${escapeHtml(contact.phone || '—')}</span>
      <span><b>البلد:</b> ${escapeHtml(contact.country || 'بانتظار التوثيق')}</span>
      <span><b>تاريخ الانضمام:</b> ${escapeHtml(formatJoinDate(contact.join_date))}</span>
      <span><b>تاريخ إدخال البطاقة:</b> ${escapeHtml(formatDate(contact.opened_at))}</span>
      <span><b>الحالة الحالية:</b> ${escapeHtml(prospectStatuses[contact.latest_reaction] || memberStatusLabel(contact))}</span>
      <span><b>اسم الراعي:</b> ${escapeHtml(contact.assigned_name || '—')}</span>
      <span><b>رقم عضوية الراعي:</b> ${escapeHtml(contact.assigned_member_no || '—')}</span></div>
    </section>`;
  }
  function prospectIdentityCard(contact) {
    return `<section class="followup-member-identity" aria-label="البطاقة التعريفية للمهتم">
      <h4>🪪 البطاقة التعريفية للمهتم</h4>
      <div><span><b>الاسم:</b> ${escapeHtml(contact.name || '—')}</span>
      <span><b>رقم الهاتف:</b> ${escapeHtml(contact.phone || '—')}</span>
      <span><b>البلد:</b> ${escapeHtml(contact.country || '—')}</span>
      <span><b>تاريخ تسجيل الاهتمام:</b> ${escapeHtml(formatDate(contact.opened_at))}</span>
      <span><b>الحالة الحالية:</b> ${escapeHtml(prospectStatusLabel(contact))}</span>
      <span><b>اسم الراعي:</b> ${escapeHtml(contact.assigned_name || '—')}</span>
      <span><b>رقم عضوية الراعي:</b> ${escapeHtml(contact.assigned_member_no || '—')}</span></div>
    </section>`;
  }
  function leaderRows() {
    const query = state.leaderSearch.trim().toLocaleLowerCase();
    return state.contacts.filter(c =>
      (state.leaderKind === 'all' || c.kind === state.leaderKind) &&
      (state.leaderAssignee === 'all' || c.assigned_user_id === state.leaderAssignee) &&
      (state.leaderStatus === 'all' || (c.kind === 'prospect' &&
        (c.prospect_status || 'new') === state.leaderStatus)) &&
      (!query || `${c.name || ''} ${c.phone || ''} ${c.member_no || ''} ${c.assigned_name || ''}`
        .toLocaleLowerCase().includes(query))
    ).sort((a, b) => new Date(b.updated_at || b.opened_at || 0) -
      new Date(a.updated_at || a.opened_at || 0));
  }
  function leaderRowsHtml() {
    const rows = leaderRows();
    const visible = rows.slice(0, state.leaderLimit);
    const cards = visible.map(c => `<article class="followup-leader-record">
      <div class="followup-leader-record-grid"><div class="followup-leader-record-main">
      <div class="followup-leader-record-top"><strong>${escapeHtml(c.name)}</strong>
        <span class="badge">${c.kind === 'prospect' ? '🌱 مهتم' : '🤝 عضو جديد'}</span></div>
      <div><b>المسؤول:</b> ${escapeHtml(c.assigned_name || 'غير محدد')}</div>
      <div><b>الحالة:</b> ${escapeHtml(c.kind === 'prospect' ? prospectStatusLabel(c) : memberStatusLabel(c))}</div>
      <div><b>المرحلة:</b> ${escapeHtml(actualStageLabel(c))}</div>
      ${c.kind === 'new_member' ? memberIdentityCard(c) : ''}
      <div class="followup-leader-record-time"><span><b>وقت التسجيل:</b> ${escapeHtml(formatDate(c.opened_at || c.created_at))}</span>
        <span><b>آخر تحديث:</b> ${escapeHtml(formatDate(c.updated_at))}</span></div>
      <button type="button" class="primary" onclick="followupCenter.open('${escapeHtml(c.id)}')">عرض البطاقة والسجل</button>
      </div>${nextStepHtml(c)}</div>
    </article>`).join('');
    return `<p class="muted">نتائج البحث: <b>${rows.length}</b></p>${cards || '<div class="empty">لا توجد نتائج مطابقة.</div>'}
      ${rows.length > state.leaderLimit ? '<button type="button" onclick="followupCenter.leaderMore()">عرض 50 سجلًا إضافيًا</button>' : ''}`;
  }
  function leaderDashboard() {
    const prospects = state.contacts.filter(c => c.kind === 'prospect');
    const members = state.contacts.filter(c => c.kind === 'new_member');
    const memberChoices = [...new Map(state.contacts.map(c => [c.assigned_user_id,
      { id: c.assigned_user_id, name: c.assigned_name || 'غير محدد' }])).values()]
      .filter(c => c.id).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const selector = (id, current, onChange, options) => `<select id="${id}" onchange="followupCenter.${onChange}(this.value)">
      ${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
    </select>`;
    return `<section class="followup-center card" aria-label="لوحة متابعة القائد">
      <div class="followup-heading"><div><h2>📊 لوحة متابعة القائد</h2><p>تظهر الحالات المسجلة من أعضاء الفريق وتحديثاتها.</p></div>
        <button type="button" onclick="followupCenter.reload()">↻ تحديث</button></div>
      <div class="followup-type-tabs">
        <button class="followup-choice selected" type="button">📊 لوحة القائد</button>
        <button class="followup-choice" type="button" onclick="followupCenter.changeKind('prospect')">🌱 المهتمون</button>
        <button class="followup-choice" type="button" onclick="followupCenter.changeKind('new_member')">🤝 الأعضاء الجدد</button>
      </div>
      <div class="followup-overview followup-leader-summary">
        <div><b>${prospects.length}</b><span>إجمالي المهتمين</span></div>
        <div><b>${members.length}</b><span>الأعضاء الجدد</span></div>
        <div><b>${prospects.filter(c => c.prospect_status === 'registered').length}</b><span>سجلوا عضوية</span></div>
      </div>
      <div class="followup-leader-filters">
        <label>بحث بالاسم أو الهاتف أو العضو المسؤول
          <input type="search" value="${escapeHtml(state.leaderSearch)}" oninput="followupCenter.leaderSearchInput(this.value)" placeholder="بحث في جميع سجلات المتابعة"></label>
        <label>نوع السجل
          ${selector('followupLeaderKind',state.leaderKind,'leaderSetKind', [['all','الكل'],['prospect','المهتمون'],['new_member','الأعضاء الجدد']])}</label>
        <label>العضو المسؤول
          ${selector('followupLeaderAssignee',state.leaderAssignee,'leaderSetAssignee', [['all','جميع الأعضاء'],...memberChoices.map(c => [c.id,c.name])])}</label>
        <label>حالة المستقطَب
          ${selector('followupLeaderStatus',state.leaderStatus,'leaderSetStatus', [['all','جميع الحالات'], ...Object.entries(prospectStatuses)])}</label>
      </div>
      ${state.loading ? '<p class="muted">جارٍ تحميل بيانات المتابعة…</p>' : ''}
      ${state.error ? `<p class="followup-error">${escapeHtml(state.error)}</p>` : ''}
      <div id="followupLeaderRows">${!state.loading && !state.error ? leaderRowsHtml() : ''}</div>
      <p class="muted followup-footnote">اللوحة مخصصة للقائد. لا تُرسل رسائل تلقائية إلى الأشخاص المسجلين.</p>
    </section>`;
  }
  function render() {
    ensureSession();
    if (!state.loaded && !state.loading && root.document) root.setTimeout(load, 0);
    if (root.followupSession?.role === 'leader' && state.kind === 'leader_dashboard') return leaderDashboard();
    const due = state.contacts.filter(c => !isClosed(c) && c.consent_confirmed && c.next_due_at &&
      stageReady(c, Number(c.stage) || 0)).length;
    const rows = matchedContacts();
    const kindBtn = (kind, text) => `<button type="button" class="followup-choice ${state.kind === kind ? 'selected' : ''}"
      onclick="followupCenter.changeKind('${kind}')">${text}</button>`;
    const filterBtn = (filter, text) => `<button type="button" class="${state.filter === filter ? 'primary' : ''}"
      onclick="followupCenter.changeFilter('${filter}')">${text}</button>`;
    return `<section class="followup-center card" aria-label="مركز المتابعة">
      <div class="followup-heading"><div><h2>📋 مركز المتابعة</h2><p>من أتابع؟ متى؟ وماذا أقول؟</p></div>
      <button type="button" class="primary" onclick="followupCenter.add()">＋ إضافة شخص</button></div>
      <div class="followup-type-tabs">${root.followupSession?.role === 'leader' ? kindBtn('leader_dashboard','📊 لوحة القائد') : ''}${kindBtn('prospect','🌱 المهتمون')}${kindBtn('new_member','🤝 الأعضاء الجدد')}</div>
      <div class="followup-overview"><div><b>${state.contacts.filter(c => c.kind === state.kind && !isClosed(c)).length}</b><span>حالات نشطة</span></div>
      <div><b>${due}</b><span>مواعيد مستحقة في القسمين</span></div></div>
      <div class="followup-filters">${filterBtn('today','اليوم والمتأخر')}${filterBtn('upcoming','القادمة')}${filterBtn('all','الجميع')}${filterBtn('closed','المغلقة')}</div>
      <div class="followup-search-row">
        <label>بحث بالاسم أو الهاتف أو رقم العضوية
          <input type="search" id="followupSearch" value="${escapeHtml(state.search)}" placeholder="اكتب للبحث" oninput="followupCenter.searchInput(this.value)">
        </label>
        ${state.kind === 'prospect' ? `<label>تصنيف حالة المستقطَب
          <select id="followupStatusFilter" onchange="followupCenter.changeStatusFilter(this.value)">
            <option value="all">جميع الحالات</option>
            ${Object.entries(prospectStatuses).map(([value, label]) =>
              `<option value="${value}" ${state.statusFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>` : ''}
      </div>
      ${state.loading ? '<p class="muted">جارٍ تحميل المهام…</p>' : ''}
      ${state.error ? `<p class="followup-error">${escapeHtml(state.error)}</p><button onclick="followupCenter.reload()">إعادة المحاولة</button>` : ''}
      <div id="followupResults">${!state.loading && !state.error ? (rows.length ? rows.map(row).join('') : '<div class="empty">لا توجد متابعات في هذه القائمة.</div>') : ''}</div>
      <p class="muted followup-footnote">التنبيهات هنا تذكّر العضو المسؤول فقط. لا تُرسل رسائل تلقائية إلى المهتمين. تحقق من الموافقة قبل التواصل.</p>
      <button type="button" onclick="followupCenter.enableDeviceReminders()">🔔 السماح بتنبيه الجهاز أثناء فتح الموقع</button>
    </section>`;
  }
  async function load() {
    ensureSession();
    if (state.loading) return activeLoad;
    if (!root.followupSession?.token) return;
    const requestToken = root.followupSession.token;
    state.loading = true;
    state.error = '';
    activeLoad = (async () => {
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
    })();
    return activeLoad;
  }
  function changeKind(kind) {
    if (kind !== 'prospect' && kind !== 'new_member' &&
      !(kind === 'leader_dashboard' && root.followupSession?.role === 'leader')) return;
    state.kind = kind; state.filter = kind === 'prospect' ? 'all' : 'today';
    state.statusFilter = 'all'; state.search = ''; root.render();
  }
  function leaderSearchInput(value) {
    if (root.followupSession?.role !== 'leader') return;
    state.leaderSearch = String(value || ''); state.leaderLimit = 50;
    const panel = root.document?.getElementById('followupLeaderRows');
    if (panel) panel.innerHTML = leaderRowsHtml();
  }
  function leaderSetKind(value) {
    if (!['all','prospect','new_member'].includes(value) || root.followupSession?.role !== 'leader') return;
    state.leaderKind = value; state.leaderStatus = 'all'; state.leaderLimit = 50; root.render();
  }
  function leaderSetAssignee(value) {
    if (root.followupSession?.role !== 'leader') return;
    state.leaderAssignee = value; state.leaderLimit = 50; root.render();
  }
  function leaderSetStatus(value) {
    if (root.followupSession?.role !== 'leader' ||
      (value !== 'all' && !Object.hasOwn(prospectStatuses, value))) return;
    state.leaderStatus = value;
    if (value !== 'all') state.leaderKind = 'prospect';
    state.leaderLimit = 50; root.render();
  }
  function leaderMore() { state.leaderLimit += 50; root.render(); }
  function changeFilter(filter) {
    if (!['today', 'upcoming', 'all', 'closed'].includes(filter)) return;
    state.filter = filter; root.render();
  }
  function changeStatusFilter(status) {
    if (status !== 'all' && !Object.hasOwn(prospectStatuses, status)) return;
    state.statusFilter = status;
    if (status !== 'all') state.filter = 'all';
    root.render();
  }
  function searchInput(value) {
    state.search = String(value || '');
    const results = root.document?.getElementById('followupResults');
    if (!results) return;
    const rows = matchedContacts();
    results.innerHTML = rows.length ? rows.map(row).join('') : '<div class="empty">لا توجد نتائج مطابقة.</div>';
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
      ${state.kind === 'prospect' ? '<p class="muted">الحالة الأولية: جديد — يمكنك تغييرها من بطاقة المستقطَب.</p>' : ''}
      ${state.kind === 'prospect' ? '<label>الصق بطاقة المهتم كاملة<textarea id="followupCard" placeholder="الاسم: ...\nالدولة: ...\nرقم الهاتف: ..." oninput="followupCenter.fillFromCard()"></textarea></label>' : ''}
      <label>الاسم<input id="followupName" required maxlength="160" placeholder="الاسم الكامل"></label>
      <div class="followup-form-grid"><label>الدولة<input id="followupCountry" maxlength="80" ${state.kind === 'new_member' ? 'required' : ''}></label>
      <label>رقم التواصل<input id="followupPhone" maxlength="40" inputmode="tel"></label></div>
      ${state.kind === 'new_member' ? '<div class="followup-form-grid"><label>رقم عضوية DXN<input id="followupMemberNo" maxlength="15" inputmode="numeric" pattern="[0-9]{6,15}" required></label><label>تاريخ الانضمام الفعلي<input id="followupJoinDate" type="date" required></label></div>' : ''}
      ${assigneeControl}
      <div class="followup-form-grid"><label>القناة المسموح بها<input id="followupChannel" maxlength="80" placeholder="قناة متوافقة مع السياسات"></label>
      <label>تذكيري قبل الموعد<select id="followupReminder"><option value="30">30 دقيقة</option><option value="15">15 دقيقة</option></select></label></div>
      <p class="muted">يحسب النظام مواعيد رسائل المراحل آليًا من تاريخ إضافة البطاقة، دون تحديد يدوي من السبونسر.</p>
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
    const card = parseLeadCard($('followupCard')?.value || '');
    const consent = !!$('followupConsent')?.checked;
    const leader = root.followupSession?.role === 'leader';
    const assigneeId = $('followupAssignee')?.value || null;
    const isNewMember = state.kind === 'new_member';
    const memberNo = $('followupMemberNo')?.value.trim() || '';
    const country = $('followupCountry')?.value.trim() || '';
    const joinDate = $('followupJoinDate')?.value || '';
    if (isNewMember && !/^[0-9]{6,15}$/.test(memberNo))
      return root.toast('أدخل رقم عضوية DXN الصحيح (6–15 رقمًا).');
    if (isNewMember && country.length < 2) return root.toast('أدخل بلد العضو الجديد.');
    if (isNewMember && (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate) ||
      !Number.isFinite(new Date(joinDate + 'T12:00:00').getTime()) ||
      new Date(joinDate + 'T12:00:00').getTime() > Date.now()))
      return root.toast('أدخل تاريخ الانضمام الفعلي للعضو الجديد.');
    if (leader && (!assigneeId || !state.assignees.some(m => m.id === assigneeId)))
      return root.toast('اختر العضو المسؤول عن هذه الحالة قبل الحفظ.');
    try {
      await root.rpc(isNewMember ? 'followup_add_new_member' : 'followup_add', {
        p_token: root.followupSession.token,
        ...(!isNewMember ? { p_kind: state.kind } : {}), p_name: name,
        p_assignee_user_id: assigneeId,
        p_phone: $('followupPhone')?.value.trim() || null,
        p_country: country || null,
        ...(!isNewMember ? { p_gender: card.gender || null,
          p_source_label: card.source || 'إحالة يدوية' } : {}),
        p_member_no: isNewMember ? memberNo : null,
        ...(isNewMember ? { p_join_date: joinDate } : {}),
        p_timezone_name: countryTimezone($('followupCountry')?.value) ||
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Baghdad',
        p_contact_channel: $('followupChannel')?.value.trim() || null,
        p_consent_confirmed: consent, p_consent_note: consent ? 'تأكيد مسؤول الحالة' : null,
        p_notes: $('followupNotes')?.value.trim() || null,
        p_next_due_at: null,
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
    state.history = [];
    const stopped = isClosed(contact);
    modal(`<div class="followup-detail"><h3>${escapeHtml(contact.name)}</h3>
      ${contact.kind === 'new_member' ? memberIdentityCard(contact) : prospectIdentityCard(contact)}
      <div class="muted">الدولة: ${escapeHtml(contact.country || '—')} · الهاتف: ${escapeHtml(contact.phone || 'لا يوجد رقم')}<br>
      المسؤول: ${escapeHtml(contact.assigned_name || '—')} · القناة: ${escapeHtml(contact.contact_channel || 'غير محددة')}<br>
      ${contact.member_no ? `رقم العضوية: ${escapeHtml(contact.member_no)} · ` : ''}
      ${contact.gender ? `الجنس: ${escapeHtml(contact.gender)} · ` : ''}
      المصدر: ${escapeHtml(contact.source_label || '—')}
      ${contact.notes ? `<div class="followup-shortnote">ملاحظة: ${escapeHtml(contact.notes)}</div>` : ''}</div>
      ${nextStepHtml(contact)}
      ${contact.kind === 'prospect' && !stopped ? `<form class="followup-status-form" onsubmit="followupCenter.convertToMember(event)">
        <h4>🤝 تحوّل المهتم إلى عضو في DXN</h4>
        <p class="muted">إذا سجّل المهتم عضوية بالفعل، انقل بطاقته إلى قسم الأعضاء الجدد فورًا، مع حفظ سجل المتابعة السابق.</p>
        <div class="followup-form-grid">
          <label>رقم عضوية DXN<input id="followupConvertMemberNo" inputmode="numeric" pattern="[0-9]{6,15}" maxlength="15" required></label>
          <label>تاريخ الانضمام الفعلي<input id="followupConvertJoinDate" type="date" required></label>
        </div>
        <button type="submit" class="primary">تحويل إلى عضو جديد</button>
      </form>` : ''}
      <h4>📑 مراحل المتابعة والرسائل المخصصة</h4>
      <p class="muted">الرسائل ظاهرة للمعاينة دائمًا. يُفتح زر النسخ وتسجيل ردة الفعل عند الموعد المحدد بعد إكمال المرحلة السابقة. لا تُرسل أي رسالة تلقائيًا.</p>
      <div id="followupStageTimeline">${stageCardsHtml(contact)}</div>
      ${!contact.consent_confirmed && !stopped ? `<form onsubmit="followupCenter.recordConsent(event)" class="followup-status-form">
        <h4>إثبات الموافقة على التواصل</h4>
        <p>لا تُفتح أي رسالة قبل إثبات الموافقة على القناة المسموح بها.</p>
        <button type="submit" class="primary">تم التحقق من الموافقة</button></form>` : ''}
      ${stopped ? '<p class="muted">توقفت هذه المتابعة، ولا يجوز نسخ الرسائل أو مواصلة الإرسال.</p>' : ''}
      <div class="followup-history"><h4>سجل المتابعة</h4><div id="followupHistory">جارٍ تحميل السجل…</div></div>
      ${contact.kind === 'new_member' && contact.origin_contact_id ?
        '<div class="followup-history"><h4>📁 سجل المتابعة السابق عندما كان مهتمًا</h4><div id="followupOriginHistory">جارٍ تحميل السجل المرتبط…</div></div>' : ''}</div>`);
    try {
      const history = await root.rpc('followup_history', { p_token: root.followupSession.token, p_contact_id: id });
      if (state.currentId !== id) return;
      state.history = Array.isArray(history) ? history : [];
      const el = root.document.getElementById('followupHistory');
      if (el) el.innerHTML = Array.isArray(history) && history.length ? history.map(h =>
        `<div class="followup-history-item"><b>${escapeHtml(h.result === 'status_updated' ?
          `${prospectStatuses[h.status_before] || 'غير محددة'} ← ${prospectStatuses[h.status_after] || 'غير محددة'}` :
          resultLabels[h.result] || h.result)}</b>
         <small>${escapeHtml(new Date(h.created_at).toLocaleString('ar-IQ'))}</small>
         <span>${escapeHtml(h.reaction_status ? `ردة الفعل: ${prospectStatuses[h.reaction_status] || h.reaction_status} · ` : '')}${escapeHtml(h.note || '')}</span></div>`).join('') : '<p class="muted">لا توجد محاولات مسجلة بعد.</p>';
      const timeline = root.document.getElementById('followupStageTimeline');
      if (timeline) timeline.innerHTML = stageCardsHtml(contact, state.history);
      if (contact.kind === 'new_member' && contact.origin_contact_id) {
        const originEl = root.document.getElementById('followupOriginHistory');
        if (originEl) {
          try {
            const oldHistory = await root.rpc('followup_history', {
              p_token: root.followupSession.token, p_contact_id: contact.origin_contact_id
            });
            if (state.currentId === id) originEl.innerHTML = Array.isArray(oldHistory) && oldHistory.length
              ? oldHistory.map(h => `<div class="followup-history-item"><b>${escapeHtml(resultLabels[h.result] || h.result)}</b>
                  <small>${escapeHtml(formatDate(h.created_at))}</small>
                  <span>${escapeHtml(h.reaction_status ? `${prospectStatuses[h.reaction_status] || h.reaction_status} — ` : '')}${escapeHtml(h.note || '')}</span></div>`).join('')
              : '<p class="muted">لا توجد إجراءات سابقة مسجلة.</p>';
          } catch (_error) { if (state.currentId === id) originEl.textContent = 'تعذر تحميل سجل المهتم السابق.'; }
        }
      }
    } catch (_error) {
      const el = root.document.getElementById('followupHistory');
      if (el) el.textContent = 'تعذر تحميل سجل المتابعة.';
    }
  }
  async function openFromNotification(id) {
    if (root.followupSession?.role !== 'leader') return;
    if (!state.loaded) await load();
    if (!state.contacts.some(c => c.id === id)) {
      root.toast('لم تعد هذه البطاقة متاحة أو ليست لديك صلاحية لعرضها.');
      return;
    }
    return open(id);
  }
  function toggleStageMembership(index) {
    const contact = state.contacts.find(c => c.id === state.currentId);
    const reaction = root.document?.getElementById(`followupReaction${index}`)?.value;
    const field = root.document?.getElementById(`followupStageMembership${index}`);
    const number = root.document?.getElementById(`followupStageMemberNo${index}`);
    const date = root.document?.getElementById(`followupStageJoinDate${index}`);
    const needsMembership = contact?.kind === 'prospect' && reaction === 'registered';
    if (field) field.hidden = !needsMembership;
    if (number) number.required = needsMembership;
    if (date) date.required = needsMembership;
  }
  async function completeStage(event, index) {
    event?.preventDefault();
    const contact = state.contacts.find(c => c.id === state.currentId);
    if (!contact || !stageReady(contact, index)) return root.toast('هذه المرحلة مغلقة حتى يحين موعدها وتُكمل المرحلة السابقة.');
    const reaction = root.document.getElementById(`followupReaction${index}`)?.value;
    if (!Object.hasOwn(prospectStatuses, reaction)) return root.toast('اختر حالة صحيحة من الحالات التسع.');
    const memberNo = root.document.getElementById(`followupStageMemberNo${index}`)?.value.trim() || '';
    const joinDate = root.document.getElementById(`followupStageJoinDate${index}`)?.value || '';
    if (contact.kind === 'prospect' && reaction === 'registered' &&
      (!/^[0-9]{6,15}$/.test(memberNo) || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate) ||
        new Date(joinDate + 'T12:00:00').getTime() > Date.now()))
      return root.toast('أدخل رقم العضوية وتاريخ الانضمام الفعلي قبل التحويل.');
    try {
      await root.rpc('followup_complete_stage', {
        p_token: root.followupSession.token, p_contact_id: contact.id, p_stage: index,
        p_reaction: reaction,
        p_note: root.document.getElementById(`followupStageNote${index}`)?.value.trim() || null,
        p_registered_member_no: contact.kind === 'prospect' && reaction === 'registered' ? memberNo : null,
        p_join_date: contact.kind === 'prospect' && reaction === 'registered' ? joinDate : null
      });
      close();
      if (contact.kind === 'prospect' && reaction === 'registered') state.kind = 'new_member';
      root.toast(reaction === 'registered' && contact.kind === 'prospect'
        ? 'انتقلت البطاقة إلى قسم الأعضاء الجدد مع حفظ تاريخها السابق.'
        : 'تم توثيق الإجراء وردة الفعل واحتساب المرحلة التالية.');
      await reload();
    } catch (error) { root.toast(error.message || 'تعذر إكمال المرحلة.'); }
  }
  async function convertToMember(event) {
    event?.preventDefault();
    const contact = state.contacts.find(c => c.id === state.currentId);
    if (!contact || contact.kind !== 'prospect' || isClosed(contact)) return root.toast('هذه البطاقة غير متاحة للتحويل.');
    const memberNo = root.document.getElementById('followupConvertMemberNo')?.value.trim() || '';
    const joinDate = root.document.getElementById('followupConvertJoinDate')?.value || '';
    if (!/^[0-9]{6,15}$/.test(memberNo) || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate) ||
        !Number.isFinite(new Date(joinDate + 'T12:00:00').getTime()) ||
        new Date(joinDate + 'T12:00:00').getTime() > Date.now())
      return root.toast('أدخل رقم العضوية وتاريخ الانضمام الفعلي.');
    try {
      await root.rpc('followup_set_prospect_status', {
        p_token: root.followupSession.token, p_contact_id: contact.id,
        p_status: 'registered', p_note: 'تحويل إلى عضو جديد بعد تسجيل عضوية DXN.',
        p_registered_member_no: memberNo, p_join_date: joinDate
      });
      close(); state.kind = 'new_member';
      root.toast('تم تحويل المهتم إلى عضو جديد وحفظ السجل السابق.'); await reload();
    } catch (error) { root.toast(error.message || 'تعذر تحويل البطاقة.'); }
  }
  async function recordConsent(event) {
    event?.preventDefault();
    const contact = state.contacts.find(c => c.id === state.currentId);
    if (!contact || isClosed(contact) || contact.consent_confirmed) return;
    try {
      await root.rpc('followup_confirm_consent', {
        p_token: root.followupSession.token, p_contact_id: contact.id
      });
      close(); root.toast('تم توثيق الموافقة وتحديث موعد المرحلة الأولى.'); await reload();
    } catch (error) { root.toast(error.message || 'تعذر إثبات الموافقة.'); }
  }
  async function copyStage(index) {
    ensureSession();
    const contact = state.contacts.find(c => c.id === state.currentId);
    if (!contact || !stageReady(contact, index)) return root.toast('زر النسخ مغلق حتى موعد هذه المرحلة.');
    try {
      await root.navigator.clipboard.writeText(template(contact, index));
      root.toast('نُسخت رسالة هذه المرحلة باسم الشخص. أرسلها يدويًا بعد مراجعتها.');
    } catch (_error) { root.toast('تعذر النسخ. تحقق من أذونات الحافظة في المتصفح.'); }
  }
  async function reload() { state.loaded = false; await load(); }
  function checkReminders() {
    ensureSession();
    const now = Date.now();
    state.contacts.forEach(c => {
      if (isClosed(c) || !c.consent_confirmed || !c.next_due_at) return;
      const due = stageDueAt(c, Number(c.stage) || 0);
      if (!due) return;
      const diff = due.getTime() - now;
      const before = Number(c.reminder_minutes || 30) * 60000;
      if (diff > before || diff < -86400000) return;
      if (diff <= 0 && state.currentId === c.id) {
        const timeline = root.document?.getElementById('followupStageTimeline');
        if (timeline && !timeline.querySelector?.('.is-ready'))
          timeline.innerHTML = stageCardsHtml(c, state.history);
      }
      const key = `${c.id}:${due.toISOString()}:${diff < 0 ? 'due' : 'before'}`;
      if (notified.has(key)) return;
      notified.add(key);
      const clock = due.toLocaleTimeString('ar-IQ', {
        hour: 'numeric', minute: '2-digit'
      });
      const message = `${c.name}: ${stageLabel(c)} — الساعة ${clock} — ${diff < 0 ? 'حان موعد المتابعة' : `تبقى ${Math.max(1, Math.ceil(diff / 60000))} دقيقة`}`;
      const action = ` — ${nextActionTypes.text}: ${template(c)}`;
      if (typeof root.toast === 'function') root.toast('🔔 ' + message + action);
      if (root.document?.hidden && root.Notification?.permission === 'granted') {
        try { new root.Notification('تذكير من مركز المتابعة', { body: message + action }); } catch (_error) { /* In-app only. */ }
      }
    });
  }
  async function pollLeaderUpdates() {
    ensureSession();
    if (leaderPolling || root.followupSession?.role !== 'leader' ||
        !root.followupSession?.token || typeof root.loadServerNotifications !== 'function') return;
    leaderPolling = true;
    try {
      await root.loadServerNotifications();
      const items = (typeof root.notificationItems === 'function' ? root.notificationItems() : [])
        .filter(n => n.event_type === 'followup_contact_added' ||
          String(n.event_type || '').startsWith('followup_action_'));
      const currentIds = new Set(items.map(n => String(n.id)));
      if (leaderNoticeInitialized) {
        const fresh = items.filter(n => !leaderNoticeIds.has(String(n.id)));
        if (fresh.length) {
          const title = fresh.length === 1 ? fresh[0].title : `لديك ${fresh.length} تحديثات جديدة في مركز المتابعة`;
          root.toast?.('🔔 ' + title);
          if (root.document?.hidden && root.Notification?.permission === 'granted') {
            try { new root.Notification('تنبيه للقائد', { body: title }); } catch (_error) { /* In-app only. */ }
          }
          if (root.followupSession.tab === 'followup') await reload();
        }
      }
      leaderNoticeInitialized = true;
      leaderNoticeIds = currentIds;
    } catch (_error) { /* The leader can use manual refresh if offline. */ }
    finally { leaderPolling = false; }
  }
  function enableDeviceReminders() {
    if (!root.Notification || typeof root.Notification.requestPermission !== 'function')
      return root.toast('تنبيهات الجهاز غير متاحة في هذا المتصفح.');
    root.Notification.requestPermission().then(permission =>
      root.toast(permission === 'granted' ? 'تم السماح بالتنبيهات أثناء فتح الموقع.' : 'ستبقى التذكيرات داخل الموقع.')
    );
  }

  root.followupCenter = { render, load, reload, changeKind, changeFilter, changeStatusFilter, searchInput,
    leaderSearchInput, leaderSetKind, leaderSetAssignee, leaderSetStatus, leaderMore, openFromNotification,
    add, searchAssignees, fillFromCard, save, open, close, recordConsent,
    toggleStageMembership, completeStage, convertToMember, copyStage,
    parseLeadCard, stageLabel, enableDeviceReminders };
  if (root.document && typeof root.setInterval === 'function') root.setInterval(checkReminders, 60000);
  if (root.document && typeof root.setInterval === 'function') root.setInterval(pollLeaderUpdates, 60000);
  if (typeof module !== 'undefined' && module.exports)
    module.exports = { parseLeadCard, stageLabel, template, escapeHtml, prospectStages, memberStages,
      prospectStatuses, prospectStatusLabel, nextActionTypes, stageDueAt, stageReady, stageCardsHtml };
})(typeof window !== 'undefined' ? window : globalThis);
