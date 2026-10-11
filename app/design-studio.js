(function(){
'use strict';
if(window.__DXN_DESIGN_STUDIO_FULL_V2__)return;
window.__DXN_DESIGN_STUDIO_FULL_V2__=true;

const tools={
  enhance:{icon:'✨',title:'تحسين احترافي',desc:'وضوح وإضاءة وتنظيف مع الحفاظ على الصورة.',needImage:true,placeholder:'اختياري: ما الذي تريد تحسينه أكثر؟'},
  product:{icon:'📸',title:'تصوير منتج',desc:'تحويل صورة المنتج إلى لقطة استوديو تسويقية.',needImage:true,placeholder:'مثال: تصوير فاخر بإضاءة صباحية وظل واقعي.'},
  remove_bg:{icon:'✂️',title:'إزالة الخلفية',desc:'عزل المنتج بخلفية شفافة ونظيفة.',needImage:true,placeholder:'لا تحتاج تعليمات إضافية.'},
  background:{icon:'🏞️',title:'تغيير الخلفية',desc:'وضع المنتج في بيئة تسويقية واقعية.',needImage:true,placeholder:'مثال: طاولة خشبية أنيقة مع ضوء صباحي.'},
  lighting:{icon:'💡',title:'تحسين الإضاءة',desc:'تصحيح الضوء والألوان دون تغيير المشهد.',needImage:true,placeholder:'مثال: إضاءة طبيعية أكثر ووهج أقل.'},
  erase:{icon:'🧹',title:'حذف عنصر',desc:'إزالة عنصر مزعج وإعادة بناء المنطقة خلفه.',needImage:true,placeholder:'اكتب العنصر المراد حذفه، مثال: احذف الكتب الموجودة يمين الصورة.'},
  free:{icon:'🪄',title:'تعديل بالذكاء الاصطناعي',desc:'اكتب ما تريد تغييره بلغتك.',needImage:true,placeholder:'مثال: غيّر الحائط فقط ولا تغيّر المنتج.'},
  upscale:{icon:'🔎',title:'زيادة الدقة',desc:'تكبير الصورة وتحسين التفاصيل بدقة أعلى.',needImage:true,placeholder:'لا تحتاج تعليمات إضافية.'},
  resize:{icon:'📐',title:'تغيير المقاس',desc:'قص وتموضع للمربع والمنشور والستوري والأفقي.',needImage:true,local:true,placeholder:''},
  ad:{icon:'📣',title:'إنشاء إعلان',desc:'تركيب إعلاني احترافي مع مساحة للنص.',needImage:true,placeholder:'مثال: إعلان فاخر بخلفية داكنة ومساحة عنوان في الأعلى.'},
  generate:{icon:'🎨',title:'إنشاء صورة',desc:'إنشاء مشهد تسويقي جديد من وصفك.',needImage:false,placeholder:'صف الصورة التي تريد إنشاءها بالتفصيل.'},
  video:{icon:'🎬',title:'صورة إلى فيديو',desc:'تحريك صورة المنتج بفيديو قصير احترافي.',needImage:true,video:true,placeholder:'مثال: حركة كاميرا بطيئة للأمام مع انعكاس ضوء ناعم.'}
};
const aspects={'1:1':[1,1],'4:5':[4,5],'9:16':[9,16],'16:9':[16,9]};
const backgrounds={premium:'استوديو فاخر',white:'أبيض نظيف',lifestyle:'Lifestyle',natural:'طبيعي',dark:'داكن فاخر',warm:'دافئ'};
const freshEditor=()=>({zoom:1,rotation:0,offsetX:0,offsetY:0,text:'',fontSize:54,textColor:'#ffffff',textX:50,textY:86,logoData:'',logoScale:22});
const state={
  view:'ai',task:'enhance',aspect:'1:1',background:'premium',preserve:true,prompt:'',
  inputData:'',inputName:'',result:null,history:[],loading:false,status:'',statusKind:'',
  duration:5,generateAudio:false,videoJob:'',
  editor:freshEditor(),undo:[],redo:[],editorImage:null,drawToken:0
};

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){if(typeof window.toast==='function')window.toast(msg);else alert(msg)}
function sessionToken(){return String(localStorage.getItem('dxn_session')||'')}
function currentImage(){return state.result&&state.result.type==='image'?(state.result.data||state.result.url||''):state.inputData}
function refresh(){if(typeof window.render==='function')window.render()}
function setStatus(msg,kind=''){state.status=msg||'';state.statusKind=kind;const el=document.getElementById('dsStatus');if(el){el.className='ds-status '+kind;el.textContent=state.status}}
function taskCard(key){
  const t=tools[key];
  return '<button type="button" class="ds-tool '+(state.task===key?'active':'')+'" data-ds-task="'+key+'"><span class="ds-tool-icon">'+t.icon+'</span><b>'+t.title+'</b><span>'+t.desc+'</span></button>';
}
function resultMedia(result){
  if(!result)return '<div class="ds-result-empty">النتيجة ستظهر هنا بعد تنفيذ المهمة.</div>';
  if(result.type==='video')return '<video controls playsinline src="'+esc(result.url)+'"></video>';
  return '<img src="'+esc(result.data||result.url)+'" alt="نتيجة استوديو التصميم">';
}
function compareHtml(){
  if(!state.inputData||!state.result||state.result.type!=='image')return '';
  return '<div class="ds-compare"><div class="ds-compare-box"><div class="ds-compare-label">قبل</div><img src="'+esc(state.inputData)+'" alt="الصورة الأصلية"></div><div class="ds-compare-box"><div class="ds-compare-label">بعد</div><img src="'+esc(state.result.data||state.result.url)+'" alt="الصورة بعد التعديل"></div></div>';
}
function aiHtml(){
  const t=tools[state.task]||tools.enhance;
  const upload=state.inputData
    ? '<div class="ds-preview has-image"><img src="'+esc(state.inputData)+'" alt="معاينة الصورة"><div class="ds-preview-bar"><button type="button" data-ds-change>🔄 تغيير</button><button type="button" data-ds-remove>🗑️ إزالة</button></div></div>'
    : '<div class="ds-empty-upload"><div class="icon">📷</div><b>اضغط لاختيار صورة</b><span>JPG / PNG / WEBP — يتم ضغطها محليًا قبل الإرسال</span></div>';
  const bgButtons=Object.entries(backgrounds).map(([k,label])=>'<button type="button" class="ds-background '+(state.background===k?'active':'')+'" data-ds-bg="'+k+'">'+label+'</button>').join('');
  const aspectButtons=Object.keys(aspects).map(k=>'<button type="button" class="ds-aspect '+(state.aspect===k?'active':'')+'" data-ds-aspect="'+k+'">'+k+'</button>').join('');
  const needsBg=['product','background','ad','generate'].includes(state.task);
  const preserveVisible=state.task!=='generate'&&state.task!=='remove_bg'&&state.task!=='upscale';
  const videoOptions=state.task==='video'
    ? '<div class="ds-form-row"><div class="ds-label">إعدادات الفيديو</div><div class="ds-video-options"><select class="ds-select" id="dsDuration"><option value="5" '+(state.duration===5?'selected':'')+'>5 ثوانٍ</option><option value="8" '+(state.duration===8?'selected':'')+'>8 ثوانٍ</option><option value="10" '+(state.duration===10?'selected':'')+'>10 ثوانٍ</option><option value="15" '+(state.duration===15?'selected':'')+'>15 ثانية</option></select><label class="ds-video-audio"><input id="dsAudio" type="checkbox" '+(state.generateAudio?'checked':'')+'> توليد صوت</label></div></div>'
    :'';
  const promptVisible=!['remove_bg','upscale','resize'].includes(state.task);
  const result=state.result
    ? '<div class="ds-panel ds-result-card"><h3>3. النتيجة</h3><div class="ds-result-area">'+resultMedia(state.result)+'</div><div class="ds-result-actions"><button type="button" class="primary" data-ds-download>⬇️ حفظ</button>'+(state.result.type==='image'?'<button type="button" data-ds-edit-result>✏️ فتح في المحرر</button>':'')+'<button type="button" data-ds-repeat>🔄 إعادة التنفيذ</button></div>'+compareHtml()+'</div>'
    : '<div class="ds-panel ds-result-card"><h3>3. النتيجة</h3><div class="ds-result-area"><div class="ds-result-empty">'+(state.loading?'<span class="ds-spinner"></span> جارٍ تنفيذ المهمة...':'النتيجة ستظهر هنا بعد تنفيذ المهمة.')+'</div></div></div>';

  return '<div class="ds-tools">'+Object.keys(tools).map(taskCard).join('')+'</div>'+
    '<div class="ds-workspace"><div class="ds-panel"><h3>1. الصورة الأصلية</h3><p class="ds-hint">'+(t.needImage?'ارفع صورة واضحة للمنتج أو المشهد.':'هذه المهمة تستطيع العمل من الوصف فقط، ورفع صورة غير مطلوب.')+'</p><div class="ds-drop" id="dsDrop">'+upload+'<input class="ds-file" id="dsFile" type="file" accept="image/jpeg,image/png,image/webp"></div></div>'+
    '<div class="ds-panel"><span class="ds-badge">'+t.icon+' '+t.title+'</span><h3 style="margin-top:11px">2. الإعدادات</h3>'+
      (preserveVisible?'<div class="ds-form-row"><label class="ds-preserve"><input id="dsPreserve" type="checkbox" '+(state.preserve?'checked':'')+'><span><b>🔒 وضع الحفاظ على المنتج</b><small>يطلب من المحرك عدم تغيير العبوة أو الشعار أو الألوان أو النصوص المطبوعة قدر الإمكان.</small></span></label><div class="ds-warning">راجع الكتابة الصغيرة والشعار قبل النشر؛ أي تحرير توليدي قد يغيّر تفاصيل دقيقة رغم هذا القيد.</div></div>':'')+
      '<div class="ds-form-row"><div class="ds-label">مقاس النتيجة</div><div class="ds-aspects">'+aspectButtons+'</div></div>'+
      (needsBg?'<div class="ds-form-row"><div class="ds-label">الطابع البصري للخلفية</div><div class="ds-backgrounds">'+bgButtons+'</div></div>':'')+
      (promptVisible?'<div class="ds-form-row"><label class="ds-label" for="dsPrompt">تعليماتك</label><textarea class="ds-textarea" id="dsPrompt" maxlength="1800" placeholder="'+esc(t.placeholder)+'">'+esc(state.prompt)+'</textarea></div>':'')+
      videoOptions+
      '<button type="button" class="ds-generate" id="dsRun" '+(state.loading?'disabled':'')+'>'+(state.loading?'⏳ جارٍ التنفيذ...':state.task==='resize'?'📐 فتح محرر المقاس':state.task==='video'?'🎬 إنشاء الفيديو':'✨ تنفيذ المهمة')+'</button>'+
      '<div id="dsStatus" class="ds-status '+state.statusKind+'">'+esc(state.status)+'</div>'+
    '</div></div>'+result;
}
function historyHtml(){
  if(!state.history.length)return '<div class="ds-empty-history"><div><div style="font-size:45px">🗂️</div><b>لا توجد نتائج في هذه الجلسة بعد</b><p>كل صورة أو فيديو يتم إنشاؤه سيظهر هنا تلقائيًا.</p></div></div>';
  return '<div class="ds-history-grid">'+state.history.map((h,i)=>{
    const media=h.type==='video'?'<video muted playsinline src="'+esc(h.url)+'"></video>':'<img src="'+esc(h.data||h.url)+'" alt="تصميم سابق">';
    return '<article class="ds-history-card"><div class="ds-history-media">'+media+'</div><div class="ds-history-meta"><b>'+esc(tools[h.task]?.title||'تصميم')+'</b><span>'+esc(h.aspect)+' · '+new Date(h.createdAt).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})+'</span></div><div class="ds-history-actions"><button type="button" data-ds-history-download="'+i+'">⬇️ حفظ</button>'+(h.type==='image'?'<button type="button" data-ds-history-edit="'+i+'">✏️ تعديل</button>':'')+'</div></article>';
  }).join('')+'</div>';
}
function editorHtml(){
  if(!currentImage())return '<div class="ds-empty-history"><div><div style="font-size:44px">🖌️</div><b>لا توجد صورة للتحرير</b><p>ارفع صورة أو أنشئ تصميمًا ثم افتحه في المحرر.</p><button type="button" class="primary" data-ds-view="ai">العودة للذكاء الاصطناعي</button></div></div>';
  return '<div class="ds-editor-layout"><div class="ds-panel"><h3>محرر الصورة</h3><p class="ds-hint">المقاس المختار يعمل كإطار قص. استخدم التكبير والتحريك لتحديد الجزء الظاهر.</p><div class="ds-canvas-wrap"><canvas id="dsEditorCanvas" width="900" height="900"></canvas></div></div>'+
    '<div class="ds-panel ds-editor-controls">'+
      '<div class="ds-control"><b>📐 المقاس والقص</b><div class="ds-aspects">'+Object.keys(aspects).map(k=>'<button type="button" class="ds-aspect '+(state.aspect===k?'active':'')+'" data-ds-editor-aspect="'+k+'">'+k+'</button>').join('')+'</div><label>تكبير / تصغير<input id="dsZoom" type="range" min="50" max="250" value="'+Math.round(state.editor.zoom*100)+'"></label><label>تحريك أفقي<input id="dsOffsetX" type="range" min="-100" max="100" value="'+state.editor.offsetX+'"></label><label>تحريك عمودي<input id="dsOffsetY" type="range" min="-100" max="100" value="'+state.editor.offsetY+'"></label><div class="ds-control-grid"><button type="button" data-ds-rotate="-90">↪️ تدوير -90°</button><button type="button" data-ds-rotate="90">↩️ تدوير +90°</button></div></div>'+
      '<div class="ds-control"><b>🔤 إضافة نص</b><input class="ds-input" id="dsText" value="'+esc(state.editor.text)+'" placeholder="اكتب النص"><div class="ds-control-grid" style="margin-top:8px"><label>الحجم<input id="dsFontSize" type="range" min="20" max="120" value="'+state.editor.fontSize+'"></label><label>اللون<br><input class="ds-color" id="dsTextColor" type="color" value="'+esc(state.editor.textColor)+'"></label></div><label>موضع أفقي<input id="dsTextX" type="range" min="5" max="95" value="'+state.editor.textX+'"></label><label>موضع عمودي<input id="dsTextY" type="range" min="5" max="95" value="'+state.editor.textY+'"></label></div>'+
      '<div class="ds-control"><b>🏷️ إضافة شعار</b><input class="ds-file" id="dsLogoFile" type="file" accept="image/png,image/jpeg,image/webp"><button type="button" data-ds-logo-pick>اختيار شعار</button> '+(state.editor.logoData?'<button type="button" data-ds-logo-clear>إزالة الشعار</button>':'')+'<label>حجم الشعار<input id="dsLogoScale" type="range" min="8" max="50" value="'+state.editor.logoScale+'"></label></div>'+
      '<div class="ds-control"><b>↩️ التراجع والتحكم</b><div class="ds-editor-actions"><button type="button" data-ds-undo '+(!state.undo.length?'disabled':'')+'>تراجع</button><button type="button" data-ds-redo '+(!state.redo.length?'disabled':'')+'>إعادة</button><button type="button" data-ds-reset>إعادة ضبط</button></div></div>'+
      '<div class="ds-control"><b>💾 تصدير</b><div class="ds-editor-actions"><button type="button" class="primary" data-ds-export="png">PNG</button><button type="button" class="primary" data-ds-export="jpg">JPG</button></div><div class="ds-editor-note">التصدير يتم محليًا في جهازك. لا يتم إرسال النص أو الشعار إلى أي خدمة عند استخدام المحرر اليدوي.</div></div>'+
    '</div></div>';
}
function page(){
  const nav='<div class="ds-subnav"><button type="button" data-ds-view="ai" class="'+(state.view==='ai'?'active':'')+'">✨ أدوات AI</button><button type="button" data-ds-view="editor" class="'+(state.view==='editor'?'active':'')+'">🖌️ المحرر</button><button type="button" data-ds-view="history" class="'+(state.view==='history'?'active':'')+'">🗂️ النتائج <span class="ds-count">'+state.history.length+'</span></button></div>';
  const body=state.view==='editor'?editorHtml():state.view==='history'?historyHtml():aiHtml();
  return '<section class="dxn-design-studio" id="dxnDesignStudio"><div class="ds-hero"><span class="ds-kicker">🎨 أدوات التسويق الذكية</span><h2>استوديو التصميم</h2><p>حسّن صور المنتجات، غيّر الخلفية، أنشئ إعلانًا أو فيديو، ثم أكمل التعديل اليدوي والتصدير من مكان واحد.</p></div>'+nav+body+'</section>';
}

