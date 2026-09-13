/* V86.43 — Daily priority challenge notification with direct navigation and visual highlighting. */
(function(){
  'use strict';
  var shownKey='dxn_priority_notice_session_v8643';

  function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  function norm(s){return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase()}
  function getAppData(){try{if(typeof data!=='undefined'&&data&&Array.isArray(data.challenges))return data}catch(e){}return null}
  function getRole(){try{if(typeof role!=='undefined')return role}catch(e){}return null}
  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function isToday(v){if(!v)return false;var d=new Date(v);if(Number.isNaN(d.getTime()))return false;return today()===d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function isDaily(c){var r=String(c.repeat_rule||c.repeatRule||c.frequency||'').toLowerCase();return !r||r.includes('day')||r.includes('daily')||r.includes('يوم')||r.includes('يومي')}

  function chooseChallenge(d){
    var list=(d.challenges||[]).filter(function(c){return c&&c.active!==false&&!c.deleted_at&&isDaily(c)});
    if(!list.length)list=(d.challenges||[]).filter(function(c){return c&&c.active!==false&&!c.deleted_at});
    var subs=Array.isArray(d.my_submissions)?d.my_submissions:[];
    var pending=list.filter(function(c){return !subs.some(function(s){return String(s.challenge_id||s.challengeId||'')===String(c.id)&&isToday(s.created_at||s.submitted_at||s.updated_at)&&String(s.status||'').toLowerCase()!=='rejected'})});
    if(pending.length)list=pending;
    list.sort(function(a,b){return Number(b.stars||b.reward_stars||0)-Number(a.stars||a.reward_stars||0)});
    return list[0]||null;
  }

  function close(){var x=document.getElementById('dxnPriorityNotice');if(x)x.remove()}

  function switchToChallenges(){
    try{if(typeof switchTab==='function'){switchTab('ch');return true}}catch(e){}
    try{
      var els=document.querySelectorAll('.tab,button,[role="tab"]');
      for(var i=0;i<els.length;i++){
        var t=norm(els[i].textContent||'');
        if(t.includes('التحديات')||t.includes('التحدي')){els[i].click();return true}
      }
    }catch(e){}
    return false;
  }

  function findChallengeElement(c){
    var id=String(c&&c.id!=null?c.id:'');
    var title=norm(c&&c.title||'');
    if(id){
      var byId=document.querySelectorAll('[data-challenge-id], [data-id]');
      for(var i=0;i<byId.length;i++){
        var el=byId[i];
        if(String(el.getAttribute('data-challenge-id')||el.getAttribute('data-id')||'')===id)return el.closest('.challenge')||el;
      }
    }
    if(!title)return null;
    var cards=document.querySelectorAll('.challenge');
    for(var j=0;j<cards.length;j++){
      var text=norm(cards[j].textContent||'');
      if(text.includes(title))return cards[j];
    }
    var heads=document.querySelectorAll('.challenge h3,.challenge .title,h3');
    for(var k=0;k<heads.length;k++){
      var ht=norm(heads[k].textContent||'');
      if(ht===title||ht.includes(title)||title.includes(ht)&&ht.length>5)return heads[k].closest('.challenge')||heads[k].closest('.card')||heads[k];
    }
    return null;
  }

  function highlightChallenge(c){
    var tries=0;
    function locate(){
      tries++;
      var el=findChallengeElement(c);
      if(el){
        el.classList.add('dxn-priority-target');
        el.setAttribute('data-dxn-priority-target','1');
        el.setAttribute('aria-label','التحدي الأهم اليوم');
        if(!el.querySelector('.dxn-priority-target-badge')){
          var b=document.createElement('div');
          b.className='dxn-priority-target-badge';
          b.textContent='⚡ التحدي الأهم اليوم — ابدأ هنا';
          el.insertBefore(b,el.firstChild);
        }
        try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})}catch(e){try{el.scrollIntoView(false)}catch(_){}}
        setTimeout(function(){try{el.classList.remove('dxn-priority-target')}catch(e){}},15000);
        return true;
      }
      if(tries<80)setTimeout(locate,100);
      return false;
    }
    setTimeout(locate,180);
  }

  function goToChallenge(c){
    close();
    switchToChallenges();
    highlightChallenge(c);
  }

  function show(c){
    if(document.getElementById('dxnPriorityNotice'))return;
    var stars=Number(c.stars||c.reward_stars||0),title=esc(c.title||'التحدي الأهم اليوم'),desc=esc(c.description||'هذا هو التحدي الذي نريد منك أن تبدأ به الآن وتنجزه بأسرع وقت ممكن.');
    var box=document.createElement('div');box.id='dxnPriorityNotice';box.innerHTML='<div class="dxn-priority-backdrop"></div><div class="dxn-priority-modal" role="dialog" aria-modal="true" aria-labelledby="dxnPriorityTitle"><button class="dxn-priority-close" type="button" aria-label="إغلاق">×</button><div class="dxn-priority-icon">🎯</div><div class="dxn-priority-label">⚡ مهم اليوم</div><h2 id="dxnPriorityTitle">التحدي الأهم الذي عليك إنجازه اليوم</h2><div class="dxn-priority-challenge">'+title+'</div><div class="dxn-priority-desc">'+desc+'</div>'+(stars?'<div class="dxn-priority-stars">⭐ '+stars+' نقطة</div>':'')+'<div class="dxn-priority-note">عند الضغط على «ابدأ التحدي الآن» سأنتقل بك مباشرة إلى التحدي وأضع عليه تمييزًا واضحًا حتى تعرف أين تبدأ.</div><div class="dxn-priority-actions"><button class="primary dxn-priority-start" type="button">🚀 ابدأ التحدي الآن</button><button class="dxn-priority-later" type="button">سأعود إليه لاحقًا</button></div></div>';
    var st=document.createElement('style');st.textContent='#dxnPriorityNotice{position:fixed;inset:0;z-index:10000;direction:rtl}.dxn-priority-backdrop{position:absolute;inset:0;background:rgba(15,35,29,.62);backdrop-filter:blur(4px)}.dxn-priority-modal{position:relative;width:min(560px,calc(100% - 28px));margin:8vh auto 0;background:#fff;border:2px solid #d7e7df;border-radius:24px;padding:24px;box-shadow:0 24px 70px #0005;text-align:center}.dxn-priority-close{position:absolute;top:10px;left:10px;width:40px;height:40px;min-height:40px;border-radius:50%;font-size:26px;background:#eef3f2;color:#667085}.dxn-priority-icon{font-size:54px;line-height:1;margin-bottom:10px}.dxn-priority-label{display:inline-block;padding:7px 13px;border-radius:999px;background:#fff1df;color:#8a5300;font-weight:950;font-size:13px}.dxn-priority-modal h2{margin:12px 0 10px;font-size:24px;color:#182234}.dxn-priority-challenge{font-size:23px;font-weight:950;color:#0f513f;margin:12px 0}.dxn-priority-desc{color:#667085;line-height:1.8;font-size:15px}.dxn-priority-stars{display:inline-block;margin-top:12px;padding:7px 12px;border-radius:999px;background:#fff7df;color:#7a5300;font-weight:950}.dxn-priority-note{margin-top:15px;padding:12px;border-radius:14px;background:#f7fcf9;border:1px solid #d7e7df;color:#0f513f;font-weight:850;line-height:1.7}.dxn-priority-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:18px}.dxn-priority-start{background:#0f513f!important;color:#fff!important}.dxn-priority-later{background:#eef3f2}.dxn-priority-modal button{font:inherit;font-weight:900}.dxn-priority-modal .dxn-priority-start{min-width:210px}.dxn-priority-target{position:relative!important;background:#fff4b8!important;border:3px solid #e1a400!important;box-shadow:0 0 0 6px rgba(225,164,0,.18),0 12px 35px rgba(146,95,0,.25)!important;animation:dxnPriorityPulse 1.15s ease-in-out 3!important;scroll-margin-top:90px;scroll-margin-bottom:90px}.dxn-priority-target-badge{display:block!important;margin:-3px -3px 12px!important;padding:10px 12px!important;border-radius:14px 14px 8px 8px!important;background:#e1a400!important;color:#fff!important;text-align:center!important;font-size:14px!important;font-weight:950!important;line-height:1.4!important}@keyframes dxnPriorityPulse{0%,100%{box-shadow:0 0 0 6px rgba(225,164,0,.18),0 12px 35px rgba(146,95,0,.25)}50%{box-shadow:0 0 0 12px rgba(225,164,0,.08),0 14px 42px rgba(146,95,0,.35)}}@media(max-width:560px){.dxn-priority-modal{margin-top:5vh;padding:20px}.dxn-priority-modal h2{font-size:20px}.dxn-priority-challenge{font-size:20px}}';
    document.head.appendChild(st);document.body.appendChild(box);
    box.querySelector('.dxn-priority-close').onclick=close;box.querySelector('.dxn-priority-later').onclick=close;box.querySelector('.dxn-priority-backdrop').onclick=close;box.querySelector('.dxn-priority-start').onclick=function(){goToChallenge(c)};
  }

  function run(){
    var d=getAppData(),r=getRole(),effectiveRole=r||(d&&d.role);
    if(!effectiveRole||!d)return;
    if(String(effectiveRole).toLowerCase()!=='member')return;
    if(sessionStorage.getItem(shownKey))return;
    var c=chooseChallenge(d);if(!c)return;
    sessionStorage.setItem(shownKey,'1');show(c);
  }

  var tries=0,t=setInterval(function(){tries++;try{run()}catch(e){}if(document.getElementById('dxnPriorityNotice')||tries>240)clearInterval(t)},250);
})();
