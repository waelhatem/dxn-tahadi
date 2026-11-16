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
// Normalize mobile numbers for WhatsApp without changing source records in the database.
const DIRECTORY_DIAL_CODES={
 'سوريا':'963','مصر':'20','العراق':'964','الأردن':'962','لبنان':'961',
 'السعودية':'966','الإمارات':'971','الإمارات العربية المتحدة':'971','الكويت':'965',
 'قطر':'974','البحرين':'973','عمان':'968','سلطنة عمان':'968','اليمن':'967',
 'فلسطين':'970','تركيا':'90','الجزائر':'213','المغرب':'212','تونس':'216',
 'ليبيا':'218','السودان':'249','موريتانيا':'222','نيجيريا':'234',
 'إثيوبيا':'251','الولايات المتحدة':'1','كندا':'1','بريطانيا':'44','المملكة المتحدة':'44'
};
function whatsappContact(phone,countryName){
 const input=String(phone||'').trim();
 if(!input)return null;
 const normalized=input.replace(/[٠-٩۰-۹]/g,c=>{
   const code=c.charCodeAt(0);
   return String(code>=0x6f0?code-0x6f0:code-0x660);
 }).replace(/[\s().-]/g,'');
 const dialCode=DIRECTORY_DIAL_CODES[String(countryName||'').trim()]||'';
 let digits='';
 if(/^\+\d{7,15}$/.test(normalized))digits=normalized.slice(1);
 else if(/^00\d{7,15}$/.test(normalized))digits=normalized.slice(2);
 else if(dialCode&&/^\d{7,15}$/.test(normalized)){
   const national=normalized.replace(/^0+/,'');
   digits=national.startsWith(dialCode)&&national.length>=dialCode.length+7
     ?national:dialCode+national;
 }else return null;
 if(!/^[1-9]\d{6,14}$/.test(digits))return null;
 const spaced=dialCode&&digits.startsWith(dialCode)
   ?'+'+dialCode+' '+digits.slice(dialCode.length):'+'+digits;
 return {display:spaced,url:'https://wa.me/'+digits};
}
const whatsappIcon='<svg class="dxnd-wa-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 .8C7.62.8.8 7.62.8 16c0 2.68.7 5.3 2.04 7.6L.7 31.3l7.88-2.07a15.12 15.12 0 0 0 7.42 1.89c8.38 0 15.2-6.82 15.2-15.2S24.38.8 16 .8zm0 27.54c-2.36 0-4.68-.63-6.69-1.82l-.48-.29-4.68 1.23 1.25-4.57-.31-.5A12.4 12.4 0 0 1 3.62 16C3.62 9.17 9.18 3.62 16 3.62S28.38 9.17 28.38 16 22.83 28.34 16 28.34zm6.79-9.27c-.37-.19-2.2-1.09-2.54-1.21-.34-.13-.59-.19-.84.19s-.97 1.21-1.19 1.46c-.22.25-.44.28-.81.09s-1.57-.58-2.99-1.85c-1.1-.98-1.84-2.19-2.06-2.56s-.02-.58.17-.77c.17-.17.37-.44.56-.65.19-.22.25-.37.37-.62.13-.25.06-.47-.03-.65-.09-.19-.84-2.03-1.15-2.78-.3-.73-.61-.63-.84-.64h-.72c-.25 0-.65.09-.99.47s-1.3 1.27-1.3 3.09 1.33 3.58 1.52 3.83c.19.25 2.62 4 6.34 5.6.89.38 1.58.6 2.12.77.89.28 1.7.24 2.34.15.71-.11 2.2-.9 2.51-1.77.31-.87.31-1.62.22-1.77s-.34-.25-.72-.43z"/></svg>';
function validMapsUrl(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol!=='https:')return '';
  if(u.hostname==='maps.app.goo.gl'&&/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return u.href;
  if(u.hostname==='goo.gl'&&/^\/maps\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return u.href;
  if(u.hostname==='maps.google.com'&&u.pathname==='/'&&/^\d{1,20}$/.test(u.searchParams.get('cid')||''))return u.href;
  if(['www.google.com','google.com'].includes(u.hostname)&&u.pathname.startsWith('/maps/'))return u.href;
 }catch(_){}
 return '';
}
function validWhatsappUrl(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol==='https:'&&u.hostname==='wa.me'&&!u.search&&!u.hash
    &&/^\/(?:[1-9][0-9]{6,14}|qr\/[A-Za-z0-9]+|message\/[A-Za-z0-9]+)\/?$/.test(u.pathname))return u.href;
 }catch(_){}
 return '';
}
function validChannelUrl(raw){
 try{
  const u=new URL(String(raw||'').trim());
  if(u.protocol==='https:'&&['whatsapp.com','www.whatsapp.com'].includes(u.hostname)
     &&/^\/channel\/[A-Za-z0-9]+\/?$/.test(u.pathname))return u.href;
 }catch(_){}
 return '';
}
function branchCard(b){
 const country=state.data.countries.find(c=>c.id===b.country_id);
 const kind=['branch','sales_point','online'].includes(b.category)?b.category:'branch';
 const isOnline=kind==='online';
 const hasGps=b.latitude!==null&&b.latitude!==undefined&&b.longitude!==null&&b.longitude!==undefined
   &&Number.isFinite(Number(b.latitude))&&Number.isFinite(Number(b.longitude))
   &&Math.abs(Number(b.latitude))<=90&&Math.abs(Number(b.longitude))<=180;
 const savedMap=validMapsUrl(b.maps_url);
 const query=hasGps?(Number(b.latitude)+','+Number(b.longitude))
   :['DXN',b.name,b.address,b.city,country?.name||''].filter(Boolean).join('، ');
 const mapUrl=savedMap||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
 const contact=whatsappContact(b.phone,country?.name);
 const delivery=whatsappContact(b.delivery_phone,country?.name);
 const originalWhatsApp=validWhatsappUrl(b.whatsapp_url);
 const whatsappButton=(c,label,originalUrl)=>c?'<a class="dxnd-whatsapp" href="'+esc(originalUrl||c.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(label+' '+c.display)+'">'+whatsappIcon+'<span class="dxnd-wa-label">'+esc(label)+'</span><b dir="ltr">'+esc(c.display)+'</b></a>':'';
 const mainPhone=contact?whatsappButton(contact,'واتساب المركز',originalWhatsApp):(b.phone?'<p>☎️ '+esc(b.phone)+'</p>':'');
 const deliveryPhone=delivery?whatsappButton(delivery,'واتساب الطلبات والتوصيل'):(b.delivery_phone?'<p>🚚 رقم الطلبات والتوصيل: '+esc(b.delivery_phone)+'</p>':'');
 const locationNotice=isOnline||savedMap||hasGps?'':'<p class="muted">📌 الموقع التقريبي: لم تُعتمد نقطة GPS دقيقة لهذا الفرع. تحقق من نتيجة البحث أو تواصل مع المركز قبل الزيارة.</p>';
 const hours=b.working_hours?'<p class="dxnd-hours">🕘 <b>أوقات الدوام:</b> '+esc(b.working_hours)+'</p>':'';
 const mapButton=isOnline?'':'<a class="dxnd-cta" href="'+esc(mapUrl)+'" target="_blank" rel="noopener noreferrer">📍 '+(savedMap||hasGps?'فتح موقع الفرع على الخريطة':'البحث عن موقع الفرع على الخريطة')+'</a>';
 const titleIcon=kind==='online'?'🚚':kind==='sales_point'?'🛍️':'📍';
 const addressIcon=isOnline?'📦':'🏠';
 return '<article class="dxnd-item"><div class="dxnd-head"><strong>'+titleIcon+' '+esc(b.name)+'</strong>'+(!b.active?'<span class="dxnd-hidden">مخفي</span>':'')+'</div><p>🌍 '+esc(country?.name||'')+' — '+esc(b.city)+'</p><p>'+addressIcon+' '+esc(b.address)+'</p>'+
  hours+mainPhone+deliveryPhone+locationNotice+mapButton+
  cardActions('branch',b)+'</article>';
}
// Signed PDF URLs are requested only for visible price lists. They expire automatically.
let inlinePreviewGeneration=0;
const inlinePreviewCache=new Map();
function priceCard(p){
 const country=state.data.countries.find(c=>c.id===p.country_id);
 const branch=state.data.branches.find(b=>b.id===p.branch_id);
 return '<article class="dxnd-item dxnd-price-item"><div class="dxnd-head"><strong>📄 '+esc(p.title)+'</strong>'+(!p.active?'<span class="dxnd-hidden">مخفي</span>':'')+'</div>'+
 '<p>🌍 '+esc(country?.name||'')+(branch?' — '+esc(branch.name):'')+'</p>'+
 '<p>🔄 آخر تحديث: '+esc(fmtDate(p.updated_at))+'</p>'+
 '<div class="dxnd-pdf-preview" id="dxndPricePreview-'+esc(p.id)+'" role="region" aria-label="المعاينة المباشرة: '+esc(p.title)+'"><p class="dxnd-pdf-loading">⏳ جارٍ عرض قائمة الأسعار مباشرة...</p></div>'+
 cardActions('price',p)+'</article>';
}
async function loadInlinePrice(p,generation,force=false){
 if(generation!==inlinePreviewGeneration)return;
 const holder=$('dxndPricePreview-'+p.id);
 if(!holder)return;
 try{
  const cached=inlinePreviewCache.get(p.id);
  let url;
  if(!force&&cached&&cached.updatedAt===p.updated_at&&cached.expiresAt>Date.now()+30000)url=cached.url;
  else{
   const answer=await storage({action:'view',price_id:p.id});
   url=String(answer.url||'');
   if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\//i.test(url))
     throw new Error('الرابط المؤقت للملف غير صالح');
   const ttl=Math.min(Math.max(Number(answer.expires_in)||900,60),900)*1000;
   inlinePreviewCache.set(p.id,{url,updatedAt:p.updated_at,expiresAt:Date.now()+ttl-30000});
  }
  if(generation!==inlinePreviewGeneration||$('dxndPricePreview-'+p.id)!==holder)return;
  holder.innerHTML='<iframe class="dxnd-inline-pdf" title="قائمة أسعار DXN: '+esc(p.title)+'" src="'+esc(url)+'" loading="eager" referrerpolicy="no-referrer"></iframe>'+
   '<p class="dxnd-pdf-fallback">تظهر القائمة أعلاه داخل الصفحة تلقائيًا. إذا كان متصفح هاتفك لا يدعم عرض PDF، <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">افتحها في عارض PDF</a>.</p>';
 }catch(error){
  if(generation!==inlinePreviewGeneration||$('dxndPricePreview-'+p.id)!==holder)return;
  holder.innerHTML='<div class="dxnd-pdf-error">تعذرت معاينة القائمة تلقائيًا: '+esc(error?.message||error)+
   ' <button type="button" data-action="retry-pdf" data-id="'+esc(p.id)+'">إعادة محاولة العرض</button></div>';
 }
}
async function loadInlinePrices(prices,generation){
 // Limit concurrent signed-URL requests on mobile; every visible list still opens automatically.
 let next=0;
 const worker=async()=>{
  while(generation===inlinePreviewGeneration&&next<prices.length){
   const price=prices[next++];
   await loadInlinePrice(price,generation);
  }
 };
 await Promise.all(Array.from({length:Math.min(prices.length,3)},worker));
}
function renderHost(){
 const host=$('dxnDirectoryHost');if(!host||!state.data)return;
 const previewGeneration=++inlinePreviewGeneration;
 const d=state.data;
 const countries=d.countries||[];
 if(state.country&&!countries.some(c=>c.id===state.country))state.country='';
 const branches=(d.branches||[]).filter(b=>!state.country||b.country_id===state.country);
 const prices=(d.prices||[]).filter(p=>!state.country||p.country_id===state.country);
 const items=state.section==='branches'?branches:prices;
 const select='<select id="dxndCountryFilter" aria-label="اختر الدولة"><option value="">🌐 جميع الدول</option>'+countries.map(c=>'<option value="'+c.id+'"'+(c.id===state.country?' selected':'')+'>'+esc(c.name)+(c.active?'':' (مخفية)')+'</option>').join('')+'</select>';
 const channelCards=(state.country?countries.filter(c=>c.id===state.country):countries).filter(c=>validChannelUrl(c.whatsapp_channel_url)).map(c=>'<a class="dxnd-channel" href="'+esc(validChannelUrl(c.whatsapp_channel_url))+'" target="_blank" rel="noopener noreferrer">📢 القناة الرسمية لـ DXN '+esc(c.name)+' على واتساب</a>').join('');
 const actions=isLeader()?'<div class="dxnd-actions"><button type="button" data-action="add" data-kind="country">➕ دولة</button><button type="button" data-action="add" data-kind="branch">➕ فرع</button><button type="button" data-action="add" data-kind="price">➕ قائمة أسعار PDF</button>'+(state.country?'<button type="button" data-action="edit" data-kind="country" data-id="'+state.country+'">✏️ تعديل الدولة</button><button type="button" data-action="delete" data-kind="country" data-id="'+state.country+'" class="danger">حذف الدولة</button>':'')+'</div>':'';
 host.innerHTML='<div class="dxnd-toolbar"><label>الدولة'+select+'</label><div class="dxnd-switch"><button type="button" data-action="section" data-section="branches" class="'+(state.section==='branches'?'selected':'')+'">📍 عناوين الفروع ('+branches.length+')</button><button type="button" data-action="section" data-section="prices" class="'+(state.section==='prices'?'selected':'')+'">📄 قوائم الأسعار ('+prices.length+')</button></div></div>'+actions+channelCards+
 '<div class="dxnd-list'+(state.section==='prices'?' dxnd-price-list':'')+'">'+(items.length?items.map(i=>state.section==='branches'?branchCard(i):priceCard(i)).join(''):'<div class="empty">لا توجد بيانات متاحة حاليًا لهذه الدولة. ستظهر هنا بعد إضافتها من القائد.</div>')+'</div><div id="dxndModal"></div>';
 if(!host.dataset.bound){
   host.dataset.bound='1';
   host.addEventListener('click',click);
   host.addEventListener('change',ev=>{if(ev.target.id==='dxndCountryFilter'){state.country=ev.target.value;renderHost()}});
 }
 if(state.section==='prices'&&items.length)void loadInlinePrices(items,previewGeneration);
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
  inner=field('اسم الدولة بالعربية','name',item?.name||'')+field('رابط قناة واتساب الرسمية للدولة (اختياري)','whatsapp_channel_url',item?.whatsapp_channel_url||'','url',false,'placeholder="https://whatsapp.com/channel/..."')+'<label class="dxnd-inline"><input type="checkbox" name="active" '+(item?.active!==false?'checked':'')+'> عرض الدولة للأعضاء</label>';
 }else if(kind==='branch'){
  inner='<label>الدولة<select name="country_id" required>'+choices(allCountries,preCountry,'اختر الدولة')+'</select></label>'+
   '<label>نوع الجهة<select name="category"><option value="branch"'+((item?.category||'branch')==='branch'?' selected':'')+'>🏢 مركز خدمة</option><option value="sales_point"'+(item?.category==='sales_point'?' selected':'')+'>🛍️ نقطة بيع</option><option value="online"'+(item?.category==='online'?' selected':'')+'>🚚 توصيل إلكتروني فقط</option></select></label>'+
   field('اسم الفرع','name',item?.name||'')+field('المدينة أو المحافظة','city',item?.city||'')+field('العنوان التفصيلي','address',item?.address||'')+
   field('رقم التواصل مع المركز (اختياري)','phone',item?.phone||'','tel',false)+
   field('رابط واتساب الأصلي للجهة (اختياري)','whatsapp_url',item?.whatsapp_url||'','url',false,'placeholder="https://wa.me/qr/..."')+
   field('رقم الطلبات والتوصيل عبر واتساب (اختياري)','delivery_phone',item?.delivery_phone||'','tel',false)+
   field('أوقات الدوام (اختياري)','working_hours',item?.working_hours||'','text',false)+
   field('رابط الموقع المباشر من خرائط Google (اختياري)','maps_url',item?.maps_url||'','url',false,'placeholder="https://maps.app.goo.gl/..."')+
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
function click(ev){
 const btn=ev.target.closest('[data-action]');if(!btn)return;
 const action=btn.dataset.action,kind=btn.dataset.kind,id=btn.dataset.id;
 if(action==='section'){state.section=btn.dataset.section;renderHost()}
 else if(action==='close'){const modal=$('dxndModal');if(modal)modal.innerHTML=''}
 else if(action==='retry-pdf'){
  const p=state.data?.prices?.find(x=>x.id===id);
  if(p){const holder=$('dxndPricePreview-'+p.id);if(holder)holder.innerHTML='<p class="dxnd-pdf-loading">⏳ جارٍ إعادة فتح قائمة الأسعار...</p>';void loadInlinePrice(p,inlinePreviewGeneration,true)}
 }
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
style.textContent+='.dxnd-channel{display:block;margin:12px 0;padding:14px;border-radius:14px;background:#e8f8ee;color:#0f513f;text-align:center;text-decoration:none;font-weight:900;border:1px solid #bce5c9}.dxnd-hours{background:#f4faf6;padding:9px;border-radius:10px}.dxnd-whatsapp{display:inline-flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;direction:rtl;min-height:48px;margin:9px 0 3px;padding:9px 13px;background:#ecfdf3;border:1px solid #b4e6c7;border-radius:13px;color:#087a43;text-decoration:none;font-size:16px;font-weight:900;max-width:100%;overflow-wrap:anywhere}.dxnd-whatsapp:focus-visible{outline:3px solid #169d64;outline-offset:2px}.dxnd-whatsapp:hover{background:#d9f8e7}.dxnd-whatsapp b{font-size:18px;unicode-bidi:isolate;direction:ltr;white-space:nowrap;color:#0a6840}.dxnd-wa-icon{width:24px;height:24px;flex:none;color:#25d366}.dxnd-wa-label{font-size:14px}';
style.textContent+='.dxnd-price-list{display:block;max-width:100%}.dxnd-price-item{width:100%;max-width:100%;margin-bottom:16px;min-width:0}.dxnd-pdf-preview{width:100%;max-width:100%;margin:12px 0;overflow:hidden;border:1px solid #dce8e1;border-radius:13px;background:#f7faf8}.dxnd-inline-pdf{display:block;width:100%;height:min(82vh,900px);min-height:550px;border:0;background:#fff}.dxnd-pdf-loading{padding:28px 12px;text-align:center;color:#345a49;font-weight:800}.dxnd-pdf-fallback{font-size:12px!important;line-height:1.6;color:#52645b;padding:8px 12px;margin:0!important}.dxnd-pdf-fallback a{color:#0f513f;font-weight:800;text-decoration:underline}.dxnd-pdf-error{padding:20px;text-align:center;color:#9a3412}.dxnd-pdf-error button{display:inline-block;margin:10px;padding:9px 16px;border-radius:9px;font-weight:800}@media(max-width:600px){.dxnd-price-item{padding:10px}.dxnd-inline-pdf{height:76vh;min-height:480px}}';
document.head.appendChild(style);
window.dxnBranchesPricesPage=page;
window.dxnBranchesPricesLoad=load;
})();
