/* V86.44.6 — زر اختبار التدريب تحت زر المشاهدة/البدء مع قفل مطابق لفتح التدريب */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_BUTTONS_V86446__) return;
  window.__DXN_TRAINING_ASSESSMENT_BUTTONS_V86446__=true;

  function isMember(){
    var r=String(window.role||window.currentRole||'').toLowerCase();
    return r==='member' || !!document.querySelector('[data-role="member"]') || !!document.getElementById('dxn-training-assessment');
  }
  function lessons(){
    var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];
    return ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)});
  }
  function videoId(url){
    var s=String(url||'');
    var m=s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);if(m)return m[1];
    m=s.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);if(m)return m[1];
    m=s.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/i);return m?m[1]:'';
  }
  function ytNodes(){return Array.prototype.slice.call(document.querySelectorAll('iframe[src*="youtube.com"],iframe[src*="youtube-nocookie.com"],a[href*="youtu.be/"],a[href*="youtube.com/"]'))}
  function trainingCards(){return Array.prototype.slice.call(document.querySelectorAll('.card')).filter(function(card){
    var text=String(card.textContent||'');
    return /التدريب\s*\d+/.test(text) && (card.querySelector('iframe[src*="youtube"],a[href*="youtu.be"],a[href*="youtube.com"]') || /مشاهدة|بدء التدريب|ابدأ التدريب|التدريب/.test(text));
  })}
  function findCard(lesson,index){
    var id=videoId(lesson.video_url||lesson.url||lesson.video||''),nodes=ytNodes();
    if(id){
      for(var i=0;i<nodes.length;i++){
        var ref=String(nodes[i].src||nodes[i].href||'');
        if(videoId(ref)===id){
          var n=nodes[i];
          for(var d=0;d<8&&n;d++,n=n.parentElement)if(n.classList&&n.classList.contains('card'))return n;
          if(nodes[i].parentElement)return nodes[i].parentElement;
        }
      }
    }
    return trainingCards()[index]||null;
  }
  function actionButtons(card){
    if(!card)return [];
    return Array.prototype.slice.call(card.querySelectorAll('button,a')).filter(function(el){
      if(el.hasAttribute('data-training-assessment-button'))return false;
      var t=String(el.textContent||'').trim(),href=String(el.getAttribute('href')||'');
      return /مشاهدة|بدء التدريب|ابدأ التدريب|التدريب/.test(t) || /youtu\.be|youtube\.com/.test(href);
    });
  }
  function isLocked(card,action){
    if(action&&action.disabled)return true;
    if(action&&String(action.getAttribute('aria-disabled')||'').toLowerCase()==='true')return true;
    var text=String((action&&action.textContent)||card&&card.textContent||'');
    if(/🔒|مغلق|مقفل|غير متاح|افتح التدريب|لم يفتح/.test(text))return true;
    var cls=String((action&&action.className)||'')+' '+String(card&&card.className||'');
    return /locked|lock|disabled/i.test(cls);
  }
  function findAssessment(no){
    var root=document.getElementById('dxn-training-assessment');if(!root)return null;
    var ds=Array.prototype.slice.call(root.querySelectorAll('details'));
    for(var i=0;i<ds.length;i++)if(new RegExp('التدريب\\s*'+Number(no)+'(?:\\D|:)').test(String(ds[i].textContent||'')))return ds[i];
    return ds[Number(no)-1]||null;
  }
  function goToAssessment(no){
    var d=findAssessment(no);
    if(!d){alert('لم يتم تحميل اختبار هذا التدريب بعد. أعد فتح صفحة التدريبات مرة أخرى.');return}
    d.open=true;d.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(function(){var q=d.querySelector('textarea');if(q)q.focus({preventScroll:true})},450);
  }
  window.openTrainingAssessment=function(no){goToAssessment(no)};
  function addButton(card,lesson,action){
    if(!card||card.querySelector('[data-training-assessment-button="'+Number(lesson.lesson_no)+'"]'))return;
    var no=Number(lesson.lesson_no),locked=isLocked(card,action),b=document.createElement('button');
    b.type='button';b.setAttribute('data-training-assessment-button',String(no));
    b.style.cssText='width:100%;margin-top:8px;border:1px solid '+(locked?'#d8dee0':'#cfe4da')+';background:'+(locked?'#eef1f1':'#eef8f2')+';color:'+(locked?'#7b8790':'#0f513f')+';font-weight:950;min-height:44px';
    b.disabled=locked;b.title=locked?'يُفتح الاختبار عند فتح التدريب بالتقدم.':'الانتقال إلى اختبار هذا التدريب';
    b.innerHTML=locked?'🔒 اختبار التدريب — مغلق حتى يفتح التدريب':'🧠 اختبار التدريب';
    if(!locked)b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();goToAssessment(no)});
    if(action&&action.parentNode)action.parentNode.insertBefore(b,action.nextSibling);
    else{var actions=card.querySelector('.actions');if(actions)actions.appendChild(b);else card.appendChild(b)}
  }
  function refresh(){
    if(!isMember())return;
    var ls=lessons();if(!ls.length)return;
    ls.forEach(function(l,i){
      var card=findCard(l,i);if(!card)return;
      var action=actionButtons(card)[0]||null;addButton(card,l,action);
      var b=card.querySelector('[data-training-assessment-button="'+Number(l.lesson_no)+'"]');if(!b)return;
      var locked=isLocked(card,action);b.disabled=locked;
      b.style.background=locked?'#eef1f1':'#eef8f2';b.style.color=locked?'#7b8790':'#0f513f';b.style.borderColor=locked?'#d8dee0':'#cfe4da';
      b.innerHTML=locked?'🔒 اختبار التدريب — مغلق حتى يفتح التدريب':'🧠 اختبار التدريب';b.title=locked?'يُفتح الاختبار عند فتح التدريب بالتقدم.':'الانتقال إلى اختبار هذا التدريب';
      if(!locked&&!b.__dxnBound){b.__dxnBound=true;b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();goToAssessment(Number(l.lesson_no))})}
    });
  }
  var tries=0;function boot(){refresh();if(++tries<80)setTimeout(boot,500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  try{new MutationObserver(function(){clearTimeout(window.__dxnAssessmentButtonTimer);window.__dxnAssessmentButtonTimer=setTimeout(refresh,80)}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','class','aria-disabled']})}catch(e){}
})();
