/* Ragwan Success Plan — Google Forms quiz helpers.
 * Copy this whole file as RagwanQuiz.gs into the existing Apps Script project
 * next to Code.gs, then run upgradeRagwanSponsorQuizzesBatch manually.
 * Warning: Google Forms' "Release grades" must be set to
 * "Immediately after each submission" in Settings > Quizzes.
 */
const RAGWAN_STEP4_MCQ_BANK = [
  {
    "correct": 2,
    "options": [
      "مشاهدة الدروس بترتيب عشوائي، وتجاوز غير المفهوم، وحفظ المصطلحات، وتكرار الاختبار فقط.",
      "الاكتفاء بملخص مكتوب، والتسجيل السريع، والسؤال في مواقع التواصل، وتجنب المراجعة.",
      "سماع المادة بالتسلسل، والاستفادة من الشروحات المفصلة، والرجوع لمن سجّلك عند الحاجة، والجلوس بعيدًا عن المشتتات.",
      "مشاهدة الجزء الأخير أولًا، والتركيز على الأرباح، وتجاهل الأسئلة، وعدم طلب المساعدة."
    ]
  },
  {
    "correct": 0,
    "options": [
      "مشاريع تستند إلى فكرة قابلة للتنفيذ بمرونة في الوقت والمكان، وقد لا تتطلب رأس مال كبيرًا ويمكن إدارتها من الهاتف.",
      "مشاريع لا تُدار إلا من مقر ثابت وتحتاج إلى حضور يومي ورأس مال كبير.",
      "مشاريع لا تعتمد على فكرة واضحة بل على شراء البضائع وتخزينها بكميات كبيرة.",
      "مشاريع لا تسمح بالتوفيق بين العمل والالتزامات العائلية وتفرض ساعات محددة."
    ]
  },
  {
    "correct": 3,
    "options": [
      "نقل البضائع من المصنع إلى عدة تجار جملة وتجزئة قبل بيعها للمستهلك.",
      "التسويق الذي يعتمد حصرًا على فتح محل تجاري وشراء مخزون من المورد.",
      "بيع الخدمات الحكومية للمستهلك عبر مناقصات ووسطاء.",
      "انتقال المنتجات من الشركة إلى المستهلك/الموزع دون سلسلة الوسطاء التقليدية، مع المرونة والدعاية الشفهية وبناء العلاقات."
    ]
  },
  {
    "correct": 1,
    "options": [
      "البيع المباشر يزيد حلقات الوساطة، بينما التقليدي يلغيها.",
      "البيع التقليدي يمر بمراحل ووسطاء، بينما البيع المباشر يقلل الوساطة بين الشركة والمستهلك.",
      "لا يوجد فرق في قنوات التوزيع بين النظامين.",
      "البيع التقليدي لا يحتاج إلى محل أو تاجر، والبيع المباشر يشترط متجرًا ثابتًا."
    ]
  },
  {
    "correct": 1,
    "options": [
      "اعتماد الشركة على متجر محلي واحد ومنتج واحد دون مزارع أو مصانع.",
      "الانتشار العالمي وطول الخبرة ووجود مزارع ومصانع ومنتجات وشبكة توزيع، كما تشرح الحقيبة.",
      "الاعتماد الكامل على وسطاء خارجيين من دون إنتاج خاص بالشركة.",
      "حصر نشاط الشركة في التدريب النظري دون منتجات فعلية."
    ]
  },
  {
    "correct": 2,
    "options": [
      "الأجهزة الإلكترونية، الأثاث، السيارات، العقارات.",
      "الملابس والأحذية والأجهزة المنزلية والأدوات المكتبية.",
      "الأغذية الطبيعية، المشروبات والعصائر، العناية الشخصية، والعناية بالبشرة والتجميل.",
      "الأدوية الموصوفة والجراحة والأجهزة الطبية والنقل."
    ]
  },
  {
    "correct": 0,
    "options": [
      "العضوية العالمية، النظام الإلكتروني، إمكانية تحقيق دخل وفق الخطة، التوريث، وتدريبات البدء المجانية بحسب الحقيبة.",
      "اشتراط شهادة جامعية ومقر تجاري ورسوم عضوية شهرية ثابتة.",
      "عدم وجود نظام إلكتروني أو مواد تدريبية، والاعتماد على البيع داخل مدينة واحدة.",
      "العمل بساعات إلزامية ومرتب ثابت لا علاقة له بالنشاط."
    ]
  },
  {
    "correct": 3,
    "options": [
      "الاقتراض البنكي وشراء أسهم الشركة وتحصيل الإيجارات.",
      "العمل الحكومي وتداول العملات وشراء عقارات.",
      "الاكتفاء بالبيع للمخازن وإدارة منافذ التوزيع فقط.",
      "الاستهلاك الشخصي، والبيع بالتجزئة، وبناء فريق مبيعات."
    ]
  },
  {
    "correct": 2,
    "options": [
      "أن جميع المنتجات تنتمي إلى صنف واحد وموجهة للاستخدام الصناعي فقط.",
      "أن المنتجات تُباع دون معلومات عن الاستخدام أو تنوع يلبي الحاجات.",
      "التنوع في المنتجات الاستهلاكية اليومية والتركيز على الجودة والقيمة للمستهلك كما توضح المادة.",
      "أن منتجات الشركة مقتصرة على الأدوات الإلكترونية وقطع الغيار."
    ]
  },
  {
    "correct": 1,
    "options": [
      "PV هو سعر البيع النقدي وSV هو رقم العضوية.",
      "PV القيمة النقطية للمنتج، وSV قيمة المبيعات/القيمة الربحية المرتبطة به وفق شرح الحقيبة.",
      "PV هو عدد أعضاء الفريق وSV هو تاريخ التسجيل.",
      "PV هو نسبة الخصم وSV هو رقم الفرع."
    ]
  },
  {
    "correct": 3,
    "options": [
      "450 نقطة للوكيل النجم، ثم خط واحد للياقوتي وخطان للماسي.",
      "4500 نقطة في شهر واحد شرط وحيد للوصول إلى الماسي.",
      "4500 نقطة للوكيل النجم، ثم ستة خطوط للياقوتي وثلاثة للماسي.",
      "4500 نقطة تراكمية للوكيل النجم، ثم ثلاثة وكلاء نجوم بخطوط مختلفة للياقوتي، وستة بخطوط مختلفة للماسي حسب الحقيبة."
    ]
  },
  {
    "correct": 0,
    "options": [
      "الانضمام والتفعيل، استخدام المنتجات، التعلم، إعداد قائمة الأسماء، خطة الاستقطاب، عرض الفرصة، تسجيل المهتمين، المتابعة، الاستنساخ، وتدريب الفريق.",
      "التسجيل ثم انتظار الأرباح دون استهلاك أو تعلّم أو متابعة.",
      "شراء كميات كبيرة ثم فتح متجر، دون الحاجة إلى تدريب الفريق.",
      "كتابة الأهداف فقط ثم ترك بناء العلاقات والتسجيل والتدريب."
    ]
  }
];
function ragwanQuizTitle(q){return q.number + ') ' + q.title;}
function ragwanQuizPoints(i){return i<4?9:8;}
function addRagwanMultipleChoiceItems(form){
  if(!form.isQuiz())throw new Error('يجب تفعيل Quiz أولًا.');
  if(TRAINING_QUESTIONS.length!==12||RAGWAN_STEP4_MCQ_BANK.length!==12)throw new Error('عدد أسئلة الحقيبة غير مطابق.');
  TRAINING_QUESTIONS.forEach(function(q,i){
    const cfg=RAGWAN_STEP4_MCQ_BANK[i];
    if(cfg.options.length!==4||new Set(cfg.options).size!==4||
      !Number.isInteger(cfg.correct)||cfg.correct<0||cfg.correct>3)throw new Error('الخيارات غير صحيحة في السؤال '+(i+1));
    const item=form.addMultipleChoiceItem();
    item.setTitle(ragwanQuizTitle(q));
    item.setRequired(true);
    item.setPoints(ragwanQuizPoints(i));
    item.setChoices(cfg.options.map(function(option,j){return item.createChoice(option,j===cfg.correct);}));
  });
}
function isRagwanMultipleChoiceQuiz(form){
  if(!form.isQuiz())return false;
  const items=form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
  return items.length===12&&items.every(function(item,i){
    const q=TRAINING_QUESTIONS[i],cfg=RAGWAN_STEP4_MCQ_BANK[i],quiz=item.asMultipleChoiceItem();
    const choices=quiz.getChoices();
    return item.getTitle()===ragwanQuizTitle(q)&&quiz.getPoints()===ragwanQuizPoints(i)&&
      choices.length===4&&choices.every(function(choice,j){
        return choice.getValue()===cfg.options[j]&&choice.isCorrectAnswer()===(j===cfg.correct);
      });
  });
}
/**
 * One-off migration; call repeatedly until remaining=0.
 * Each run converts up to TWO sponsor forms in-place, keeping their links and triggers.
 * Original essay answers are archived as private Drive JSON before changing questions.
 * If interrupted, the affected Form remains closed to avoid accepting mixed-format answers.
 */
