/* Primary leader-only prospect dashboard. Data is never stored in localStorage. */
(function(){
  'use strict';
  var OWNER_ID='5cf50c5d-d23e-499e-96b3-f71b10c4d854';
  var statuses=[
    ['new','🆕 جديد'],['contacted','📞 تم التواصل'],['no_reply','⏳ لم يرد'],
    ['no_whatsapp','📵 لا يمتلك واتساب'],['existing_member','🪪 لديه عضوية مسبقة'],
    ['registered','✅ سجل عضوية'],['training','📚 قيد التدريب'],
    ['contests_sent','🎯 أرسلت مسابقات'],['points','⭐ فعل نقاط'],
    ['group','👥 انضم للكروب'],['blocked','🚫 قام بالحظر'],['not_interested','— غير مهتم']
  ];
  var items=[],loaded=false,busy=false,selected='',filter='all',searchText='';
  function allowed(){
    return typeof role!=='undefined' && role==='leader' &&
      typeof data!=='undefined' && data &&
      String(data.user_id || (data.current_user&&data.current_user.id) || '')===OWNER_ID;
  }
  function safe(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function label(s){var x=statuses.find(function(t){return t[0]===s});return x?x[1]:'غير محدد'}
  function opt(s){return statuses.map(function(t){return '<option value="'+t[0]+'" '+(s===t[0]?'selected':'')+'>'+t[1]+'</option>'}).join('')}
  function date(s){if(!s)return '—';var d=new Date(s);return isNaN(d)?String(s):d.toLocaleDateString('ar-IQ')}
  function localToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function cleanPhone(s){return String(s||'').replace(/[^0-9]/g,'')}
  function rpcCrm(action,payload){if(!allowed())return Promise.reject(Error('غير مصرح لهذا الحساب'));return rpc('primary_leader_crm',{p_token:token,p_action:action,p_payload:payload||{}})}
  function message(s,isError){var n=document.getElementById('ll-message');if(n){n.textContent=s;n.className='ll-message'+(isError?' ll-error':'');}}
  function view(){
    if(!allowed())return '<div class="card"><h3>هذه الصفحة خاصة بحساب القائد الأساسي فقط.</h3></div>';
    return '<section class="ll-wrap" id="leaderLeadsRoot" dir="rtl">'+
      '<header class="ll-head"><div><div class="ll-kicker">👑 مساحة خاصة بحساب القائد</div><h2>📋 إدارة المهتمين والمتابعة</h2><p>سجل الأشخاص القادمين من الإعلانات، وتابع كل محادثة وخطوة تسجيل في مكان واحد.</p></div>'+
      '<div class="ll-head-actions"><button type="button" onclick="OwnerLeads.reload()">↻ تحديث</button><button type="button" class="ll-primary" onclick="OwnerLeads.newLead()">＋ مهتم جديد</button></div></header>'+
      '<div id="ll-message" class="ll-message">جاري تحميل سجلات المتابعة...</div>'+
      '<div id="ll-stats" class="ll-stats"></div>'+
      '<div class="ll-filters"><label>بحث بالاسم أو الهاتف أو المدينة<input id="ll-search" type="search" placeholder="اسم المهتم، رقمه، أو مصدر الإعلان" oninput="OwnerLeads.setSearch(this.value)"></label>'+
      '<label>تصفية حسب الحالة<select id="ll-filter" onchange="OwnerLeads.setFilter(this.value)"><option value="all">جميع الحالات</option>'+
      statuses.map(function(t){return '<option value="'+t[0]+'">'+t[1]+'</option>'}).join('')+
      '<option value="due">⏰ متابعة مستحقة</option></select></label></div>'+
      '<div id="ll-list" class="ll-list"></div>'+
      '<p class="ll-foot">🔒 البيانات محفوظة في سجلات خاصة، ولا يمكن الوصول إليها بحساب القائد 1 أو حسابات الأعضاء. لا يوجد ربط تلقائي بمنصة رجوان الخارجية حتى الآن.</p></section>';
  }
  function stats(){
    var due=items.filter(function(x){return x.next_follow_up_at&&x.next_follow_up_at<=localToday()}).length;
    var newCount=items.filter(function(x){return x.status==='new'}).length;
    var contacted=items.filter(function(x){return x.status==='contacted'}).length;
    var registered=items.filter(function(x){return x.status==='registered'||x.status==='training'||x.status==='points'||x.status==='group'}).length;
    var vals=[['📥 إجمالي المهتمين',items.length],['🆕 جديد',newCount],['📞 تم التواصل',contacted],['⏰ متابعة مستحقة',due],['✅ سجل وتقدم',registered]];
    var host=document.getElementById('ll-stats');
    if(host)host.innerHTML=vals.map(function(v){return '<div class="ll-stat"><span>'+v[0]+'</span><strong>'+v[1]+'</strong></div>'}).join('');
  }
  function rowHtml(x){
    var id=safe(x.id),phone=cleanPhone(x.phone),due=x.next_follow_up_at&&x.next_follow_up_at<=localToday();
    return '<article class="ll-card"><div class="ll-card-top"><div class="ll-avatar">'+safe(String(x.full_name||'م').slice(0,1))+'</div>'+
      '<div class="ll-person"><h3>'+safe(x.full_name)+'</h3><span>'+(x.country?safe(x.country):'بلد غير محدد')+(x.city?' · '+safe(x.city):'')+'</span></div>'+
      '<div class="ll-badge">'+safe(label(x.status))+'</div></div>'+
      '<div class="ll-facts"><span>📱 '+safe(x.phone||'لم يضاف رقم')+'</span><span>📣 '+safe(x.source||'غير محدد')+
      (x.campaign?' · '+safe(x.campaign):'')+'</span><span>🗓️ '+date(x.created_at)+'</span>'+
      (x.next_follow_up_at?'<span class="'+(due?'ll-due':'')+'">⏰ متابعة: '+safe(x.next_follow_up_at)+(due?' · مستحقة':'')+'</span>':'')+'</div>'+
      '<div class="ll-card-actions"><select aria-label="تغيير حالة المهتم" onchange="OwnerLeads.changeStatus(\''+id+'\',this.value)">'+opt(x.status)+'</select>'+
      '<button type="button" onclick="OwnerLeads.details(\''+id+'\')">📝 سجل المتابعة</button>'+
      '<button type="button" onclick="OwnerLeads.edit(\''+id+'\')">✏️ تعديل</button>'+
      (phone?'<a href="https://wa.me/'+phone+'" target="_blank" rel="noopener noreferrer">💬 واتساب</a>':'')+
      '</div></article>';
  }
  function showRows(){
    var n=document.getElementById('ll-list');if(!n)return;
    var s=searchText.trim().toLowerCase(),rows=items.filter(function(x){
      var hay=[x.full_name,x.phone,x.country,x.city,x.source,x.campaign,x.member_no].join(' ').toLowerCase();
      var matched=!s||hay.indexOf(s)!==-1;
      return matched&&(filter==='all'||(filter==='due' ? (x.next_follow_up_at&&x.next_follow_up_at<=localToday()) : x.status===filter));
    });
    n.innerHTML=rows.length?rows.map(rowHtml).join(''):'<div class="ll-empty">لا توجد سجلات مطابقة. يمكنك إضافة مهتم جديد أو تغيير البحث.</div>';
  }
  function paint(){if(!allowed())return;stats();showRows();message('تم تحميل '+items.length+' سجل متابعة.');}
  async function reload(){
    if(!allowed())return;
    if(busy)return;
    busy=true;message('جاري تحديث سجلات المهتمين...');
    try{var res=await rpcCrm('list',{});items=Array.isArray(res.items)?res.items:[];loaded=true;paint()}
    catch(e){message('تعذر تحميل السجلات: '+e.message,true)}
    finally{busy=false}
  }
  function init(){if(!allowed()||!document.getElementById('leaderLeadsRoot'))return;if(loaded)paint();else reload()}
  function modal(html){
    close();
    var d=document.createElement('div');d.id='ll-overlay';d.className='ll-overlay';
    d.innerHTML='<div class="ll-backdrop" onclick="OwnerLeads.close()"></div><div class="ll-dialog" role="dialog" aria-modal="true">'+html+'</div>';
    document.body.appendChild(d);
  }
  function close(){var n=document.getElementById('ll-overlay');if(n)n.remove()}
  function get(id){return items.find(function(x){return String(x.id)===String(id)})}
  function form(x){
    x=x||{};selected=x.id||'';
    modal('<form id="ll-edit-form" onsubmit="return OwnerLeads.save(event)">'+
      '<header><h3>'+(x.id?'✏️ تعديل ملف المهتم':'➕ إضافة مهتم جديد')+'</h3><button type="button" onclick="OwnerLeads.close()">✕</button></header>'+
      '<div class="ll-fields"><label>الاسم الكامل *<input name="full_name" required maxlength="160" value="'+safe(x.full_name||'')+'"></label>'+
      '<label>رقم الهاتف مع مفتاح الدولة<input name="phone" type="tel" dir="ltr" maxlength="35" placeholder="+963..." value="'+safe(x.phone||'')+'"></label>'+
      '<label>الدولة<input name="country" maxlength="100" value="'+safe(x.country||'')+'"></label>'+
      '<label>المدينة<input name="city" maxlength="100" value="'+safe(x.city||'')+'"></label>'+
      '<label>مصدر المهتم<input name="source" maxlength="100" value="'+safe(x.source||'إعلان ممول')+'"></label>'+
      '<label>اسم الحملة أو الإعلان<input name="campaign" maxlength="180" value="'+safe(x.campaign||'')+'"></label>'+
      '<label>الحالة<select name="status">'+opt(x.status||'new')+'</select></label>'+
      '<label>رقم عضوية DXN إن وجد<input name="member_no" maxlength="30" dir="ltr" value="'+safe(x.member_no||'')+'"></label>'+
      '<label>موعد المتابعة القادم<input name="next_follow_up_at" type="date" value="'+safe(x.next_follow_up_at||'')+'"></label>'+
      '<label class="ll-full">تفاصيل أو ملاحظات عامة<textarea name="details" rows="3" maxlength="3000">'+safe(x.details||'')+'</textarea></label></div>'+
      '<div class="ll-modal-msg" id="ll-modal-msg"></div><div class="ll-modal-actions"><button type="button" onclick="OwnerLeads.close()">إلغاء</button>'+
      '<button type="submit" class="ll-primary" id="ll-save-btn">💾 حفظ البيانات</button></div></form>');
  }
  function modalError(e){var n=document.getElementById('ll-modal-msg');if(n)n.textContent=String(e.message||e)}
  async function save(ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(!allowed()||busy)return false;
    var f=document.getElementById('ll-edit-form');if(!f)return false;
    var vals=Object.fromEntries(new FormData(f).entries());
    if(!String(vals.full_name||'').trim()){modalError(Error('الاسم مطلوب'));return false}
    if(selected)vals.id=selected;
    busy=true;var btn=document.getElementById('ll-save-btn');if(btn)btn.disabled=true;
    try{await rpcCrm('save',vals);close();busy=false;await reload()}
    catch(e){modalError(e);busy=false;if(btn)btn.disabled=false}
    return false;
  }
  async function changeStatus(id,value){
    if(!allowed()||busy)return;
    busy=true;
    try{await rpcCrm('status',{id:id,status:value});busy=false;await reload()}
    catch(e){busy=false;message('تعذر تغيير الحالة: '+e.message,true);showRows()}
  }
  async function details(id){
    if(!allowed())return;
    var x=get(id);if(!x)return;
    selected=id;
    modal('<header><h3>📝 متابعة: '+safe(x.full_name)+'</h3><button type="button" onclick="OwnerLeads.close()">✕</button></header>'+
      '<p class="ll-dialog-sub">'+safe(label(x.status))+' · '+safe(x.phone||'بدون رقم')+'</p>'+
      (x.details?'<p class="ll-description">'+safe(x.details)+'</p>':'')+
      '<form id="ll-activity-form" onsubmit="return OwnerLeads.addActivity(event)">'+
      '<label>نوع السجل<select name="kind"><option value="contact">📞 تواصل جديد</option><option value="note">📝 ملاحظة</option></select></label>'+
      '<label>ماذا حصل معه؟<textarea name="note" rows="3" required minlength="2" maxlength="3000" placeholder="مثلًا: شاهد العرض وطلب التواصل مساءً..."></textarea></label>'+
      '<div id="ll-modal-msg" class="ll-modal-msg"></div><button type="submit" class="ll-primary" id="ll-save-btn">＋ إضافة إلى السجل</button></form>'+
      '<h4>تاريخ المتابعة</h4><div id="ll-events">جارٍ تحميل سجل المتابعة...</div>'+
      '<div class="ll-modal-actions"><button type="button" onclick="OwnerLeads.edit(\''+safe(id)+'\')">تعديل البيانات</button>'+
      '<button type="button" class="ll-archive" onclick="OwnerLeads.archive(\''+safe(id)+'\')">أرشفة المهتم</button></div>');
    await loadEvents(id);
  }
  async function loadEvents(id){
    var node=document.getElementById('ll-events');if(!node)return;
    try{var r=await rpcCrm('events',{id:id}),rows=Array.isArray(r.items)?r.items:[];
      node.innerHTML=rows.length?rows.map(function(e){
        return '<div class="ll-event"><div><b>'+safe(e.event_type==='created'?'إضافة':e.event_type==='status'?'تغيير حالة':e.event_type==='contact'?'تواصل':'ملاحظة')+
          '</b><small>'+safe(date(e.created_at))+'</small></div><p>'+safe(e.note)+(e.event_type==='status'?' — '+safe(label(e.status)):'')+'</p></div>';
      }).join(''):'<p>لا توجد ملاحظات بعد.</p>';
    }catch(e){node.textContent='تعذر تحميل تاريخ المتابعة: '+e.message}
  }
  async function addActivity(ev){
    ev.preventDefault();if(!allowed()||busy||!selected)return false;
    var form=document.getElementById('ll-activity-form');if(!form)return false;
    var vals=Object.fromEntries(new FormData(form).entries());
    busy=true;
    try{await rpcCrm('activity',{id:selected,kind:vals.kind,note:vals.note});form.reset();await loadEvents(selected);busy=false;await reload()}
    catch(e){modalError(e);busy=false}
    return false;
  }
  async function archive(id){
    if(!allowed()||!confirm('هل تريد أرشفة هذا المهتم؟ لن يظهر ضمن القائمة النشطة.'))return;
    if(busy)return;busy=true;
    try{await rpcCrm('archive',{id:id});close();busy=false;await reload()}
    catch(e){busy=false;modalError(e)}
  }
  window.isPrimaryLeaderAccount=allowed;
  window.ownerLeadsPage=view;
  window.OwnerLeads={
    init:init,reload:reload,newLead:function(){form(null)},edit:function(id){var x=get(id);if(x)form(x)},
    save:save,changeStatus:changeStatus,details:details,addActivity:addActivity,archive:archive,close:close,
    setFilter:function(v){filter=v;showRows()},setSearch:function(v){searchText=v;showRows()}
  };
})();