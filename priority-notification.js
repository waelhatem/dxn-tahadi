/* V86.42 — Daily priority challenge notification for members. */
(function(){
  'use strict';
  var shownKey='dxn_priority_notice_session_v8642';
  function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
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
  function show(c){
    if(document.getElementById('dxnPriorityNotice'))return;
    var stars=Number(c.stars||c.reward_stars||0),title=esc(c.title||'التحدي الأهم اليوم'),desc=esc(c.description||'هذا هو التحدي الذي نريد منك أن تبدأ به الآن وتنجزه بأسرع وقت ممكن.');
    var box=document.createElement('div');box.id='dxnPriorityNotice';box.innerHTML='<div class="dxn-priority-backdrop"></div><div class="dxn-priority-modal" role="dialog" aria-modal="true" aria-labelledby="dxnPriorityTitle"><button class="dxn-priority-close" type="button" aria-label="إغلاق">×</button><div class="dxn-priority-icon">🎯</div><div class="dxn-priority-label">⚡ مهم اليوم</div><h2 id="dxnPriorityTitle">التحدي الأهم الذي عليك إنجازه اليوم</h2><div class="dxn-priority-challenge">'+title+'</div><div class="dxn-priority-desc">'+desc+'</div>'+(stars?'<div class="dxn-priority-stars">⭐ '+stars+' نقطة</div>':'')+'<div class="dxn-priority-note">لا تؤجله. ابدأ به الآن، ثم انتقل إلى بقية المهام.</div><div class="dxn-priority-actions"><button class="primary dxn-priority-start" type="button">🚀 ابدأ التحدي الآن</button><button class="dxn-priority-later" type="button">سأعود إليه لاحقًا</button></div></div>';
    var st=document.createElement('style');st.textContent='#dxnPriorityNotice{position:fixed;inset:0;z-index:10000;direction:rtl}.dxn-priority-backdrop{position:absolute;inset:0;background:rgba(15,35,29,.62);backdrop-filter:blur(4px)}.dxn-priority-modal{position:relative;width:min(560px,calc(100% - 28px));margin:8vh auto 0;background:#fff;border:2px solid #d7e7df;border-radius:24px;padding:24px;box-shadow:0 24px 70px #0005;text-align:center}.dxn-priority-close{position:absolute;top:10px;left:10px;width:40px;height:40px;min-height:40px;border-radius:50%;font-size:26px;background:#eef3f2;color:#667085}.dxn-priority-icon{font-size:54px;line-height:1;margin-bottom:10px}.dxn-priority-label{display:inline-block;padding:7px 13px;border-radius:999px;background:#fff1df;color:#8a5300;font-weight:950;font-size:13px}.dxn-priority-modal h2{margin:12px 0 10px;font-size:24px;color:#182234}.dxn-priority-challenge{font-size:23px;font-weight:950;color:#0f513f;margin:12px 0}.dxn-priority-desc{color:#667085;line-height:1.8;font-size:15px}.dxn-priority-stars{display:inline-block;margin-top:12px;padding:7px 12px;border-radius:999px;background:#fff7df;color:#7a5300;font-weight:950}.dxn-priority-note{margin-top:15px;padding:12px;border-radius:14px;background:#f7fcf9;border:1px solid #d7e7df;color:#0f513f;font-weight:850;line-height:1.7}.dxn-priority-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:18px}.dxn-priority-start{background:#0f513f!important;color:#fff!important}.dxn-priority-later{background:#eef3f2}.dxn-priority-modal button{font:inherit;font-weight:900}.dxn-priority-modal .dxn-priority-start{min-width:210px}@media(max-width:560px){.dxn-priority-modal{margin-top:5vh;padding:20px}.dxn-priority-modal h2{font-size:20px}.dxn-priority-challenge{font-size:20px}}';
    document.head.appendChild(st);document.body.appendChild(box);
    box.querySelector('.dxn-priority-close').onclick=close;box.querySelector('.dxn-priority-later').onclick=close;box.querySelector('.dxn-priority-backdrop').onclick=close;box.querySelector('.dxn-priority-start').onclick=function(){close();try{if(typeof switchTab==='function')switchTab('ch')}catch(e){}};
  }
  function run(){
    var d=getAppData(),r=getRole(),effectiveRole=r||(d&&d.role);
    if(!effectiveRole)return;
    if(String(effectiveRole).toLowerCase()!=='member')return;
    if(sessionStorage.getItem(shownKey))return;
    var c=chooseChallenge(d);if(!c)return;
    sessionStorage.setItem(shownKey,'1');show(c);
  }
  var tries=0,t=setInterval(function(){tries++;try{run()}catch(e){}if(document.getElementById('dxnPriorityNotice')||tries>240)clearInterval(t)},250);
})();
