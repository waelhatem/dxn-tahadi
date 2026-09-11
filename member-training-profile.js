/* V86.12 — detailed training tracking for leader and member profiles. */
(function(){
  if(window.__DXN_MEMBER_TRAINING_PROFILE_V8612__)return;
  window.__DXN_MEMBER_TRAINING_PROFILE_V8612__=true;
  function pct(p){return Math.max(0,Math.min(100,Number(p&&p.completed===true?100:(p&&p.watch_percent||0))))}
  function watched(p){return !!p&&(p.completed===true||Number(p.watch_percent||0)>0||Number(p.watched_seconds||0)>0)}
  function installProfile(){
    if(typeof window.openMemberProfile!=='function'||window.openMemberProfile.__dxnV8612)return false;
    function detailed(id){
      var m=(data.members||[]).find(function(x){return String(x.id)===String(id)});if(!m)return;
      var lessons=(trainingData&&trainingData.lessons||[]).filter(function(x){return x.active!==false}).sort(function(a,b){return Number(a.lesson_no)-Number(b.lesson_no)});
      var ps=(trainingData&&trainingData.my_progress||[]).filter(function(x){return String(x.member_id||x.memberId)===String(id)});
      var map=new Map(ps.map(function(x){return [String(x.lesson_id),x]}));
      var done=lessons.filter(function(l){var p=map.get(String(l.id));return p&&p.completed===true}).length;
      var started=lessons.filter(function(l){return watched(map.get(String(l.id)))}).length;
      var rows=lessons.map(function(l){var p=map.get(String(l.id)),v=pct(p),w=watched(p);return '<div class="row" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>📚 '+esc(l.lesson_no)+'. '+esc(l.title||'التدريب')+'</b><div class="muted">'+(p&&p.completed===true?'✅ مكتمل فعليًا':w?'▶️ تمت مشاهدة '+Math.round(v)+'%':'⚪ لم يُشاهد')+'</div></div><b>'+Math.round(v)+'%</b></div><div class="bar" style="margin-top:7px"><span style="width:'+Math.round(v)+'%"></span></div></div>'}).join('');
      var old=document.getElementById('memberProfileModal');if(old)old.remove();
      var modal=document.createElement('div');modal.id='memberProfileModal';modal.innerHTML='<div class="evidence-backdrop" onclick="closeMemberProfile()"></div><div class="evidence-modal card" style="max-width:800px;max-height:90vh;overflow:auto"><div class="row"><div><h2 style="margin:0">👤 '+esc(m.name||'عضو')+'</h2><div class="muted">🪪 '+esc(m.member_no||'')+' · '+esc(m.team_name||'بدون فريق')+'</div></div><button onclick="closeMemberProfile()">✖️</button></div><div class="command-grid"><div class="command-card"><div class="muted">📚 المكتمل فعليًا</div><div class="command-big">'+done+'/'+lessons.length+'</div></div><div class="command-card"><div class="muted">🎬 تمت مشاهدته</div><div class="command-big">'+started+'/'+lessons.length+'</div></div></div><div class="card" style="margin-top:10px"><div class="title">📚 سجل التدريبات التفصيلي</div><p class="muted">كل تدريب له نسبة مستقلة؛ إكمال تدريب لا يرفع نسبة أي تدريب آخر.</p>'+rows+'</div></div>';document.body.appendChild(modal);
    }
    detailed.__dxnV8612=true;window.openMemberProfile=detailed;return true;
  }
  function patchLeader(){
    if(typeof role==='undefined'||role!=='leader'||typeof trainingData==='undefined'||typeof data==='undefined')return;
    var card=[].find?Array.from(document.querySelectorAll('.card')).find(function(c){return /الشروحات والتدريبات/.test(c.textContent||'')}):null;
    if(!card||card.__dxnV8612)return;
    var lessons=(trainingData.lessons||[]).filter(function(x){return x.active!==false});var mp=trainingData.member_progress||[];var members=data.members||[];
    var rows=mp.map(function(p){var id=String(p.member_id||p.memberId||''),m=members.find(function(x){return String(x.id)===id})||p;var total=Number(lessons.length||p.total_lessons||0),done=Math.min(total,Number(p.completed_lessons||0)),v=total?Math.round(done*100/total):0;return '<div class="row"><div style="flex:1"><b>'+esc(m.name||'عضو')+'</b><div class="muted">🪪 '+esc(m.member_no||'')+' · 📚 '+done+' من '+total+' تدريبات مكتملة فعليًا</div><div class="bar"><span style="width:'+v+'%"></span></div></div><button class="primary" type="button" onclick="openMemberProfile(\''+id+'\')">👤 الملف التفصيلي</button></div>'}).join('');
    card.innerHTML='<div class="title">📚 الشروحات والتدريبات</div><p class="muted">متابعة دقيقة لكل عضو. لا توجد نسبة عامة تخفي اختلاف التقدم بين التدريبات.</p><div class="admin-toolbar"><button class="primary" onclick="openTrainingManager()">📚 إدارة التدريبات</button><button onclick="refresh()">🔄 تحديث</button></div><div style="margin-top:14px">'+(rows||'<div class="empty">لا توجد بيانات مشاهدة بعد.</div>')+'</div>';card.__dxnV8612=true;
  }
  var tries=0,t=setInterval(function(){try{var a=installProfile();patchLeader();if(a&&document.querySelector('.card')){}if(++tries>300)clearInterval(t)}catch(e){console.error('V86.12 training detail',e);if(++tries>300)clearInterval(t)}},100);
  var obs=new MutationObserver(function(){patchLeader()});
  if(document.body)obs.observe(document.body,{childList:true,subtree:true});
})();