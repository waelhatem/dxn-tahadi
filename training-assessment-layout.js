/* V86.44.3 — ترتيب اختبارات التدريب مباشرة تحت فيديو التدريب */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_LAYOUT_V86443__) return;
  window.__DXN_TRAINING_ASSESSMENT_LAYOUT_V86443__=true;

  function lessons(){
    var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];
    return ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)});
  }
  function videoId(url){
    var s=String(url||'');
    var m=s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);
    return m?m[1]:'';
  }
  function findVideoAnchor(lesson,index){
    var id=videoId(lesson.video_url||lesson.url||'');
    var frames=[].slice.call(document.querySelectorAll('iframe[src*="youtube"]'));
    if(id){
      for(var i=0;i<frames.length;i++) if(String(frames[i].src||'').indexOf(id)!==-1) return frames[i];
    }
    return frames[index]||null;
  }
  function candidate(anchor,lesson){
    if(!anchor)return null;
    var title=String(lesson.title||lesson.lesson_title||'').trim();
    var node=anchor;
    for(var depth=0;depth<7&&node&&node.parentElement;depth++,node=node.parentElement){
      var txt=String(node.textContent||'');
      var frameCount=node.querySelectorAll?node.querySelectorAll('iframe[src*="youtube"]').length:0;
      if((title&&txt.indexOf(title)!==-1&&frameCount===1) || (frameCount===1 && node.classList&&node.classList.contains('card'))) return node;
    }
    return anchor.parentElement||anchor;
  }
  function arrange(){
    if(typeof role!=='undefined' && role!=='member')return;
    var root=document.getElementById('dxn-training-assessment');
    if(!root)return;
    var details=[].slice.call(root.querySelectorAll(':scope > details'));
    if(!details.length)return;
    var ls=lessons();
    details.forEach(function(d){
      if(d.dataset.dxnPlaced==='1')return;
      var m=(d.querySelector('summary .title')||{}).textContent||'';
      var noMatch=m.match(/التدريب\s+(\d+)/);
      var no=noMatch?Number(noMatch[1]):0;
      var lesson=ls.find(function(x){return Number(x.lesson_no)===no})||{lesson_no:no};
      var anchor=findVideoAnchor(lesson,Math.max(0,no-1));
      var target=candidate(anchor,lesson);
      if(!target||!target.parentNode)return;
      target.parentNode.insertBefore(d,target.nextSibling);
      d.dataset.dxnPlaced='1';
      d.style.marginTop='14px';
      d.style.marginBottom='18px';
      d.style.border='2px solid #cfe4da';
      d.style.background='linear-gradient(135deg,#f8fcfa,#fff)';
    });
    if(details.every(function(d){return d.dataset.dxnPlaced==='1'})){
      var intro=root.querySelector('.title');
      var progress=root.querySelector('.progress-grid');
      var note=root.querySelector('p.muted');
      root.style.marginBottom='14px';
      if(intro)intro.textContent='🧠 اختبارات استيعاب التدريبات';
      if(note)note.textContent='شاهد كل تدريب ثم أجب عن أسئلته مباشرة تحته. الإجابة النموذجية مخفية عن العضو وتظهر للقائد عند المراجعة.';
      root.dataset.dxnArranged='1';
    }
  }
  function start(){
    var tries=0;
    var timer=setInterval(function(){
      arrange();
      if(++tries>120)clearInterval(timer);
    },250);
    new MutationObserver(function(){
      if(!document.getElementById('dxn-training-assessment'))return;
      arrange();
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
