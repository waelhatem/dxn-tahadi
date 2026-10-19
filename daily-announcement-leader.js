(function(){
  'use strict';
  if(window.__DXN_DAILY_GA_UI__)return;
  window.__DXN_DAILY_GA_UI__=true;
  function session(){try{return String(localStorage.getItem('dxn_session')||'').trim()}catch(e){return ''}}
  async function rpc(fn,args){
    const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fn:fn,args:args||{}}),cache:'no-store'});
    const txt=await r.text();let data;
    try{data=JSON.parse(txt)}catch(e){data=null}
    if(!r.ok)throw new Error((data&&(data.message||data.error))||'فشل الاتصال بالخادم');
    return data;
  }
  function renderStatus(el,settings){
    el.dataset.enabled=String(!!settings.enabled);
    const status=el.querySelector('#dxnDailyStatus');
    const btn=el.querySelector('#dxnDailyToggle');
    status.textContent=settings.enabled?'🟢 النشر التلقائي مفعّل':'⚪ النشر التلقائي متوقف';
    btn.textContent=settings.enabled?'إيقاف النشر التلقائي':'تفعيل النشر التلقائي';
    el.querySelector('#dxnDailyLast').textContent=
      settings.last_published_date?'آخر رسالة: '+settings.last_published_date:'لم تُنشر رسالة آلية بعد';
    const archive=el.querySelector('#dxnDailyArchive');
    archive.replaceChildren();
    const rows=Array.isArray(settings.history)?settings.history:[];
    if(rows.length){
      const label=document.createElement('strong');label.textContent='آخر الرسائل المنشورة:';
      archive.appendChild(label);
      const list=document.createElement('ul');
      rows.forEach(item=>{
        const li=document.createElement('li');
        li.textContent=String(item.date||'')+' — '+String(item.title||'');
        list.appendChild(li);
      });
      archive.appendChild(list);
    }
  }
  async function load(el){
    const btn=el.querySelector('#dxnDailyToggle');
    btn.disabled=true;
    try{
      const settings=await rpc('get_daily_announcement_settings',{p_token:session()});
      renderStatus(el,settings);
      btn.disabled=false;
    }catch(e){
      el.querySelector('#dxnDailyStatus').textContent=/get_daily_announcement_settings|schema cache|PGRST202/i.test(String(e.message||''))
        ?'⏳ إعدادات النشر التلقائي تنتظر تحديث قاعدة البيانات. تستطيع معاينة النافذة من الزر أدناه.'
        :'تعذر تحميل إعدادات النشر حالياً. زر المعاينة يعمل بصورة مستقلة.';
      btn.textContent='النشر التلقائي غير جاهز';
    }
  }
  function closeTestModal(){
    const modal=document.getElementById('dxnDailyPreviewModal');
    if(modal)modal.remove();
    document.removeEventListener('keydown',onPreviewKeydown);
  }
  function onPreviewKeydown(e){if(e.key==='Escape')closeTestModal()}
  function showTestModal(message){
    closeTestModal();
    const modal=document.createElement('div');
    modal.id='dxnDailyPreviewModal';
    modal.className='dxn-global-announcement-modal';
    const panel=document.createElement('div');
    panel.className='dxn-global-announcement-panel ga-announcement dxn-ga-daily-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label','معاينة إعلان صباحي للقائد فقط');
    const tag=document.createElement('div');
    tag.className='ga-type';
    tag.textContent='🔵 إعلان • معاينة للقائد فقط';
    const title=document.createElement('h2');
    title.textContent=String(message.title||'');
    const body=document.createElement('div');
    body.className='ga-body';
    body.textContent=String(message.body||'');
    if(window.__DXN_DAILY_PRESENTATION__)window.__DXN_DAILY_PRESENTATION__.renderBody(body,message.body);
    const footer=document.createElement('div');
    footer.className='ga-footer';
    const understood=document.createElement('button');
    understood.type='button';
    understood.className='primary';
    understood.textContent='✓ فهمت';
    understood.addEventListener('click',closeTestModal);
    const close=document.createElement('button');
    close.type='button';
    close.textContent='إغلاق';
    close.addEventListener('click',closeTestModal);
    footer.append(understood,close);
    panel.append(tag,title,body,footer);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    document.addEventListener('keydown',onPreviewKeydown);
    understood.focus();
  }
  function showDesignSample(el){
    showTestModal({
      title:'🌅 صباح الصحة والثراء | نموذج بصري',
      body:'🌿 فكرة اليوم: صحتك هي ثروتك الأولى، والاهتمام بها يبدأ من عادات صغيرة تحافظ عليها باستمرار.\n\n💡 خطوة عملية: اختر اليوم عادة صحية بسيطة، مثل الحركة اليومية أو النوم المنتظم، وشارك تجربتك بصدق مع من حولك.\n\n💬 سؤال اليوم: ما العادة الجميلة التي تريد أن تبدأ بها من هذا الصباح؟'
    });
    el.querySelector('#dxnDailyPreviewStatus').textContent='👁️ هذه معاينة شكلية ثابتة للنافذة، وليست رسالة مولدة بالذكاء الاصطناعي. لم يُنشر شيء.';
  }
  async function runTestPreview(el){
    const btn=el.querySelector('#dxnDailyPreviewButton');
    const status=el.querySelector('#dxnDailyPreviewStatus');
    btn.disabled=true;
    status.textContent='✨ جارٍ توليد رسالة حقيقية بالذكاء الاصطناعي...';
    try{
      const res=await fetch('/api/daily-announcement-preview',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({p_token:session()})
      });
      const payload=await res.json();
      if(!res.ok||!payload.preview||!payload.title||!payload.body){
        throw new Error(payload.error||'تعذرت معاينة الرسالة.');
      }
      showTestModal(payload);
      status.textContent='✅ تم توليد معاينة خاصة بك فقط. لم يتم نشر أي إعلان.';
    }catch(e){
      status.textContent='تعذرت التجربة: '+String(e&&e.message||e);
    }finally{btn.disabled=false}
  }
  function inject(){
    const card=document.getElementById('dxnGlobalAnnouncementCard');
    if(!card||document.getElementById('dxnDailyAnnouncementSettings'))return;
    const el=document.createElement('section');
    el.id='dxnDailyAnnouncementSettings';
    el.className='dxn-daily-settings';
    el.innerHTML='<div class="dxn-daily-title">🌅 رسائل الصحة والثراء الصباحية الذكية</div>'+
      '<p>إنشاء رسالة عربية جديدة ونشرها كإعلان عام في نافذة العضو. لا تنشر في دردشة المجتمع.</p>'+
      '<div>🕗 موعد النشر: <strong>8:00 صباحاً بتوقيت بغداد</strong></div>'+
      '<div id="dxnDailyStatus" role="status" aria-live="polite">جارٍ تحميل الإعدادات...</div>'+
      '<small id="dxnDailyLast"></small>'+ 
      '<div id="dxnDailyArchive"></div>'+
      '<button type="button" id="dxnDailyToggle" class="primary" disabled>تحميل...</button>'+
      '<p class="dxn-daily-note">🤖 النشر اليومي بعد تفعيله يعمل تلقائياً. الأزرار التالية للتجربة فقط، ولا ترسل أي شيء للأعضاء.</p>'+ 
      '<button type="button" id="dxnDailyPreviewButton">✨ تجربة توليد رسالة الآن — دون نشر</button>'+
      '<button type="button" id="dxnDailyDesignSampleButton">👁️ معاينة شكل النافذة دون نشر</button>'+
      '<small>هذه معاينة حية لك فقط، لا تُرسل إلى الأعضاء ولا تحفظ إعلاناً في قاعدة البيانات.</small>'+
      '<div id="dxnDailyPreviewStatus" role="status" aria-live="polite"></div>'+
      '<p class="dxn-daily-note">تظهر رسالة اليوم فقط للعضو مرة واحدة بعد تأكيدها. تبقى الإعلانات اليدوية ذات الأولوية.</p>';
    card.appendChild(el);
    el.querySelector('#dxnDailyToggle').addEventListener('click',async function(){
      const btn=this;
      const enabled=el.dataset.enabled==='true';
      btn.disabled=true;
      try{
        await rpc('set_daily_announcement_enabled',{p_token:session(),p_enabled:!enabled});
        await load(el);
      }catch(e){
        el.querySelector('#dxnDailyStatus').textContent='تعذر حفظ الإعداد: '+e.message;
        btn.disabled=false;
      }
    });
    el.querySelector('#dxnDailyPreviewButton').addEventListener('click',function(){runTestPreview(el)});
    el.querySelector('#dxnDailyDesignSampleButton').addEventListener('click',function(){showDesignSample(el)});
    load(el);
  }
  const css=document.createElement('style');
  css.textContent='.dxn-daily-settings{margin-top:20px;padding:17px;border:1px solid #b8dcc9;border-radius:15px;background:#f2faf5;display:grid;gap:10px;line-height:1.7;color:#174d38}.dxn-daily-title{font-weight:900;font-size:18px}.dxn-daily-settings p{margin:0}.dxn-daily-settings small{color:#667085}.dxn-daily-settings button{max-width:280px}.dxn-daily-settings #dxnDailyPreviewButton,.dxn-daily-settings #dxnDailyDesignSampleButton{background:#fff;color:#155b42;border:1px solid #90bba7;border-radius:10px;padding:10px;font-weight:800;cursor:pointer}.dxn-daily-settings #dxnDailyPreviewButton:disabled{opacity:.6;cursor:wait}.dxn-daily-note{font-size:12px;color:#566c62}';
  document.head.appendChild(css);
  let queued=false;
  const observer=new MutationObserver(function(){
    if(queued)return;
    queued=true;queueMicrotask(function(){queued=false;inject()});
  });
  observer.observe(document.body,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);
  else inject();
})();