function loadImage(src,crossOrigin){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    if(crossOrigin)img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('تعذر فتح الصورة في المحرر.'));
    img.src=src;
  });
}
async function compressFile(file){
  if(!file||!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||''))throw new Error('اختر صورة JPG أو PNG أو WEBP.');
  if(file.size>18*1024*1024)throw new Error('حجم الصورة أكبر من 18 MB.');
  const url=URL.createObjectURL(file);
  try{
    const img=await loadImage(url,false);
    let maxEdge=1800,quality=.9;
    for(let pass=0;pass<6;pass++){
      const scale=Math.min(1,maxEdge/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(320,Math.round(img.naturalWidth*scale));
      const h=Math.max(320,Math.round(img.naturalHeight*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const ctx=c.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w,h);
      const data=c.toDataURL('image/webp',quality);
      if(data.length<=2350000)return data;
      maxEdge=Math.round(maxEdge*.82);quality=Math.max(.65,quality-.05);
    }
    throw new Error('تعذر ضغط الصورة ضمن الحجم المطلوب. جرّب صورة أصغر.');
  }finally{URL.revokeObjectURL(url)}
}
async function acceptFile(file){
  try{
    setStatus('جارٍ تجهيز الصورة...');
    state.inputData=await compressFile(file);
    state.inputName=file.name||'image';
    state.result=null;state.status='';state.statusKind='';state.editorImage=null;
    refresh();
  }catch(e){setStatus(String(e.message||e),'error');toast(String(e.message||e))}
}
function removeInput(){state.inputData='';state.inputName='';state.result=null;state.editorImage=null;refresh()}
function addHistory(item){state.history.unshift({...item,createdAt:Date.now()});state.history=state.history.slice(0,8)}
async function apiPost(path,body){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(body)});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){}
  if(!r.ok||!data||data.ok!==true)throw new Error(data&&data.error||'تعذر تنفيذ الطلب الآن.');
  return data;
}
async function runVideo(){
  const start=await apiPost('/api/design-video',{token:sessionToken(),image_data:state.inputData,prompt:state.prompt,duration:state.duration,generate_audio:state.generateAudio,preserve:state.preserve});
  state.videoJob=start.request_id;
  setStatus('تمت إضافة الفيديو إلى قائمة المعالجة. لا تغلق الصفحة حتى تكتمل النتيجة.','ok');
  const started=Date.now();
  while(Date.now()-started<240000){
    await new Promise(r=>setTimeout(r,4000));
    const s=await apiPost('/api/design-video-status',{token:sessionToken(),request_id:state.videoJob});
    if(s.status==='COMPLETED'){
      state.result={type:'video',url:s.video_url,task:'video',aspect:state.aspect};
      addHistory(state.result);
      setStatus('اكتمل إنشاء الفيديو.','ok');
      return;
    }
    setStatus(s.status==='IN_PROGRESS'?'الفيديو قيد المعالجة...':'الفيديو في قائمة الانتظار...','');
  }
  throw new Error('استغرق الفيديو وقتًا أطول من المتوقع. يمكنك إعادة المحاولة بعد قليل.');
}
async function run(){
  captureForm();
  const t=tools[state.task];
  if(!sessionToken()){toast('انتهت جلسة الدخول. أعد تسجيل الدخول.');return}
  if(t.needImage&&!state.inputData){toast('ارفع صورة أولًا.');return}
  if((state.task==='generate'||state.task==='erase')&&!state.prompt.trim()){toast(state.task==='erase'?'اكتب العنصر الذي تريد حذفه.':'اكتب وصف الصورة التي تريد إنشاءها.');return}
  if(state.task==='resize'){state.view='editor';refresh();return}
  state.loading=true;state.result=null;state.status='';state.statusKind='';refresh();
  try{
    if(state.task==='video')await runVideo();
    else{
      const data=await apiPost('/api/design-image',{token:sessionToken(),task:state.task,image_data:state.inputData,aspect:state.aspect,background:state.background,preserve:state.preserve,prompt:state.prompt});
      state.result={type:'image',data:String(data.image_data||''),url:String(data.url||''),task:state.task,aspect:state.aspect};
      addHistory(state.result);
      state.status='تم إنشاء التصميم بنجاح.';state.statusKind='ok';
    }
  }catch(e){state.status=String(e.message||e);state.statusKind='error';toast(state.status)}
  finally{state.loading=false;refresh()}
}
function captureForm(){
  const p=document.getElementById('dsPrompt');if(p)state.prompt=p.value;
  const pr=document.getElementById('dsPreserve');if(pr)state.preserve=pr.checked;
  const d=document.getElementById('dsDuration');if(d)state.duration=Number(d.value)||5;
  const a=document.getElementById('dsAudio');if(a)state.generateAudio=a.checked;
}
async function downloadSource(src,name){
  if(!src)return;
  if(src.startsWith('data:')){const a=document.createElement('a');a.href=src;a.download=name;a.click();return}
  try{
    const r=await fetch(src);if(!r.ok)throw new Error();
    const blob=await r.blob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
  }catch(_){window.open(src,'_blank','noopener')}
}
function editResult(result){if(result&&result.type==='image'){state.result=result;state.editorImage=null;state.view='editor';refresh()}}
function editorSnapshot(){return JSON.parse(JSON.stringify(state.editor))}
function pushUndo(snapshot){state.undo.push(snapshot||editorSnapshot());if(state.undo.length>30)state.undo.shift();state.redo=[]}
function setEditor(key,value){pushUndo();state.editor[key]=value;drawEditor()}
function resetEditor(){pushUndo();state.editor=freshEditor();state.editorImage=null;refresh()}
function undo(){if(!state.undo.length)return;state.redo.push(editorSnapshot());state.editor=state.undo.pop();state.editorImage=null;refresh()}
function redo(){if(!state.redo.length)return;state.undo.push(editorSnapshot());state.editor=state.redo.pop();state.editorImage=null;refresh()}
async function editorBaseImage(){
  const src=currentImage();if(!src)return null;
  if(state.editorImage&&state.editorImage._src===src)return state.editorImage;
  const img=await loadImage(src,!src.startsWith('data:'));img._src=src;state.editorImage=img;return img;
}
async function drawEditor(){
  const canvas=document.getElementById('dsEditorCanvas');if(!canvas)return;
  const token=++state.drawToken;
  const ratio=aspects[state.aspect]||[1,1],rw=ratio[0],rh=ratio[1],max=960;
  canvas.width=rw>=rh?max:Math.round(max*rw/rh);
  canvas.height=rw>=rh?Math.round(max*rh/rw):max;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  try{
    const img=await editorBaseImage();if(!img||token!==state.drawToken)return;
    const fit=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight)*state.editor.zoom;
    const w=img.naturalWidth*fit,h=img.naturalHeight*fit;
    const x=canvas.width/2+(state.editor.offsetX/100)*canvas.width/2;
    const y=canvas.height/2+(state.editor.offsetY/100)*canvas.height/2;
    ctx.save();ctx.translate(x,y);ctx.rotate(state.editor.rotation*Math.PI/180);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();

    if(state.editor.logoData){
      try{
        const logo=await loadImage(state.editor.logoData,false);if(token!==state.drawToken)return;
        const lw=canvas.width*(state.editor.logoScale/100),lh=lw*(logo.naturalHeight/logo.naturalWidth);
        ctx.drawImage(logo,canvas.width-lw-30,canvas.height-lh-30,lw,lh);
      }catch(_){}
    }
    if(state.editor.text.trim()){
      const font=Math.max(18,Math.round(state.editor.fontSize*canvas.width/900));
      ctx.save();ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+font+'px Arial, Tahoma, sans-serif';
      ctx.lineWidth=Math.max(3,font*.09);ctx.strokeStyle='rgba(0,0,0,.55)';ctx.fillStyle=state.editor.textColor;
      const tx=canvas.width*state.editor.textX/100,ty=canvas.height*state.editor.textY/100;
      ctx.strokeText(state.editor.text,tx,ty,canvas.width*.88);ctx.fillText(state.editor.text,tx,ty,canvas.width*.88);ctx.restore();
    }
  }catch(e){setStatus(String(e.message||e),'error')}
}
function exportCanvas(format){
  const c=document.getElementById('dsEditorCanvas');if(!c)return;
  try{
    const mime=format==='jpg'?'image/jpeg':'image/png',ext=format==='jpg'?'jpg':'png';
    const data=c.toDataURL(mime,format==='jpg'?.92:undefined);downloadSource(data,'dxn-design-'+Date.now()+'.'+ext);
  }catch(_){toast('تعذر تصدير هذه الصورة من المصدر الخارجي. جرّب حفظ النتيجة أولًا ثم ارفعها إلى المحرر.')}
}
function bindRange(id,key,transform){
  const el=document.getElementById(id);if(!el)return;
  let before=null;
  el.addEventListener('pointerdown',()=>before=editorSnapshot());
  el.addEventListener('input',()=>{state.editor[key]=transform?transform(el.value):Number(el.value);drawEditor()});
  el.addEventListener('change',()=>{if(before){pushUndo(before);before=null}});
}
function bind(){
  document.querySelectorAll('[data-ds-view]').forEach(b=>b.addEventListener('click',()=>{captureForm();state.view=b.dataset.dsView;refresh()}));
  document.querySelectorAll('[data-ds-task]').forEach(b=>b.addEventListener('click',()=>{captureForm();state.task=b.dataset.dsTask;state.result=null;state.status='';state.statusKind='';refresh()}));
  document.querySelectorAll('[data-ds-aspect]').forEach(b=>b.addEventListener('click',()=>{state.aspect=b.dataset.dsAspect;refresh()}));
  document.querySelectorAll('[data-ds-bg]').forEach(b=>b.addEventListener('click',()=>{state.background=b.dataset.dsBg;refresh()}));
  const drop=document.getElementById('dsDrop'),file=document.getElementById('dsFile');
  if(drop&&file){
    drop.addEventListener('click',e=>{if(!e.target.closest('button'))file.click()});
    file.addEventListener('change',()=>acceptFile(file.files&&file.files[0]));
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
    drop.addEventListener('drop',e=>acceptFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]));
  }
  document.querySelector('[data-ds-change]')?.addEventListener('click',e=>{e.stopPropagation();file&&file.click()});
  document.querySelector('[data-ds-remove]')?.addEventListener('click',e=>{e.stopPropagation();removeInput()});
  document.getElementById('dsPrompt')?.addEventListener('input',e=>state.prompt=e.target.value);
  document.getElementById('dsPreserve')?.addEventListener('change',e=>state.preserve=e.target.checked);
  document.getElementById('dsDuration')?.addEventListener('change',e=>state.duration=Number(e.target.value)||5);
  document.getElementById('dsAudio')?.addEventListener('change',e=>state.generateAudio=e.target.checked);
  document.getElementById('dsRun')?.addEventListener('click',run);
  document.querySelector('[data-ds-repeat]')?.addEventListener('click',run);
  document.querySelector('[data-ds-download]')?.addEventListener('click',()=>{if(state.result){const src=state.result.type==='video'?state.result.url:(state.result.data||state.result.url);downloadSource(src,'dxn-design-'+Date.now()+(state.result.type==='video'?'.mp4':'.jpg'))}});
  document.querySelector('[data-ds-edit-result]')?.addEventListener('click',()=>editResult(state.result));
  document.querySelectorAll('[data-ds-history-download]').forEach(b=>b.addEventListener('click',()=>{const h=state.history[Number(b.dataset.dsHistoryDownload)];if(h)downloadSource(h.type==='video'?h.url:(h.data||h.url),'dxn-design-'+h.createdAt+(h.type==='video'?'.mp4':'.jpg'))}));
  document.querySelectorAll('[data-ds-history-edit]').forEach(b=>b.addEventListener('click',()=>editResult(state.history[Number(b.dataset.dsHistoryEdit)])));

  if(state.view==='editor'){
    document.querySelectorAll('[data-ds-editor-aspect]').forEach(b=>b.addEventListener('click',()=>{state.aspect=b.dataset.dsEditorAspect;drawEditor()}));
    bindRange('dsZoom','zoom',v=>Number(v)/100);bindRange('dsOffsetX','offsetX');bindRange('dsOffsetY','offsetY');bindRange('dsFontSize','fontSize');bindRange('dsTextX','textX');bindRange('dsTextY','textY');bindRange('dsLogoScale','logoScale');
    const text=document.getElementById('dsText');let textBefore=null;
    text?.addEventListener('focus',()=>textBefore=editorSnapshot());text?.addEventListener('input',e=>{state.editor.text=e.target.value;drawEditor()});text?.addEventListener('change',()=>{if(textBefore){pushUndo(textBefore);textBefore=null}});
    const color=document.getElementById('dsTextColor');let colorBefore=null;
    color?.addEventListener('focus',()=>colorBefore=editorSnapshot());color?.addEventListener('input',e=>{state.editor.textColor=e.target.value;drawEditor()});color?.addEventListener('change',()=>{if(colorBefore){pushUndo(colorBefore);colorBefore=null}});
    document.querySelectorAll('[data-ds-rotate]').forEach(b=>b.addEventListener('click',()=>setEditor('rotation',(state.editor.rotation+Number(b.dataset.dsRotate))%360)));
    const logo=document.getElementById('dsLogoFile');
    document.querySelector('[data-ds-logo-pick]')?.addEventListener('click',()=>logo&&logo.click());
    logo?.addEventListener('change',async()=>{const f=logo.files&&logo.files[0];if(!f)return;const before=editorSnapshot();try{state.editor.logoData=await compressFile(f);pushUndo(before);drawEditor()}catch(e){toast(String(e.message||e))}});
    document.querySelector('[data-ds-logo-clear]')?.addEventListener('click',()=>setEditor('logoData',''));
    document.querySelector('[data-ds-undo]')?.addEventListener('click',undo);document.querySelector('[data-ds-redo]')?.addEventListener('click',redo);document.querySelector('[data-ds-reset]')?.addEventListener('click',resetEditor);
    document.querySelectorAll('[data-ds-export]').forEach(b=>b.addEventListener('click',()=>exportCanvas(b.dataset.dsExport)));
    drawEditor();
  }
}
window.designStudioPage=page;
window.designStudioAfterRender=bind;
window.DXNDesignStudio={state,run,acceptFile,drawEditor};
})();
