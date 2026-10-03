/* Ragwan professional plan certificate builder.
   Generates a personalized PNG from the approved male/female certificate templates.
*/
(function(){
  'use strict';

  const TEMPLATE_URLS={
    male:['/app/assets/certificates/ragwan-professional-plan-certificate-male.png','/assets/certificates/ragwan-professional-plan-certificate-male.png','./assets/certificates/ragwan-professional-plan-certificate-male.png','./app/assets/certificates/ragwan-professional-plan-certificate-male.png'],
    female:['/app/assets/certificates/ragwan-professional-plan-certificate-female.png','/assets/certificates/ragwan-professional-plan-certificate-female.png','./assets/certificates/ragwan-professional-plan-certificate-female.png','./app/assets/certificates/ragwan-professional-plan-certificate-female.png']
  };
  const GENDER_KEY='ragwan_certificate_gender_';

  function escLocal(value){
    return String(value??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
  }

  function ensureStyles(){
    if(document.getElementById('ragwanCertificateBuilderStyles'))return;
    const style=document.createElement('style');
    style.id='ragwanCertificateBuilderStyles';
    style.textContent=[
      '.ragwan-certificate-builder{margin-top:10px;padding:12px;border:1px solid #d9e8e1;border-radius:14px;background:linear-gradient(135deg,#fbfdfc,#fff);direction:rtl}',
      '.ragwan-certificate-builder>label{display:block;margin:0 0 6px;font-size:12px;font-weight:950;color:#123b30}',
      '.ragwan-certificate-builder select{width:100%;min-height:44px;padding:9px 11px;border:1px solid #cfe1d8;border-radius:11px;background:#fff;color:#173c31;font-weight:800;box-sizing:border-box}',
      '.ragwan-certificate-create{width:100%;min-height:50px;margin-top:8px;border:0;border-radius:13px;background:linear-gradient(135deg,#d99a18,#b87905);color:#fff;font-size:15px;font-weight:950;cursor:pointer;box-shadow:0 7px 18px rgba(184,121,5,.22)}',
      '.ragwan-certificate-create:hover{filter:brightness(1.03);transform:translateY(-1px)}',
      '.ragwan-certificate-builder-status{min-height:18px;margin-top:7px;text-align:center;font-size:11px;font-weight:900;color:#176b55}',
      '.ragwan-certificate-modal{position:fixed;inset:0;z-index:100020;background:rgba(8,31,24,.72);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl}',
      '.ragwan-certificate-card{width:min(1180px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.34);padding:16px}',
      '.ragwan-certificate-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '.ragwan-certificate-card-head .title{font-size:19px;font-weight:950;color:#123b30}',
      '.ragwan-certificate-preview{background:#f3f6f4;border-radius:15px;padding:10px;text-align:center;overflow:auto}',
      '.ragwan-certificate-preview canvas{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.12)}',
      '.ragwan-certificate-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}',
      '.ragwan-certificate-actions button{min-height:46px;border:0;border-radius:12px;padding:10px 16px;font-weight:950;cursor:pointer}',
      '.ragwan-certificate-download{background:#0f513f;color:#fff}',
      '.ragwan-certificate-close{background:#eef3f1;color:#173c31}',
      '@media(max-width:700px){.ragwan-certificate-modal{padding:8px}.ragwan-certificate-card{width:98vw;max-height:96vh;padding:10px}.ragwan-certificate-card-head .title{font-size:16px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function currentIdentity(){
    try{
      if(typeof window.currentAccountIdentity==='function'){
        const x=window.currentAccountIdentity();
        return {name:String(x?.name||'').trim(),member_no:String(x?.member_no||'').trim()};
      }
    }catch(_){}
    const m=window.me||{};
    return {
      name:String(m.name||m.member_name||'').trim(),
      member_no:String(m.member_no||m.membership_no||m.membership_number||'').trim()
    };
  }

  function completionData(){
    const trainee=window.ragwanSelectedTrainee||{};
    const completion=window.ragwanLastCompletion||{};
    const sponsor=currentIdentity();
    return {
      traineeName:String(completion.member_name||completion.trainee_name||completion.name||trainee.name||'').trim(),
      traineeNo:String(completion.member_no||completion.trainee_member_no||completion.membership_number||completion.membership_no||trainee.member_no||trainee.membership_no||trainee.membership_number||'').trim(),
      sponsorName:String(completion.sponsor_member_name||sponsor.name||'').trim(),
      sponsorNo:String(completion.sponsor_member_no||sponsor.member_no||'').trim(),
      completedAt:String(completion.completed_at||trainee.completed_at||new Date().toISOString())
    };
  }

  function formatArabicDate(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    try{
      return new Intl.DateTimeFormat('ar-IQ',{day:'2-digit',month:'long',year:'numeric'}).format(d);
    }catch(_){
      return d.toLocaleDateString('ar-IQ');
    }
  }

  function loadImage(urls){
    return new Promise(function(resolve,reject){
      let index=0;
      function attempt(){
        if(index>=urls.length){reject(new Error('تعذر تحميل قالب الشهادة.'));return}
        const img=new Image();
        img.onload=function(){resolve(img)};
        img.onerror=function(){index++;attempt()};
        img.src=urls[index++];
      }
      attempt();
    });
  }

  function fitFont(ctx,text,maxWidth,startSize,minSize,weight,fontFamily){
    let size=startSize;
    while(size>minSize){
      ctx.font=(weight||900)+' '+size+'px '+(fontFamily||'Tahoma, Arial, sans-serif');
      if(ctx.measureText(text).width<=maxWidth)break;
      size-=1;
    }
    return size;
  }

  function drawCentered(ctx,text,x,y,maxWidth,startSize,minSize,color,weight){
    const value=String(text||'').trim();
    if(!value)return;
    const size=fitFont(ctx,value,maxWidth,startSize,minSize,weight,'Tahoma, Arial, sans-serif');
    ctx.save();
    ctx.direction='rtl';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle=color;
    ctx.font=(weight||900)+' '+size+'px Tahoma, Arial, sans-serif';
    ctx.fillText(value,x,y,maxWidth);
    ctx.restore();
  }

  function cover(ctx,x,y,w,h,fill){
    ctx.save();
    ctx.fillStyle=fill;
    ctx.fillRect(x,y,w,h);
    ctx.restore();
  }

  function drawCertificateCanvas(img,gender,data){
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth||1536;
    canvas.height=img.naturalHeight||1024;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);

    const male=gender==='male';
    const baseFill=male?'#fff9e9':'#fff4f8';
    const valueColor=male?'#07563f':'#a4144e';

    /* Keep the approved artwork intact; only replace its sample personalization values. */
    cover(ctx,475,420,610,70,baseFill);
    drawCentered(ctx,data.traineeName,780,458,570,58,26,valueColor,950);

    cover(ctx,575,520,410,48,baseFill);
    drawCentered(ctx,data.traineeNo,780,544,360,30,16,'#1c2522',850);

    /* Replace the sample completion date while preserving the printed date label. */
    cover(ctx,930,880,190,72,baseFill);
    drawCentered(ctx,formatArabicDate(data.completedAt),1025,917,175,23,14,'#1c2522',850);

    return canvas;
  }

  function openModal(canvas,gender,data){
    const old=document.getElementById('ragwanCertificateModal');
    if(old)old.remove();

    const modal=document.createElement('div');
    modal.id='ragwanCertificateModal';
    modal.className='ragwan-certificate-modal';
    modal.innerHTML=
      '<div class="ragwan-certificate-card">'+
        '<div class="ragwan-certificate-card-head">'+
          '<div><div class="title">🎓 شهادة إتمام الخطة الاحترافية</div>'+
          '<div class="muted" style="margin-top:4px">تم تجهيز الشهادة للمتدرب: <b>'+escLocal(data.traineeName)+'</b> — '+(gender==='female'?'نسخة أنثى':'نسخة ذكر')+'</div></div>'+
          '<button type="button" class="ragwan-certificate-close" onclick="document.getElementById(\'ragwanCertificateModal\')?.remove()">✖️</button>'+
        '</div>'+
        '<div class="ragwan-certificate-preview"><canvas id="ragwanCertificateCanvasPreview" width="'+canvas.width+'" height="'+canvas.height+'"></canvas></div>'+
        '<div class="ragwan-certificate-actions">'+
          '<button type="button" class="ragwan-certificate-download" id="ragwanCertificateDownload">⬇️ تنزيل الشهادة PNG</button>'+
          '<button type="button" class="ragwan-certificate-close" onclick="document.getElementById(\'ragwanCertificateModal\')?.remove()">إغلاق</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(modal);

    const preview=document.getElementById('ragwanCertificateCanvasPreview');
    const pctx=preview.getContext('2d');
    pctx.drawImage(canvas,0,0);

    document.getElementById('ragwanCertificateDownload')?.addEventListener('click',function(){
      const safeNo=(data.traineeNo||'member').replace(/[^0-9A-Za-z_-]/g,'-');
      const name='ragwan-professional-plan-certificate-'+safeNo+'.png';
      const a=document.createElement('a');
      a.href=canvas.toDataURL('image/png');
      a.download=name;
      document.body.appendChild(a);a.click();a.remove();
    });
  }

  async function create(){
    ensureStyles();
    const status=document.getElementById('ragwanCertificateBuilderStatus');
    const select=document.getElementById('ragwanCertificateGender');
    const gender=String(select?.value||'').trim();
    if(!gender){
      if(status)status.textContent='⚠️ اختر نوع الشهادة: ذكر أو أنثى.';
      select?.focus();
      return;
    }
    const data=completionData();
    if(!data.traineeName||!data.traineeNo){
      if(status)status.textContent='⚠️ لا يمكن إنشاء الشهادة قبل توفر اسم المتدرب ورقم عضويته.';
      return;
    }
    localStorage.setItem(GENDER_KEY+String(window.ragwanSelectedTraineeId||data.traineeNo),gender);
    if(status)status.textContent='⏳ جارٍ تجهيز الشهادة...';
    try{
      const img=await loadImage(TEMPLATE_URLS[gender]);
      await (document.fonts?.ready||Promise.resolve());
      const canvas=drawCertificateCanvas(img,gender,data);
      openModal(canvas,gender,data);
      if(status)status.textContent='✅ تم تجهيز الشهادة بنجاح.';
    }catch(e){
      if(status)status.textContent='⚠️ '+String(e?.message||'تعذر تجهيز الشهادة.');
    }
  }

  window.ragwanCreateCompletionCertificate=create;
  window.ragwanInitCertificateGender=function(){
    ensureStyles();
    const select=document.getElementById('ragwanCertificateGender');
    if(!select)return;
    const key=GENDER_KEY+String(window.ragwanSelectedTraineeId||'');
    const saved=localStorage.getItem(key)||'';
    if(saved)select.value=saved;
  };
  window.addEventListener('load',function(){setTimeout(window.ragwanInitCertificateGender,120)});
})();
