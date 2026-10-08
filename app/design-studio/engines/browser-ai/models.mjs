/* سجل نماذج الذكاء الاصطناعي التي تعمل داخل المتصفح (مجانًا، بدون مفاتيح API).
   كل نموذج مثبّت على نسخة محددة ويُتحقق من حجمه وبصمته SHA-256 قبل الاستخدام.
   التراخيص راجعناها قبل الدمج: لا شيء هنا بترخيص AGPL أو غير تجاري. */

const HF = 'https://huggingface.co';

export const MODELS = Object.freeze({
  /* Real-ESRGAN General x4v3 (SRVGGNetCompact) — BSD-3-Clause.
     ملفات ONNX الرسمية من Qualcomm AI Hub (v0.64.0) كما هي، مستضافة مع الموقع لأن مصدرها لا يسمح بالتحميل من المتصفح.
     الرسم البياني في ملف والأوزان في ملف خارجي باسم يجب أن يبقى كما هو. المدخل ثابت 128×128 والمخرج 512×512. */
  upscaler: {
    id: 'realesr-general-x4v3',
    label: 'نموذج زيادة الدقة',
    url: new URL('../../models/real_esrgan_general_x4v3.onnx', import.meta.url).href,
    bytes: 161087,
    sha256: '09e6b675a0a18a97e1057c8dd7e984ef878a0a02ce104430da525b6241c858e7',
    externalData: {
      path: 'real_esrgan_general_x4v3.data',
      url: new URL('../../models/real_esrgan_general_x4v3.data', import.meta.url).href,
      bytes: 4836096,
      sha256: '512d0ec9940c2e9d85d27f2952f12a0b77b7841dc22df4ce9f3ea458bc98f37f'
    },
    license: 'BSD-3-Clause',
    scale: 4,
    tile: [128, 128]
  },
  /* ORMBG (Open Remove Background) — Apache-2.0. نسخة int8 للمعالج، fp16 لكرت الشاشة. */
  segmenterInt8: {
    id: 'ormbg-int8',
    label: 'نموذج إزالة الخلفية',
    url: `${HF}/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/onnx/model_quantized.onnx`,
    bytes: 44315205,
    sha256: 'ffbcae62a7b675d616e64cb392ee028786c4cf74f83596590fba13733ef00171',
    license: 'Apache-2.0',
    size: 1024
  },
  segmenterFp16: {
    id: 'ormbg-fp16',
    label: 'نموذج إزالة الخلفية',
    url: `${HF}/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/onnx/model_fp16.onnx`,
    bytes: 88117930,
    sha256: '06e4236d2c2fae771f56b6e4723b6ed870a554b661ea4da4a74f650bbd53cf57',
    license: 'Apache-2.0',
    size: 1024
  },
  /* MI-GAN (Picsart AI Research) — MIT. خط معالجة كامل: صورة + قناع ← صورة بعد الإزالة. */
  inpainter: {
    id: 'migan-pipeline-v2',
    label: 'نموذج إزالة العناصر',
    url: `${HF}/andraniksargsyan/migan/resolve/406830d0fa60666da0071c342ad2fbc8f30c5c64/migan_pipeline_v2.onnx`,
    bytes: 28079181,
    sha256: '6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b',
    license: 'MIT'
  }
});
