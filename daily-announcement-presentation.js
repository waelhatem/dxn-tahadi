(function(root){
  'use strict';

  // A small, text-only formatter shared by the leader preview and member announcements.
  // Never parse generated copy as HTML or Markdown.
  function sectionsOf(text){
    const value=String(text==null?'':text).replace(/\r\n?/g,'\n').trim();
    const segments=value.split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean);
    return segments.map((text,index)=>({
      text,
      type: /[؟?]\s*$/.test(text)?'question':index===0?'lead':'tip',
      icon: /^\s*[\p{Extended_Pictographic}]/u.test(text)?'':(/[؟?]\s*$/.test(text)?'💬':index===0?'🌿':'💡')
    }));
  }

  function renderBody(container,text){
    if(!container||!container.ownerDocument)return;
    const doc=container.ownerDocument;
    container.replaceChildren();
    container.classList.add('dxn-ga-daily-content');
    for(const entry of sectionsOf(text)){
      const paragraph=doc.createElement('p');
      paragraph.className='dxn-ga-daily-para dxn-ga-daily-'+entry.type;
      paragraph.dir='auto';
      if(entry.icon){
        const icon=doc.createElement('span');
        icon.className='dxn-ga-daily-emoji';
        icon.textContent=entry.icon;
        icon.setAttribute('aria-hidden','true');
        paragraph.appendChild(icon);
      }
      const span=doc.createElement('span');
      span.textContent=entry.text;
      paragraph.appendChild(span);
      container.appendChild(paragraph);
    }
  }

  const css=[
    '.dxn-global-announcement-panel.dxn-ga-daily-panel{background:linear-gradient(180deg,#fcfffd,#f2f8f4);border-color:#b6d8c5;}',
    '.dxn-ga-daily-panel h2{font-weight:950;line-height:1.55;color:#164a39;font-size:clamp(21px,4.8vw,27px);text-wrap:pretty;}',
    '.dxn-global-announcement-panel .ga-body.dxn-ga-daily-content{display:grid;gap:11px;white-space:normal;line-height:1.9;color:#234439;font-size:clamp(16px,3.9vw,18px);}',
    '.dxn-ga-daily-content .dxn-ga-daily-para{margin:0;padding:13px 14px;border-radius:13px;background:#fff;border-right:4px solid #a3cbb7;font-weight:800;line-height:1.9;overflow-wrap:anywhere;white-space:pre-wrap;}',
    '.dxn-ga-daily-content .dxn-ga-daily-lead{background:#e9f6ef;border-right-color:#13845d;color:#184e39;font-weight:900;}',
    '.dxn-ga-daily-content .dxn-ga-daily-tip{background:#fff;border-right-color:#79aa92;}',
    '.dxn-ga-daily-content .dxn-ga-daily-question{background:#fff7e6;border-right-color:#d49b32;color:#684719;font-weight:900;}',
    '.dxn-ga-daily-content .dxn-ga-daily-emoji{display:inline-block;margin-inline-end:7px;font-size:1.16em;vertical-align:-.04em;}',
    '@media(max-width:650px){.dxn-global-announcement-panel .ga-body.dxn-ga-daily-content{font-size:16px;gap:9px}.dxn-ga-daily-content .dxn-ga-daily-para{padding:11px 12px}.dxn-ga-daily-panel h2{font-size:22px}}'
  ].join('\n');

  if(root&&root.document){
    const sheet=root.document.createElement('style');
    sheet.id='dxn-ga-daily-style';
    sheet.textContent=css;
    root.document.head.appendChild(sheet);
    root.__DXN_DAILY_PRESENTATION__={renderBody,sectionsOf};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={renderBody,sectionsOf};
})(typeof window==='undefined'?null:window);
