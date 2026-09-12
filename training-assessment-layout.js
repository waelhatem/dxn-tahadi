/* V86.44.4 — تثبيت موضع الاختبار مباشرة بعد فيديو كل تدريب */
(function(){
  if(window.__DXN_TRAINING_ASSESSMENT_LAYOUT_V86444__) return;
  window.__DXN_TRAINING_ASSESSMENT_LAYOUT_V86444__=true;
  function lessons(){var ls=(typeof trainingData!=='undefined'&&trainingData&&Array.isArray(trainingData.lessons))?trainingData.lessons.slice():[];return ls.filter(function(x){return x&&x.active!==false}).sort(function(a,b){return Number(a.lesson_no||0)-Number(b.lesson_no||0)})}
  function videoId(url){var s=String(url||''),m=s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/i);return m?m[1]:''}
  function ytIn(node){return node&&node.querySelectorAll?[].slice.call(node.querySelectorAll('a[href*="youtu.be"],a[href*="youtube.com"],iframe[src*="youtube.com"],iframe[src*="youtube-nocookie.com"])):[]}
  function ytAll(){return [].slice.call(document.querySelectorAll('a[href*="youtu.be"],a[href*="youtube.com"],iframe[src*="youtube.com"],iframe[src*="youtube-nocookie.com"]'))}
  function titleAnchor(title){title=String(title||'').trim();if(!title)return null;var ns=document.querySelectorAll('.title,h2,h3,h4,strong,b,summary');for(var i=0;i<ns.length;i++){var t=String(ns[i].textContent||'').replace(/\s+/g,' ').trim();if((t===title||t.indexOf(title)!==-1)&&!/اختبارات استيعاب|اختبارات التدريبات/.test(t))return ns[i]}return null}
  function findTarget(lesson,no){var title=lesson.title||lesson.lesson_title||'',a=titleAnchor(title),id=videoId(lesson.video_url||lesson.url||'');
    if(a){var node=a;for(var d=0;d<9&&node;d++,node=node.parentElement){var links=ytIn(node);if(id){for(var i=0;i<links.length;i++){if(String(links[i].href||links[i].src||'').indexOf(id)!==-1)return node}}if(links.length===1)return node}}
    var all=ytAll();if(id){for(var j=0;j<all.length;j++){if(String(all[j].href||all[j].src||'').indexOf(id)!==-1){var v=all[j],p=v.parentElement;for(var z=0;z<5&&p&&p.parentElement;z++,p=p.parentElement){if(ytIn(p).length===1)return p}return v.parentElement||v}}}
    if(all[no-1])return all[no-1].parentElement||all[no-1];
    return a||null;
  }
  function arrange(){if(typeof role!=='undefined'&&role!=='member')return;var root=document.getElementById('dxn-training-assessment');if(!root)return;var ds=[].slice.call(root.querySelectorAll('details'));if(!ds.length)return;var ls=lessons();ds.forEach(function(d){if(d.dataset.dxnPlaced==='1')return;var st=d.querySelector('summary .title'),m=String(st?st.textContent:'').match(/التدريب\s+(\d+)/),no=m?Number(m[1]):0,lesson=ls.find(function(x){return Number(x.lesson_no)===no})||{lesson_no:no},target=findTarget(lesson,no);if(!target||!target.parentNode)return;target.parentNode.insertBefore(d,target.nextSibling);d.dataset.dxnPlaced='1';d.classList.add('dxn-training-assessment-inline');d.style.setProperty('margin-top','14px','important');d.style.setProperty('margin-bottom','18px','important');d.style.setProperty('border','2px solid #cfe4da','important');d.style.setProperty('background','linear-gradient(135deg,#f8fcfa,#fff)','important')});if(ds.every(function(d){return d.dataset.dxnPlaced==='1'})){root.setAttribute('data-dxn-arranged','1');root.style.display='none'}}
  function start(){var tries=0,t=setInterval(function(){arrange();if(++tries>160)clearInterval(t)},250);new MutationObserver(function(){if(document.getElementById('dxn-training-assessment'))setTimeout(arrange,20)}).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
