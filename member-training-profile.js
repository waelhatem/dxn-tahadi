/* V86.10 — Detailed member training profile. Loaded by config.js after the main app script. */
(function(){
  if(window.__DXN_MEMBER_TRAINING_PROFILE_V8610__) return;
  window.__DXN_MEMBER_TRAINING_PROFILE_V8610__=true;
  function install(){
    try{
      if(typeof window.openMemberProfile!=='function') return false;
      if(window.openMemberProfile.__dxnV8610) return true;
      var original=window.openMemberProfile;
      function detailedMemberProfile(id){
        var m=(data.members||[]).find(function(x){return String(x.id)===String(id)}); if(!m)return;
        var snap=memberActivitySnapshot().find(function(x){return String(x.id)===String(id)})||m;
        var subs=(data.my_submissions||[]).filter(function(x){return String(x.member_id||x.memberId)===String(id)});
        var approved=subs.filter(function(x){return x.status==='approved'}).length;
        var lessons=(trainingData&&trainingData.lessons||[]).filter(function(x){return x.active!==false}).sort(function(a,b){return Number(a.lesson_no)-Number(b.lesson_no)});
        var allProgress=(trainingData&&trainingData.my_progress||[]).filter(function(x){return String(x.member_id||x.memberId)===String(id)});
        var byLesson=new Map(allProgress.map(function(x){return [String(x.lesson_id),x]}));
        var pctOf=function(p){return Math.max(0,Math.min(100,Number(p&&p.completed===true?100:(p&&p.watch_percent||0))))};
        var watched=function(p){return !!p&&(p.completed===true||Number(p.watch_percent||0)>0||Number(p.watched_seconds||0)>0)};
        var watchedCount=lessons.filter(function(l){return watched(byLesson.get(String(l.id)))}).length;
        var done=lessons.filter(function(l){return byLesson.get(String(l.id))&&byLesson.get(String(l.id)).completed===true}).length;
        var avgPct=lessons.length?Math.round(lessons.reduce(function(a,l){return a+pctOf(byLesson.get(String(l.id)))},0)/lessons.length):0;
        var target=Math.max(0,100-snap._pts);
        var badgeCount=(function(){var old=me;me=m;var n=getBadges().filter(function(b){return b.earned}).length;me=old;return n})();
        var trainingError=trainingData&&trainingData.error||'';
        var lessonRows=lessons.map(function(l){
          var p=byLesson.get(String(l.id)), pct=pctOf(p), was=watched(p);
          var status=p&&p.completed===true?'✅ مكتمل فعليًا':was?'▶️ تمت مشاهدة '+Math.round(pct)+'%':'⚪ لم يُشاهد';
          var watchedSec=Number(p&&p.watched_seconds||0), duration=Number(p&&p.duration_seconds||0);
          var timeText=duration>0?' · '+Math.floor(watchedSec/60)+':'+String(Math.floor(watchedSec%60)).padStart(2,'0')+' / '+Math.floor(duration/60)+':'+String(Math.floor(duration%60)).padStart(2,'0'):'';
          var updated=p&&(p.updated_at||p.last_update_at||p.completed_at);
          var updatedText=updated?' · 🕐 '+new Date(updated).toLocaleString('ar-IQ'):'';
          return '<div class="row" style="display:block;padding:12px 0"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="flex:1"><b>📚 '+esc(l.lesson_no)+'. '+esc(l.title||'التدريب')+'</b><div class="muted" style="margin-top:4px">'+status+timeText+updatedText+'</div></div><b style="font-size:18px;white-space:nowrap">'+Math.round(pct)+'%</b></div><div class="bar" style="margin-top:8px;height:9px"><span style="width:'+Math.round(pct)+'%"></span></div></div>';
        }).join('');
        var modal=document.createElement('div'); modal.id='memberProfileModal';
        modal.innerHTML='<div class="evidence-backdrop" onclick="closeMemberProfile()"></div><div class="evidence-modal card" style="max-width:800px;max-height:90vh;overflow:auto"><div class="row"><div><h2 style="margin:0">👤 '+esc(m.name||'عضو')+'</h2><div class="muted">🪪 '+esc(m.member_no||'')+' · '+esc(m.team_name||'بدون فريق')+'</div></div><button onclick="closeMemberProfile()">✖️</button></div><div class="command-grid"><div class="command-card"><div class="muted">⭐ النجوم</div><div class="command-big stars">'+Number(m.stars||0)+'</div><div class="muted">'+esc(getLevel(m.stars).current.name)+'</div></div><div class="command-card"><div class="muted">🎯 نقاط DXN</div><div class="command-big">'+snap._pts+'/100</div><div class="bar"><span style="width:'+Math.min(100,snap._pts)+'%"></span></div><div class="muted">'+(target?'باقي '+target+' نقطة':'🎉 التارجت محقق')+'</div></div><div class="command-card"><div class="muted">📚 المكتمل فعليًا</div><div class="command-big">'+done+'/'+lessons.length+'</div><div class="muted">إكمال موثّق بالمشاهدة الفعلية</div></div><div class="command-card"><div class="muted">🎬 تمت المشاهدة</div><div class="command-big">'+watchedCount+'/'+lessons.length+'</div><div class="muted">متوسط المشاهدة '+avgPct+'%</div></div><div class="command-card"><div class="muted">🏅 الشارات</div><div class="command-big">'+badgeCount+'</div><div class="muted">شارات مكتسبة</div></div></div>'+memberRatingCard(id,role)+'<div class="card" style="margin-top:10px;background:linear-gradient(135deg,#f7fcf9,#fff);border:2px solid #cfe4da"><div class="title">📚 سجل التدريبات التفصيلي</div><p class="muted" style="line-height:1.8;margin:6px 0 10px">هذا السجل يعرض التدريبات الثمانية واحدًا واحدًا، ونسبة المشاهدة المسجلة لكل فيديو، والزمن المسجل عند توفره، وهل تم اعتماد الإكمال فعليًا. <b>النجوم ليست دليلًا على المشاهدة.</b></p>'+(trainingError?'<div class="challenge" style="border-color:#f0b7b2;background:#fff7f6"><b>⚠️ تعذر تحميل سجل التدريب</b><div class="muted" style="margin-top:5px">'+esc(trainingError)+'</div></div>':(lessons.length?lessonRows:'<div class="empty">لا توجد تدريبات نشطة حاليًا.</div>'))+'</div><div class="card" style="margin-top:10px"><b>📊 الحالة التشغيلية</b><div class="row"><span>آخر نشاط</span><b>'+ (snap._days===null?'لم يبدأ بعد':snap._days===0?'اليوم':'منذ '+snap._days+' أيام')+'</b></div><div class="row"><span>⏳ إنجازات معلقة</span><b>'+snap._pending+'</b></div><div class="row"><span>✅ إنجازات معتمدة</span><b>'+approved+'</b></div><div class="row"><span>📅 مدة العضوية</span><b>'+ (snap._joinedDays===null?'غير مسجلة':snap._joinedDays+' يوم')+'</b></div></div><div class="command-actions"><button class="primary" onclick="closeMemberProfile();switchTab(\'teams\')">👥 إدارة العضو</button><button onclick="closeMemberProfile();switchTab(\'leader\')">👑 العودة لمركز القيادة</button></div></div>';
        document.body.appendChild(modal);
      }
      detailedMemberProfile.__dxnV8610=true;
      detailedMemberProfile.__dxnOriginal=original;
      window.openMemberProfile=detailedMemberProfile;
      return true;
    }catch(e){console.error('V86.10 member profile patch',e);return false}
  }
  var tries=0, timer=setInterval(function(){if(install()||++tries>300)clearInterval(timer)},100);
})();
