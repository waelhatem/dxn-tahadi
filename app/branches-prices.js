/* Global DXN directory — isolated feature; no changes to existing training or team logic. */
(function(){
'use strict';
const state={data:null,country:'',section:'branches',editing:null,loading:false};
const MAX_PDF=20*1024*1024;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
const session=()=>String(localStorage.getItem('dxn_session')||'');
function notify(message){if(typeof window.toast==='function')window.toast(message);else alert(message)}
function fmtDate(x){try{return new Intl.DateTimeFormat('ar',{year:'numeric',month:'short',day:'numeric'}).format(new Date(x))}catch{return ''}}
async function rpc(fn,args){
  const response=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({fn,args:{...args,p_token:session()}})});
  const value=await response.json().catch(()=>({}));
  if(!response.ok||value?.error)throw new Error(value?.error||'تعذر الاتصال بالخدمة');
  return value;
}
async function storage(body){
  const response=await fetch('/api/dxn-directory-storage',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({...body,p_token:session()})});
  const value=await response.json().catch(()=>({}));
  if(!response.ok||!value.ok)throw new Error(value.error||'تعذر الوصول إلى ملف PDF');
  return value;
}
function isLeader(){return !!state.data?.is_leader}
function page(){
 return '<section class="card dxn-directory" id="dxnDirectory"><div class="title">📍 الفروع والأسعار حول العالم</div><p class="muted">اختر الدولة لعرض عناوين فروع DXN وأحدث قوائم الأسعار المتاحة. يتم تحديث المحتوى من إدارة القائد.</p><div id="dxnDirectoryHost" role="region" aria-label="فروع DXN وقوائم الأسعار">جارٍ تحميل دليل الفروع والأسعار...</div></section>';
}
function chosenCountry(){return state.country||''}
function cardActions(entity,item){
 if(!isLeader())return '';
 return '<div class="dxnd-actions"><button type="button" data-action="edit" data-kind="'+entity+'" data-id="'+item.id+'">✏️ تعديل</button><button type="button" data-action="delete" data-kind="'+entity+'" data-id="'+item.id+'" class="danger">🗑️ حذف</button></div>';
}
function branchCard(b){
 const country=state.data.countries.find(c=>c.id===b.country_id);
 const hasGps=b.latitude!==null&&b.latitude!==undefined&&b.longitude!==null&&b.longitude!==undefined
   &&Number.isFinite(Number(b.latitude))&&Number.isFinite(Number(b.longitude));
 const query=[b.name,b.city,country?.name||'سوريا',b.address].filter(Boolean).join('، ');
 const destination=hasGps?(Number(b.latitude)+','+Number(b.longitude)):query;
 const url='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination)+'&travelmode=driving';
 const searchUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
 const dial=/^0[0-9]{9}$/.test(String(b.phone||''))?'+963'+String(b.phone).slice(1):String(b.phone||'');
 const phone=b.phone?'<p>☎️ <a href="tel:'+esc(dial.replace(/[^+0-9]/g,''))+'" style="font-weight:900">'+esc(b.phone)+'</a></p>':'';
 const gpsNotice=hasGps?'':'<p class="muted">⚠️ لم تُعتمد إحداثيات GPS لهذا الفرع بعد؛ اتجاهات الخريطة مبنية على العنوان المكتوب وقد لا تكون دقيقة. اتصل بالفرع لتأكيد الموقع قبل التوجه.</p>';
 return '<article class="dxnd-item"><div class="dxnd-head"><strong>📍 '+esc(b.name)+'</strong>'+(!b.active?'<span class="dxnd-hidden">مخفي</span>':'')+'</div><p>🌍 '+esc(country?.name||'')+' — '+esc(b.city)+'</p><p>🏠 '+esc(b.address)+'</p>'+
  phone+gpsNotice+
  '<a class="dxnd-cta" href="'+url+'" target="_blank" rel="noopener noreferrer">'+(hasGps?'🧭 الاتجاهات من موقعي عبر GPS':'🧭 اتجاهات باستخدام العنوان المكتوب')+'</a>'+
  (!hasGps?'<a class="dxnd-map-search" href="'+searchUrl+'" target="_blank" rel="noopener noreferrer">🔎 البحث عن الفرع في خرائط Google</a>':'')+
  cardActions('branch',b)+'</article>';
}
function priceCard(p){
 const country=state.data.countries.find(c=>c.id===p.country_id);
 const branch=state.data.branches.find(b=>b.id===p.branch_id);
 return '<article class="dxnd-item"><div class="dxnd-head"><strong>📄 '+esc(p.title)+'</strong>'+(!p.active?'<span class="dxnd-hidden">مخفي</span>':'')+'</div>'+
 '<p>🌍 '+esc(country?.name||'')+(branch?' — '+esc(branch.name):'')+'</p>'+
 '<p>🔄 آخر تحديث: '+esc(fmtDate(p.updated_at))+'</p>'+
 '<button class="dxnd-cta" type="button" data-action="view" data-id="'+p.id+'">📖 عرض وتحميل قائمة PDF</button>'+cardActions('price',p)+'</article>';
}
function renderHost(){
 const host=$('dxnDirectoryHost');if(!host||!state.data)return;
 const d=state.data;
 const countries=d.countries||[];
 if(state.country&&!countries.some(c=>c.id===state.country))state.country='';
 const branches=(d.branches||[]).filter(b=>!state.country||b.country_id===state.country);
 const prices=(d.prices||[]).filter(p=>!state.country||p.country_id===state.country);
 const items=state.section==='branches'?branches:prices;
 const select='<select id="dxndCountryFilter" aria-label="اختر الدولة"><option value="">🌐 جميع الدول</option>'+countries.map(c=>'<option value="'+c.id+'"'+(c.id===state.country?' selected':'')+'>'+esc(c.name)+(c.active?'':' (مخفية)')+'</option>').join('')+'</select>';
 const actions=isLeader()?'<div class="dxnd-actions"><button type="button" data-action="add" data-kind="country">➕ دولة</button><button type="button" data-action="add" data-kind="branch">➕ فرع</button><button type="button" data-action="add" data-kind="price">➕ قائمة أسعار PDF</button>'+(state.country?'<button type="button" data-action="edit" data-kind="country" data-id="'+state.country+'">✏️ تعديل الدولة</button><button type="button" data-action="delete" data-kind="country" data-id="'+state.country+'" class="danger">حذف الدولة</button>':'')+'</div>':'';
 host.innerHTML='<div class="dxnd-toolbar"><label>الدولة'+select+'</label><div class="dxnd-switch"><button type="button" data-action="section" data-section="branches" class="'+(state.section==='branches'?'selected':'')+'">📍 عناوين الفروع ('+branches.length+')</button><button type="button" data-action="section" data-section="prices" class="'+(state.section==='prices'?'selected':'')+'">📄 قوائم الأسعار ('+prices.length+')</button></div></div>'+actions+
 '<div class="dxnd-list">'+(items.length?items.map(i=>state.section==='branches'?branchCard(i):priceCard(i)).join(''):'<div class="empty">لا توجد بيانات متاحة حاليًا لهذه الدولة. ستظهر هنا بعد إضافتها من القائد.</div>')+'</div><div id="dxndModal"></div>';
 if(!host.dataset.bound){
   host.dataset.bound='1';
   host.addEventListener('click',click);
   host.addEventListener('change',ev=>{if(ev.target.id==='dxndCountryFilter'){state.country=ev.target.value;renderHost()}});
 }
}
function choices(items,selected,placeholder,filter){
 return '<option value="">'+esc(placeholder)+'</option>'+items.filter(filter||(()=>true)).map(x=>'<option value="'+x.id+'"'+(x.id===selected?' selected':'')+'>'+esc(x.name)+'</option>').join('');
}
function field(label,name,value='',type='text',required=true,extra=''){
 return '<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?'required ':'')+extra+'></label>';
}
function editForm(kind,item){
 const d=state.data; const allCountries=d.countries||[];const preCountry=item?.country_id||state.country||'';
 let inner='';
 if(kind==='country'){
  inner=field('اسم الدولة بالعربية','name',item?.name||'')+'<label class="dxnd-inline"><input type="checkbox" name="active" '+(item?.active!==false?'checked':'')+'> عرض الدولة للأعضاء</label>';
 }else if(kind==='branch'){
  inner='<label>الدولة<select name="country_id" required>'+choices(allCountries,preCountry,'اختر الدولة')+'</select></label>'+
   field('اسم الفرع','name',item?.name||'')+field('المدينة أو المحافظة','city',item?.city||'')+field('العنوان التفصيلي','address',item?.address||'')+
   field('رقم التواصل (اختياري)','phone',item?.phone||'','tel',false)+
   '<p class="muted">إحداثيات GPS اختيارية: أدخل خط العرض والطول معًا فقط عند التأكد من نقطة الفرع الفعلية. وإلا اتركهما فارغين، وسيظهر البحث بالعنوان بدل النقطة غير المؤكدة.</p>'+
   field('خط العرض (Latitude) - اختياري','latitude',item?.latitude??'','number',false,'step="any" min="-90" max="90"')+
   field('خط الطول (Longitude) - اختياري','longitude',item?.longitude??'','number',false,'step="any" min="-180" max="180"')+
   '<label class="dxnd-inline"><input type="checkbox" name="active" '+(item?.active!==false?'checked':'')+'> إظهار الفرع للأعضاء</label>';
 }else{
  inner='<label>الدولة<select name="country_id" required id="dxndPriceCountry">'+choices(allCountries,preCountry,'اختر الدولة')+'</select></label>'+
   '<label>الفرع (اختياري)<select name="branch_id" id="dxndPriceBranch">'+choices(d.branches,item?.branch_id||'','قائمة عامة للدولة',b=>b.country_id===preCountry)+'</select></label>'+
   field('عنوان قائمة الأسعار','title',item?.title||'')+
   '<label>ملف PDF '+(item?'البديل':'الجديد')+'<input type="file" name="pdf_file" accept=".pdf,application/pdf" required></label>'+
   '<p class="muted">الحد الأقصى 20 ميغابايت. عند تعديل القائمة، يحل الملف الجديد محل القديم في الدليل.</p>'+
   '<label class="dxnd-inline"><input type="checkbox" name="active" '+(item?.active!==false?'checked':'')+'> إظهار القائمة للأعضاء</label>';
 }
 const container=$('dxndModal'); if(!container)return;
 container.innerHTML='<div class="dxnd-overlay" role="dialog" aria-modal="true" aria-label="إدارة دليل DXN"><form id="dxndEditForm" class="dxnd-form"><h3>'+(item?'✏️ تعديل':'➕ إضافة')+' '+({country:'دولة',branch:'فرع',price:'قائمة أسعار'}[kind])+'</h3>'+inner+
 '<div class="dxnd-actions"><button type="submit" class="primary">💾 حفظ</button><button type="button" data-action="close">إلغاء</button></div><p id="dxndFormMessage" role="status"></p></form></div>';
 const form=$('dxndEditForm');
 form.dataset.kind=kind;form.dataset.id=item?.id||'';
 form.addEventListener('submit',saveForm);
 if(kind==='price')$('dxndPriceCountry').addEventListener('change',e=>{
   $('dxndPriceBranch').innerHTML=choices(d.branches,'','قائمة عامة للدولة',b=>b.country_id===e.target.value);
 });
}
async function saveForm(ev){
 ev.preventDefault();const f=ev.currentTarget;
 const kind=f.dataset.kind;const id=f.dataset.id||'';
 const payload=Object.fromEntries(new FormData(f).entries());
 payload.id=id||null;
 payload.active=f.elements.active.checked;
 const msg=$('dxndFormMessage');const btn=f.querySelector('[type=submit]');
 if(kind==='branch'&&Boolean(String(payload.latitude||'').trim())!==Boolean(String(payload.longitude||'').trim())){
   msg.textContent='❌ يجب إدخال خط العرض وخط الطول معًا، أو تركهما فارغين.';return;
 }
 btn.disabled=true;msg.textContent='جارٍ حفظ البيانات...';
 try{
  if(kind==='price'){
   const file=f.elements.pdf_file.files?.[0];
   if(!file||(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'))throw new Error('اختر ملف PDF صالحًا');
   if(file.size<1||file.size>MAX_PDF)throw new Error('ملف PDF يجب ألا يتجاوز 20 ميغابايت');
   const prepared=await storage({action:'prepare',file_size:file.size,content_type:'application/pdf'});
   const client=window.supabase.createClient(window.DXN_CONFIG.SUPABASE_URL,window.DXN_CONFIG.SUPABASE_ANON_KEY);
   const result=await client.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path,prepared.upload_token,file,{contentType:'application/pdf'});
   if(result.error)throw new Error(result.error.message||'فشل رفع PDF');
   payload.object_path=prepared.path;
   payload.file_size=file.size;
   payload.file_name=file.name;
   delete payload.pdf_file;
  }
  const r=await rpc('dxn_directory_manage',{p_entity:kind,p_action:'save',p_payload:payload});
  if(!r?.ok)throw new Error('لم تكتمل عملية الحفظ');
  notify('تم حفظ البيانات بنجاح');
  await load();
 }catch(error){msg.textContent='❌ '+String(error?.message||error);btn.disabled=false}
}
async function remove(kind,id){
 if(!confirm('هل تريد حذف هذا السجل نهائيًا؟'))return;
 try{await rpc('dxn_directory_manage',{p_entity:kind,p_action:'delete',p_payload:{id}});notify('تم الحذف');await load()}
 catch(e){notify(String(e?.message||e))}
}
async function viewPdf(id){
 const p=state.data?.prices?.find(x=>x.id===id);if(!p)return;
 const container=$('dxndModal');if(!container)return;
 container.innerHTML='<div class="dxnd-overlay" role="dialog" aria-modal="true"><div class="dxnd-viewer"><div class="dxnd-head"><strong>📄 '+esc(p.title)+'</strong><button type="button" data-action="close">✖ إغلاق</button></div><div id="dxndPdfFrame" class="muted">جارٍ تجهيز ملف PDF الآمن...</div></div></div>';
 try{
  const answer=await storage({action:'view',price_id:id});
  const frame=$('dxndPdfFrame');if(!frame)return;
  frame.innerHTML='<p><a class="dxnd-cta" target="_blank" rel="noopener noreferrer" href="'+esc(answer.url)+'">📖 فتح PDF في المتصفح أو تطبيق القراءة</a></p><iframe title="قائمة أسعار DXN" src="'+esc(answer.url)+'" loading="lazy"></iframe><p class="muted">إذا لم يظهر الملف داخل الهاتف، اضغط «فتح PDF» أعلاه.</p>';
 }catch(e){const frame=$('dxndPdfFrame');if(frame)frame.textContent='تعذر فتح القائمة: '+String(e?.message||e)}
}
function click(ev){
 const btn=ev.target.closest('[data-action]');if(!btn)return;
 const action=btn.dataset.action,kind=btn.dataset.kind,id=btn.dataset.id;
 if(action==='section'){state.section=btn.dataset.section;renderHost()}
 else if(action==='close'){const modal=$('dxndModal');if(modal)modal.innerHTML=''}
 else if(action==='view')viewPdf(id);
 else if(action==='delete')remove(kind,id);
 else if(action==='add')editForm(kind,null);
 else if(action==='edit'){const list={country:'countries',branch:'branches',price:'prices'}[kind];editForm(kind,state.data?.[list]?.find(x=>x.id===id))}
}
async function load(){
 const host=$('dxnDirectoryHost');if(!host)return;
 if(state.loading)return;state.loading=true;
 try{
  const response=await rpc('dxn_directory_list',{});
  if(!response||!Array.isArray(response.countries))throw new Error('تنسيق الدليل غير صالح');
  state.data=response;renderHost();
 }catch(error){host.innerHTML='<div class="empty">تعذر تحميل دليل الفروع والأسعار: '+esc(error.message||error)+'<p><button type="button" id="dxndRetry">إعادة المحاولة</button></p></div>';$('dxndRetry')?.addEventListener('click',load)}
 finally{state.loading=false}
}
const style=document.createElement('style');
style.textContent='.dxn-directory{direction:rtl;text-align:right}.dxnd-toolbar{display:grid;gap:9px;margin:16px 0}.dxnd-toolbar label{font-weight:900}.dxnd-toolbar select{margin:5px 0}.dxnd-switch,.dxnd-actions{display:flex;flex-wrap:wrap;gap:8px}.dxnd-switch>button{flex:1;background:#eef4f0;color:#164b3d}.dxnd-switch>.selected,.dxnd-cta{background:#0f513f!important;color:#fff!important}.dxnd-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;margin-top:12px}.dxnd-item{border:1px solid #dce8e1;border-radius:17px;padding:16px;background:#fff;box-shadow:0 4px 18px #0000000a}.dxnd-item p{font-size:13px;line-height:1.8;margin:8px 0;color:#4b5b55}.dxnd-head{display:flex;gap:9px;align-items:center;justify-content:space-between}.dxnd-cta{display:block;text-align:center;border:0;border-radius:12px;min-height:44px;padding:12px;margin:10px 0;text-decoration:none;font-weight:900;cursor:pointer;width:100%}.dxnd-actions button{min-height:40px}.dxnd-hidden{background:#fef3c7;color:#854d0e;border-radius:12px;padding:5px 8px;font-size:12px}.dxnd-overlay{position:fixed;inset:0;background:#091b18b0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto}.dxnd-form,.dxnd-viewer{background:#fff;border-radius:18px;max-height:93vh;overflow:auto;width:min(100%,650px);padding:19px;box-shadow:0 15px 45px #0003}.dxnd-form label{display:block;font-size:13px;font-weight:900;margin:8px 0}.dxnd-form input,.dxnd-form select{margin:6px 0}.dxnd-form .dxnd-inline{display:flex;align-items:center;gap:10px}.dxnd-form input[type=checkbox]{width:auto}.dxnd-viewer{width:min(100%,850px)}.dxnd-viewer iframe{width:100%;height:65vh;border:1px solid #dce8e1;border-radius:10px}@media(max-width:600px){.dxnd-viewer iframe{height:52vh}.dxnd-form,.dxnd-viewer{padding:12px}}';
style.textContent+='.dxnd-map-search{display:block;text-align:center;border:1px solid #0f513f;border-radius:12px;color:#0f513f;text-decoration:none;font-weight:900;padding:11px;margin:7px 0}';
document.head.appendChild(style);
window.dxnBranchesPricesPage=page;
window.dxnBranchesPricesLoad=load;
})();
