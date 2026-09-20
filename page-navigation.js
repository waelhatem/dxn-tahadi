(function(){
  if ((location.pathname || '').replace(/\/+$/,'') !== '/03-pretest.html') return;
  function apply(){
    if (document.getElementById('quiz-circular-buttons-exact')) return;
    var style=document.createElement('style');
    style.id='quiz-circular-buttons-exact';
    style.textContent=`
      .btns{position:fixed!important;left:50%!important;bottom:18px!important;z-index:9999!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:0!important;transform:translateX(-50%)!important;direction:ltr!important;background:transparent!important;box-shadow:none!important;padding:0!important}
      .btns #back{display:none!important}
      .btns .btn{position:relative!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;padding:0!important;margin:0!important;border:0!important;border-radius:50%!important;background:#fff!important;color:transparent!important;font-size:0!important;line-height:0!important;box-shadow:0 4px 14px rgba(0,0,0,.16)!important;display:block!important;overflow:hidden!important;opacity:1!important;transform:none!important;animation:none!important;cursor:pointer!important}
      .btns .btn::before{display:none!important;content:none!important}
      .btns #back::after,.btns #next::after{content:""!important;position:absolute!important;top:50%!important;left:50%!important;width:0!important;height:0!important;border-top:9px solid transparent!important;border-bottom:9px solid transparent!important;transform:translate(-50%,-50%)!important}
      .btns #back::after{border-right:13px solid #0f513f!important;margin-left:-1px!important}
      .btns #next::after{border-left:13px solid #0f513f!important;margin-left:1px!important}
      .btns .btn{flex:0 0 44px!important}
      .btns .btn:hover:not(:disabled){transform:scale(1.04)!important;box-shadow:0 6px 17px rgba(0,0,0,.2)!important}
      .btns .btn:active:not(:disabled){transform:scale(.96)!important}
      .btns .btn:disabled{opacity:.28!important;cursor:not-allowed!important}
      @media(max-width:700px){
        .btns{left:50%!important;bottom:18px!important}
        .btns .btn{width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;flex-basis:40px!important}
        .btns #back::after,.btns #next::after{border-top-width:8px!important;border-bottom-width:8px!important}
        .btns #back::after{border-right-width:12px!important}
        .btns #next::after{border-left-width:12px!important}
      }
    `;
    document.head.appendChild(style);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true}); else apply();
})();
