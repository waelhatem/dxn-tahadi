/* Community UI V2 — adds a compact premium utility rail without changing existing actions */
(function(){
  if(window.__DXN_COMMUNITY_UI_V2__) return;
  window.__DXN_COMMUNITY_UI_V2__=true;
  const labels=[
    ['الرئيسية','🏠'],['الدردشة','💬'],['المنشورات','📄'],['الصور','🖼️'],
    ['الفيديو','▶️'],['فريقي','👥'],['الاجتماعات المباشرة','📹'],['الإشعارات','🔔'],['الملف الشخصي','👤']
  ];
  function findTab(label){
    return [...document.querySelectorAll('.tabs .tab')].find(b=>String(b.textContent||'').replace(/[^\u0600-\u06FF\w ]/g,'').includes(label));
  }
  function build(){
    if(document.getElementById('communityUtilityRail')) return;
    const rail=document.createElement('aside');
    rail.id='communityUtilityRail';
    rail.innerHTML='<div class="community-rail-brand"><span>DXN</span><small>المجتمع</small></div><div class="community-rail-list"></div>';
    const list=rail.querySelector('.community-rail-list');
    labels.forEach(([label,icon])=>{
      const b=document.createElement('button');
      b.type='button'; b.className='community-rail-btn';
      b.innerHTML='<span>'+icon+'</span><b>'+label+'</b>';
      b.onclick=()=>{
        const target=findTab(label);
        if(target){target.click();target.scrollIntoView({behavior:'smooth',block:'start'});}
      };
      list.appendChild(b);
    });
    document.body.appendChild(rail);
  }
  function styles(){
    if(document.getElementById('communityUtilityRailStyles')) return;
    const s=document.createElement('style');s.id='communityUtilityRailStyles';
    s.textContent='#communityUtilityRail{position:fixed;right:18px;top:50%;transform:translateY(-50%);z-index:40;width:92px;padding:10px 8px;border:1px solid rgba(255,255,255,.24);border-radius:22px;background:rgba(4,43,33,.70);box-shadow:0 18px 45px rgba(0,0,0,.20);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);direction:rtl}#communityUtilityRail .community-rail-brand{text-align:center;color:#fff;padding:8px 4px 10px;border-bottom:1px solid rgba(255,255,255,.16);margin-bottom:8px}.community-rail-brand span{display:block;font-size:20px;font-weight:950;letter-spacing:1px}.community-rail-brand small{font-size:10px;opacity:.8}.community-rail-list{display:grid;gap:6px}.community-rail-btn{width:100%;min-height:58px;padding:7px 4px;border:1px solid transparent;border-radius:14px;background:rgba(255,255,255,.08);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}.community-rail-btn span{font-size:20px;line-height:1}.community-rail-btn b{font-size:9px;line-height:1.25}.community-rail-btn:hover{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.25);transform:translateY(-1px)}@media(max-width:1100px){#communityUtilityRail{display:none}}';
    document.head.appendChild(s);
  }
  function init(){styles();build()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  new MutationObserver(()=>{if(!document.getElementById('communityUtilityRail'))build()}).observe(document.body,{childList:true,subtree:true});
})();