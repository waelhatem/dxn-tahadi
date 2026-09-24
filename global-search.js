/* V1 — Global site search: members, teams, training, questions, challenges, notifications and visible pages. */
(function(){
  if(window.__DXN_GLOBAL_SEARCH_V1__)return;
  window.__DXN_GLOBAL_SEARCH_V1__=true;

  var state={items:[],modal:null,input:null,list:null};
  var navItems=[
    {title:'الرئيسية',keywords:'الرئيسية الصفحة الرئيسية dashboard home',tab:'home',icon:'🏠'},
    {title:'التحديات',keywords:'التحديات تحديات challenge challenges',tab:'challenges',icon:'🎯'},
    {title:'التدريب',keywords:'التدريب الدروس الحقيبة التدريبية trainings lessons',tab:'training',icon:'📚'},
    {title:'تقدّمي',keywords:'تقدمي التقدم progress',tab:'progress',icon:'📈'},
    {title:'الفرق والأعضاء',keywords:'الفرق الاعضاء الفريق teams members',tab:'teams',icon:'👥'},
    {title:'الإشعارات',keywords:'الاشعارات التنبيهات notifications',tab:'notifications',icon:'🔔'},
    {title:'الإعدادات',keywords:'الاعدادات settings',tab:'advanced',icon:'⚙️'},
    {title:'المجتمع',keywords:'المجتمع community',tab:'community',icon:'🌍'}
  ];

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function norm(v){
    return String(v==null?'':v).toLowerCase().normalize('NFKC')
      .replace(/[ًٌٍَُِّْـ]/g,'')
      .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function add(item){
    if(!item||!item.title)return;
    var key=[item.type,item.id||'',norm(item.title),norm(item.meta||'')].join('|');
    if(state.items.some(function(x){return x._key===key;}))return;
    item._key=key;
    item.search=norm([item.title,item.meta,item.keywords,item.extra].filter(Boolean).join(' '));
    state.items.push(item);
  }
  function addObj(type,obj,titleFields,metaFields,tab,icon){
    if(!obj)return;
    var title='';
    for(var i=0;i<titleFields.length;i++){if(obj[titleFields[i]]!=null&&String(obj[titleFields[i]]).trim()){title=String(obj[titleFields[i]]).trim();break;}}
    if(!title)return;
    var meta=[];
    (metaFields||[]).forEach(function(k){if(obj[k]!=null&&String(obj[k]).trim())meta.push(String(obj[k]).trim());});
    var extra=[];
    ['question','text','description','category','rank','status','member_no','memberNo','team_name','name','title','lesson_title'].forEach(function(k){
      if(obj[k]!=null)extra.push(String(obj[k]));
    });
    add({type:type,id:obj.id||obj.member_no||obj.memberNo||title,title:title,meta:meta.join(' · '),extra:extra.join(' '),tab:tab,icon:icon||'🔎',obj:obj});
  }

  function buildIndex(){
    state.items=[];
    navItems.forEach(add);

    try{
      var d=(typeof data!=='undefined'&&data)||{};
      (Array.isArray(d.members)?d.members:[]).forEach(function(m){
        addObj('member',m,['name','member_name','full_name'],['member_no','rank','team_name','status'], 'teams','👤');
      });
      (Array.isArray(d.teams)?d.teams:[]).forEach(function(t){
        addObj('team',t,['name','team_name','title'],['members','approved_challenges'], 'teams','👥');
      });
      (Array.isArray(d.challenges)?d.challenges:[]).forEach(function(c){
        addObj('challenge',c,['title','name'],['category','status','points'], 'challenges','🎯');
      });
      (Array.isArray(d.questions)?d.questions:[]).forEach(function(q){
        addObj('question',q,['text','question','title'],['category','question_no'], 'challenges','❓');
      });
      (Array.isArray(d.notifications)?d.notifications:[]).forEach(function(n){
        addObj('notification',n,['title','name'],['status','created_at'], 'notifications','🔔');
      });
      (Array.isArray(d.my_submissions)?d.my_submissions:[]).forEach(function(x){
        addObj('submission',x,['title','challenge_title','name'],['status','submitted_at','created_at'], 'challenges','📝');
      });

      var td=(typeof trainingData!=='undefined'&&trainingData)||{};
      var lessons=Array.isArray(td.lessons)?td.lessons:[];
      lessons.forEach(function(l){
        addObj('training',l,['title','lesson_title','name'],['lesson_no','description'], 'training','📚');
        var qs=Array.isArray(l.questions)?l.questions:[];
        qs.forEach(function(q){ addObj('training-question',q,['question','text','title'],['lesson_no','category'], 'training','🧠'); });
        var videos=Array.isArray(l.videos)?l.videos:((Array.isArray(l.video_materials)?l.video_materials:[]));
        videos.forEach(function(v){ addObj('training-video',v,['title','name'],['lesson_no'], 'training','🎬'); });
      });
      (Array.isArray(td.my_progress)?td.my_progress:[]).forEach(function(p){
        addObj('training-progress',p,['lesson_title','title','name'],['watch_percent','completed_at'], 'training','📊');
      });

      ['membershipRequests','prospectRequests','monthlyPointRequests','teamRegistryRows'].forEach(function(k){
        var arr=(typeof window[k]!=='undefined'&&window[k])||((typeof globalThis!=='undefined'&&globalThis[k])||[]);
        if(Array.isArray(arr)){
          arr.forEach(function(x){addObj('request',x,['member_name','name','title','memberNo','member_no'],['status','created_at','type'], 'advanced','📋');});
        }
      });
    }catch(e){console.debug('DXN search index build',e)}

    // Also index visible text in the current SPA without storing secrets.
    try{
      var root=document.getElementById('app');
      if(root){
        var nodes=root.querySelectorAll('.title,h1,h2,h3,.tab,.badge,.k,.muted');
        Array.prototype.slice.call(nodes,0,500).forEach(function(n){
          var t=String(n.textContent||'').trim();
          if(t&&t.length>1&&t.length<180)add({type:'page-text',title:t,meta:'عنصر ظاهر في الصفحة الحالية',tab:(typeof tab!=='undefined'?tab:'home'),icon:'📌'});
        });
      }
    }catch(e){}
  }

  function score(item,q){
    if(!q)return 0;
    var s=item.search||'';
    var n=norm(q);
    if(!n)return 0;
    if(s===n)return 1000;
    var parts=n.split(' ').filter(Boolean);
    var total=0;
    parts.forEach(function(p){
      if(!p)return;
      if(s.indexOf(p)!==-1)total+=120;
      if(norm(item.title).indexOf(p)!==-1)total+=220;
      if(norm(item.meta).indexOf(p)!==-1)total+=90;
    });
    return total;
  }

  function resultMarkup(item,scoreVal){
    return '<button type="button" class="dxn-search-result" data-search-key="'+esc(item._key)+'">'+
      '<span class="dxn-search-result-icon">'+esc(item.icon||'🔎')+'</span>'+
      '<span class="dxn-search-result-body"><b>'+esc(item.title)+'</b><small>'+esc(item.meta||labelType(item.type))+'</small></span>'+
      '<span class="dxn-search-result-arrow">←</span>'+
      '</button>';
  }
  function labelType(t){
    return ({
      member:'عضو',team:'فريق',training:'تدريب', 'training-question':'سؤال تدريبي',
      'training-video':'فيديو تدريبي','training-progress':'تقدّم تدريبي',
      challenge:'تحدٍ',question:'سؤال',notification:'إشعار',submission:'إجابة',request:'طلب','page-text':'عنصر في الصفحة'
    })[t]||'عنصر';
  }

  function openModal(){
    if(!state.modal)createUI();
    buildIndex();
    state.modal.classList.add('open');
    state.input.value='';
    renderResults('');
    setTimeout(function(){state.input.focus();},30);
  }
  function closeModal(){if(state.modal)state.modal.classList.remove('open');}
  function createUI(){
    var style=document.createElement('style');
    style.textContent=
      '.dxn-search-fab{position:fixed;left:18px;top:18px;z-index:70;background:#0f513f;color:#fff;border:0;border-radius:999px;padding:11px 16px;font-weight:950;box-shadow:0 8px 24px rgba(15,81,63,.22);cursor:pointer}'+
      '.dxn-search-backdrop{position:fixed;inset:0;background:rgba(10,30,24,.55);z-index:90;display:none;align-items:flex-start;justify-content:center;padding:8vh 14px}'+
      '.dxn-search-backdrop.open{display:flex}'+
      '.dxn-search-box{width:min(760px,96vw);max-height:82vh;background:#fff;border-radius:24px;box-shadow:0 24px 70px #0005;overflow:hidden;direction:rtl}'+
      '.dxn-search-head{padding:15px 16px;background:linear-gradient(135deg,#0c4738,#1a725b);color:#fff;display:flex;align-items:center;gap:10px}'+
      '.dxn-search-head b{font-size:18px;flex:1}.dxn-search-close{background:#ffffff22;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}'+
      '.dxn-search-input-wrap{padding:14px;background:#f7faf8;border-bottom:1px solid #e2e8e5}'+
      '.dxn-search-input{width:100%;margin:0;padding:14px 16px;border:2px solid #cfe1d9;border-radius:15px;font:inherit;outline:none}'+
      '.dxn-search-input:focus{border-color:#0f513f;box-shadow:0 0 0 4px rgba(15,81,63,.10)}'+
      '.dxn-search-hint{margin-top:8px;color:#667085;font-size:12px}'+
      '.dxn-search-results{padding:10px;max-height:58vh;overflow:auto;display:grid;gap:7px}'+
      '.dxn-search-result{width:100%;display:flex;align-items:center;gap:11px;padding:12px;border:1px solid #e2e8e5;border-radius:14px;background:#fff;text-align:right;cursor:pointer}'+
      '.dxn-search-result:hover{background:#f5fbf8;border-color:#b9d8ca}'+
      '.dxn-search-result-icon{width:38px;height:38px;border-radius:11px;background:#edf7f1;display:grid;place-items:center;font-size:20px;flex:0 0 38px}'+
      '.dxn-search-result-body{flex:1;min-width:0}.dxn-search-result-body b{display:block;color:#182234;font-size:14px;line-height:1.55}.dxn-search-result-body small{display:block;color:#667085;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dxn-search-result-arrow{color:#0f513f;font-size:20px}'+
      '.dxn-search-empty{text-align:center;padding:30px;color:#667085}.dxn-search-section{font-size:12px;color:#0f513f;font-weight:950;padding:7px 4px 2px}'+
      '@media(max-width:700px){.dxn-search-fab{left:10px;top:10px;padding:10px 13px;font-size:12px}.dxn-search-backdrop{padding:3vh 8px}.dxn-search-box{max-height:92vh;border-radius:20px}.dxn-search-results{max-height:66vh}}';
    document.head.appendChild(style);

    var fab=document.createElement('button');
    fab.className='dxn-search-fab';
    fab.type='button';
    fab.textContent='🔎 بحث';
    fab.setAttribute('aria-label','بحث في الموقع');
    fab.onclick=openModal;
    document.body.appendChild(fab);

    var back=document.createElement('div');
    back.className='dxn-search-backdrop';
    back.innerHTML='<div class="dxn-search-box" role="dialog" aria-modal="true" aria-label="بحث في الموقع">'+
      '<div class="dxn-search-head"><b>🔎 البحث في الموقع</b><button type="button" class="dxn-search-close">إغلاق</button></div>'+
      '<div class="dxn-search-input-wrap"><input class="dxn-search-input" autocomplete="off" placeholder="ابحث باسم عضو، رقم عضوية، تدريب، سؤال، تحدٍ أو أي عنصر..." /><div class="dxn-search-hint">يمكنك استخدام Ctrl + K لفتح البحث بسرعة.</div></div>'+
      '<div class="dxn-search-results"></div></div>';
    document.body.appendChild(back);
    state.modal=back; state.input=back.querySelector('.dxn-search-input'); state.list=back.querySelector('.dxn-search-results');
    back.querySelector('.dxn-search-close').onclick=closeModal;
    back.addEventListener('click',function(e){if(e.target===back)closeModal();});
    state.input.addEventListener('input',function(){renderResults(this.value);});
    state.input.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
    state.list.addEventListener('click',function(e){
      var btn=e.target.closest('.dxn-search-result');if(!btn)return;
      var key=btn.getAttribute('data-search-key');
      var item=state.items.find(function(x){return x._key===key;});
      if(item){activate(item);closeModal();}
    });
    document.addEventListener('keydown',function(e){
      if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();openModal();}
      if(e.key==='Escape'&&state.modal&&state.modal.classList.contains('open'))closeModal();
    });
  }

  function renderResults(query){
    if(!state.list)return;
    var q=String(query||'').trim();
    if(!q){
      var defaults=navItems.slice(0,8).map(function(item){
        var found=state.items.find(function(x){return x.type==='page-text'&&norm(x.title)===norm(item.title);})||item;
        if(!found._key) {
          found._key=[found.type,found.id||'',norm(found.title),norm(found.meta||'')].join('|');
        }
        return resultMarkup(found,0);
      }).join('');
      state.list.innerHTML='<div class="dxn-search-section">الوصول السريع</div>'+defaults+
        '<div class="dxn-search-empty">اكتب كلمة للبحث داخل بيانات الحساب والتدريب والفريق والمحتوى.</div>';
      return;
    }
    var scored=state.items.map(function(x){return {x:x,s:score(x,q)}}).filter(function(z){return z.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,40);
    if(!scored.length){state.list.innerHTML='<div class="dxn-search-empty">لا توجد نتائج مطابقة لـ <b>'+esc(q)+'</b>.</div>';return;}
    var groups={};
    scored.forEach(function(z){var k=labelType(z.x.type);(groups[k]||(groups[k]=[])).push(z.x);});
    var html='';
    Object.keys(groups).slice(0,8).forEach(function(g){html+='<div class="dxn-search-section">'+esc(g)+'</div>';html+=groups[g].slice(0,8).map(function(x){return resultMarkup(x,0)}).join('');});
    state.list.innerHTML=html;
  }

  function activate(item){
    try{
      if(item.tab&&typeof switchTab==='function')switchTab(item.tab);
      var needle=String(item.obj?.member_no||item.obj?.member_name||item.obj?.name||item.title||'').trim();
      setTimeout(function(){
        if(!needle)return;
        var root=document.getElementById('app');if(!root)return;
        var els=root.querySelectorAll('.title,.row,b,h1,h2,h3,.muted');
        for(var i=0;i<els.length;i++){
          var t=String(els[i].textContent||'');
          if(t.indexOf(needle)!==-1){els[i].scrollIntoView({behavior:'smooth',block:'center'});els[i].style.outline='3px solid #d99a18';setTimeout(function(){try{els[i].style.outline=''}catch(e){}},2200);break;}
        }
      },350);
    }catch(e){console.debug('DXN search activate',e)}
  }

  function boot(){createUI();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();