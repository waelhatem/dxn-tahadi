const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ryqpstkzppaifpvhezzn.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.AI_AGENT_GRADING_MODEL || process.env.AI_AGENT_HELPER_MODEL || 'gpt-5-nano';
const WEBHOOK_SECRET = String(process.env.GOOGLE_FORM_WEBHOOK_SECRET || '').trim();

const REFERENCE_ANSWERS = [
  {
    question: 'ماهي ال4 نصائح للاستفادة القصوى من الحقيبة التدريبية ؟',
    answer: 'النصيحة الأولى: التدرج في سماع المادة التدريبية بحسب تسلسل الحقيبة لأن المعلومات فيها متسلسلة بشكل تصاعدي. النصيحة الثانية: المادة المعروضة مختصرة لتناسب العضو الجديد، وهناك شروحات مفصلة يمكن الاستعانة بها لاحقًا لمن يحب الاستزادة. النصيحة الثالثة: عند صعوبة فهم معلومة معينة يرجع العضو إلى الشخص الذي سجله ضمن المشروع. النصيحة الرابعة: الجلوس في مكان هادئ وبعيد عن المشتتات عند سماع الحقيبة.'
  },
  {
    question: 'ماهي المشاريع الذكية وماهي صفاتها ؟',
    answer: 'هي مشاريع تعتمد على فكرة ذكية من صاحبها، وبعضها لا يحتاج إلى رأس مال، ويحدد صاحبها الوقت والمكان المناسبين للعمل دون أن يحددهما الآخرون، ويمكن أن تحقق دخلًا أثناء عدم العمل. ويمكن العمل فيها من الهاتف ضمن مشروع لا يتعارض مع الالتزامات الأخرى وليس فيه اشتراطات معقدة.'
  },
  {
    question: 'ما هو البيع المباشر نظام شركة دي اكس ان وماهي مزاياه ؟',
    answer: 'البيع المباشر هو عملية بيع المنتج من المصنع إلى المستهلك مباشرة، الذي تطلق عليه تسمية الموزع، دون تدخل تاجر وسيط كتجار التجزئة، وغالبًا من خلال الدعاية الشفهية وإدارة العملية عبر السيستم. ومن مزاياه: زيادة الدخل، المرونة في العمل، أن تكون مدير نفسك، وبناء علاقات عابرة للقارات.'
  },
  {
    question: 'الفرق بين البيع المباشر والبيع التقليدي ؟',
    answer: 'في البيع التقليدي يمر المنتج عبر مراحل الوساطة والدعاية والإعلان، مثل الشركة المصنعة ثم الوكيل الإقليمي ثم وكيل الدولة ثم موزع الجملة ثم التاجر ثم المستهلك. أما البيع المباشر فيزيل الوسطاء بين المصنع والمستهلك ويتيح العمل فيه بغض النظر عن الشهادة أو الخبرة، ويعرض المصدر أنه بدون رأس مال وبنسبة مخاطرة 0%.'
  },
  {
    question: 'ماهي عناصر قوة شركة دي اكس ان ؟',
    answer: 'شركة حقيقية عالمية تجاوز عمرها 30 عامًا، منتشرة رسميًا في أكثر من 80 دولة ويعمل معها أكثر من 18 مليون عضو، وتمتلك مزارع ومصانع في عدد من دول العالم وتقوم بزراعة وصناعة المنتجات وتوزيعها في أكثر من 180 بلدًا، وفق المادة التدريبية.'
  },
  {
    question: 'ماهي اصناف منتجات دي اكس ان ؟',
    answer: 'أربعة أصناف: المأكولات الغذائية الطبيعية، المشروبات والعصائر الطبيعية، منتجات العناية الشخصية، ومنتجات العناية بالبشرة والتجميل.'
  },
  {
    question: 'ماهي مميزات العمل مع دي اكس ان ؟',
    answer: 'عضوية مجانية عالمية، سيستم إلكتروني يدير العملية التسويقية، نظام ربح عالمي وليس محليًا فقط، نظام توريث للأولاد، وتدريبات شخصية وعملية مجانية للبدء بالمشروع.'
  },
  {
    question: 'ماهي طرق الربح من دي اكس ان للاستفادة المالية ؟',
    answer: 'ثلاث طرق: الاستهلاك الشخصي، البيع بالتجزئة، وبناء فريق مبيعات.'
  },
  {
    question: 'ماهي مميزات منتجات دي اكس ان ؟',
    answer: 'منتجات طبيعية وعضوية ذات جودة عالية وحاصلة على شهادات عالمية بهذا الخصوص، وتقدم قيمة حقيقية للمستهلك، ومتنوعة وتغطي أغلب حاجات الاستهلاك اليومي مثل القهوة والشاي والشامبو والصابون ومعجون الأسنان والزيوت والكريمات، وفق المادة التدريبية.'
  },
  {
    question: 'ماهو الفرق بين الPV و الSV ؟',
    answer: 'PV هو VALLU POINT أي القيمة النقطية للمنتج، وSV هو VALLU SALES أي القيمة الربحية للمنتج بحسب صياغة المادة. كل منتج يحتوي على PV وSV، وبقدر تحقيق المبيعات ترتفع النقاط وترتفع معها نسبة العمولة والأرباح.'
  },
  {
    question: 'كيف تصل في الدي اكس ان الى مرتبة النجم ثم الياقوتي ثم الماسي ؟',
    answer: 'عند بلوغ 4500 نقطة تراكمية يصل العضو إلى رتبة الوكيل النجم وتتراوح النسبة بين 21% و25% في المادة. ثم عند وصول ثلاثة أعضاء في خطوط أفقية مختلفة إلى رتبة الوكيل النجم، يصبح العضو نجمًا ياقوتيًا بنسبة 31%. وعند وصول ستة أعضاء في خطوط أفقية مختلفة إلى رتبة الوكيل النجم، يصبح نجمًا ماسيًا بنسبة 37%.'
  },
  {
    question: 'ماهي خطوات العمل الاحترافي للنجاح مع دي اكس ان ؟',
    answer: 'الخطوات العشر في المادة: الانضمام للعضوية وتفعيلها بتحقيق مبيعات بمقدار 100 نقطة تقريبًا، استخدام بعض المنتجات، التعلم قبل الكلام ومعرفة الشركة والمنتجات والخطة المالية، كتابة قائمة المعارف وتصنيفها إلى سوق بارد ودافئ ثم السوشيال ميديا، وضع خطة للاستقطاب، عرض العمل بشكل احترافي أو الاستعانة بالسبونسر، تسجيل الراغبين وتعريفهم بمزايا العضوية وقوة الفرصة، المتابعة الصحيحة للشركاء، الاستنساخ والمضاعفة، ثم تدريب الفريق على نفس الخطوات.'
  }
];

