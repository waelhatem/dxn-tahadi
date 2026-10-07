(function(){
  'use strict';
  if(window.__DXN_DESIGN_STUDIO_V1__) return;
  window.__DXN_DESIGN_STUDIO_V1__ = true;

  const state = {
    task: 'enhance',
    inputImage: '',
    inputName: '',
    resultImage: '',
    ratio: '1:1',
    background: 'premium',
    preserve: true,
    prompt: '',
    loading: false
  };

  const taskMeta = {
    enhance: {
      icon: '✨',
      title: 'تحسين الصورة',
      desc: 'رفع الجودة والوضوح والإضاءة مع الحفاظ على المنتج.'
    },
    background: {
      icon: '🪄',
      title: 'تغيير الخلفية',
      desc: 'استبدال الخلفية بمشهد احترافي مناسب للتسويق.'
    },
    ad: {
      icon: '📣',
      title: 'إنشاء إعلان',
      desc: 'تحويل صورة المنتج إلى لقطة إعلانية جاهزة للنشر.'
    },
    free: {
      icon: '🎨',
      title: 'تصميم حر',
      desc: 'اكتب التعديل المطلوب بلغتك وسيُطبّق على الصورة.'
    }
  };

  const ratioSize = {
    '1:1': '1024x1024',
    '4:5': '1024x1280',
    '9:16': '1024x1792',
    '16:9': '1792x1024'
  };

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function notify(msg){
    if(typeof window.toast === 'function') window.toast(msg);
    else alert(msg);
  }

  function styleBlock(){
    return `<style id="dxn-design-studio-v1-style">
      .ds-shell{direction:rtl}
      .ds-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,#0d513f,#173f68);color:#fff;border-radius:26px;padding:24px;margin-bottom:16px;box-shadow:0 14px 34px rgba(15,81,63,.16)}
      .ds-hero:after{content:"";position:absolute;width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.08);left:-55px;top:-70px}
      .ds-kicker{font-size:13px;font-weight:900;opacity:.88}
      .ds-hero h2{margin:7px 0 8px;font-size:30px}
      .ds-hero p{margin:0;line-height:1.8;max-width:720px}
      .ds-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 18px}
      .ds-task{appearance:none;border:1px solid #dbe8e2;background:#fff;border-radius:18px;padding:15px;text-align:right;cursor:pointer;box-shadow:0 6px 18px rgba(16,49,39,.05);transition:.18s}
      .ds-task:hover{transform:translateY(-2px);border-color:#9fcbbb}
      .ds-task.active{border:2px solid #0f513f;background:#f2faf6;box-shadow:0 8px 24px rgba(15,81,63,.12)}
      .ds-task .ico{font-size:28px;display:block;margin-bottom:8px}.ds-task b{display:block;font-size:16px;color:#173d31}.ds-task small{display:block;color:#64756e;line-height:1.6;margin-top:5px}
      .ds-work{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
      .ds-card{background:#fff;border:1px solid #dfe9e4;border-radius:22px;padding:18px;box-shadow:0 8px 24px rgba(15,81,63,.06)}
      .ds-title{font-weight:950;font-size:18px;color:#123f32;margin-bottom:10px}
      .ds-drop{border:2px dashed #b9d4c9;border-radius:18px;padding:16px;text-align:center;background:#f8fcfa}
      .ds-drop input{display:none}.ds-upload{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 16px;border-radius:12px;background:#0f513f;color:#fff;font-weight:900;cursor:pointer}
      .ds-preview{display:flex;align-items:center;justify-content:center;min-height:270px;margin-top:12px;border-radius:16px;background:#edf3f0;overflow:hidden}
      .ds-preview img{max-width:100%;max-height:430px;display:block;object-fit:contain}.ds-empty{color:#73817b;text-align:center;padding:30px 15px;line-height:1.8}
      .ds-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ds-field{margin-top:12px}.ds-field label{display:block;font-weight:850;color:#27483e;margin-bottom:6px}
      .ds-field select,.ds-field textarea{width:100%;border:1px solid #cfded7;border-radius:12px;padding:11px;background:#fff;color:#172c25;font:inherit}
      .ds-field textarea{min-height:105px;resize:vertical;line-height:1.7}
      .ds-check{display:flex;align-items:flex-start;gap:9px;margin-top:13px;padding:11px;border:1px solid #dce9e3;border-radius:13px;background:#f9fcfa}
      .ds-check input{margin-top:4px;transform:scale(1.15)}
      .ds-generate{width:100%;margin-top:14px;padding:13px 16px;border:0;border-radius:14px;background:linear-gradient(135deg,#0f513f,#176b55);color:#fff;font-weight:950;font-size:16px;cursor:pointer}
      .ds-generate:disabled{opacity:.55;cursor:not-allowed}
      .ds-status{margin-top:10px;min-height:24px;color:#566a62;font-size:14px;line-height:1.6}
      .ds-result-wrap{margin-top:14px}.ds-result{min-height:300px;display:flex;align-items:center;justify-content:center;border-radius:18px;background:#eef4f1;overflow:hidden}
      .ds-result img{max-width:100%;max-height:520px;object-fit:contain;display:block}
      .ds-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ds-actions a,.ds-actions button{border:1px solid #cddbd5;background:#fff;color:#173f33;border-radius:11px;padding:9px 13px;font-weight:850;text-decoration:none;cursor:pointer}
      .ds-note{margin-top:12px;padding:11px 12px;border-radius:12px;background:#fff7df;color:#765500;font-size:13px;line-height:1.7}
      @media(max-width:780px){.ds-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ds-work{grid-template-columns:1fr}.ds-hero{padding:20px}.ds-hero h2{font-size:25px}}
      @media(max-width:480px){.ds-row{grid-template-columns:1fr}.ds-task{padding:12px}.ds-preview{min-height:220px}.ds-result{min-height:240px}}
    </style>`;
  }

  function taskCards(){
    return Object.entries(taskMeta).map(([key,item]) => `
      <button type="button" class="ds-task ${state.task===key?'active':''}" onclick="window.__DXN_DS_SELECT__('${key}')">
        <span class="ico">${item.icon}</span>
        <b>${item.title}</b>
        <small>${item.desc}</small>
      </button>`).join('');
  }

  function designStudioPage(){
    const meta = taskMeta[state.task] || taskMeta.enhance;
    const input = state.inputImage
      ? `<img src="${state.inputImage}" alt="معاينة صورة المنتج">`
      : '<div class="ds-empty">🖼️ ارفع صورة المنتج من الهاتف أو الكمبيوتر<br><small>JPG / PNG / WEBP</small></div>';
    const result = state.resultImage
      ? `<img src="${state.resultImage}" alt="التصميم الناتج">`
      : '<div class="ds-empty">النتيجة ستظهر هنا بعد إنشاء التصميم.</div>';

    return styleBlock()+`<section class="ds-shell">
      <div class="ds-hero">
        <div class="ds-kicker">🎨 الذكاء الاصطناعي للتسويق</div>
        <h2>استوديو التصميم</h2>
        <p>حوّل صورة المنتج إلى مادة تسويقية احترافية، مع خيارات للتحسين وتغيير الخلفية وصناعة الإعلان والتعديل الحر.</p>
      </div>

      <div class="ds-grid">${taskCards()}</div>

      <div class="ds-work">
        <div class="ds-card">
          <div class="ds-title">1) صورة المنتج</div>
          <div class="ds-drop">
            <label class="ds-upload" for="dsImageInput">📷 اختيار صورة</label>
            <input id="dsImageInput" type="file" accept="image/jpeg,image/png,image/webp" onchange="window.__DXN_DS_FILE__(this.files&&this.files[0])">
            <div style="margin-top:8px;color:#6f7f78;font-size:13px">${state.inputName?esc(state.inputName):'سيتم ضغط الصورة محليًا قبل الإرسال لتسريع المعالجة.'}</div>
          </div>
          <div class="ds-preview">${input}</div>
        </div>

        <div class="ds-card">
          <div class="ds-title">2) إعداد التصميم — ${meta.icon} ${meta.title}</div>

          <div class="ds-row">
            <div class="ds-field">
              <label for="dsRatio">مقاس التصميم</label>
              <select id="dsRatio" onchange="window.__DXN_DS_SET__('ratio',this.value)">
                <option value="1:1" ${state.ratio==='1:1'?'selected':''}>مربع 1:1</option>
                <option value="4:5" ${state.ratio==='4:5'?'selected':''}>منشور 4:5</option>
                <option value="9:16" ${state.ratio==='9:16'?'selected':''}>Story / Reels 9:16</option>
                <option value="16:9" ${state.ratio==='16:9'?'selected':''}>أفقي 16:9</option>
              </select>
            </div>
            <div class="ds-field">
              <label for="dsBackground">نوع الخلفية</label>
              <select id="dsBackground" onchange="window.__DXN_DS_SET__('background',this.value)">
                <option value="premium" ${state.background==='premium'?'selected':''}>استوديو فاخر</option>
                <option value="white" ${state.background==='white'?'selected':''}>بيضاء نظيفة</option>
                <option value="lifestyle" ${state.background==='lifestyle'?'selected':''}>مشهد Lifestyle</option>
                <option value="natural" ${state.background==='natural'?'selected':''}>طبيعية واقعية</option>
              </select>
            </div>
          </div>

          <label class="ds-check">
            <input type="checkbox" ${state.preserve?'checked':''} onchange="window.__DXN_DS_SET__('preserve',this.checked)">
            <span><b>الحفاظ على المنتج كما هو</b><br><small>عدم تغيير شكل العبوة أو الشعار أو الألوان أو النصوص قدر الإمكان.</small></span>
          </label>

          <div class="ds-field">
            <label for="dsPrompt">تعليمات إضافية</label>
            <textarea id="dsPrompt" maxlength="1200" placeholder="${state.task==='free'?'اكتب التعديل الذي تريده بالتفصيل...':'اختياري: مثال — إضاءة صباحية هادئة، خلفية خشبية واقعية، بدون إضافة نصوص.'}" oninput="window.__DXN_DS_SET__('prompt',this.value)">${esc(state.prompt)}</textarea>
          </div>

          <button id="dsGenerateBtn" class="ds-generate" type="button" onclick="window.__DXN_DS_GENERATE__()" ${state.loading?'disabled':''}>
            ${state.loading?'⏳ جارٍ إنشاء التصميم...':'✨ إنشاء التصميم'}
          </button>
          <div id="dsStatus" class="ds-status">${state.loading?'قد تستغرق المعالجة عدة ثوانٍ حسب الصورة والمقاس.':''}</div>
          <div class="ds-note">⚠️ راجع اسم المنتج والشعار والنصوص المطبوعة على العبوة قبل النشر؛ التحرير التوليدي قد يغيّر تفاصيل دقيقة رغم تفعيل خيار الحفاظ على المنتج.</div>
        </div>
      </div>

      <div class="ds-card ds-result-wrap">
        <div class="ds-title">3) النتيجة</div>
        <div class="ds-result">${result}</div>
        ${state.resultImage?`<div class="ds-actions">
          <a href="${state.resultImage}" download="dxn-design.jpg">⬇️ حفظ الصورة</a>
          <button type="button" onclick="window.__DXN_DS_GENERATE__()">🔁 إعادة التصميم</button>
        </div>`:''}
      </div>
    </section>`;
  }

  function renderStudio(){
    if(typeof window.render === 'function') window.render();
  }

  function selectTask(task){
    if(!taskMeta[task]) return;
    state.task = task;
    state.resultImage = '';
    renderStudio();
  }

  function setState(key,value){
    if(!(key in state)) return;
    state[key] = value;
  }

  function dataUrlBytes(dataUrl){
    const base64 = String(dataUrl||'').split(',')[1] || '';
    return Math.ceil(base64.length * 3 / 4);
  }

  function compressImage(file){
    return new Promise((resolve,reject)=>{
      if(!file || !/^image\/(jpeg|png|webp)$/i.test(file.type||'')) return reject(new Error('اختر صورة JPG أو PNG أو WEBP.'));
      if(file.size > 18*1024*1024) return reject(new Error('حجم الصورة كبير جدًا. الحد الأقصى 18MB قبل الضغط.'));
      const reader = new FileReader();
      reader.onerror = ()=>reject(new Error('تعذر قراءة الصورة.'));
      reader.onload = ()=>{
        const img = new Image();
        img.onerror = ()=>reject(new Error('تعذر فتح الصورة.'));
        img.onload = ()=>{
          const maxSide = 1600;
          const scale = Math.min(1,maxSide/Math.max(img.naturalWidth||1,img.naturalHeight||1));
          const w = Math.max(1,Math.round(img.naturalWidth*scale));
          const h = Math.max(1,Math.round(img.naturalHeight*scale));
          const canvas = document.createElement('canvas');
          canvas.width=w; canvas.height=h;
          const ctx=canvas.getContext('2d',{alpha:false});
          ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0,w,h);
          let quality=.90;
          let out=canvas.toDataURL('image/jpeg',quality);
          while(dataUrlBytes(out)>3.2*1024*1024 && quality>.62){
            quality-=.08;
            out=canvas.toDataURL('image/jpeg',quality);
          }
          if(dataUrlBytes(out)>3.35*1024*1024) return reject(new Error('تعذر ضغط الصورة إلى حجم مناسب. جرّب صورة أصغر.'));
          resolve(out);
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function onFile(file){
    try{
      if(!file) return;
      const el=document.getElementById('dsStatus'); if(el) el.textContent='⏳ جارٍ تجهيز الصورة...';
      state.inputImage = await compressImage(file);
      state.inputName = file.name || 'صورة المنتج';
      state.resultImage = '';
      renderStudio();
    }catch(e){
      notify(e.message||'تعذر تجهيز الصورة.');
      const el=document.getElementById('dsStatus'); if(el) el.textContent='';
    }
  }

  async function generate(){
    if(state.loading) return;
    if(!state.inputImage) return notify('ارفع صورة المنتج أولًا.');
    if(state.task==='free' && !String(state.prompt||'').trim()) return notify('اكتب التعديل المطلوب في التصميم الحر.');
    const session=String(localStorage.getItem('dxn_session')||'').trim();
    if(!session) return notify('جلسة الدخول غير متوفرة. سجّل الدخول من جديد.');

    state.loading=true;
    renderStudio();
    try{
      const r=await fetch('/api/design-studio',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          token:session,
          image:state.inputImage,
          task:state.task,
          background:state.background,
          preserve_product:!!state.preserve,
          prompt:String(state.prompt||'').trim(),
          size:ratioSize[state.ratio]||'1024x1024'
        }),
        cache:'no-store'
      });
      const txt=await r.text();
      let d=null; try{d=txt?JSON.parse(txt):null}catch(_){}
      if(!r.ok) throw new Error((d&&(d.error||d.message))||txt||('HTTP '+r.status));
      if(!d || !d.image) throw new Error('لم يتم استلام صورة من محرك التصميم.');
      state.resultImage=d.image;
      setTimeout(()=>document.querySelector('.ds-result-wrap')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    }catch(e){
      notify(e.message||'تعذر إنشاء التصميم.');
    }finally{
      state.loading=false;
      renderStudio();
    }
  }

  window.designStudioPage = designStudioPage;
  window.__DXN_DS_SELECT__ = selectTask;
  window.__DXN_DS_SET__ = setState;
  window.__DXN_DS_FILE__ = onFile;
  window.__DXN_DS_GENERATE__ = generate;

  if(typeof window.tab!=='undefined' && window.tab==='design' && typeof window.render==='function'){
    setTimeout(()=>window.render(),0);
  }
})();