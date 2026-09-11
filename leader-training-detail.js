/* V86.11 — Detailed per-lesson training progress in Leader Center. */
(function(){
  if(window.__DXN_LEADER_TRAINING_DETAIL_V8611__) return;
  window.__DXN_LEADER_TRAINING_DETAIL_V8611__=true;
  function pct(p){
    if(!p) return 0;
    if(p.completed===true) return 100;
    var n=Number(p.watch_percent);
    if(!isFinite(n) || n<0){
      var w=Number(p.watched_seconds||0), d=Number(p.duration_seconds||0);
      n=d>0?(w/d*100):0;
    }
    return Math.max(0,Math.min(100,Math.round(n)));
  }
  function watched(p){return !!p&&(p.completed===true||Number(p.watch_percent||0)>0||Number(p.watched_seconds||0)>0)}
  function timeText(p){
    var w=Number(p&&p.watched_seconds||0), d=Number(p&&p.duration_seconds||0);
    if(!(w>0||d>0)) return '';
    var f=function(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
    return ' · '+f(w)+(d>0?' / '+f(d):'');
  }
  function status(p,n){
    if(p&&p.completed===true) return '✅ مكتمل فعليًا';
    if(n>0) return '▶️ تمت مشاهدة '+n+'%';
    return '⚪ لم يُشاهد بعد';
  }
  function render(){
    try{
      if(typeof role==='undefined' || role!=='leader') return false;
      var box=document.getElementById('leader-training-center');
      if(!box || box.getAttribute('data-v8611')==='1') return false;
      var lessons=(trainingData&&trainingData.lessons||[]).filter(function(l){return l.active!==false}).sort(function(a,b){return Number(a.lesson_no)-Number(b.lesson_no)});
      var members=(data&&data.members||[]).filter(function(m){return m.active!==false});
      var progress=(trainingData&&trainingData.my_progress||[]).slice();
      var byKey={};
      progress.forEach(function(p){
        var key=String(p.member_id||p.memberId||'')+'::'+String(p.lesson_id||p.lessonId||'');
        var old=byKey[key];
        var nt=new Date(p.updated_at||p.last_update_at||p.completed_at||0).getTime()||0;
        var ot=old?new Date(old.updated_at||old.last_update_at||old.completed_at||0).getTime()||0:0;
        if(!old||nt>=ot) byKey[key]=p;
      });
      var rows=members.map(function(m){
        var mid=String(m.id);
        var watchedCount=0, done=0, sum=0;
        lessons.forEach(function(l){var p=byKey[mid+'::'+String(l.id)];var n=pct(p);if(watched(p))watchedCount++;if(p&&p.completed===true)done++;sum+=n});
        var avg=lessons.length?Math.round(sum/lessons.length):0;
        var lessonHtml=lessons.map(function(l){
          var p=byKey[mid+'::'+String(l.id)], n=pct(p);
          var upd=p&&(p.updated_at||p.last_update_at||p.completed_at);
          var date=upd?' · 🕐 '+new Date(upd).toLocaleString('ar-IQ'):'';
          return '<div class="card" style="margin:8px 0;padding:12px;background:#fff;border:1px solid var(--line);border-radius:14px">'
            +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'
            +'<div style="flex:1"><b>📚 التدريب '+esc(l.lesson_no)+': '+esc(l.title||'التدريب')+'</b>'
            +'<div class="muted" style="margin-top:4px">'+status(p,n)+timeText(p)+date+'</div></div>'
            +'<b style="font-size:20px;white-space:nowrap">'+n+'%</b></div>'
            +'<div class="bar" style="margin-top:9px;height:10px"><span style="width:'+n+'%"></span></div>'
            +'</div>';
        }).join('');
        return '<div class="card" style="margin-top:14px;border:2px solid #d7e7df;background:linear-gradient(135deg,#f7fcf9,#fff)">'
          +'<div class="row" style="padding-top:0"><div><div class="title">👤 '+esc(m.name||'عضو')+'</div><div class="muted">🪪 '+esc(m.member_no||'')+(m.team_name?' · 🏆 '+esc(m.team_name):'')+'</div></div>'
          +'<button class="primary" onclick="openMemberProfile(\''+esc(m.id)+'\')">👤 ملف العضو</button></div>'
          +'<div class="mini-grid" style="margin-top:10px"><div><b>🎬 التدريبات المشاهدة</b><div style="font-size:20px;font-weight:900;margin-top:4px">'+watchedCount+' / '+lessons.length+'</div></div><div><b>📊 متوسط المشاهدة</b><div style="font-size:20px;font-weight:900;margin-top:4px">'+avg+'%</div></div><div><b>✅ المكتمل فعليًا</b><div style="font-size:20px;font-weight:900;margin-top:4px">'+done+' / '+lessons.length+'</div></div></div>'
          +'<div style="margin-top:12px"><b>التفصيل لكل تدريب</b>'+ (lessonHtml||'<div class="empty">لا توجد تدريبات نشطة حاليًا.</div>') +'</div></div>';
      }).join('');
      box.setAttribute('data-v8611','1');
      box.innerHTML='<div class="title">📚 الشروحات والتدريبات — متابعة تفصيلية</div>'
        +'<p class="muted">تظهر هنا نسبة المشاهدة الحقيقية لكل تدريب لكل عضو بشكل مستقل. إذا توقف العضو عند 22% فستبقى 22% أمام ذلك التدريب، ولا تُجمع النسب في نسبة واحدة مضللة.</p>'
        +'<div class="admin-toolbar" style="margin-bottom:14px"><button class="primary" onclick="openTrainingManager()">📚 إدارة التدريبات</button><button onclick="refresh()">🔄 تحديث تقدم التدريب</button></div>'
        +(lessons.length?rows:'<div class="empty">لا توجد تدريبات نشطة حاليًا.</div>');
      return true;
    }catch(e){console.error('V86.11 leader training detail',e);return false}
  }
  var observer=new MutationObserver(function(){render()});
  function install(){
    try{
      observer.observe(document.body,{childList:true,subtree:true});
      var tries=0,t=setInterval(function(){if(render()||++tries>300)clearInterval(t)},100);
    }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
