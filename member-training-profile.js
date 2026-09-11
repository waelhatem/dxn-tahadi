/* V86.13 — Robust detailed member profile opener. */
(function(){
  if(window.__DXN_MEMBER_TRAINING_PROFILE_V8613__) return;
  window.__DXN_MEMBER_TRAINING_PROFILE_V8613__=true;

  function escLocal(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
  }
  function pctOf(p){
    return Math.max(0,Math.min(100,Number(p&&p.completed===true?100:(p&&p.watch_percent||0))));
  }
  function watched(p){
    return !!p&&(p.completed===true||Number(p.watch_percent||0)>0||Number(p.watched_seconds||0)>0);
  }

  function detailedMemberProfile(id){
    try{
      var members=(window.data&&Array.isArray(window.data.members))?window.data.members:[];
      var m=members.find(function(x){return String(x.id)===String(id)});
      if(!m){
        if(typeof window.toast==='function') window.toast('تعذر العثور على بيانات العضو.');
        return;
      }
      var snap=(typeof window.memberActivitySnapshot==='function' ? window.memberActivitySnapshot().find(function(x){return String(x.id)===String(id)}) : null)||m;
      var submissions=(window.data&&Array.isArray(window.data.my_submissions))?window.data.my_submissions:[];
      var subs=submissions.filter(function(x){return String(x.member_id||x.memberId)===String(id)});
      var approved=subs.filter(function(x){return x.status==='approved'}).length;
      var td=window.trainingData||{};
      var lessons=(Array.isArray(td.lessons)?td.lessons:[]).filter(function(x){return x.active!==false}).sort(function(a,b){return Number(a.lesson_no)-Number(b.lesson_no)});
      var progress=Array.isArray(td.member_progress)?td.member_progress:[];
      var mine=progress.filter(function(x){return String(x.member_id||x.memberId)===String(id)});
      if(!mine.length && Array.isArray(td.my_progress)) mine=td.my_progress.filter(function(x){return String(x.member_id||x.memberId)===String(id)});
      var byLesson=new Map(mine.map(function(x){return [String(x.lesson_id),x]}));
      var watchedCount=lessons.filter(function(l){return watched(byLesson.get(String(l.id)))}).length;
      var done=lessons.filter(function(l){var p=byLesson.get(String(l.id));return p&&p.completed===true}).length;
      var avgPct=lessons.length?Math.round(lessons.reduce(function(a,l){return a+pctOf(byLesson.get(String(l.id)))},0)/lessons.length):0;
      var pts=Number(snap._pts||0);
      var target=Math.max(0,100-pts);
      var badgeCount=0;
      try{
        if(typeof window.getBadges==='function'){
          var old=window.me;window.me=m;badgeCount=(window.getBadges()||[]).filter(function(b){return b.earned}).length;window.me=old;
        }
      }catch(e){}
      var trainingError=td.error||'';
      var lessonRows=lessons.map(function(l){
        var p=byLesson.get(String(l.id)),pct=pctOf(p),was=watched(p);
        var status=p&&p.completed===true?'✅ مكتمل فعليًا':was?'▶️ تمت مشاهدة '+Math.round(pct)+'%':'⚪ لم يُشاهد';
        var watchedSec=Number(p&&p.watched_seconds||0),duration=Number(p&&p.duration_seconds||0);
        var timeText=duration>0?' · '+Math.floor(watchedSec/60)+':'+String(Math.floor(watchedSec%60)).padStart(2,'0')+' / '+Math.floor(duration/60)+':'+String(Math.floor(duration%60)).padStart(2,'0'):'';
        var updated=p&&(p.updated_at||p.last_update_at||p.completed_at);
        var updatedText=updated?' · 🕐 '+new Date(updated).toLocaleString('ar-IQ'):'';
        return '<div class="row" style="display:block;padding:12px 0"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="flex:1"><b>📚 '+escLocal(l.lesson_no)+'. '+escLocal(l.title||'التدريب')+'</b><div class="muted" style="margin-top:4px">'+status+timeText+updatedText+'</div></div><b style="font-size:18px;white-space:nowrap">'+Math.round(pct)+'%</b></div><div class="bar" style="margin-top:8px;height:9px"><span style="width:'+Math.round(pct)+'%"></span></div></div>';
      }).join('');
      var oldModal=document.getElementById('memberProfileModal');if(oldModal)oldModal.remove();
      var modal=document.createElement('div');modal.id='memberProfileModal';
      var level='';try{level=typeof window.getLevel==='function'?(window.getLevel(m.stars).current.name||''):''}catch(e){}
      var rating='';try{rating=typeof window.memberRatingCard==='function'?window.memberRatingCard(id,window.role||''):''}catch(e){}
      modal.innerHTML='<div class="evidence-backdrop" onclick="closeMemberProfile()"></div><div class="evidence-modal card" style="max-width:800px;max-height:90vh;overflow:auto"><div class="row"><div><h2 style="margin:0">👤 '+escLocal(m.name||'عضو')+'</h2><div class="muted">🪪 '+escLocal(m.member_no||'')+' · '+escLocal(m.team_name||'بدون فريق')+'</div></div><button type="button" onclick="closeMemberProfile()">✖️</button></div><div class="command-grid"><div class="command-card"><div class="muted">⭐ النجوم</div><div class="command-big stars">'+Number(m.stars||0)+'</div><div class="muted">'+escLocal(level)+'</div></div><div class="command-card"><div class="muted">🎯 نقاط DXN</div><div class="command-big">'+pts+'/100</div><div class="bar"><span style="width:'+Math.min(100,pts)+'%"></span></div><div class="muted">'+(target?'باقي '+target+' نقطة':'🎉 التارجت محقق')+'</div></div><div class="command-card"><div class="muted">📚 المكتمل فعليًا</div><div class="command-big">'+done+'/'+lessons.length+'</div><div class="muted">إكمال موثّق بالمشاهدة الفعلية</div></div><div class="command-card"><div class="muted">🎬 تمت المشاهدة</div><div class="command-big">'+watchedCount+'/'+lessons.length+'</div><div class="muted">متوسط المشاهدة '+avgPct+'%</div></div><div class="command-card"><div class="muted">🏅 الشارات</div><div class="command-big">'+badgeCount+'</div><div class="muted">شارات مكتسبة</div></div></div>'+rating+'<div class="card" style="margin-top:10px;background:linear-gradient(135deg,#f7fcf9,#fff);border:2px solid #cfe4da"><div class="title">📚 سجل التدريبات التفصيلي</div><p class="muted" style="line-height:1.8;margin:6px 0 10px">هذا السجل يعرض التدريبات الثمانية واحدًا واحدًا، ونسبة المشاهدة المسجلة لكل فيديو، والزمن المسجل عند توفره، وهل تم اعتماد الإكمال فعليًا. <b>النجوم ليست دليلًا على المشاهدة.</b></p>'+(trainingError?'<div class="challenge" style="border-color:#f0b7b2;background:#fff7f6"><b>⚠️ تعذر تحميل سجل التدريب</b><div class="muted" style="margin-top:5px">'+escLocal(trainingError)+'</div></div>':(lessons.length?lessonRows:'<div class="empty">لا توجد تدريبات نشطة حاليًا.</div>'))+'</div><div class="card" style="margin-top:10px"><b>📊 الحالة التشغيلية</b><div class="row"><span>آخر نشاط</span><b>'+ (snap._days===null||snap._days===undefined?'لم يبدأ بعد':snap._days===0?'اليوم':'منذ '+snap._days+' أيام')+'</b></div><div class="row"><span>⏳ إنجازات معلقة</span><b>'+Number(snap._pending||0)+'</b></div><div class="row"><span>✅ إنجازات معتمدة</span><b>'+approved+'</b></div><div class="row"><span>📅 مدة العضوية</span><b>'+ (snap._joinedDays===null||snap._joinedDays===undefined?'غير مسجلة':snap._joinedDays+' يوم')+'</b></div></div><div class="command-actions"><button type="button" class="primary" onclick="closeMemberProfile();switchTab(\'teams\')">👥 إدارة العضو</button><button type="button" onclick="closeMemberProfile();switchTab(\'leader\')">👑 العودة لمركز القيادة</button></div></div>';
      document.body.appendChild(modal);
      if(typeof window.applyI18n==='function')try{window.applyI18n()}catch(e){}
    }catch(e){
      console.error('V86.13 member profile',e);
      if(typeof window.toast==='function')window.toast('تعذر فتح الملف التفصيلي: '+(e&&e.message?e.message:'خطأ غير معروف'));
    }
  }

  window.openMemberProfile=detailedMemberProfile;
  window.__DXNOpenDetailedMemberProfile=detailedMemberProfile;

  function wireButtons(){
    try{
      document.querySelectorAll('button').forEach(function(btn){
        var text=(btn.textContent||'').trim();
        if(!text.includes('الملف التفصيلي')||btn.__dxnProfileV8613)return;
        btn.__dxnProfileV8613=true;
        var attr=btn.getAttribute('onclick')||'';
        var match=attr.match(/openMemberProfile\s*\(\s*[\'\"]?([^\'\")\s]+)[\'\"]?\s*\)/);
        var id=match?match[1]:btn.dataset.memberId||'';
        btn.dataset.memberProfileId=id;
        btn.addEventListener('click',function(e){
          e.preventDefault();e.stopImmediatePropagation();
          var x=btn.dataset.memberProfileId;
          if(x)detailedMemberProfile(x);else if(typeof window.toast==='function')window.toast('تعذر تحديد عضو الملف التفصيلي.');
        },true);
      });
    }catch(e){console.debug('V86.13 profile button wiring',e)}
  }
  window.__DXNWireMemberProfileButtons=wireButtons;
  wireButtons();
  new MutationObserver(wireButtons).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
})();
