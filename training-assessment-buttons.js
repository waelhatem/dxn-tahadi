/* V86.46.52 — زر المشاهدة والاختبار مع التمييز الدقيق بين العضو والقائد */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_BUTTONS_V864652__) return;
  window.__DXN_TRAINING_ASSESSMENT_BUTTONS_V864652__ = true;

  function addStyles(){
    if(document.getElementById('dxn-training-assessment-inline-style')) return;
    var s = document.createElement('style');
    s.id = 'dxn-training-assessment-inline-style';
    s.textContent = ''
      + '.dxn-training-assessment-card-fixed{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}'
      + '.dxn-training-title-host{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}'
      + '.dxn-training-title-anchor{display:block!important;width:100%!important;box-sizing:border-box!important;margin-bottom:10px!important;text-align:right!important}'
      + '.dxn-training-action-row{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;flex-wrap:nowrap!important;direction:rtl!important;margin:0 0 12px!important;min-width:0!important}'
      + '.dxn-training-action-row>.dxn-training-primary-action{flex:0 0 auto!important;width:auto!important;min-width:0!important;max-width:100%!important;margin:0!important;box-sizing:border-box!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}'
      + '.dxn-training-action-row>[data-training-assessment-button]{flex:0 0 auto!important;width:auto!important;min-width:max-content!important;max-width:100%!important;padding:9px 12px!important;margin:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;white-space:nowrap!important}'
      + '@media(max-width:600px){.dxn-training-title-anchor{font-size:18px!important;line-height:1.45!important}.dxn-training-action-row{gap:6px!important;margin-bottom:10px!important;overflow-x:auto!important}.dxn-training-action-row>[data-training-assessment-button],.dxn-training-action-row>.dxn-training-primary-action{min-height:40px!important;font-size:13px!important;padding:8px 10px!important}}'
      + '@media(max-width:390px){.dxn-training-action-row{gap:5px!important}.dxn-training-action-row>[data-training-assessment-button],.dxn-training-action-row>.dxn-training-primary-action{font-size:12px!important;padding:8px!important}}';
    (document.head || document.documentElement).appendChild(s);
  }

  // --- دوال التمييز بين القائد والعضو ---
  function getRole(){
    var r = (window.role || window.currentRole || localStorage.getItem('dxn_role') || localStorage.getItem('user_role') || '').toString().toLowerCase().trim();
    return r;
  }

  function isLeader(){
    var r = getRole();
    if (r === 'leader' || r === 'admin' || r === 'supervisor' || r === 'قائد') return true;
    if (document.querySelector('[data-role="leader"], [data-role="admin"], #leader-training-root, .leader-dashboard')) return true;
    return false;
  }

  function isMember(){
    if (isLeader()) return false; // إذا كان قائداً يتم استبعاده فوراً من تصنيف العضو العادي
    var r = getRole();
    return r === 'member' || r === 'عضو' || !!document.querySelector('[data-role="member"]') || !!document.getElementById('dxn-training-assessment');
  }

  function lessons(){
    var ls = (typeof trainingData !== 'undefined' && trainingData && Array.isArray(trainingData.lessons)) ? trainingData.lessons.slice() : [];
    return ls.filter(function(x){ return x && x.active !== false; }).sort(function(a, b){ return Number(a.lesson_no || 0) - Number(b.lesson_no || 0); });
  }

  function videoId(url){
    var s = String(url || ''), m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if(m) return m[1];
    m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
    if(m) return m[1];
    m = s.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/i);
    return m ? m[1] : '';
  }

  function ytNodes(){
    return Array.prototype.slice.call(document.querySelectorAll('iframe[src*="youtube.com"],iframe[src*="youtube-nocookie.com"],a[href*="youtu.be/"],a[href*="youtube.com/"]'));
  }

  function trainingCards(){
    return Array.prototype.slice.call(document.querySelectorAll('.card')).filter(function(card){
      var text = String(card.textContent || '');
      return /التدريب\s*\d+/.test(text) && (card.querySelector('iframe[src*="youtube"],a[href*="youtu.be"],a[href*="youtube.com"]') || /مشاهدة|بدء التدريب|ابدأ التدريب|التدريب/.test(text));
    });
  }

  function findCard(lesson, index){
    var id = videoId(lesson.video_url || lesson.url || lesson.video || ''), nodes = ytNodes();
    if(id){
      for(var i = 0; i < nodes.length; i++){
        var ref = String(nodes[i].src || nodes[i].href || '');
        if(videoId(ref) === id){
          var n = nodes[i];
          for(var d = 0; d < 8 && n; d++, n = n.parentElement){
            if(n.classList && n.classList.contains('card')) return n;
          }
          if(nodes[i].parentElement) return nodes[i].parentElement;
        }
      }
    }
    return trainingCards()[index] || null;
  }

  function actionButtons(card){
    if(!card) return [];
    return Array.prototype.slice.call(card.querySelectorAll('button,a')).filter(function(el){
      if(el.hasAttribute('data-training-assessment-button')) return false;
      var t = String(el.textContent || '').trim(), href = String(el.getAttribute('href') || '');
      return /مشاهدة|بدء التدريب|ابدأ التدريب|إعادة المشاهدة/.test(t) || /youtu\.be|youtube\.com/.test(href);
    });
  }

  function isLocked(card, action){
    // القائد لا يقفل أمامه الاختبار أبداً
    if(isLeader()) return false;

    if(action && action.disabled) return true;
    if(action && String(action.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true;
    var text = String((action && action.textContent) || (card && card.textContent) || '');
    if(/🔒|مغلق|مقفل|غير متاح|افتح التدريب|لم يفتح/.test(text)) return true;
    var cls = String((action && action.className) || '') + ' ' + String((card && card.className) || '');
    return /locked|lock|disabled/i.test(cls);
  }

  function titleNode(card, lesson){
    var wanted = String((lesson && (lesson.title || lesson.lesson_title)) || '').replace(/\s+/g, ' ').trim();
    var cands = card.querySelectorAll('.title,h2,h3,h4,strong,b');
    for(var i = 0; i < cands.length; i++){
      var t = String(cands[i].textContent || '').replace(/\s+/g, ' ').trim();
      if(t && (/التدريب\s*\d+/.test(t) || (wanted && t.indexOf(wanted) !== -1))) return cands[i];
    }
    return null;
  }

  function findAssessment(no){
    var root = document.getElementById('dxn-training-assessment');
    if(!root) return null;
    var ds = Array.prototype.slice.call(root.querySelectorAll('details'));
    for(var i = 0; i < ds.length; i++){
      if(new RegExp('التدريب\\s*' + Number(no) + '(?:\\D|:)').test(String(ds[i].textContent || ''))) return ds[i];
    }
    return ds[Number(no) - 1] || null;
  }

  function goToAssessment(no){
    var d = findAssessment(no);
    if(!d){
      alert('لم يتم تحميل اختبار هذا التدريب بعد.');
      return;
    }
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function(){
      var q = d.querySelector('textarea, input');
      if(q) q.focus({ preventScroll: true });
    }, 450);
  }

  window.openTrainingAssessment = function(no){ goToAssessment(no); };

  function ensureRow(card, lesson, action, b){
    if(!card || !action || !b) return;
    var title = titleNode(card, lesson);
    if(!title) return;
    var host = title.parentNode;
    if(!host) return;
    host.classList.add('dxn-training-title-host');
    title.classList.add('dxn-training-title-anchor');
    var row = host.querySelector(':scope > .dxn-training-action-row');
    if(!row){
      row = document.createElement('div');
      row.className = 'dxn-training-action-row';
      if(title.nextSibling) host.insertBefore(row, title.nextSibling);
      else host.appendChild(row);
    }
    action.classList.add('dxn-training-primary-action');
    if(action.parentNode !== row) row.appendChild(action);
    if(b.parentNode !== row) row.appendChild(b);
  }

  function addButton(card, lesson, action){
    if(!card || !action) return;
    var no = Number(lesson.lesson_no);
    var b = card.querySelector('[data-training-assessment-button="' + no + '"]');
    var leaderMode = isLeader();
    var locked = isLocked(card, action);

    if(!b){
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-training-assessment-button', String(no));
      b.addEventListener('click', function(e){
        if(b.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        goToAssessment(no);
      });
    }

    b.disabled = locked;
    b.setAttribute('aria-disabled', locked ? 'true' : 'false');
    b.setAttribute('data-dxn-assessment-locked', locked ? '1' : '0');
    b.setAttribute('data-dxn-assessment-ready', locked ? '0' : '1');

    // تخصيص المظهر والنص بحسب الحساب (قائد أم عضو)
    if(leaderMode){
      // شكل الزر لحساب القائد (متاح دائماً ومميز)
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:auto;max-width:100%;padding:9px 12px;border:1px solid #b6d4fe;background:#e7f1ff;color:#0d6efd;font-weight:950;min-height:42px;line-height:1.2;vertical-align:middle;white-space:nowrap;flex:0 0 auto;border-radius:10px;cursor:pointer;';
      b.innerHTML = '📋 معاينة اختبار التدريب';
      b.title = 'حساب قائد: استعراض تفاصيل وأسئلة الاختبار';
    } else {
      // شكل الزر لحساب العضو (مقفل / مفتوح حسب مشاهدة الفيديو)
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:auto;max-width:100%;padding:9px 12px;border:1px solid ' + (locked ? '#d8dee0' : '#cfe4da') + ';background:' + (locked ? '#eef1f1' : '#eef8f2') + ';color:' + (locked ? '#7b8790' : '#0f513f') + ';font-weight:950;min-height:42px;line-height:1.2;vertical-align:middle;white-space:nowrap;flex:0 0 auto;border-radius:10px;' + (locked ? 'cursor:not-allowed;' : 'cursor:pointer;');
      b.innerHTML = locked ? '🔒 اختبار التدريب' : '🧠 اختبار التدريب';
      b.title = locked ? 'أكمل مشاهدة فيديو التدريب بالكامل لفتح الاختبار.' : 'الانتقال إلى اختبار هذا التدريب';
    }

    ensureRow(card, lesson, action, b);
  }

  function refresh(){
    // يعمل للكلا الطرفين ولكن يميز الدور تلقائياً
    if(!isMember() && !isLeader()) return;
    addStyles();
    var ls = lessons();
    if(!ls.length) return;
    ls.forEach(function(l, i){
      var card = findCard(l, i);
      if(!card) return;
      card.classList.add('dxn-training-assessment-card-fixed');
      var action = actionButtons(card)[0] || null;
      if(!action) return;
      addButton(card, l, action);
    });
  }

  function schedule(){
    clearTimeout(window.__dxnAssessmentButtonTimer);
    window.__dxnAssessmentButtonTimer = setTimeout(refresh, 120);
  }

  function boot(){
    refresh();
    setTimeout(refresh, 350);
    setTimeout(refresh, 1000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch(e){}
  document.addEventListener('dxn:training-progress-updated', schedule);
  document.addEventListener('dxn:training-rendered', schedule);
})();