function upgradeRagwanSponsorQuizzesBatch(){
  const p=PropertiesService.getScriptProperties(),all=p.getProperties();
  const pending=Object.keys(all).filter(function(k){
    return k.indexOf('SPONSOR_')===0&&all['RAGWAN_MCQ_READY_'+k.slice(8)]!=='1';
  }).sort();
  const result={converted:[],errors:[],remaining:pending.length};
  pending.slice(0,2).forEach(function(k){
    const id=k.slice(8);
    try{migrateRagwanQuizForm(id);result.converted.push(id);}
    catch(err){result.errors.push({formId:id,error:String(err&&err.message||err)});}
  });
  const next=p.getProperties();
  result.remaining=Object.keys(next).filter(function(k){
    return k.indexOf('SPONSOR_')===0&&next['RAGWAN_MCQ_READY_'+k.slice(8)]!=='1';
  }).length;
  Logger.log(JSON.stringify(result));
  return result;
}
function migrateRagwanQuizForm(id){
  const p=PropertiesService.getScriptProperties(),form=FormApp.openById(id);
  const old=form.getItems(FormApp.ItemType.PARAGRAPH_TEXT);
  const mcq=form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
  if(isRagwanMultipleChoiceQuiz(form)&&old.length===0){
    p.setProperty('RAGWAN_MCQ_READY_'+id,'1');return;
  }
  if(old.length!==12||mcq.length!==0||
    old.some(function(item,i){return item.getTitle()!==ragwanQuizTitle(TRAINING_QUESTIONS[i]);}))
    throw new Error('النموذج ليس نسخة الحقيبة الأصلية المكونة من 12 سؤالًا مقاليًا. يلزم فحصه يدويًا.');
  const items=form.getItems();
  if(items.filter(function(i){return i.getTitle()==='اسم العضو الكامل';}).length!==1||
     items.filter(function(i){return i.getTitle()==='رقم العضوية';}).length!==1)
    throw new Error('حقول هوية المتدرب غير مطابقة.');
  const archiveKey='RAGWAN_MCQ_RESPONSE_ARCHIVE_'+id;
  if(!p.getProperty(archiveKey)){
    const answers=form.getResponses().map(function(r){
      return {id:r.getId(),time:r.getTimestamp().toISOString(),
        items:r.getItemResponses().map(function(ir){
          return {title:ir.getItem().getTitle(),answer:ir.getResponse()};
        })};
    });
    const archive=DriveApp.createFile('ragwan-original-responses-'+id+'.json',
      JSON.stringify({formId:id,archivedAt:new Date().toISOString(),answers:answers}),
      MimeType.PLAIN_TEXT);
    p.setProperty(archiveKey,archive.getId());
    Logger.log('Private response archive: '+archive.getUrl());
  }
  const accepting=form.isAcceptingResponses();
  form.setAcceptingResponses(false);
  try{
    form.setIsQuiz(true);
    form.setPublishingSummary(false);
    addRagwanMultipleChoiceItems(form);
    const added=form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
    old.forEach(function(item,i){
      form.moveItem(added[i],item.getIndex());
      form.deleteItem(item);
    });
    if(!isRagwanMultipleChoiceQuiz(form))throw new Error('فشل التحقق من الترتيب أو النقاط.');
    form.setConfirmationMessage('✅ تم إرسال إجاباتك بنجاح. اضغط «عرض النتيجة» (View score) لمعرفة درجتك من 100. سيتم إرسال تقريرك إلى بريد الراعي.');
    p.setProperty('RAGWAN_MCQ_READY_'+id,'1');
    form.setAcceptingResponses(accepting);
  }catch(err){
    Logger.log('Form '+id+' left closed for safe manual recovery: '+String(err));
    throw err;
  }
}


