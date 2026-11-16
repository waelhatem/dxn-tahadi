/* Community platform: branch GPS directory and PDF price lists. */
(function(){
'use strict';
if(window.DXN_BRANCH_PRICES)return;

const state={branches:[],prices:[],section:'branches',q:'',country:'',canEdit:false,loading:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>String(v??'').replace(/[^\d]/g,'');
const ROOT='dxnBranchPrices';
const style=`<style>
#dxnBranchPrices{direction:rtl;max-width:1100px;margin:10px auto 26px;color:#17392e;font-family:inherit}
#dxnBranchPrices *{box-sizing:border-box}
#dxnBranchPrices .bp-hero{background:linear-gradient(135deg,#0c4738,#1d755c);color:#fff;border-radius:23px;padding:22px 24px;box-shadow:0 9px 24px #073e3024}
#dxnBranchPrices .bp-hero h2{font-size:clamp(22px,3vw,29px);margin:0 0 6px;font-weight:950}
#dxnBranchPrices .bp-hero p{margin:0;color:#e0f5e8;line-height:1.7;font-size:14px}
#dxnBranchPrices .bp-selectors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:13px 0}
#dxnBranchPrices .bp-switch{border:1px solid #cadfd3;background:#fff;color:#0f513f;box-shadow:0 3px 12px #0f513f12;min-height:53px;border-radius:16px;font-weight:900;font-size:16px}
#dxnBranchPrices .bp-switch.selected{color:#fff;border-color:#0f513f;background:#0f513f}
#dxnBranchPrices .bp-panel{background:#fff;border:1px solid #d9e9df;border-radius:22px;padding:18px;box-shadow:0 8px 25px #0f513f09}
#dxnBranchPrices .bp-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
#dxnBranchPrices .bp-toolbar input,#dxnBranchPrices .bp-toolbar select{margin:0;min-width:160px;flex:1}
#dxnBranchPrices .bp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
#dxnBranchPrices .bp-card{border:1px solid #d7e9df;background:linear-gradient(145deg,#fff,#f9fdfb);border-radius:18px;padding:16px;min-width:0}
#dxnBranchPrices .bp-icon{display:inline-grid;place-items:center;width:39px;height:39px;border-radius:12px;background:#e2f1e8;font-size:23px;margin-left:7px}
#dxnBranchPrices .bp-card-head{display:flex;align-items:center;gap:5px}
#dxnBranchPrices .bp-card h3{font-size:17px;font-weight:950;line-height:1.5;margin:0;color:#124733}
#dxnBranchPrices .bp-meta{color:#627568;font-size:13px;margin:8px 0 4px;line-height:1.7}
#dxnBranchPrices .bp-address{color:#354f42;line-height:1.9;font-size:14px;overflow-wrap:anywhere;min-height:43px;margin:8px 0}
#dxnBranchPrices .bp-card-footer{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
#dxnBranchPrices .bp-primary{background:#0f513f;color:#fff;border-radius:12px;min-height:44px;padding:10px 16px}
#dxnBranchPrices .bp-secondary{background:#e8f4ec;color:#0f513f;border:1px solid #cae1d3;border-radius:12px;min-height:44px}
#dxnBranchPrices .bp-danger{background:#fff2ee;color:#a72b17;border:1px solid #f0cec4;border-radius:12px;min-height:44px}
#dxnBranchPrices .bp-empty{grid-column:1/-1;text-align:center;padding:35px 10px;color:#667b70;border:1px dashed #cbdcd2;border-radius:14px;line-height:1.9}
#dxnBranchPrices .bp-note{padding:11px 13px;font-size:12px;border-radius:12px;background:#f2f8f3;color:#53685a;line-height:1.9;margin-top:14px}
#dxnBranchPrices .bp-editor{margin-top:14px;padding:17px;border:2px solid #b9d7c5;border-radius:18px;background:#f6fbf8}
#dxnBranchPrices .bp-editor h3{margin:0 0 10px;color:#0d4a37}
#dxnBranchPrices .bp-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
#dxnBranchPrices .bp-editor label{font-size:13px;font-weight:900;color:#275340;display:block}
#dxnBranchPrices .bp-editor input,#dxnBranchPrices .bp-editor select{margin:6px 0 2px;min-width:0;width:100%;border:1px solid #bdd9c9;background:#fff}
#dxnBranchPrices .bp-editor .wide{grid-column:1/-1}
#dxnBranchPrices .bp-progress{min-height:28px;margin:8px 0;color:#0f513f;font-weight:850;font-size:14px}
#dxnBranchPrices .bp-stamp{display:inline-block;background:#edf6ef;padding:5px 9px;border-radius:8px;font-size:12px;color:#0f513f;font-weight:800}
#dxnBranchPrices .bp-price-icon{background:#fdf2d3}
@media(max-width:700px){#dxnBranchPrices .bp-grid,#dxnBranchPrices .bp-editor-grid{grid-template-columns:1fr}#dxnBranchPrices .bp-panel{padding:13px}#dxnBranchPrices .bp-hero{padding:20px 15px}#dxnBranchPrices .bp-toolbar input,#dxnBranchPrices .bp-toolbar select{flex-basis:100%}#dxnBranchPrices .bp-switch{font-size:14px}}
</style>`;

function pageHtml(role){
 state.canEdit=role==='leader';
 return style+`<section id="${ROOT}" aria-label="دليل فروع DXN وقوائم الأسعار">
 <header class="bp-hero"><h2>📍 الفروع والأسعار</h2><p>دليل فروع DXN ومواقعها الجغرافية وأحدث قوائم الأسعار المرفوعة إلى المجتمع.</p></header>
 <div class="bp-selectors" role="group" aria-label="اختر القسم">
  <button class="bp-switch selected" type="button" data-bp-section="branches">📍 عناوين الفروع</button>
  <button class="bp-switch" type="button" data-bp-section="prices">📄 قوائم الأسعار</button>
 </div>
 <div class="bp-panel">
  <div class="bp-toolbar"><input type="search" id="bpSearch" placeholder="ابحث باسم الفرع أو المدينة أو الدولة" aria-label="البحث في الفروع والأسعار">
   <select id="bpCountry" aria-label="تصفية الدولة"><option value="">جميع الدول</option></select>
   <button id="bpAdd" class="bp-primary" type="button" data-bp-action="add-branch" ${role==='leader'?'':'hidden'}>+ إضافة فرع</button>
  </div>
  <div id="bpCards" class="bp-grid" aria-live="polite"><div class="bp-empty">جارٍ تحميل البيانات...</div></div>
  <div id="bpEditorHost"></div>
  <div class="bp-note">مواقع GPS يحددها القائد بدقة. وتاريخ تحديث ملفات الأسعار هو تاريخ رفعها للمجتمع، وليس ضمانًا لتحديث تلقائي من شركة DXN.</div>
 </div></section>`;
}

function root(){return document.getElementById(ROOT);}
function token(){return String(localStorage.getItem('dxn_session')||'');}
async function api(action,payload){
 const isGet=action==='list'||action==='open_pdf';
 const url='/api/branch-price-catalog'+(isGet?'?'+new URLSearchParams({action,...payload}):'');
 const r=await fetch(url,{method:isGet?'GET':'POST',headers:{'X-DXN-Session':token(),...(isGet?{}:{'Content-Type':'application/json'})},body:isGet?undefined:JSON.stringify({action,...payload}),cache:'no-store'});
 const data=await r.json().catch(()=>({error:'استجابة الخادم غير صالحة'}));
 if(!r.ok||data.error)throw new Error(data.error||('تعذر تنفيذ الطلب: '+r.status));
 return data;
}
function tell(message,kind='info'){
 const r=root();if(!r)return;
 let el=r.querySelector('#bpProgress');if(!el){el=document.createElement('div');el.id='bpProgress';el.className='bp-progress';r.querySelector('.bp-panel').prepend(el);}
 el.textContent=message;el.style.color=kind==='error'?'#a52816':'#0f513f';
}
function dateStr(date){
 if(!date)return 'غير محدد';
 const d=new Date(date);return Number.isNaN(d.getTime())?'غير محدد':d.toLocaleDateString('ar-IQ',{year:'numeric',month:'2-digit',day:'2-digit'});
}
function setSection(next){
 state.section=next==='prices'?'prices':'branches';state.q='';state.country='';
 const r=root();if(!r)return;
 r.querySelectorAll('[data-bp-section]').forEach(b=>b.classList.toggle('selected',b.dataset.bpSection===state.section));
 const search=r.querySelector('#bpSearch');search.value='';search.placeholder=state.section==='prices'?'ابحث باسم قائمة الأسعار أو الدولة':'ابحث باسم الفرع أو المدينة أو الدولة';
 fillCountries();draw();
 r.querySelector('#bpEditorHost').innerHTML='';
 const add=r.querySelector('#bpAdd');add.hidden=!state.canEdit;
 add.dataset.bpAction=state.section==='prices'?'add-price':'add-branch';add.textContent=state.section==='prices'?'+ رفع قائمة PDF':'+ إضافة فرع';
}
function fillCountries(){
 const r=root();if(!r)return;
 const values=[...new Set((state.section==='branches'?state.branches:state.prices).map(x=>x.country))].sort((a,b)=>a.localeCompare(b,'ar'));
 const s=r.querySelector('#bpCountry');if(!s)return;s.innerHTML='<option value="">جميع الدول</option>'+values.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');s.value=state.country;
}
function branchCard(b){
 return `<article class="bp-card">
  <div class="bp-card-head"><span class="bp-icon">📍</span><h3>${esc(b.name)}</h3></div>
  <div class="bp-meta">${esc(b.country)} | ${esc(b.city)}</div>
  <p class="bp-address">${esc(b.street_address)}</p>
  <div class="bp-card-footer"><button class="bp-primary" data-bp-action="navigate" data-id="${b.id}">🧭 ابدأ الملاحة</button>
   ${state.canEdit?`<button class="bp-secondary" data-bp-action="edit-branch" data-id="${b.id}">✏️ تعديل</button><button class="bp-danger" data-bp-action="delete-branch" data-id="${b.id}">حذف</button>`:''}</div>
 </article>`;
}
function priceCard(p){
 const associated=state.branches.find(b=>b.id===p.branch_id);
 return `<article class="bp-card">
  <div class="bp-card-head"><span class="bp-icon bp-price-icon">📄</span><h3>${esc(p.title)}</h3></div>
  <div class="bp-meta">${esc(p.country)}${associated?' | '+esc(associated.name):''}</div>
  <div class="bp-address"><span class="bp-stamp">PDF</span> ${esc(p.file_name)}<div class="bp-meta">تاريخ التحديث: ${dateStr(p.updated_at)}${p.effective_on?' | تاريخ الأسعار: '+dateStr(p.effective_on):''}</div></div>
  <div class="bp-card-footer"><button class="bp-primary" data-bp-action="open-pdf" data-id="${p.id}">📄 فتح قائمة الأسعار</button>
   ${state.canEdit?`<button class="bp-secondary" data-bp-action="edit-price" data-id="${p.id}">✏️ تعديل / استبدال</button><button class="bp-danger" data-bp-action="delete-price" data-id="${p.id}">حذف</button>`:''}</div>
 </article>`;
}
function draw(){
 const r=root();if(!r)return;
 const items=state.section==='branches'?state.branches:state.prices;
 const filtered=items.filter(x=>{
  if(state.country&&x.country!==state.country)return false;
  const searchable=state.section==='branches'?[x.name,x.country,x.city,x.street_address]:[x.title,x.country,x.file_name];
  return searchable.join(' ').toLocaleLowerCase().includes(state.q.toLocaleLowerCase());
 });
 r.querySelector('#bpCards').innerHTML=filtered.length?filtered.map(state.section==='branches'?branchCard:priceCard).join(''):`<div class="bp-empty">${items.length?'لا توجد نتائج تطابق البحث.':state.section==='branches'?'لم تُضف فروع بعد. يمكن للقائد إضافة أول فرع.':'لم تُرفع أي قوائم أسعار PDF بعد.'}</div>`;
}
async function refresh(){
 const r=root();if(!r)return;
 try{
  const result=await api('list',{});
  if(!root()||root()!==r)return;
  state.branches=result.branches||[];state.prices=result.prices||[];state.canEdit=result.can_edit===true;
  fillCountries();draw();tell('');
  const add=r.querySelector('#bpAdd');add.hidden=!state.canEdit;
 }catch(err){tell(err.message,'error');r.querySelector('#bpCards').innerHTML='<div class="bp-empty">تعذر تحميل البيانات. تحقّق من الاتصال ثم أعد المحاولة.</div>';}
}
function branchEditor(b={}){
 const r=root();if(!r||!state.canEdit)return;
 const host=r.querySelector('#bpEditorHost');
 host.innerHTML=`<form id="bpEditForm" class="bp-editor" data-kind="branch">
  <h3>${b.id?'✏️ تعديل بيانات الفرع':'📍 إضافة فرع جديد'}</h3>
  <input type="hidden" name="id" value="${esc(b.id||'')}">
  <div class="bp-editor-grid">
   <label>اسم الفرع *<input name="name" value="${esc(b.name||'')}" maxlength="140" required placeholder="مثال: فرع DXN الرئيسي"></label>
   <label>الدولة *<input name="country" value="${esc(b.country||'')}" maxlength="90" required></label>
   <label>المدينة *<input name="city" value="${esc(b.city||'')}" maxlength="90" required></label>
   <label class="wide">العنوان التفصيلي *<input name="street_address" value="${esc(b.street_address||'')}" maxlength="500" required placeholder="الشارع، المنطقة، رقم المبنى"></label>
   <label>خط العرض (Latitude) *<input name="latitude" type="number" step="any" min="-90" max="90" required value="${esc(b.latitude??'')}" placeholder="30.123456"></label>
   <label>خط الطول (Longitude) *<input name="longitude" type="number" step="any" min="-180" max="180" required value="${esc(b.longitude??'')}" placeholder="47.123456"></label>
  </div>
  <div class="bp-note">انسخ إحداثيات الموقع المحدد بدقة من خرائط Google. سيبدأ زر الملاحة باتجاه هذه النقطة.</div>
  <div class="bp-card-footer"><button type="submit" class="bp-primary">💾 حفظ الفرع</button><button type="button" class="bp-secondary" data-bp-action="cancel">إلغاء</button></div>
 </form>`;
 host.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function priceEditor(p={}){
 const r=root();if(!r||!state.canEdit)return;
 const host=r.querySelector('#bpEditorHost');
 const countries=[...new Set(state.branches.map(b=>b.country))].sort((a,b)=>a.localeCompare(b,'ar'));
 const branchOpts=state.branches.map(b=>`<option value="${b.id}" ${p.branch_id===b.id?'selected':''}>${esc(b.country+' - '+b.city+' - '+b.name)}</option>`).join('');
 host.innerHTML=`<form id="bpEditForm" class="bp-editor" data-kind="price">
  <h3>${p.id?'📄 تعديل القائمة أو استبدال PDF':'📤 رفع قائمة أسعار PDF جديدة'}</h3>
  <input type="hidden" name="id" value="${esc(p.id||'')}">
  <div class="bp-editor-grid">
   <label>عنوان القائمة *<input name="title" value="${esc(p.title||'')}" maxlength="160" required placeholder="قائمة أسعار DXN مصر"></label>
   <label>الدولة *<input name="country" value="${esc(p.country||'')}" list="bpCountries" maxlength="90" required placeholder="مثال: مصر"><datalist id="bpCountries">${countries.map(c=>'<option value="'+esc(c)+'">').join('')}</datalist></label>
   <label>فرع محدد (اختياري)<select name="branch_id"><option value="">جميع فروع الدولة</option>${branchOpts}</select></label>
   <label>تاريخ سريان الأسعار (اختياري)<input type="date" name="effective_on" value="${esc(p.effective_on||'')}"></label>
   <label class="wide">ملف PDF ${p.id?'(اتركه فارغًا للإبقاء على الملف الحالي)':'*'}<input id="bpPdf" type="file" accept=".pdf,application/pdf" ${p.id?'':'required'}></label>
  </div>
  <div class="bp-note">عند استبدال الملف، سيظهر PDF الجديد للأعضاء بعد الحفظ مباشرة. الحد الأقصى: 15 ميغابايت.</div>
  <div class="bp-card-footer"><button type="submit" class="bp-primary">💾 حفظ قائمة الأسعار</button><button type="button" class="bp-secondary" data-bp-action="cancel">إلغاء</button></div>
 </form>`;
 host.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function submit(form){
 const save=form.querySelector('button[type="submit"]');if(save.disabled)return;
 save.disabled=true;
 const fields=Object.fromEntries(new FormData(form).entries());
 try{
  if(form.dataset.kind==='branch'){
   tell('جارٍ حفظ عنوان الفرع وإحداثياته...');
   await api('save_branch',fields);
   tell('تم حفظ الفرع بنجاح');
  }else{
   const input=form.querySelector('#bpPdf'),file=input.files?.[0];
   let path='',fileName='';
   if(file){
    if(!/\.pdf$/i.test(file.name)||!(file.type==='application/pdf'||file.type===''))throw new Error('اختر ملف PDF صالحًا.');
    if(file.size<=0||file.size>15*1024*1024)throw new Error('الحجم الأقصى لملف PDF هو 15 ميغابايت.');
    tell('جارٍ تجهيز رفع ملف PDF...');
    const signed=await api('prepare_pdf',{file_name:file.name,size:file.size});
    tell('جارٍ رفع ملف PDF...');
    const uploaded=await fetch(signed.upload_url,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:file});
    if(!uploaded.ok){const msg=await uploaded.text().catch(()=>'');throw new Error('تعذر رفع PDF: '+(msg.slice(0,160)||uploaded.status));}
    path=signed.storage_path;fileName=file.name;
   }else if(!fields.id){throw new Error('اختر ملف PDF للرفع.');}
   tell('جارٍ حفظ قائمة الأسعار...');
   await api('save_price',{...fields,storage_path:path,file_name:fileName});
   tell('تم حفظ قائمة الأسعار بنجاح');
  }
  root()?.querySelector('#bpEditorHost')?.replaceChildren();
  await refresh();
 }catch(e){tell(e.message,'error');}
 finally{save.disabled=false;}
}
function drive(b){
 const dest=Number(b.latitude)+','+Number(b.longitude);
 const url=origin=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(dest)+'&travelmode=driving'+(origin?'&origin='+encodeURIComponent(origin):'');
 // Open synchronously to avoid popup blocking during the location request.
 const tab=window.open('about:blank','_blank');
 const go=origin=>{if(tab&&!tab.closed)tab.location.replace(url(origin));else window.location.assign(url(origin));};
 if(!navigator.geolocation){go('');return;}
 navigator.geolocation.getCurrentPosition(
  pos=>go(pos.coords.latitude+','+pos.coords.longitude),
  ()=>go(''),
  {enableHighAccuracy:true,timeout:7000,maximumAge:120000}
 );
}
async function openPdf(id){
 const tab=window.open('about:blank','_blank');
 if(tab){tab.document.title='جارٍ فتح قائمة الأسعار';tab.document.body.textContent='جارٍ فتح ملف PDF...';}
 try{const r=await api('open_pdf',{id});if(tab&&!tab.closed)tab.location.replace(r.url);else window.location.assign(r.url);}
 catch(e){if(tab&&!tab.closed)tab.close();tell(e.message,'error');}
}
async function onClick(event){
 const control=event.target.closest('[data-bp-action],[data-bp-section]');
 if(!control||!root()?.contains(control))return;
 const section=control.dataset.bpSection;
 if(section){setSection(section);return;}
 const action=control.dataset.bpAction,id=Number(control.dataset.id);
 if(action==='cancel'){root().querySelector('#bpEditorHost').innerHTML='';return;}
 if(action==='navigate'){const b=state.branches.find(x=>x.id===id);if(b)drive(b);return;}
 if(action==='open-pdf'){openPdf(id);return;}
 if(!state.canEdit)return;
 if(action==='add-branch'||action==='edit-branch'){branchEditor(action==='add-branch'?{}:state.branches.find(x=>x.id===id)||{});return;}
 if(action==='add-price'||action==='edit-price'){priceEditor(action==='add-price'?{}:state.prices.find(x=>x.id===id)||{});return;}
 if(action==='delete-branch'||action==='delete-price'){
  const isBranch=action==='delete-branch',name=isBranch?state.branches.find(x=>x.id===id)?.name:state.prices.find(x=>x.id===id)?.title;
  if(!window.confirm('هل تريد حذف «'+name+'» نهائيًا من الدليل؟'))return;
  try{await api(isBranch?'delete_branch':'delete_price',{id});tell('تم الحذف');await refresh();}
  catch(e){tell(e.message,'error');}
 }
}
function activate(){
 const r=root();if(!r)return;
 r.addEventListener('click',onClick);
 r.addEventListener('input',e=>{if(e.target?.id==='bpSearch'){state.q=e.target.value.trim();draw();}});
 r.addEventListener('change',e=>{if(e.target?.id==='bpCountry'){state.country=e.target.value;draw();}});
 r.addEventListener('submit',e=>{if(e.target?.id==='bpEditForm'){e.preventDefault();submit(e.target);}});
 setSection('branches');refresh();
}
window.DXN_BRANCH_PRICES={pageHtml,activate};
})();