function json(res, status, body) {
  return res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of (Array.isArray(data?.output) ? data.output : [])) {
    for (const part of (Array.isArray(item?.content) ? item.content : [])) {
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
  }
  return parts.join('').trim();
}

async function gradeOne(item, reference) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        'أنت مقيّم لاختبار الحقيبة التدريبية المعتمد.',
        'قيّم فهم المتدرب مقارنة بالإجابة المرجعية المرفقة، وليس التطابق الحرفي.',
        'اقبل الصياغة المختلفة إذا تضمنت المعنى الأساسي الصحيح.',
        'لا تخترع عناصر غير موجودة في الإجابة المرجعية.',
        'الدرجة من 0 إلى 100.',
        '60 فأعلى = approved، وأقل من 60 = retry.',
        'أعط ملاحظة عربية قصيرة توضح ما أصابه المتدرب وما يحتاج إلى تحسينه.'
      ].join('\n'),
      input: `السؤال:
${reference.question}

الإجابة المرجعية:
${reference.answer}

إجابة العضو:
${item.answer}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'external_training_grade',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              status: { type: 'string', enum: ['approved', 'retry'] },
              note: { type: 'string', minLength: 1, maxLength: 500 }
            },
            required: ['score', 'status', 'note'],
            additionalProperties: false
          }
        }
      },
      max_output_tokens: 220
    })
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) throw new Error(data?.error?.message || text || `OpenAI HTTP ${response.status}`);
  const out = extractOutputText(data);
  if (!out) throw new Error('لم يرجع التقييم نصًا');
  const grade = JSON.parse(out);
  const score = Math.max(0, Math.min(100, Number(grade.score || 0)));
  return { score, status: score >= 60 ? 'approved' : 'retry', note: String(grade.note || '').trim() };
}

async function saveSubmission(payload, report) {
  if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY غير مضبوط في Vercel');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/external_training_assessment_submissions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      form_id: payload.formId,
      sponsor_email: payload.sponsorEmail,
      member_name: payload.memberName,
      membership_number: payload.membershipNumber,
      submitted_at: payload.submittedAt || new Date().toISOString(),
      answers: payload.answers,
      report
    })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `Supabase HTTP ${r.status}`);
  try { return text ? JSON.parse(text) : null; } catch (_) { return text; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!OPENAI_API_KEY) return json(res, 503, { error: 'OPENAI_API_KEY غير مضبوط في Vercel' });
  if (!SUPABASE_SECRET_KEY) return json(res, 503, { error: 'SUPABASE_SECRET_KEY غير مضبوط في Vercel' });
  if (!WEBHOOK_SECRET) return json(res, 503, { error: 'GOOGLE_FORM_WEBHOOK_SECRET غير مضبوط في Vercel' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const secret = String(req.headers['x-google-form-secret'] || body.webhookSecret || '').trim();
    if (secret !== WEBHOOK_SECRET) return json(res, 401, { error: 'Unauthorized' });

    const formId = String(body.formId || '').trim();
    const sponsorEmail = String(body.sponsorEmail || '').trim();
    const memberName = String(body.memberName || '').trim();
    const membershipNumber = String(body.membershipNumber || '').trim();
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!formId || !sponsorEmail || !memberName || !membershipNumber || answers.length !== REFERENCE_ANSWERS.length) {
      return json(res, 400, { error: 'بيانات اختبار Google Form ناقصة أو غير مكتملة' });
    }

    const results = [];
    for (let i = 0; i < REFERENCE_ANSWERS.length; i++) {
      const item = answers[i] || {};
      const answer = String(item.answer || '').trim();
      if (!answer) throw new Error(`الإجابة عن السؤال ${i + 1} فارغة`);
      const grade = await gradeOne({ answer }, REFERENCE_ANSWERS[i]);
      results.push({
        questionNo: i + 1,
        question: REFERENCE_ANSWERS[i].question,
        answer,
        score: grade.score,
        status: grade.status,
        note: grade.note
      });
    }

    const totalScore = Math.round(results.reduce((sum, x) => sum + x.score, 0) / results.length);
    const approvedCount = results.filter(x => x.status === 'approved').length;
    const report = {
      totalScore,
      totalQuestions: results.length,
      approvedCount,
      retryCount: results.length - approvedCount,
      overallStatus: results.every(x => x.status === 'approved') ? 'approved' : 'retry',
      results
    };

    const saved = await saveSubmission(body, report);

    return json(res, 200, {
      ok: true,
      sponsorEmail,
      memberName,
      membershipNumber,
      report,
      saved
    });
  } catch (error) {
    console.error('google-form-submit error:', error);
    return json(res, 500, { error: String(error?.message || error) });
  }
};
