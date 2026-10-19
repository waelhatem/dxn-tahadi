(function(root){
  'use strict';

  // Keep AI copy as one continuous, readable paragraph even if an older draft
  // contains newlines or labels from the former three-card layout.
  function normalizeDailyText(value){
    return String(value==null?'':value)
      .replace(/\*\*/g,'')
      .replace(/(?:فكرة اليوم|خطوة عملية|سؤال اليوم)\s*[:：]\s*/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function renderBody(container,text){
    if(!container)return;
    container.classList.add('dxn-ga-daily-content');
    // textContent, never innerHTML: the AI must not inject markup.
    container.textContent=normalizeDailyText(text);
    container.setAttribute('dir','rtl');
  }

  const css=[
    '.dxn-global-announcement-panel.dxn-ga-daily-panel{background:linear-gradient(165deg,#fff 5%,#f4faf6 100%);border:1px solid #c7e2d3;}',
    '.dxn-ga-daily-panel h2{font-weight:900;line-height:1.5;color:#164d3c;font-size:clamp(20px,4.6vw,25px);overflow-wrap:anywhere;}',
    '.dxn-global-announcement-panel .ga-body.dxn-ga-daily-content{display:block;margin:12px 0 10px;padding:19px 20px;background:linear-gradient(125deg,#f0f9f3,#fffdf6);border:1px solid #d7e9dc;border-right:4px solid #15865c;border-radius:18px;box-shadow:0 8px 25px rgba(17,79,52,.06);color:#244b3c;font-weight:900;font-size:clamp(17px,4.1vw,20px);line-height:2.05;text-align:right;white-space:normal;overflow-wrap:break-word;word-break:normal;letter-spacing:0;}',
    '.dxn-ga-daily-panel .ga-type{font-weight:850;}',
    '@media(max-width:650px){.dxn-ga-daily-panel h2{font-size:21px;line-height:1.55}.dxn-global-announcement-panel .ga-body.dxn-ga-daily-content{font-size:17px;line-height:2.05;padding:16px 15px;margin:12px 0 8px;border-radius:15px;}}'
  ].join('\n');

  if(root&&root.document){
    const sheet=root.document.createElement('style');
    sheet.id='dxn-ga-daily-style';
    sheet.textContent=css;
    root.document.head.appendChild(sheet);
    root.__DXN_DAILY_PRESENTATION__={renderBody,normalizeDailyText};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={renderBody,normalizeDailyText};
})(typeof window==='undefined'?null:window);
