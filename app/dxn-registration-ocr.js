/*
 * DXN registration screenshot reader for the leader's existing manual DXN form.
 * Runs recognition in the browser; the screenshot is never sent to the DXN
 * registry endpoint. Only the already-supported fields are submitted there.
 */
(function () {
  'use strict';

  var OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  var scriptPromise = null;
  var currentObjectURL = null;
  var busy = false;
  var modalGeneration = 0;

  function cleanedLine(line) {
    return String(line || '').normalize('NFKC')
      .replace(/[٠-٩]/g, function (digit) { return String(digit.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (digit) { return String(digit.charCodeAt(0) - 0x6f0); })
      .replace(/[\u200e\u200f]/g, '').trim();
  }

  function extractCodes(line) {
    return Array.from(String(line || '').matchAll(/(?:^|[^\d])([0-9]{9})(?!\d)/g), function (m) { return m[1]; });
  }

  function upperName(line) {
    // Latin names on DXN's success screen are uppercase. Ignore OCR noise from Arabic labels.
    var match = String(line || '').match(/(?:^|\s)([A-Z][A-Z'-]{1,}(?:\s+[A-Z][A-Z'-]{1,}){1,7})(?=\s|$)/);
    if (!match) return '';
    var result = match[1].trim().replace(/\s+/g, ' ');
    return result.length >= 5 && result.length <= 140 ? result : '';
  }

  function arabicName(line) {
    // The Arabic UI puts labels and the actual name on the same line. Strip
    // known labels, but preserve the spelling and word order in the name.
    var value = String(line || '')
      .replace(/(?:اسم|إسم|الاسم)\s*(?:العضو|الراعي|الدليل)/g, ' ')
      .replace(/(?:الراعي|العضو|الدليل)\s*(?:اسم|إسم|الاسم)/g, ' ')
      .replace(/(?:رقم|رمز)\s*(?:العضو|الراعي|الدليل)/g, ' ')
      .replace(/الراعي\s*أو\s*الدليل/g, ' ')
      .replace(/(?:^|\s)(?:اسم|إسم|الاسم|العضو|الراعي|الدليل|أو|رقم|رمز)(?=\s|$)/g, ' ')
      .replace(/[0-9@._%+\-]/g, ' ')
      .replace(/[^\u0621-\u064a\u0671-\u06d3\s]/g, ' ')
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/\s+/g, ' ').trim();
    var words = value.split(' ').filter(Boolean);
    if (words.length < 2 || words.length > 9 || value.length < 5 || value.length > 140) return '';
    if (/(?:تم التسجيل|التسجيل بنجاح|رسالة تفعيل|البريد الإلكتروني|صندوق الوارد|لقد أرسلنا|الدخول إلى)/.test(value)) return '';
    return value;
  }

  function findNextName(lines, index) {
    for (var i = index + 1; i < Math.min(lines.length, index + 4); i++) {
      if (extractCodes(lines[i]).length) break;
      var arabic = arabicName(lines[i]);
      if (arabic) return arabic;
      var name = upperName(lines[i]);
      if (name && !name.includes('GMAIL') && !name.includes('EMAIL')) return name;
    }
    return '';
  }

  function parseSuccessText(rawText) {
    var lines = String(rawText || '').split(/\r?\n/).map(cleanedLine).filter(Boolean);
    var codeRows = [];
    lines.forEach(function (line, index) {
      extractCodes(line).forEach(function (code) { codeRows.push({code: code, index: index}); });
    });
    var memberCode = codeRows[0] ? codeRows[0].code : '';
    var sponsorCode = codeRows[1] ? codeRows[1].code : '';
    var memberName = codeRows[0] ? findNextName(lines, codeRows[0].index) : '';
    var sponsorName = codeRows[1] ? findNextName(lines, codeRows[1].index) : '';
    var emailMatch = String(rawText || '').match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
    return {
      memberCode: memberCode,
      memberName: memberName,
      sponsorCode: sponsorCode,
      sponsorName: sponsorName,
      email: emailMatch ? emailMatch[0] : '',
      needsReview: !memberCode || !memberName || !sponsorCode || !sponsorName,
      lines: lines.length
    };
  }

  function fileMime(fileBytes) {
    if (fileBytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every(function (x, i) { return fileBytes[i] === x; })) return 'image/png';
    if (fileBytes.length >= 3 && fileBytes[0] === 255 && fileBytes[1] === 216 && fileBytes[2] === 255) return 'image/jpeg';
    if (fileBytes.length >= 12 && String.fromCharCode.apply(null, Array.from(fileBytes.slice(0, 4))) === 'RIFF' && String.fromCharCode.apply(null, Array.from(fileBytes.slice(8, 12))) === 'WEBP') return 'image/webp';
    return null;
  }

  async function validatePhoto(file) {
    if (!file || !file.size || file.size > MAX_IMAGE_BYTES) throw new Error('اختر صورة واضحة لا يزيد حجمها عن 8 ميغابايت.');
    var mime = fileMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if (!mime) throw new Error('الصيغ المدعومة: PNG وJPG وWebP فقط.');
  }

  function ensureLibrary() {
    if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = OCR_SCRIPT;
      script.async = true;
      script.onload = function () {
        if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') resolve();
        else reject(new Error('لم يتم تحميل محرك قراءة الصور.'));
      };
      script.onerror = function () { reject(new Error('تعذر تحميل محرك التعرف على النصوص. تأكد من اتصال الإنترنت.')); };
      document.head.appendChild(script);
    }).catch(function (err) { scriptPromise = null; throw err; });
    return scriptPromise;
  }

  function status(message, error) {
    var node = document.getElementById('dxnOcrStatus');
    if (!node) return;
    node.textContent = message;
    node.style.color = error ? '#a32318' : '#315e53';
  }

  function setReviewText(id, title, value, warning) {
    var node = document.getElementById(id);
    if (!node) return;
    node.textContent = title + ': ' + (value || 'لم يتم التعرف عليها — أدخلها يدوياً') + (warning ? ' (راجعها في الصورة)' : '');
  }

  function fillFromImage(result) {
    var memberNo = document.getElementById('manualDxnMemberNo');
    var memberName = document.getElementById('manualDxnMemberName');
    var sponsorNo = document.getElementById('manualDxnSponsorNo');
    if (!memberNo || !memberName || !sponsorNo) return;
    if (result.memberCode) memberNo.value = result.memberCode;
    if (result.memberName) memberName.value = result.memberName;
    if (result.sponsorCode) sponsorNo.value = result.sponsorCode;
    setReviewText('dxnOcrSponsorName', 'اسم الراعي الظاهر في الصورة', result.sponsorName, false);
    setReviewText('dxnOcrEmail', 'البريد الإلكتروني (للمراجعة فقط)', result.email, true);
    var review = document.getElementById('dxnOcrReviewed');
    if (review) { review.checked = false; review.disabled = false; }
    var reviewBox = document.getElementById('dxnOcrReview');
    if (reviewBox) reviewBox.hidden = false;
    if (result.sponsorCode && typeof window.lookupManualDxnSponsor === 'function') {
      window.lookupManualDxnSponsor();
    }
  }

  async function onPhotoSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file || busy || !document.getElementById('manualDxnMemberModal')) return;
    var generation = modalGeneration;
    busy = true;
    var choose = document.getElementById('dxnOcrChoose');
    if (choose) choose.disabled = true;
    try {
      await validatePhoto(file);
      if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = URL.createObjectURL(file);
      var preview = document.getElementById('dxnOcrPreview');
      if (preview) { preview.src = currentObjectURL; preview.hidden = false; }
      status('جارٍ تجهيز محرك القراءة على جهازك. قد يستغرق أول تشغيل وقتاً أطول...');
      await ensureLibrary();
      // DXN registration confirmations may contain names in Arabic or Latin.
      // Loading both models avoids transliterating Arabic names into gibberish.
      var worker = await window.Tesseract.createWorker(['eng', 'ara']);
      var result;
      try {
        status('جارٍ استخراج الأسماء العربية والإنجليزية وأرقام العضوية من الصورة...');
        result = await worker.recognize(file);
      } finally {
        await worker.terminate();
      }
      if (generation !== modalGeneration || !document.getElementById('manualDxnMemberModal')) return;
      var parsed = parseSuccessText(result && result.data && result.data.text);
      fillFromImage(parsed);
      status(parsed.needsReview
        ? 'تمت القراءة جزئياً. أدخل أي اسم أو رقم لم يُقرأ بدقة من الصورة، ولا تحفظ قبل مطابقة الاسم حرفياً.'
        : 'تم استخراج البيانات الأساسية بالعربية أو الإنجليزية. طابق الاسم حرفياً مع الصورة قبل تأكيد الحفظ.');
    } catch (err) {
      status(err && err.message ? err.message : 'تعذر تحليل الصورة. يمكنك إدخال البيانات يدوياً.', true);
    } finally {
      busy = false;
      if (choose) choose.disabled = false;
      event.target.value = '';
    }
  }

  function clearPreview() {
    if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }

  function mountFormAddon() {
    var memberNo = document.getElementById('manualDxnMemberNo');
    if (!memberNo || document.getElementById('dxnOcrPanel')) return;
    var section = document.createElement('section');
    section.id = 'dxnOcrPanel';
    section.style.cssText = 'border:1px solid #b9e0cb;background:#f0faf3;border-radius:15px;padding:13px;margin:0 0 16px;text-align:right';
    section.innerHTML =
      '<strong style="color:#11533f">📷 إدخال بيانات العضوية من صورة نجاح التسجيل</strong>' +
      '<p class="muted" style="margin:5px 0 10px">اختر صورة تأكيد التسجيل من DXN. تُقرأ على جهازك دون رفعها إلى الخادم، ثم تراجع المعلومات قبل الحفظ.</p>' +
      '<input type="file" id="dxnOcrFile" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" style="display:none">' +
      '<button type="button" id="dxnOcrChoose" style="background:#0f513f;color:white;padding:10px 14px;border-radius:10px">📷 اختيار صورة التسجيل</button>' +
      '<div id="dxnOcrStatus" role="status" aria-live="polite" class="muted" style="margin:9px 0">يمكنك الاستمرار بالإدخال اليدوي إذا لم تتوفر صورة واضحة.</div>' +
      '<img id="dxnOcrPreview" alt="صورة نجاح التسجيل للمراجعة" hidden style="max-width:100%;max-height:250px;object-fit:contain;border:1px solid #d3e4d8;border-radius:10px;background:white">' +
      '<div id="dxnOcrReview" hidden style="margin-top:10px">' +
        '<div id="dxnOcrSponsorName" class="muted"></div>' +
        '<div id="dxnOcrEmail" class="muted"></div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin:11px 0 2px;font-weight:700">' +
          '<input id="dxnOcrReviewed" type="checkbox" style="width:18px;height:18px;min-height:18px"> طابقت كتابة اسم العضو كما في الصورة، وراجعت رقمي العضوية والراعي وتاريخ الانضمام قبل الحفظ' +
        '</label>' +
        '<p class="muted" style="margin:5px 0 0">البريد المعروض لا يُرسل إلى سجل DXN، وصورة التسجيل لا تُحفظ فيه. يمكن إرفاقها لاحقاً في «مفاتيح العضوية».</p>' +
      '</div>';
    memberNo.parentElement.insertBefore(section, memberNo.parentElement.firstChild);
    section.querySelector('#dxnOcrChoose').addEventListener('click', function () { section.querySelector('#dxnOcrFile').click(); });
    section.querySelector('#dxnOcrFile').addEventListener('change', onPhotoSelected);
  }

  function install() {
    if (typeof window.openManualDxnMemberModal !== 'function' || typeof window.saveManualDxnMember !== 'function') return;
    var originalOpen = window.openManualDxnMemberModal;
    var originalSave = window.saveManualDxnMember;
    var originalClose = window.closeManualDxnMemberModal;
    window.openManualDxnMemberModal = function () {
      var result = originalOpen.apply(this, arguments);
      modalGeneration++;
      mountFormAddon();
      return result;
    };
    window.saveManualDxnMember = function () {
      if (busy) {
        if (typeof window.toast === 'function') window.toast('انتظر اكتمال قراءة الصورة قبل حفظ العضو.');
        return;
      }
      var reviewBox = document.getElementById('dxnOcrReview');
      var reviewed = document.getElementById('dxnOcrReviewed');
      if (reviewBox && !reviewBox.hidden && reviewed && !reviewed.checked) {
        if (typeof window.toast === 'function') window.toast('راجع بيانات الصورة وحدد مربع التأكيد قبل حفظ العضو.');
        else status('راجع بيانات الصورة وحدد مربع التأكيد قبل حفظ العضو.', true);
        return;
      }
      return originalSave.apply(this, arguments);
    };
    window.closeManualDxnMemberModal = function () {
      modalGeneration++;
      clearPreview();
      return originalClose.apply(this, arguments);
    };
  }

  // For deterministic parser tests without OCR network access.
  window.DXNRegistrationOCR = {parseSuccessText: parseSuccessText, validatePhoto: validatePhoto};
  install();
})();
