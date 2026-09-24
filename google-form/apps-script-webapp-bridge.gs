/**
 * Google Apps Script Web App bridge for the DXN training assessment.
 *
 * Add this function to the SAME Apps Script project that already contains:
 *   - createSponsorTrainingForm(sponsorEmail)
 *   - getSponsorFormInfo(formId) (if used)
 *   - the SPONSOR_<formId> Script Properties
 *
 * The bridge returns either:
 *   1) the normal sponsor Form URL (leader/test mode), or
 *   2) a member-specific prefilled URL containing the logged-in member's
 *      name and membership number.
 *
 * The membership number is only prefilled into Google Form so it can be
 * recorded with the submission. Sponsor identity remains tied to the Form ID.
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || '').trim();
    const email = String(p.email || '').trim();
    const memberName = String(p.memberName || '').trim();
    const membershipNumber = String(p.membershipNumber || '').trim().replace(/[\s-]+/g, '');

    if (action !== 'sponsor_form') {
      return jsonOutput_({ ok: false, error: 'Invalid action.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonOutput_({ ok: false, error: 'بريد الراعي غير صالح.' });
    }

    const hasMemberIdentity = Boolean(memberName || membershipNumber);
    if (hasMemberIdentity && (!memberName || !/^\d{9}$/.test(membershipNumber))) {
      return jsonOutput_({ ok: false, error: 'بيانات العضو غير مكتملة أو رقم العضوية غير صالح.' });
    }

    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();

    // Reuse an existing sponsor-specific Form when one already exists.
    let formId = '';
    Object.keys(all).some(function(key) {
      if (key.indexOf('SPONSOR_') !== 0) return false;
      const savedEmail = String(all[key] || '').trim().toLowerCase();
      if (savedEmail === email.toLowerCase()) {
        formId = key.replace('SPONSOR_', '');
        return true;
      }
      return false;
    });

    // Create the sponsor-specific Form only when needed.
    if (!formId) {
      const created = createSponsorTrainingForm(email);
      formId = String(created && created.formId || '').trim();
    }

    if (!formId) {
      throw new Error('تعذر إنشاء أو العثور على نموذج الراعي.');
    }

    const form = FormApp.openById(formId);
    let memberUrl = form.getPublishedUrl();

    if (hasMemberIdentity) {
      memberUrl = createMemberPrefilledUrl_(form, memberName, membershipNumber);
    }

    return jsonOutput_({
      ok: true,
      formId: formId,
      sponsorEmail: email,
      memberUrl: memberUrl,
      prefilledMember: hasMemberIdentity
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: String(error && error.message || error)
    });
  }
}

/**
 * Build a unique Google Forms prefilled URL for the current logged-in member.
 * This does NOT submit anything; it only fills the two identity fields.
 */
function createMemberPrefilledUrl_(form, memberName, membershipNumber) {
  const items = form.getItems(FormApp.ItemType.TEXT);
  let nameItem = null;
  let numberItem = null;

  items.forEach(function(item) {
    const title = String(item.getTitle() || '').trim();
    if (title === 'اسم العضو الكامل') nameItem = item.asTextItem();
    if (title === 'رقم العضوية') numberItem = item.asTextItem();
  });

  if (!nameItem || !numberItem) {
    throw new Error('لم يتم العثور على حقلي اسم العضو ورقم العضوية في نموذج الراعي.');
  }

  const response = form.createResponse();
  response.withItemResponse(nameItem.createResponse(memberName));
  response.withItemResponse(numberItem.createResponse(membershipNumber));

  return response.toPrefilledUrl();
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
