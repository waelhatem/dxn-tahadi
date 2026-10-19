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
      el.querySelector('#dxnDailyStatus').textContent='تعذر تحميل الإعدادات: '+e.message;
    }
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
    load(el);
  }
  const css=document.createElement('style');
  css.textContent='.dxn-daily-settings{margin-top:20px;padding:17px;border:1px solid #b8dcc9;border-radius:15px;background:#f2faf5;display:grid;gap:10px;line-height:1.7;color:#174d38}.dxn-daily-title{font-weight:900;font-size:18px}.dxn-daily-settings p{margin:0}.dxn-daily-settings small{color:#667085}.dxn-daily-settings button{max-width:280px}.dxn-daily-note{font-size:12px;color:#566c62}';
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
