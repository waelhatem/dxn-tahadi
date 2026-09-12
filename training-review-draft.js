/* V86.44.9 — تثبيت مسودة درجة وملاحظة القائد أثناء إعادة بناء الواجهة */
(function(){
  if(window.__DXN_TRAINING_REVIEW_DRAFT_V86449__) return;
  window.__DXN_TRAINING_REVIEW_DRAFT_V86449__=true;

  var drafts={};
  var KEY='dxn_training_review_drafts';

  function load(){
    try{drafts=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){drafts={}}
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(drafts))}catch(e){}
  }
  function idFrom(el){
    var id=String(el&&el.id||'');
    var m=id.match(/^(score|note)-(.+)$/);
    return m?m[2]:'';
  }
  function capture(el){
    var id=idFrom(el);if(!id)return;
    var d=drafts[id]||(drafts[id]={});
    if(String(el.id).indexOf('score-')===0)d.score=String(el.value==null?'':el.value);
    else d.note=String(el.value==null?'':el.value);
    save();
  }
  function restore(){
    document.querySelectorAll('[id^="score-"],[id^="note-"]').forEach(function(el){
      var id=idFrom(el),d=drafts[id];
      if(!d)return;
      if(String(el.id).indexOf('score-')===0 && d.score!=null)el.value=d.score;
      if(String(el.id).indexOf('note-')===0 && d.note!=null)el.value=d.note;
    });
  }
  document.addEventListener('input',function(e){
    var t=e.target;
    if(t&&t.id&&/^(score|note)-/.test(t.id))capture(t);
  },true);
  document.addEventListener('change',function(e){
    var t=e.target;
    if(t&&t.id&&/^(score|note)-/.test(t.id))capture(t);
  },true);

  var oldReview=window.reviewTrainingAnswer;
  var tries=0;
  var timer=setInterval(function(){
    if(typeof window.reviewTrainingAnswer==='function'){
      if(window.reviewTrainingAnswer.__dxnDraftWrapped)return;
      oldReview=window.reviewTrainingAnswer;
      window.reviewTrainingAnswer=async function(id,status){
        var d=drafts[String(id)]||{};
        var score=document.getElementById('score-'+id);
        var note=document.getElementById('note-'+id);
        if(score)d.score=String(score.value==null?'':score.value);
        if(note)d.note=String(note.value==null?'':note.value);
        save();
        try{
          var result=await oldReview.apply(this,arguments);
          delete drafts[String(id)];
          save();
          return result;
        }catch(e){throw e}
      };
      window.reviewTrainingAnswer.__dxnDraftWrapped=true;
      restore();
      clearInterval(timer);
    }else if(++tries>300)clearInterval(timer);
  },100);

  var mo=new MutationObserver(function(){restore()});
  mo.observe(document.body,{childList:true,subtree:true});
  load();
})();
