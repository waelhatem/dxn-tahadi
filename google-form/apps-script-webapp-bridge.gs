/**
 * Google Apps Script Web App bridge for the DXN training assessment.
 *
 * Add this function to the SAME Apps Script project that already contains:
 *   - createSponsorTrainingForm(sponsorEmail)
 *   - getSponsorFormInfo(formId)
 *   - the SPONSOR_<formId> Script Properties
 *
 * Then deploy the project as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The Vercel endpoint calls:
 *   ?action=sponsor_form&email=sponsor@example.com
 */
function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim();
    const email = String((e && e.parameter && e.parameter.email) || '').trim();

    if (action !== 'sponsor_form') {
      return jsonOutput_({ ok: false, error: 'Invalid action.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonOutput_({ ok: false, error: 'بريد الراعي غير صالح.' });
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

    return jsonOutput_({
      ok: true,
      formId: formId,
      sponsorEmail: email,
      memberUrl: form.getPublishedUrl()
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: String(error && error.message || error)
    });
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