/**
 * اختبار آمن للنتيجة الفورية: ينشئ نموذجًا تجريبيًا فقط، دون ربطه
 * ببريد سبونسر، ودون Trigger، ودون تغيير النماذج الحالية.
 * بعد إنشائه افتح رابط التحرير واضبط: Settings > Release grades >
 * Immediately after each submission، ثم جرّب الرابط العام كمتدرب.
 */
function createRagwanQuizPreviewOnly(){
  const form=FormApp.create('تجربة آمنة — اختبار حقيبة رجوان (لا تستخدمه للأعضاء)');
  form.setIsQuiz(true);
  form.setCollectEmail(false);
  form.setPublishingSummary(false);
  form.setShuffleQuestions(false);
  form.setDescription('نسخة تجريبية للتحقق من عرض الدرجة فور الإرسال. لا تُستخدم لتدريب الأعضاء.');
  form.addTextItem().setTitle('اسم العضو الكامل').setRequired(true);
  form.addTextItem().setTitle('رقم العضوية').setRequired(true);
  addRagwanMultipleChoiceItems(form);
  form.setConfirmationMessage('تم إرسال الإجابات. اضغط «عرض النتيجة» (View score).');
  const result={editUrl:form.getEditUrl(),respondentUrl:form.getPublishedUrl(),formId:form.getId()};
  Logger.log(JSON.stringify(result));
  return result;
}

/**
 * تدقيق قراءة فقط للنماذج الموجودة. لا يغير أي نموذج ولا ينشئ ملفات.
 * لا تُرسل سجل التنفيذ وفيه بريد السبونسر لأشخاص غير مخولين.
 */
function auditRagwanSponsorQuizzesReadOnly(){
  const props=PropertiesService.getScriptProperties().getProperties();
  const rows=Object.keys(props).filter(function(k){
    return k.indexOf('SPONSOR_')===0;
  }).sort().map(function(key){
    const id=key.slice(8);
    try{
      const form=FormApp.openById(id);
      return {formId:id,quiz:form.isQuiz(),totalItems:form.getItems().length,
        paragraphQuestions:form.getItems(FormApp.ItemType.PARAGRAPH_TEXT).length,
        choiceQuestions:form.getItems(FormApp.ItemType.MULTIPLE_CHOICE).length,
        autoGradeReady:isRagwanMultipleChoiceQuiz(form)};
    }catch(err){return {formId:id,error:String(err&&err.message||err)};}
  });
  Logger.log(JSON.stringify(rows));
  return rows;
}

/**
 * تحويل نموذج موجود واحد فقط بعد نجاح النموذج التجريبي
 * وإتمام النسخ الاحتياطي؛ يتحقق أن المعرف مسجل لهذا المشروع.
 */
function migrateOneRagwanSponsorQuiz(formId){
  const id=String(formId||'').trim();
  if(!id)throw new Error('يجب تزويد Form ID المعتمد، ولا يجوز التخمين.');
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('SPONSOR_'+id))throw new Error('Form ID ليس مسجلًا لسبونسر في هذا المشروع.');
  migrateRagwanQuizForm(id);
  return {formId:id,quiz:true,formUrl:FormApp.openById(id).getPublishedUrl()};
}
